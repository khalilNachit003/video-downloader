import path from 'node:path';
import fs from 'node:fs';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import morgan from 'morgan';
import { config, ROOT, TMP_DIR } from './config.js';
import apiRoutes from './routes/api.js';

const app = express();
app.set('trust proxy', 1); // Render / Railway sit behind a proxy

/* ------------------------------------------------------------------ */
/* Security + parsing                                                  */
/* ------------------------------------------------------------------ */
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
        mediaSrc: ["'self'", 'blob:', 'https:'],
        connectSrc: ["'self'"],
        fontSrc: ["'self'", 'data:'],
        objectSrc: ["'none'"],
        frameAncestors: ["'self'"],
        upgradeInsecureRequests: null,
      },
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

if (config.corsOrigins.length) {
  app.use(cors({ origin: config.corsOrigins, credentials: false }));
}

app.use(express.json({ limit: '256kb' }));
app.use(express.urlencoded({ extended: true, limit: '256kb' }));

// Do NOT compress media streams (it breaks range requests and wastes CPU).
app.use(
  compression({
    filter: (req, res) => {
      if (req.path.startsWith('/api/download')) return false;
      return compression.filter(req, res);
    },
  })
);

if (process.env.NODE_ENV !== 'test') {
  app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
}

/* ------------------------------------------------------------------ */
/* Static frontend                                                     */
/* ------------------------------------------------------------------ */
const publicDir = path.join(ROOT, 'public');
app.use(
  express.static(publicDir, {
    maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0,
    etag: true,
  })
);

/* ------------------------------------------------------------------ */
/* API                                                                 */
/* ------------------------------------------------------------------ */
app.use('/api', apiRoutes);

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(publicDir, 'index.html'));
});

app.use((req, res) => {
  res.status(404).json({ error: 'Not found.' });
});

/* eslint-disable-next-line no-unused-vars */
app.use((err, req, res, _next) => {
  console.error('[error]', err);
  if (res.headersSent) return res.end();
  res.status(500).json({ error: 'Unexpected server error.' });
});

/* ------------------------------------------------------------------ */
/* Boot + housekeeping                                                  */
/* ------------------------------------------------------------------ */
function cleanTmp() {
  try {
    if (!fs.existsSync(TMP_DIR)) return;
    for (const entry of fs.readdirSync(TMP_DIR)) {
      const full = path.join(TMP_DIR, entry);
      try {
        fs.rmSync(full, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
  }
}

const server = app.listen(config.port, config.host, () => {
  console.log(`\n  ▸ ${config.brand.name}`);
  console.log(`  ▸ listening on http://localhost:${config.port}`);
  console.log(`  ▸ brand tagline: ${config.brand.tagline}\n`);
  // Free-tier hosts recycle containers; wipe leftovers on boot.
  cleanTmp();
});

setInterval(cleanTmp, 30 * 60 * 1000).unref();

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    console.log(`\n${sig} received, shutting down…`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5000).unref();
  });
}

export { app, server };
