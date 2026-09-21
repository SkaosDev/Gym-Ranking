import { ApiError } from '../lib/errors.js';

/**
 * Terminal error middleware. A stack trace never reaches the client: unexpected
 * errors are logged here and reported as a bare 500.
 */
export function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    next(err);
    return;
  }

  if (err instanceof ApiError) {
    const body = { error: { code: err.code, message: err.message } };
    if (err.fields) body.error.fields = err.fields;
    res.status(err.status).json(body);
    return;
  }

  // express.json() rejects malformed bodies with these; they are client errors.
  if (err?.type === 'entity.parse.failed') {
    res.status(400).json({
      error: { code: 'INVALID_JSON', message: 'Request body is not valid JSON.' },
    });
    return;
  }
  if (err?.type === 'entity.too.large') {
    res.status(413).json({
      error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body is too large.' },
    });
    return;
  }

  console.error(`[error] ${req.method} ${req.originalUrl}`, err);
  res.status(500).json({
    error: { code: 'INTERNAL', message: 'Something went wrong on the server.' },
  });
}
