import { Router } from 'express';

import { get, run, tx } from '../lib/db.js';
import { ApiError } from '../lib/errors.js';
import { hashPassword, verifyPassword } from '../lib/password.js';
import { ageOn } from '../lib/scoring.js';
import { MIN_AGE } from '../lib/scoring-config.js';
import { SESSION_COOKIE_NAME } from '../lib/session.js';
import { findAuthUserByEmail, findUserById, ownerProfile } from '../lib/users.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { loginThrottle, loginThrottleKey } from '../middleware/throttle.js';
import { validateBody } from '../middleware/validate.js';

const router = Router();

const today = () => new Date().toISOString().slice(0, 10);

/**
 * Scrypt work performed when no account matches, so a missing email and a wrong
 * password take comparable time and cannot be told apart by a stopwatch.
 */
const DECOY_CREDENTIALS = { hash: '00'.repeat(64), salt: '00'.repeat(16) };

const promisifySession = (method) => (req) =>
  new Promise((resolve, reject) => {
    req.session[method]((error) => (error ? reject(error) : resolve()));
  });

const regenerateSession = promisifySession('regenerate');
const saveSession = promisifySession('save');
const destroySession = promisifySession('destroy');

/** Starts a fresh session bound to a user; the id changes to defeat fixation. */
async function startSession(req, userId) {
  await regenerateSession(req);
  req.session.user_id = userId;
  await saveSession(req);
}

const signupSchema = {
  email: { type: 'email', required: true },
  username: { type: 'username', required: true },
  password: { type: 'password', required: true, min: 8 },
  sex: { type: 'enum', values: ['M', 'F'], required: true },
  birth_date: { type: 'date', required: true, notFuture: true, notBefore: '1900-01-01' },
  height_cm: { type: 'number', required: true, min: 100, max: 250 },
  weight_kg: { type: 'number', required: true, min: 30, max: 250 },
};

router.post('/signup', validateBody(signupSchema), async (req, res) => {
  const data = req.valid;

  const age = ageOn(data.birth_date, today());
  if (age < MIN_AGE) {
    // Every age table in the scoring engine starts at 14, and under-14s are not
    // an audience to push toward one-rep-max work.
    throw ApiError.unprocessable('Some fields need attention.', {
      birth_date: `You must be at least ${MIN_AGE} years old to create an account.`,
    });
  }

  const taken = {};
  if (get('SELECT 1 AS hit FROM users WHERE lower(email) = lower(?)', [data.email])) {
    taken.email = 'An account already exists for this email address.';
  }
  if (get('SELECT 1 AS hit FROM users WHERE lower(username) = lower(?)', [data.username])) {
    taken.username = 'This username is already taken.';
  }
  if (Object.keys(taken).length > 0) throw ApiError.conflict('Some fields need attention.', taken);

  const { hash, salt } = await hashPassword(data.password);

  let userId;
  try {
    userId = tx(() => {
      const inserted = run(
        `INSERT INTO users (email, password_hash, password_salt, username, sex, birth_date, height_cm)
         VALUES (:email, :hash, :salt, :username, :sex, :birth_date, :height_cm)`,
        {
          email: data.email,
          hash,
          salt,
          username: data.username,
          sex: data.sex,
          birth_date: data.birth_date,
          height_cm: data.height_cm,
        },
      );
      const id = Number(inserted.lastInsertRowid);
      // The signup weight becomes the first entry in the bodyweight history,
      // so a performance logged today already has a weight to score against.
      run('INSERT INTO body_weights (user_id, weight_kg, measured_at) VALUES (?, ?, ?)', [
        id,
        data.weight_kg,
        today(),
      ]);
      return id;
    });
  } catch (error) {
    if (/UNIQUE constraint failed/i.test(error.message)) {
      throw ApiError.conflict('That email address or username is already taken.');
    }
    throw error;
  }

  await startSession(req, userId);
  res.status(201).json(ownerProfile(findUserById(userId)));
});

const loginSchema = {
  email: { type: 'email', required: true },
  // Deliberately lax: the stored password decides, not the login form.
  password: { type: 'string', required: true, min: 1, max: 200, trim: false },
};

router.post('/login', validateBody(loginSchema), async (req, res) => {
  const { email, password } = req.valid;
  const key = loginThrottleKey(req, email);

  const { blocked, retryAfterSeconds } = loginThrottle.check(key);
  if (blocked) {
    res.set('Retry-After', String(retryAfterSeconds));
    throw ApiError.tooManyRequests(
      `Too many failed attempts. Try again in ${retryAfterSeconds} seconds.`,
    );
  }

  const account = findAuthUserByEmail(email);
  const credentials = account ?? DECOY_CREDENTIALS;
  const valid = await verifyPassword(
    password,
    account ? account.password_hash : credentials.hash,
    account ? account.password_salt : credentials.salt,
  );

  if (!account || !valid) {
    loginThrottle.fail(key);
    // One message for both cases: never reveal which field was wrong.
    throw new ApiError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
  }

  loginThrottle.reset(key);
  await startSession(req, account.id);
  res.json(ownerProfile(findUserById(account.id)));
});

router.post('/logout', async (req, res) => {
  if (req.session) await destroySession(req);
  res.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => {
  res.json(ownerProfile(req.user));
});

export default router;
