/**
 * ffmpeg wrapper used for progressive (stream-while-downloading) remuxing.
 *
 * The video+audio DASH files served by YouTube can be remuxed into a
 * fragmented MP4 *on the fly*, so instead of waiting for the whole file to
 * be downloaded and merged on disk, the browser starts receiving a valid,
 * streamable `.mp4` as soon as ffmpeg fetches the first bytes.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { resolveFfmpegDir, isWindows } from '../config.js';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36';

function ffmpegPath() {
  const dir = resolveFfmpegDir();
  if (dir) return path.join(dir, isWindows ? 'ffmpeg.exe' : 'ffmpeg');
  return 'ffmpeg'; // PATH
}

/**
 * Run ffmpeg locally (file inputs, real output file) and resolve when done.
 */
export function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath(), args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (d) => {
      stderr += d.toString();
      if (stderr.length > 4000) stderr = stderr.slice(-4000);
    });
    child.on('error', (err) => reject(new Error(`Failed to start ffmpeg: ${err.message}`)));
    child.on('close', (code) => {
      if (code === 0) return resolve({ stderr });
      const tail = stderr.trim().split('\n').slice(-3).join(' ').slice(0, 300);
      reject(new Error(tail ? `ffmpeg failed: ${tail}` : `ffmpeg exited with code ${code}`));
    });
  });
}

/**
 * Spawn ffmpeg to remux one or two inputs into MPEG-TS-free fragmented
 * MP4 (or MP3 for audio) piped to stdout.
 *
 *   videoUrl present -> video + audio remux (`-c copy`)
 *   audioOnly        -> transcode to MP3
 */
export function spawnFfmpeg({ videoUrl, audioUrl, audioOnly = false }) {
  const args = ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y'];
  // YouTube throttles full GET connections (SABR) to a trickle, but serves
  // range requests at full speed — so always ask for an open range.
  const headers = `User-Agent: ${UA}\r\nRange: bytes=0-\r\n`;

  if (videoUrl) args.push('-headers', headers, '-i', videoUrl);
  if (audioUrl) args.push('-headers', headers, '-i', audioUrl);

  if (audioOnly) {
    args.push('-vn', '-ac', '2', '-b:a', '192k', '-acodec', 'libmp3lame', '-f', 'mp3', 'pipe:1');
  } else {
    args.push(
      '-c', 'copy',
      '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
      '-f', 'mp4',
      'pipe:1'
    );
  }

  const child = spawn(ffmpegPath(), args, {
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stderr = '';
  child.stderr.on('data', (d) => {
    stderr += d.toString();
    if (stderr.length > 4000) stderr = stderr.slice(-4000);
  });
  child.ffmpegStderr = () => stderr;

  return child;
}
