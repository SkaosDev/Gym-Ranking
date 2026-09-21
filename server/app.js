import { existsSync } from 'node:fs';
import path from 'node:path';
import express from 'express';

import { ApiError } from './lib/errors.js';
import { errorHandler } from './middleware/errorHandler.js';

const CLIENT_DIST = path.join(import.meta.dirname, '..', 'client', 'dist');

/**
 * Builds the Express application. The API is JSON only and never renders HTML;
 * the built client is served as static files with an SPA fallback so the whole
 * app can run from a single origin at demo time.
 */
export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '64kb' }));

  // ---------------------------------------------------------------- API routes
  app.get('/api/healthz', (req, res) => {
    res.json({
      status: 'ok',
      node: process.version,
      uptimeSeconds: Math.round(process.uptime()),
    });
  });

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
