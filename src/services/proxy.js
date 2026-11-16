/**
 * Streams an upstream media URL straight through to the browser.
 *
 * Why not just redirect the browser to the media URL?
 *  - YouTube/Facebook CDN URLs are bound to the IP that resolved them, so the
 *    browser (a different IP) would get 403. The proxy resolves and fetches
 *    from the server, which is the IP yt-dlp used.
 *  - It also lets us force the `Content-Disposition` filename.
 */
export async function proxyMedia(req, res, upstreamUrl, { filename, contentType }) {
  const headers = {};
  const range = req.headers.range;
  if (range) headers.Range = range;
  if (req.headers['user-agent']) headers['User-Agent'] = req.headers['user-agent'];

  const controller = new AbortController();
  req.on('close', () => controller.abort());

  let upstream;
  try {
    upstream = await fetch(upstreamUrl, {
      headers,
      redirect: 'follow',
      signal: controller.signal,
    });
  } catch (err) {
    if (controller.signal.aborted) return res.end();
    res.status(502).json({ error: 'Failed to reach the media server.' });
    return;
  }

  if (!upstream.ok && upstream.status !== 206) {
    res.status(upstream.status === 403 ? 403 : 502).json({
      error:
        upstream.status === 403
          ? 'The media server refused the request (403). Try again.'
          : `Media server error (${upstream.status}).`,
    });
    return;
  }

  res.status(upstream.status);

  const type = upstream.headers.get('content-type') || contentType || 'application/octet-stream';
  res.setHeader('Content-Type', type);
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Cache-Control', 'private, max-age=0, no-store');

  if (upstream.headers.get('content-length')) {
    res.setHeader('Content-Length', upstream.headers.get('content-length'));
  }
  if (upstream.headers.get('content-range')) {
    res.setHeader('Content-Range', upstream.headers.get('content-range'));
  }
  if (filename) {
    const ascii = filename.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '');
    res.setHeader('Content-Disposition', `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`);
  }

  if (req.method === 'HEAD') {
    res.end();
    upstream.body?.cancel?.();
    return;
  }

  try {
    const reader = upstream.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!res.write(value)) {
        await new Promise((resolve) => res.once('drain', resolve));
      }
    }
    res.end();
  } catch {
    res.end();
  }
}
