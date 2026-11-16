/**
 * Parallel chunked downloading of media URLs that support HTTP Range.
 *
 * YouTube throttles single full-GET connections (SABR) to a trickle,
 * but serves concurrent range requests at full speed — so we split the
 * file into chunks and fetch them with a small worker pool.
 */
import { open } from 'node:fs/promises';

export const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36';

async function probeTotalBytes(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Range: 'bytes=0-0' },
    redirect: 'follow',
  });
  const cr = res.headers.get('content-range'); // e.g. "bytes 0-0/4821978"
  const match = /bytes \d+-\d+\/(\d+)/.exec(cr || '');
  if (match) return Number(match[1]);
  const len = Number(res.headers.get('content-length'));
  if (Number.isFinite(len)) return len;
  throw new Error('Cannot determine remote file size');
}

/**
 * Download `url` to `filePath`, updating `onProgress(bytesDone, totalBytes)`.
 * Throws when a chunk fails (caller retries / reports the job as failed).
 */
export async function downloadFileToPath(
  url,
  filePath,
  { concurrency = 5, chunkBytes = 2 * 1024 * 1024, onProgress = () => {} } = {}
) {
  const total = await probeTotalBytes(url);
  const handle = await open(filePath, 'w');
  await handle.truncate(total);

  const ranges = [];
  for (let start = 0; start < total; start += chunkBytes) {
    ranges.push([start, Math.min(start + chunkBytes - 1, total - 1)]);
  }

  let done = 0;
  let index = 0;

  async function worker() {
    for (;;) {
      const i = index++;
      if (i >= ranges.length) return;
      const [start, end] = ranges[i];
      const res = await fetch(url, {
        headers: { 'User-Agent': UA, Range: `bytes=${start}-${end}` },
        redirect: 'follow',
      });
      if (res.status !== 206 && res.status !== 200) {
        throw new Error(`Chunk request failed with HTTP ${res.status}`);
      }
      const buf = Buffer.from(await res.arrayBuffer());
      await handle.write(buf, 0, buf.length, start);
      done += buf.length;
      onProgress(done, total);
    }
  }

  try {
    await Promise.all(Array.from({ length: Math.min(concurrency, ranges.length) }, worker));
  } finally {
    await handle.close();
  }

  return total;
}
