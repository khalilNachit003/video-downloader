import { spawn } from 'node:child_process';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36';

const url = process.argv[2];
const rangeHeader = 'User-Agent: ' + UA + '\r\nRange: bytes=0-\r\n';

const t0 = Date.now();
await new Promise((resolve, reject) => {
  const child = spawn(
    'C:\\Users\\PC\\Desktop\\video-downloader\\bin\\ffmpeg.exe',
    ['-hide_banner', '-loglevel', 'info', '-headers', rangeHeader, '-i', url, '-t', '10', '-f', 'null', '-'],
    { windowsHide: true }
  );
  let buf = '';
  child.stderr.on('data', (d) => (buf += d));
  child.on('error', reject);
  child.on('close', (code) => {
    console.log('exit code:', code, 'time:', Date.now() - t0, 'ms');
    const tail = buf.split('\n').slice(-12).join('\n');
    console.log('---- last lines:\n' + tail);
    resolve();
  });
});
