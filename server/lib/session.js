import session from 'express-session';

import { get, run } from './db.js';

const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const SWEEP_INTERVAL_MS = 15 * 60 * 1000;

const nowIso = () => new Date().toISOString();

/**
 * A session store on top of node:sqlite. Every off-the-shelf store pulls in the
 * native sqlite3 driver, which would mean a compile step and a second SQLite
 * driver in the same process, so this is about forty lines instead.
 *
 * node:sqlite is synchronous, so the callbacks fire immediately; express-session
 * does not care either way.
 */
export class SqliteSessionStore extends session.Store {
  constructor({ ttlMs = DEFAULT_TTL_MS, sweepIntervalMs = SWEEP_INTERVAL_MS } = {}) {
    super();
    this.ttlMs = ttlMs;

    if (sweepIntervalMs > 0) {
      this.sweepTimer = setInterval(() => this.sweep(), sweepIntervalMs);
      // Never keep the process alive just to expire sessions.
      this.sweepTimer.unref?.();
    }
  }

  /** Expiry comes from the cookie when express-session set one. */
  #expiryFor(sess) {
    const expires = sess?.cookie?.expires;
    if (expires) return new Date(expires).toISOString();
    const maxAge = sess?.cookie?.originalMaxAge ?? this.ttlMs;
    return new Date(Date.now() + maxAge).toISOString();
  }

  sweep() {
    try {
      run('DELETE FROM sessions WHERE expires_at <= ?', [nowIso()]);
    } catch (error) {
      console.error('[session] sweep failed', error);
    }
  }

  get(sid, callback) {
    try {
      const row = get('SELECT data, expires_at FROM sessions WHERE sid = ?', [sid]);
      if (!row) return callback(null, null);
      if (row.expires_at <= nowIso()) {
        run('DELETE FROM sessions WHERE sid = ?', [sid]);
        return callback(null, null);
      }
      return callback(null, JSON.parse(row.data));
    } catch (error) {
      return callback(error);
    }
  }

  set(sid, sess, callback) {
    try {
      run(
        `INSERT INTO sessions (sid, data, expires_at) VALUES (?, ?, ?)
         ON CONFLICT (sid) DO UPDATE SET data = excluded.data, expires_at = excluded.expires_at`,
        [sid, JSON.stringify(sess), this.#expiryFor(sess)],
      );
      return callback(null);
    } catch (error) {
      return callback(error);
    }
  }

  destroy(sid, callback) {
    try {
      run('DELETE FROM sessions WHERE sid = ?', [sid]);
      return callback(null);
    } catch (error) {
      return callback(error);
    }
  }

  /** Rolling sessions call this on every request; only the expiry moves. */
  touch(sid, sess, callback) {
    try {
      run('UPDATE sessions SET expires_at = ? WHERE sid = ?', [this.#expiryFor(sess), sid]);
      return callback(null);
    } catch (error) {
      return callback(error);
    }
  }

  length(callback) {
    try {
      return callback(null, get('SELECT count(1) AS n FROM sessions').n);
    } catch (error) {
      return callback(error);
    }
  }

  clear(callback) {
    try {
      run('DELETE FROM sessions');
      return callback(null);
    } catch (error) {
      return callback(error);
    }
  }
}

export const SESSION_COOKIE_NAME = 'gymrank.sid';
export const SESSION_TTL_MS = DEFAULT_TTL_MS;
