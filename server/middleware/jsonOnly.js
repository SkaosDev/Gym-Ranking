import { ApiError } from '../lib/errors.js';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Every mutating request must declare application/json.
 *
 * A cross-site HTML form can only send GET or POST with a form content type,
 * and cannot set a custom one without triggering a CORS preflight. Requiring
 * JSON here, together with SameSite=Lax on the session cookie, therefore
 * closes the realistic CSRF vector for a local app. A public deployment would
 * still want real CSRF tokens; the README says so.
 */
export function jsonOnly(req, res, next) {
  if (!MUTATING_METHODS.has(req.method)) return next();

  const mediaType = (req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
  if (mediaType === 'application/json') return next();

  return next(
    new ApiError(
      415,
      'UNSUPPORTED_MEDIA_TYPE',
      'This API accepts application/json only. Set the Content-Type header.',
    ),
  );
}
