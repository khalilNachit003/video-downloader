import { spawn } from 'node:child_process';
import { mkdir, rm, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { config, resolveYtdlp, resolveFfmpegDir, TMP_DIR } from '../config.js';

const YTDLP = resolveYtdlp();

/** Flags shared by every yt-dlp call. */
function baseArgs(url) {
  const youtubeClient = process.env.YOUTUBE_PLAYER_CLIENT || 'tv_embedded,default';

  const args = [
    '--no-warnings',
    '--no-color',
    '--no-progress',
    '--no-check-certificate',
    '--ignore-config',
    // tv_embedded serves classic HTTPS DASH URLs that are not throttled
    // by YouTube's SABR mechanism; we keep "default" as a fallback.
    ...(youtubeClient ? ['--extractor-args', `youtube:player_client=${youtubeClient}`] : []),
    '--socket-timeout',
    '20',
    '--retries',
    '3',
    '--extractor-retries',
    '3',
    '--no-playlist-reverse',
    '--no-mtime',
    '--paths',
    `temp:${TMP_DIR}`,
  ];

  if (config.cookiesFile) args.push('--cookies', config.cookiesFile);

  const ff = resolveFfmpegDir();
  if (ff) args.push('--ffmpeg-location', ff);

  args.push(url);
  return args;
}

/**
 * Run yt-dlp and capture stdout (used for JSON dumps and `-g`).
 * Resolves with { stdout, stderr } and rejects on a non-zero exit.
 */
export function runYtDlp(args, { timeoutMs = config.jobTimeoutMs } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(YTDLP, args, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('yt-dlp timed out'));
    }, timeoutMs);

    child.stdout.on('data', (d) => {
      stdout += d.toString();
    });
    child.stderr.on('data', (d) => {
      stderr += d.toString();
      if (stderr.length > 20000) stderr = stderr.slice(-20000);
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(new Error(`Failed to start yt-dlp: ${err.message}`));
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(cleanError(stderr) || `yt-dlp exited with code ${code}`));
    });
  });
}

/** Turn yt-dlp's noisy stderr into a short, user friendly message. */
export function cleanError(stderr = '') {
  const lines = stderr
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((l) => !/^\[download\]/.test(l) && !/^\[info\]/.test(l));

  const raw = lines.join(' ') || stderr.trim();

  const map = [
    [/Video unavailable/i, 'This video is unavailable or has been removed.'],
    [/Private video/i, 'This video is private.'],
    [/Sign in to confirm your age|age-restricted/i, 'This video is age-restricted.'],
    [/members-only|join this channel/i, 'This video is for members only.'],
    [/not available in your country|geo/i, 'This video is not available in your region.'],
    [/copyright|removed by the uploader/i, 'This video was removed for copyright reasons.'],
    [/login required|rate limit/i, 'The platform is rate-limiting us. Try again later.'],
    [/Unsupported URL|is not a valid URL/i, 'This link is not supported.'],
    [/Failed to parse JSON|JSONDecodeError/i, 'Could not read data from this link.'],
    [/HTTP Error 404|Not Found/i, 'The media was not found (404).'],
    [/HTTP Error 403|Forbidden/i, 'Access denied by the platform (403).'],
    [/ffmpeg (is )?not installed|ffmpeg not found/i, 'ffmpeg is required for this format but was not found on the server.'],
    [/Unable to extract|DOCTYPE/i, 'Could not extract data from this link. It may be invalid or private.'],
  ];

  for (const [re, msg] of map) if (re.test(raw)) return msg;
  return raw.split('.').slice(0, 2).join('.').trim() || 'Unknown error';
}

/* ------------------------------------------------------------------ */
/* Metadata                                                            */
/* ------------------------------------------------------------------ */

export async function getInfo(url) {
  const { stdout } = await runYtDlp([
    ...baseArgs(url),
    '--dump-single-json',
    '--no-playlist',
    '--no-warnings',
  ]);
  const data = JSON.parse(stdout);
  return normalizeInfo(data);
}

export async function getPlaylist(url) {
  const { stdout } = await runYtDlp([
    ...baseArgs(url),
    '--dump-single-json',
    '--flat-playlist',
    '--extractor-args',
    'youtubetab:approximate_date',
  ]);
  const data = JSON.parse(stdout);
  const entries = (data.entries || []).filter(Boolean);
  return {
    id: data.id,
    title: data.title || 'Playlist',
    uploader: data.uploader || data.channel || '',
    count: entries.length,
    entries: entries.map((e, i) => ({
      index: i + 1,
      id: e.id,
      title: e.title || e.url || `Video ${i + 1}`,
      url: e.url || (e.id && e.ie_key ? `https://www.youtube.com/watch?v=${e.id}` : null),
      duration: e.duration ?? null,
      durationString: e.duration_string || e.durationString || null,
      thumbnail: e.thumbnails?.[e.thumbnails.length - 1]?.url || e.thumbnail || null,
      uploader: e.uploader || e.channel || data.uploader || '',
    })),
  };
}

