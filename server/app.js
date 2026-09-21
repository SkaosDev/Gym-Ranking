import { existsSync } from 'node:fs';
import path from 'node:path';
import express from 'express';
import session from 'express-session';

import { ApiError } from './lib/errors.js';
import { SESSION_COOKIE_NAME, SESSION_TTL_MS, SqliteSessionStore } from './lib/session.js';
import { errorHandler } from './middleware/errorHandler.js';
import { jsonOnly } from './middleware/jsonOnly.js';
import authRoutes from './routes/auth.js';
import exerciseRoutes from './routes/exercises.js';
import meRoutes from './routes/me.js';
import performanceRoutes from './routes/performances.js';
import rankRoutes from './routes/ranks.js';
import statsRoutes from './routes/stats.js';

const CLIENT_DIST = path.join(import.meta.dirname, '..', 'client', 'dist');

const DEVELOPMENT_SECRET = 'gymrank-insecure-development-secret';

/**
 * Builds the Express application. The API is JSON only and never renders HTML;
 * the built client is served as static files with an SPA fallback so the whole
 * app can run from a single origin at demo time.
 */
export function createApp({ sessionStore } = {}) {
  const app = express();
  app.disable('x-powered-by');
  // Only loopback is trusted, which is all the Vite dev proxy needs.
  app.set('trust proxy', 'loopback');

  app.use(express.json({ limit: '64kb' }));

  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    console.warn('[startup] SESSION_SECRET is not set; falling back to a development value.');
  }

  app.use(
    session({
      name: SESSION_COOKIE_NAME,
      store: sessionStore ?? new SqliteSessionStore(),
      secret: secret ?? DEVELOPMENT_SECRET,
      resave: false,
      saveUninitialized: false,
      rolling: true,
      cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: false, // localhost is plain http; a real deployment would set this
        maxAge: SESSION_TTL_MS,
        path: '/',
      },
    }),
  );

  // ---------------------------------------------------------------- API routes
  app.use('/api', jsonOnly);

  app.get('/api/healthz', (req, res) => {
    res.json({
      status: 'ok',
      node: process.version,
      uptimeSeconds: Math.round(process.uptime()),
    });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/exercises', exerciseRoutes);
  app.use('/api/performances', performanceRoutes);
  app.use('/api/ranks', rankRoutes);
  app.use('/api/stats', statsRoutes);
  app.use('/api/me', meRoutes);

  // Anything under /api that no route above claimed is a 404, not the SPA.
  app.use('/api', (req, res, next) => {
    next(ApiError.notFound(`No API endpoint for ${req.method} ${req.baseUrl}${req.path}`));
  });

  // ------------------------------------------------------------- Static client
  const hasBuild = existsSync(path.join(CLIENT_DIST, 'index.html'));
  if (hasBuild) {
    app.use(express.static(CLIENT_DIST));
    // Client-side routing: every non-API path returns the SPA shell so that
    // deep links such as /progress survive a hard reload.
    app.get('/{*splat}', (req, res) => {
      res.sendFile(path.join(CLIENT_DIST, 'index.html'));
    });
  } else {
    app.get('/{*splat}', (req, res) => {
      res.status(404).json({
        error: {
          code: 'NO_CLIENT_BUILD',
          message:
            'No client build found. In development use the Vite dev server on port 5173; ' +
            'for a single-origin run, execute "npm run build" first.',
        },
      });
    });
  }

  app.use(errorHandler);
  return app;
}

export { CLIENT_DIST };
