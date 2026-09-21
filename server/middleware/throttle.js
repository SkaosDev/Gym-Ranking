/**
 * In-memory sliding-window throttle for repeated failures. Process-local,
 * which is exactly right for a single-process local app, and it forgets
 * everything on restart.
 */
export class AttemptThrottle {
  constructor({ maxAttempts = 5, windowMs = 15 * 60 * 1000 } = {}) {
    this.maxAttempts = maxAttempts;
    this.windowMs = windowMs;
    this.attempts = new Map();
  }

  #recent(key, now) {
    const timestamps = (this.attempts.get(key) ?? []).filter((at) => now - at < this.windowMs);
    if (timestamps.length === 0) this.attempts.delete(key);
    else this.attempts.set(key, timestamps);
    return timestamps;
  }

  /** { blocked, retryAfterSeconds } */
  check(key) {
    const now = Date.now();
    const recent = this.#recent(key, now);
    if (recent.length < this.maxAttempts) return { blocked: false, retryAfterSeconds: 0 };
    const oldest = Math.min(...recent);
    return {
      blocked: true,
      retryAfterSeconds: Math.max(1, Math.ceil((this.windowMs - (now - oldest)) / 1000)),
    };
  }

  fail(key) {
    const now = Date.now();
    const recent = this.#recent(key, now);
    recent.push(now);
    this.attempts.set(key, recent);

    // Opportunistic cleanup so a long-running process cannot grow unbounded.
    if (this.attempts.size > 1000) {
      for (const candidate of [...this.attempts.keys()]) this.#recent(candidate, now);
    }
  }

  reset(key) {
    this.attempts.delete(key);
  }
}

/** Failures are counted per email and per client address together. */
export const loginThrottle = new AttemptThrottle();

export function loginThrottleKey(req, email) {
  return `${String(email ?? '').toLowerCase()}|${req.ip ?? 'unknown'}`;
}