/** Build the UI-ready shape of a yt-dlp info dict. */
export function normalizeInfo(data) {
  const formats = Array.isArray(data.formats) ? data.formats : [];
  const quality = buildQualityOptions(formats);

  return {
    id: data.id,
    title: data.title || 'Untitled',
    description: data.description || '',
    uploader: data.uploader || data.channel || data.uploader_id || '',
    uploaderUrl: data.uploader_url || data.channel_url || '',
    duration: data.duration ?? null,
    durationString: formatDuration(data.duration),
    thumbnail: pickThumbnail(data.thumbnails) || data.thumbnail || null,
    thumbnailList: (data.thumbnails || []).map((t) => ({ url: t.url, id: t.id, height: t.height })),
    platform: data.extractor_key?.toLowerCase() || null,
    isLive: !!data.is_live,
    wasLive: !!data.was_live,
    filesizeApprox: data.filesize_approx ?? null,
    viewCount: data.view_count ?? null,
    ext: data.ext || 'mp4',
    quality,
    hasAudioOnly: quality.some((q) => q.kind === 'audio'),
  };
}

function pickThumbnail(thumbs = []) {
  if (!thumbs.length) return null;
  const sorted = [...thumbs].sort((a, b) => (b.preference || 0) - (a.preference || 0) || (b.height || 0) - (a.height || 0));
  return sorted[0]?.url || null;
}

/**
 * Rank a format for selection. Direct HTTPS (DASH/MP4) streams are strongly
 * preferred over HLS/m3u8 ones, because ffmpeg re-muxing an HLS stream yields
 * MPEG-TS output, and because m3u8 needs extra manifest handling.
 */
function protoScore(f) {
  const proto = String(f.protocol || '').toLowerCase();
  if (proto.includes('m3u8') || proto.includes('hls')) return 0;
  if (proto.startsWith('https') || proto.startsWith('http')) return 1_000_000;
  if (proto.includes('dash')) return 900_000;
  return 100_000; // anything else (e.g. rtsp)
}

function bestPerHeight(list) {
  const byHeight = new Map();
  for (const f of list) {
    const h = f.height || 0;
    if (!h) continue;
    const prev = byHeight.get(h);
    if (!prev || protoScore(f) + (f.tbr || 0) > protoScore(prev) + (prev.tbr || 0)) {
      byHeight.set(h, f);
    }
  }
  return byHeight;
}
/**
 * Build a de-duplicated list of download options.
 *
 *  - "combined" formats already contain video + audio (no ffmpeg merge needed)
 *  - "merged" formats are video-only and paired with the best audio track
 */
export function buildQualityOptions(formats) {
  const hasVideo = (f) => f.vcodec && f.vcodec !== 'none';
  const hasAudio = (f) => f.acodec && f.acodec !== 'none';

  const combined = formats.filter((f) => hasVideo(f) && hasAudio(f));
  const videoOnly = formats.filter((f) => hasVideo(f) && !hasAudio(f));
  const audioOnly = formats.filter((f) => !hasVideo(f) && hasAudio(f));

  const bestAudio = audioOnly
    .slice()
    .sort((a, b) => protoScore(b) + (b.abr || b.tbr || 0) - (protoScore(a) + (a.abr || a.tbr || 0)))[0];

  const options = [];

  // combined formats, one per height (best bitrate wins)
  const byHeight = bestPerHeight(combined);
  for (const [h, f] of [...byHeight.entries()].sort((a, b) => b[0] - a[0])) {
    options.push(makeOption(f, {
      id: f.format_id,
      kind: 'video',
      needsMerge: false,
      height: h,
      label: qualityLabel(f),
    }));
  }

  // video-only formats merged with the best audio
  const vHeight = bestPerHeight(
    videoOnly.filter((f) => !f.height || f.height <= config.maxVideoHeight)
  );
  for (const [h, f] of [...vHeight.entries()].sort((a, b) => b[0] - a[0])) {
    if (byHeight.has(h)) continue; // a combined format already exists at this height
    if (!bestAudio) break;
    options.push(makeOption(f, {
      id: `${f.format_id}+${bestAudio.format_id}`,
      kind: 'video',
      needsMerge: true,
      height: h,
      label: qualityLabel(f),
    }));
  }

  if (options.length === 0 && formats.length) {
    // Single format available (common on Facebook / Instagram).
    const f = formats[formats.length - 1];
    options.push(makeOption(f, {
      id: f.format_id,
      kind: hasVideo(f) ? 'video' : 'audio',
      needsMerge: false,
      height: f.height || 0,
      label: f.format_note || f.ext || 'default',
    }));
  }

  // MP3 audio option
  options.push({
    id: '__mp3__',
    kind: 'audio',
    label: 'MP3 audio',
    ext: 'mp3',
    height: 0,
    needsMerge: false,
    audioFormat: 'mp3',
    size: bestAudio ? bestAudio.filesize || bestAudio.filesize_approx || null : null,
    sizeText: bestAudio ? formatBytes(bestAudio.filesize || bestAudio.filesize_approx) : null,
    abr: bestAudio ? bestAudio.abr || null : null,
    sourceFormatId: bestAudio ? bestAudio.format_id : null,
  });

  return options;
}

