import path from 'node:path';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import express from 'express';
import { config, hasFfmpeg } from '../config.js';
import { detectPlatform, isValidHttpUrl, sanitizeFilename, toAsciiFilename, PLATFORMS } from '../services/platforms.js';
import {
  getInfo,
  getPlaylist,
  getDirectUrls,
  cleanError,
  formatBytes,
  makeTempDir,
  removeTempDir,
  downloadToFile,
} from '../services/ytdlp.js';
import { spawnFfmpeg } from '../services/ffmpeg.js';
import { proxyMedia } from '../services/proxy.js';
import { createJob, getJob, deleteJob } from '../services/jobs.js';
import { runDownloadJob } from '../services/download-job.js';
import { apiLimiter, downloadLimiter } from '../middleware/rateLimit.js';

const router = express.Router();

/* ------------------------------------------------------------------ */
/* Tiny concurrency semaphore — free-tier hosts have limited resources  */
/* ------------------------------------------------------------------ */
let active = 0;
const queue = [];

function acquire() {
  if (active < config.maxConcurrentJobs) {
    active++;
    return Promise.resolve();
  }
  return new Promise((resolve) => queue.push(resolve));
}

function release() {
  const next = queue.shift();
  if (next) next();
  else active--;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function badRequest(res, message) {
  return res.status(400).json({ error: message });
}

function serverError(res, message) {
  return res.status(500).json({ error: message });
}

/** Extract + validate the `url` parameter. */
function readUrl(req) {
  const raw = req.query.url || req.body?.url;
  if (!raw || typeof raw !== 'string') return { error: 'A url is required.' };

  const url = raw.trim();
  if (!isValidHttpUrl(url)) return { error: 'That does not look like a valid link.' };

  const platform = detectPlatform(url);
  if (!platform) {
    return {
      error: 'This platform is not supported. Supported: YouTube, Facebook, Instagram and more.',
    };
  }
  return { url, platform };
}

/* ------------------------------------------------------------------ */
/* Routes                                                              */
/* ------------------------------------------------------------------ */

router.get('/health', (_req, res) => {
  res.json({
    ok: true,
    brand: config.brand.name,
    ffmpeg: hasFfmpeg(),
    time: new Date().toISOString(),
  });
});

/** List of supported platforms (used by the frontend to show badges). */
router.get('/platforms', (_req, res) => {
  res.json({
    platforms: PLATFORMS.map((p) => ({ id: p.id, name: p.name, color: p.color })),
  });
});

/** Resolve metadata + available qualities for a single URL. */
router.post('/resolve', apiLimiter, async (req, res) => {
  const parsed = readUrl(req);
  if (parsed.error) return badRequest(res, parsed.error);

  try {
    await acquire();
    const info = await getInfo(parsed.url);
    return res.json({ platform: parsed.platform.id, platformName: parsed.platform.name, info });
  } catch (err) {
    return serverError(res, cleanError(err.message));
  } finally {
    release();
  }
});

/** GET variant of /resolve for convenience. */
router.get('/resolve', apiLimiter, async (req, res) => {
  const parsed = readUrl(req);
  if (parsed.error) return badRequest(res, parsed.error);

  try {
    await acquire();
    const info = await getInfo(parsed.url);
    return res.json({ platform: parsed.platform.id, platformName: parsed.platform.name, info });
  } catch (err) {
    return serverError(res, cleanError(err.message));
  } finally {
    release();
  }
});

/** Resolve many URLs at once (batch mode). */
router.post('/batch', apiLimiter, async (req, res) => {
  const urls = Array.isArray(req.body?.urls) ? req.body.urls : [];
  if (!urls.length) return badRequest(res, 'No urls provided.');
  if (urls.length > 20) return badRequest(res, 'Maximum 20 links per batch.');

  const results = [];
  for (const raw of urls) {
    const url = String(raw || '').trim();
    if (!isValidHttpUrl(url)) {
      results.push({ url, ok: false, error: 'Invalid link.' });
      continue;
    }
    const platform = detectPlatform(url);
    if (!platform) {
      results.push({ url, ok: false, error: 'Unsupported platform.' });
      continue;
    }
    try {
      await acquire();
      const info = await getInfo(url);
      results.push({ url, ok: true, platform: platform.id, platformName: platform.name, info });
    } catch (err) {
      results.push({ url, ok: false, error: cleanError(err.message) });
    } finally {
      release();
    }
  }

  res.json({ results });
});

/**
 * Create a background download job for a link.
 * Returns immediately with a jobId; the heavy lifting happens async.
 */
router.post('/start-download', downloadLimiter, async (req, res) => {
  const parsed = readUrl(req);
  if (parsed.error) return badRequest(res, parsed.error);

  const formatSpec = String(req.query.format || req.body?.format || '').trim();
  const title =
    sanitizeFilename(req.query.title || req.body?.title || parsed.platform.name) ||
    parsed.platform.name;

  const dir = await makeTempDir();
  const job = createJob({ dir, title, formatSpec });
  res.json({ jobId: job.id, title });

  runDownloadJob(job, parsed.url, formatSpec).catch(() => {});
});

/** Poll the progress of a background job. */
router.get('/download-job/:id/status', (req, res) => {
  const job = getJob(req.params.id);
  if (!job) return res.status(404).json({ error: 'Unknown or expired job.' });

  res.json({
    state: job.state,
    bytesDone: job.bytesDone,
    totalBytes: job.totalBytes,
    error: job.error,
    title: job.title,
    ext: job.ext,
  });
});

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Stream the finished file (Range supported) once the job is done. */
router.get('/download-job/:id/file', async (req, res) => {
  const job = getJob(req.params.id);
  if (!job) return res.status(404).json({ error: 'Unknown or expired job.' });

  // Hold the request open until the job finishes (or fails / times out).
  const deadline = Date.now() + 5 * 60 * 1000;
  for (;;) {
    if (job.state === 'done') break;
    if (job.state === 'error') {
      return serverError(res, job.error || 'Download failed.');
    }
    if (Date.now() > deadline) {
      return serverError(res, 'Download timed out on the server.');
    }
    await sleep(200);
  }

  const mime = job.ext === 'mp3' ? 'audio/mpeg' : 'video/mp4';
  // Do NOT delete the job here: the browser aborts the document navigation
  // and re-requests this URL as a download. The sweeper cleans it up.
  await streamFileWithRange(req, res, job.file, toAsciiFilename(`${job.title}.${job.ext}`), mime);
});

/** Cancel a running job. */
router.delete('/download-job/:id', async (req, res) => {
  const job = deleteJob(req.params.id);
  if (job?.dir) await removeTempDir(job.dir);
  res.json({ ok: true });
});

/** List the entries of a playlist. */
router.post('/playlist', apiLimiter, async (req, res) => {
  const parsed = readUrl(req);
  if (parsed.error) return badRequest(res, parsed.error);

  try {
    await acquire();
    const playlist = await getPlaylist(parsed.url);
    return res.json({ platform: parsed.platform.id, platformName: parsed.platform.name, playlist });
  } catch (err) {
    return serverError(res, cleanError(err.message));
  } finally {
    release();
  }
});

/**
 * Stream the media to the browser.
 *
 * Query / body:
 *   url     – the page link
 *   format  – quality id coming from /resolve (or "__mp3__")
 *   title   – optional filename base
 */
async function handleDownload(req, res) {
  const parsed = readUrl(req);
  if (parsed.error) return badRequest(res, parsed.error);

  const formatSpec = String(req.query.format || req.body?.format || '').trim();
  const title =
    sanitizeFilename(req.query.title || req.body?.title || parsed.platform.name) ||
    parsed.platform.name;

  const wantsAudio = formatSpec === '__mp3__';

  try {
    await acquire();

    // ---- MP3 (streamed live via ffmpeg) --------------------------------
    if (wantsAudio) {
      let direct = [];
      try {
        direct = await getDirectUrls(parsed.url, 'bestaudio/best');
      } catch {
        direct = [];
      }

      if (direct.length === 1) {
        const child = spawnFfmpeg({ audioUrl: direct[0], audioOnly: true });
        const filename = `${title}.mp3`;
        pipeChildToResponse(res, child, 'audio/mpeg', filename);
        return;
      }

      // Fallback: download to temp then stream
      const dir = await makeTempDir();
      try {
        const result = await downloadToFile(parsed.url, null, dir, { audioOnly: true });
        res.on('close', () => removeTempDir(dir));
        await streamFileWithRange(req, res, result.path, `${title}.mp3`, 'audio/mpeg');
      } catch (err) {
        await removeTempDir(dir);
        throw err;
      }
      return;
    }

    // ---- Video -------------------------------------------------------
    // Strategy:
    //   1. Merged format (video+audio) -> ffmpeg remux piped live to the
    //      browser, so the download starts immediately (fragmented MP4).
    //   2. Single combined format     -> simple Range-aware proxy.
    //   3. Anything else              -> temp file fallback.
    let direct = [];
    if (formatSpec) {
      try {
        direct = await getDirectUrls(parsed.url, formatSpec);
      } catch {
        direct = [];
      }
    }

    if (direct.length === 2 && formatSpec.includes('+')) {
      const child = spawnFfmpeg({ videoUrl: direct[0], audioUrl: direct[1] });
      const filename = `${title}.mp4`;
      pipeChildToResponse(res, child, 'video/mp4', filename);
      return;
    }

    if (direct.length === 1) {
      const ext = guessExt(direct[0], formatSpec);
      const filename = `${title}.${ext}`;
      await proxyMedia(req, res, direct[0], { filename });
      return;
    }

    // Fallback: let yt-dlp produce a real file, then stream it with Range.
    const dir = await makeTempDir();
    try {
      const result = await downloadToFile(parsed.url, formatSpec || undefined, dir);
      const ext = result.ext || 'mp4';
      const filename = `${title}.${ext}`;
      const type = ext === 'mp3' ? 'audio/mpeg' : ext === 'webm' ? 'video/webm' : 'video/mp4';
      res.on('close', () => removeTempDir(dir));
      await streamFileWithRange(req, res, result.path, filename, type);
    } catch (err) {
      await removeTempDir(dir);
      throw err;
    }
  } catch (err) {
    if (!res.headersSent) serverError(res, cleanError(err.message));
    else res.end();
  } finally {
    // Release the slot shortly after the stream ends.
    setTimeout(release, 250);
  }
}

function pipeChildToResponse(res, child, contentType, filename) {
  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', contentDisposition(filename));
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Accel-Buffering', 'no');

  let failed = false;
  child.on('error', (err) => {
    failed = true;
    if (!res.headersSent) serverError(res, `Failed to start ffmpeg: ${err.message}`);
    else res.end();
  });

  child.stdout.pipe(res);

  child.on('close', (code) => {
    if (failed) return;
    if (code !== 0) {
      if (!res.headersSent) {
        serverError(res, `ffmpeg failed: ${child.ffmpegStderr?.() || `exit code ${code}`}`);
      } else {
        res.end();
      }
    }
  });
}

async function streamFileWithRange(req, res, filePath, filename, contentType) {
  const info = await stat(filePath);
  const size = info.size;
  const range = req.headers.range;

  let start = 0;
  let end = size - 1;
  let status = 200;

  if (range) {
    const match = /bytes=(\d*)-(\d*)/.exec(range);
    if (match) {
      if (match[1]) start = parseInt(match[1], 10);
      if (match[2]) end = Math.min(parseInt(match[2], 10), size - 1);
      if (start > end || start >= size) {
        res.status(416).setHeader('Content-Range', `bytes */${size}`);
        res.end();
        return;
      }
      status = 206;
    }
  }

  res.status(status);
  res.setHeader('Content-Type', contentType);
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Content-Length', end - start + 1);
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Disposition', contentDisposition(filename));
  if (status === 206) res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);

  if (req.method === 'HEAD') {
    res.end();
    return;
  }

  createReadStream(filePath, { start, end }).pipe(res);
}

function contentDisposition(filename) {
  const ascii = filename.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

function guessExt(url, formatSpec) {
  if (!formatSpec) return 'mp4';
  const m = formatSpec.match(/(\d{3,4}p|audio)/i);
  if (m && m[1].toLowerCase() === 'audio') return 'm4a';
  if (url) {
    try {
      const u = new URL(url);
      const ext = u.pathname.match(/\.([a-z0-9]{2,4})$/i);
      if (ext) return ext[1].toLowerCase();
    } catch {
      /* ignore */
    }
  }
  return 'mp4';
}

router.get('/download', downloadLimiter, handleDownload);
router.post('/download', downloadLimiter, handleDownload);

export default router;
export { formatBytes };
