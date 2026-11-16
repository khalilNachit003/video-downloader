# ── Video Downloader image ──────────────────────────────────────────
# Debian-based so that yt-dlp (pip) + ffmpeg work reliably.
FROM node:22-bookworm-slim

ENV NODE_ENV=production \
    PORT=3000 \
    SKIP_BIN_DOWNLOAD=1 \
    YTDLP_PATH=/usr/local/bin/yt-dlp \
    FFMPEG_PATH=/usr/bin/ffmpeg

# ffmpeg  -> merge video+audio streams and create MP3
# python3 -> runtime for yt-dlp
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ffmpeg \
        python3 \
        python3-pip \
        ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# yt-dlp -> the download engine
RUN pip3 install --break-system-packages --no-cache-dir --upgrade yt-dlp \
    && yt-dlp --version

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts

COPY src ./src
COPY public ./public
COPY scripts ./scripts

RUN mkdir -p /app/tmp && chown -R node:node /app

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "src/server.js"]
