#!/usr/bin/env node
/**
 * Downloads the external binaries the app needs:
 *   - yt-dlp  (the actual downloader engine)
 *   - ffmpeg  (needed to merge separate video+audio streams for high quality)
 *
 * Binaries land in ./bin and are git-ignored.
 * In Docker we install ffmpeg from apt and yt-dlp from the same script,
 * so the script must never fail the build hard.
 */
import { mkdir, writeFile, stat, chmod, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const BIN_DIR = path.join(ROOT, 'bin');

const isWindows = process.platform === 'win32';
const YTDLP_NAME = isWindows ? 'yt-dlp.exe' : 'yt-dlp';
const FFMPEG_NAME = isWindows ? 'ffmpeg.exe' : 'ffmpeg';

const YTDLP_URL = `https://github.com/yt-dlp/yt-dlp/releases/latest/download/${YTDLP_NAME}`;

// Mirrors for the Windows ffmpeg build, tried in order.
const FFMPEG_URLS = isWindows
  ? [
      'https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip',
      'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip',
      'https://github.com/GyanD/codexffmpeg/releases/download/7.1/ffmpeg-7.1-essentials_build.zip',
    ]
  : []; // on Linux we use apt (see Dockerfile)

const log = (...a) => console.log('[install-bins]', ...a);

async function exists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function download(url, dest, redirects = 5) {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(dest, buf);
  return buf.length;
}

/** Extract a zip using the tar.exe that ships with Windows 10+ (bsdtar understands zip). */
async function extractZip(zipPath, outDir) {
  await execFileAsync('tar', ['-xf', zipPath, '-C', outDir]);
}

async function installYtdlp() {
  const dest = path.join(BIN_DIR, YTDLP_NAME);
  if (await exists(dest)) {
    log('yt-dlp already present, skipping.');
    return true;
  }
  log('Downloading yt-dlp…');
  const size = await download(YTDLP_URL, dest);
  if (!isWindows) await chmod(dest, 0o755);
  log(`yt-dlp installed (${(size / 1024 / 1024).toFixed(1)} MB) -> ${dest}`);
  return true;
}

async function installFfmpeg() {
  const dest = path.join(BIN_DIR, FFMPEG_NAME);
  if (await exists(dest)) {
    log('ffmpeg already present, skipping.');
    return true;
  }
  if (!FFMPEG_URLS.length) {
    log('ffmpeg not handled on this platform by this script (use apt install ffmpeg).');
    return false;
  }

  for (const url of FFMPEG_URLS) {
    const tmpZip = path.join(os.tmpdir(), `ffmpeg-${Date.now()}.zip`);
    const tmpDir = path.join(os.tmpdir(), `ffmpeg-${Date.now()}`);
    try {
      log(`Downloading ffmpeg from ${new URL(url).host}…`);
      const size = await download(url, tmpZip);
      log(`  archive: ${(size / 1024 / 1024).toFixed(1)} MB`);

      await mkdir(tmpDir, { recursive: true });
      await extractZip(tmpZip, tmpDir);

      // Archives look like "ffmpeg-7.1-essentials_build/bin/ffmpeg.exe"
      const { stdout } = await execFileAsync('tar', ['-tf', tmpZip]).catch(() => ({ stdout: '' }));
      const entry = stdout
        .split(/\r?\n/)
        .find((l) => l.replace(/\\/g, '/').toLowerCase().endsWith(`/bin/${FFMPEG_NAME}`));
      if (!entry) throw new Error('ffmpeg executable not found inside the archive');

      await execFileAsync('tar', ['-xf', tmpZip, '-C', tmpDir, entry]);
      const inner = path.join(tmpDir, entry);
      await mkdir(BIN_DIR, { recursive: true });
      const { readFile } = await import('node:fs/promises');
      await writeFile(dest, await readFile(inner));

      // ffprobe is a nice-to-have; copy it next to ffmpeg when present.
      const probeEntry = stdout
        .split(/\r?\n/)
        .find((l) => l.replace(/\\/g, '/').toLowerCase().endsWith(`/bin/${isWindows ? 'ffprobe.exe' : 'ffprobe'}`));
      if (probeEntry) {
        await execFileAsync('tar', ['-xf', tmpZip, '-C', tmpDir, probeEntry]);
        await writeFile(
          path.join(BIN_DIR, isWindows ? 'ffprobe.exe' : 'ffprobe'),
          await readFile(path.join(tmpDir, probeEntry))
        );
      }

      log(`ffmpeg installed -> ${dest}`);
      return true;
    } catch (err) {
      log(`  mirror failed: ${err.message}`);
    } finally {
      await rm(tmpZip, { force: true }).catch(() => {});
      await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  log('ffmpeg install skipped (all mirrors failed). Merged qualities and MP3 will be unavailable.');
  return false;
}

async function main() {
  if (process.env.SKIP_BIN_DOWNLOAD === '1') {
    log('SKIP_BIN_DOWNLOAD=1 — skipping (the image provides its own binaries).');
    return;
  }
  await mkdir(BIN_DIR, { recursive: true });
  await installYtdlp();
  await installFfmpeg();
  if (!isWindows && !(await exists('/usr/bin/ffmpeg')) && !(await exists('/usr/local/bin/ffmpeg'))) {
    log('NOTE: ffmpeg not found in system paths.');
  }
}

main().catch((err) => {
  console.error('[install-bins] failed:', err.message);
  // Never break `npm install` — the app degrades gracefully without the binaries.
  process.exit(0);
});
