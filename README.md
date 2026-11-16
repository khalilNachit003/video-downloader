# ⬇ Video Downloader

Download clips from YouTube, Facebook, Instagram and other platforms. Paste a
link, pick a quality, and the file is streamed **straight to the user's device**
— files are never stored on the server.

Built with **Node.js + Express**, **yt-dlp** and **ffmpeg**. Bilingual UI
(Arabic RTL by default, English LTR).

## Features

- Single link analysis with title, thumbnail, duration, views and uploader
- Quality picker (144p → 4K) — merged video+audio streams
- Audio-only MP3 download
- Download whole playlists / channels (`/api/playlist`)
- Batch mode — analyze up to 20 links at once (`/api/batch`)
- Download history (stored in the browser only)
- Rate limiting + legal disclaimer page
- Ready-to-deploy Dockerfile / Render / Railway config

## Requirements

- Node.js ≥ 20
- Windows / Linux / macOS
- `yt-dlp` & `ffmpeg` — installed automatically by `postinstall` into `bin/`,
  or use system binaries (`YTDLP_PATH`, `FFMPEG_PATH`)

## Local setup

```bash
npm install
npm run dev
```

Then open <http://localhost:3000>

## Environment variables

See `.env.example`. The most useful ones:

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `BRAND_NAME` | `Video Downloader` | Site name in header/meta |
| `BRAND_TAGLINE` | … | Hero slogan |
| `RATE_LIMIT_MAX` | `30` | API calls / IP / minute |
| `RATE_LIMIT_DOWNLOAD_MAX` | `10` | downloads / IP / minute |
| `MAX_CONCURRENT_JOBS` | `2` | concurrent yt-dlp processes |
| `COOKIES_FILE` | — | Netscape cookies.txt for Instagram/Facebook |

## Docker

```bash
docker build -t video-downloader .
docker run --rm -p 3000:3000 video-downloader
```

## Deploy on Render (free)

1. Push this repo to GitHub.
2. Create a **Web Service** on Render → "Docker" environment → select the repo.
   (`render.yaml` is already present and will be picked up.)
3. Done — health check: `/api/health`.

## Deploy on Railway

`railway.toml` is included. In Railway: **Deploy from GitHub repo** → the file
is detected automatically and the Dockerfile is used.

> Note: free-tier containers may be killed on inactivity, so your 4K downloads
> (~300 MB) can be cut by the platform's own limits. Self-host if you need
> guaranteed large downloads.

## Instagram / Facebook need cookies

Both platforms aggressively block anonymous scraping. Without cookies, expect
"login required" errors for private/age-restricted content. To fix:

1. Export a Netscape-format `cookies.txt` (browser extension *Get cookies.txt*)
2. Set `COOKIES_FILE=/path/to/cookies.txt`

## Notes / limitations

- YouTube currently exposes only split (video-only + audio-only) DASH files to
  generic clients; the server therefore always downloads to a temp file,
  merges with ffmpeg and streams the result to the browser.
- Files are written to disk then streamed and deleted automatically.
- Some videos (members-only, age-restricted, geo-blocked, deleted) cannot be
  downloaded — a friendly Arabic/English error is shown instead.

## Legal

This tool is for downloading content you own or that is legally available for
download. Do **not** use it to infringe copyright. Users are responsible for
their own actions. See the in-app "Terms / Privacy" pages.

## Architecture

```
src/
  server.js            Express app, helmet/CSP, static, cleanup
  config.js            brand + limits + binary resolution
  services/
    platforms.js       platform detection (YouTube/Facebook/Instagram/…)
    ytdlp.js           yt-dlp wrapper (metadata, playlist, download-to-file)
    proxy.js           Range-aware reverse proxy for direct media URLs
    middleware/        express-rate-limit
public/                static frontend (vanilla JS, a11y, i18n ar/en)
```

## API

- `GET  /api/health` — status, brand, ffmpeg availability
- `GET  /api/platforms` — supported platform list
- `GET|POST /api/resolve?url=` — metadata + quality list
- `POST /api/batch  {urls:[...]}` — analyze up to 20 links
- `POST /api/playlist {url}` — list playlist entries
- `GET|POST /api/download?url=&format=&title=` — stream the file to the browser
