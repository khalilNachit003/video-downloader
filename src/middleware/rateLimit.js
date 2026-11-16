import rateLimit from 'express-rate-limit';

const { windowMs, max, downloadMax } = {
  windowMs: 60 * 1000,
  max: 30,
  downloadMax: 10,
};

/** General API limiter: metadata lookups, playlists. */
export const apiLimiter = rateLimit({
  windowMs,
  max,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please slow down.' },
  skip: (req) => req.path === '/api/health',
});

/** Stricter limiter for actual media downloads (each one is expensive). */
export const downloadLimiter = rateLimit({
  windowMs,
  max: downloadMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Download limit reached. Please wait a minute and try again.' },
});
