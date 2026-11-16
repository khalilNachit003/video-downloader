/**
 * Background download jobs.
 *
 * A job:
 *   1. resolves the direct media URLs through yt-dlp (fast),
 *   2. downloads them in parallel chunks (way faster than a single
 *      full-GET connection, which YouTube throttles on SABR traffic),
 *   3. remuxes locally with ffmpeg,
 *   4. becomes available at /api/download-job/:id/file for Range-streamed
 *      delivery to the browser.
 *
 * The frontend polls /api/download-job/:id/status to drive the progress bar.
 */
import path from 'node:path';
import { stat } from 'node:fs/promises';
import { downloadFileToPath } from './chunked-dl.js';
import { getDirectUrls } from './ytdlp.js';
import { runFfmpeg } from './ffmpeg.js';
import { cleanError } from './ytdlp.js';

export async function runDownloadJob(job, url, formatSpec) {
  const dir = job.dir;

  try {
    if (formatSpec === '__mp3__') {
      const [audioUrl] = await getDirectUrls(url, 'bestaudio/best');
      if (!audioUrl) throw new Error('No audio source found for this link');

      const audioRaw = path.join(dir, 'audio.raw');
      job.totalBytes = 0;
      await downloadFileToPath(audioUrl, audioRaw, {
        onProgress: (done, total) => {
          job.bytesDone = done;
          job.totalBytes = total;
        },
      });

      const out = path.join(dir, 'media.mp3');
      await runFfmpeg(['-y', '-i', audioRaw, '-vn', '-acodec', 'libmp3lame', '-q:a', '2', out]);
      job.file = out;
      job.ext = 'mp3';
      job.totalBytes = (await stat(out)).size;
      job.bytesDone = job.totalBytes;
      job.state = 'done';
      return;
    }

    const direct = await getDirectUrls(url, formatSpec || 'bv*+ba/b');

    if (direct.length === 2) {
      const videoRaw = path.join(dir, 'video.raw');
      const audioRaw = path.join(dir, 'audio.raw');
      let vDone = 0,
        vTotal = 0,
        aDone = 0,
        aTotal = 0;
      const bump = () => {
        job.bytesDone = vDone + aDone;
        job.totalBytes = vTotal + aTotal;
      };

      await Promise.all([
        downloadFileToPath(direct[0], videoRaw, {
          onProgress: (d, t) => {
            vDone = d;
            vTotal = t;
            bump();
          },
        }),
        downloadFileToPath(direct[1], audioRaw, {
          onProgress: (d, t) => {
            aDone = d;
            aTotal = t;
            bump();
          },
        }),
      ]);

      const out = path.join(dir, 'media.mp4');
      await runFfmpeg(['-y', '-i', videoRaw, '-i', audioRaw, '-c', 'copy', '-movflags', '+faststart', out]);

      job.file = out;
      job.ext = 'mp4';
      job.totalBytes = (await stat(out)).size;
      job.bytesDone = job.totalBytes;
      job.state = 'done';
      return;
    }

    if (direct.length === 1) {
      const ext = guessExt(direct[0], formatSpec);
      const out = path.join(dir, `media.${ext}`);
      await downloadFileToPath(direct[0], out, {
        onProgress: (done, total) => {
          job.bytesDone = done;
          job.totalBytes = total;
        },
      });
      job.file = out;
      job.ext = ext;
      job.bytesDone = job.totalBytes;
      job.state = 'done';
      return;
    }

    throw new Error('No downloadable streams were found for this link');
  } catch (err) {
    job.state = 'error';
    job.error = cleanError(err.message);
    console.error('[download-job]', job.id, err);
  }
}

function guessExt(url, formatSpec) {
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
