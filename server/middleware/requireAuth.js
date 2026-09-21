import { ApiError } from '../lib/errors.js';
import { findUserById } from '../lib/users.js';

/** Rejects anonymous requests and attaches the current user row as req.user. */
export function requireAuth(req, res, next) {
  const userId = req.session?.user_id;
  if (!userId) return next(ApiError.unauthenticated());

  const user = req.user ?? findUserById(userId);
  if (!user) {
    // The account was deleted while the session lived on.
    req.session.destroy(() => {});
    return next(ApiError.unauthenticated('Your account is no longer available.'));
  }

  req.user = user;
  return next();
}
