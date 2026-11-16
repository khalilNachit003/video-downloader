import path from 'node:path';
import os from 'node:os';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, '..');
export const BIN_DIR = path.join(ROOT, 'bin');
export const TMP_DIR = path.join(ROOT, 'tmp');

export const config = {
  brand: {
    // Change these two lines to rebrand the whole site.
    name: process.env.BRAND_NAME || 'Video Downloader',
    tagline: process.env.BRAND_TAGLINE || 'Download videos from YouTube, Facebook & Instagram',
  },

  port: Number(process.env.PORT) || 3000,
  host: process.env.HOST || '0.0.0.0',

  // Path to a Netscape-format cookies.txt used for Instagram/Facebook when needed.
  cookiesFile: process.env.COOKIES_FILE || '',

  // Max concurrent yt-dlp processes. Keep low on free-tier hosts (512MB RAM).
  maxConcurrentJobs: Number(process.env.MAX_CONCURRENT_JOBS) || 2,
  jobTimeoutMs: Number(process.env.JOB_TIMEOUT_MS) || 5 * 60 * 1000,

  // Comma separated list of allowed origins for CORS (empty = same-origin only).
  corsOrigins: (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  rateLimit: {
    windowMs: 60 * 1000,
    max: Number(process.env.RATE_LIMIT_MAX) || 30,
    downloadMax: Number(process.env.RATE_LIMIT_DOWNLOAD_MAX) || 10,
  },

  tmpDir: TMP_DIR,
  maxVideoHeight: Number(process.env.MAX_VIDEO_HEIGHT) || 2160,
};

export const isWindows = process.platform === 'win32';
export const platformBin = (name) =>
  path.join(BIN_DIR, isWindows ? `${name}.exe` : name);

/** Where yt-dlp lives: env override, then ./bin, then system PATH. */
export function resolveYtdlp() {
  if (process.env.YTDLP_PATH) return process.env.YTDLP_PATH;
  const local = platformBin('yt-dlp');
  if (existsSyncSafe(local)) return local;
  return 'yt-dlp';
}

export function resolveFfmpegDir() {
  if (process.env.FFMPEG_PATH) return path.dirname(process.env.FFMPEG_PATH);
  if (process.env.FFMPEG_LOCATION) return process.env.FFMPEG_LOCATION;
  const local = platformBin('ffmpeg');
  if (existsSyncSafe(local)) return BIN_DIR;
  for (const rel of [
    'node_modules/ffmpeg-static/ffmpeg.exe',
    'node_modules/ffmpeg-static/ffmpeg',
  ]) {
    const p = path.join(ROOT, rel);
    if (existsSyncSafe(p)) return path.dirname(p);
  }
  return undefined; // let yt-dlp look in PATH
}

/**
 * Whether ffmpeg is reachable. Merging separate video+audio streams and
 * creating MP3 files both require it.
 */
export function hasFfmpeg() {
  const dir = resolveFfmpegDir();
  if (dir && existsSyncSafe(path.join(dir, isWindows ? 'ffmpeg.exe' : 'ffmpeg'))) return true;
  const systemPaths = [
    '/usr/bin/ffmpeg',
    '/usr/local/bin/ffmpeg',
    'C:\\ffmpeg\\bin\\ffmpeg.exe',
    'C:\\Program Files\\ffmpeg\\bin\\ffmpeg.exe',
  ];
  return systemPaths.some((p) => existsSyncSafe(p));
}

function existsSyncSafe(p) {
  try {
    return existsSync(p);
  } catch {
    return false;
  }
}

export const tmpRoot = os.tmpdir();