function makeOption(f, extra) {
  const size = f.filesize || f.filesize_approx || null;
  return {
    id: extra.id,
    kind: extra.kind,
    label: extra.label,
    ext: f.ext || 'mp4',
    height: extra.height || 0,
    width: f.width || 0,
    fps: f.fps ? Math.round(f.fps) : null,
    needsMerge: extra.needsMerge,
    container: f.container || f.ext,
    size,
    sizeText: size ? formatBytes(size) : null,
    vcodec: f.vcodec,
    acodec: f.acodec,
    formatNote: f.format_note || '',
  };
}

function qualityLabel(f) {
  if (f.height) {
    const fps = f.fps && Math.round(f.fps) > 30 ? `${Math.round(f.fps)}` : null;
    return `${f.height}p${fps ? fps : ''}`;
  }
  return f.format_note || f.ext || 'default';
}

export function formatBytes(bytes) {
  if (!bytes && bytes !== 0) return null;
  const units = ['B', 'KB', 'MB', 'GB'];
  let v = Number(bytes);
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

export function formatDuration(seconds) {
  if (!seconds && seconds !== 0) return null;
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

/* ------------------------------------------------------------------ */
/* Direct URL resolution (enables HTTP Range / seeking in the browser)  */
/* ------------------------------------------------------------------ */

/**
 * Ask yt-dlp for the real media URL(s) of a format.
 * Returns an array (2 entries when a merge is requested).
 */
export async function getDirectUrls(url, formatSpec) {
  const { stdout } = await runYtDlp([
    ...baseArgs(url),
    '--no-playlist',
    '-f',
    formatSpec,
    '-g',
  ]);
  return stdout
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

/* ------------------------------------------------------------------ */
/* Temp file jobs + cleanup                                            */
/* ------------------------------------------------------------------ */

/** Create a unique temp folder for a job. */
export async function makeTempDir(prefix = 'dl') {
  await mkdir(TMP_DIR, { recursive: true });
  const dir = path.join(TMP_DIR, `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  await mkdir(dir, { recursive: true });
  return dir;
}

export async function removeTempDir(dir) {
  if (!dir) return;
  await rm(dir, { recursive: true, force: true }).catch(() => {});
}

/**
 * Download media to a real file inside `dir` and resolve with the file path.
 * Used for merged formats (DASH) because ffmpeg cannot stream a merged mp4
 * to a non-seekable pipe — use this instead of piping yt-dlp to stdout.
 */
export async function downloadToFile(url, formatSpec, dir, { audioOnly = false } = {}) {
  return new Promise((resolve, reject) => {
    const args = baseArgs(url);
    args.push('--no-playlist');
    if (audioOnly) {
      args.push('-x', '--audio-format', 'mp3', '--audio-quality', '0');
    } else if (formatSpec) {
      args.push('-f', formatSpec);
      if (formatSpec.includes('+')) args.push('--merge-output-format', 'mp4');
    }
    args.push('-o', path.join(dir, 'media.%(ext)s'));

    const child = spawn(YTDLP, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (d) => {
      stderr += d.toString();
      if (stderr.length > 8000) stderr = stderr.slice(-8000);
    });
    child.on('error', (err) => reject(new Error(`Failed to start yt-dlp: ${err.message}`)));
    child.on('close', async (code) => {
      if (code !== 0) return reject(new Error(cleanError(stderr) || `yt-dlp exited with code ${code}`));
      try {
        const files = await readdir(dir);
        const media = files.find((f) => f.startsWith('media.'));
        if (!media) return reject(new Error('Download produced no output file'));
        const full = path.join(dir, media);
        const info = await stat(full);
        resolve({ path: full, size: info.size, ext: path.extname(media).slice(1) || 'mp4' });
      } catch (err) {
        reject(new Error(`Failed to locate downloaded file: ${err.message}`));
      }
    });
  });
}

/** Small helper so callers can pipe a child stdout into an HTTP response. */
export function childStdout(child) {
  return Readable.from(child.stdout);
}
