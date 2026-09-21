import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);

const SALT_BYTES = 16;
const KEY_BYTES = 64;
// N=16384, r=8, p=1 needs 128*N*r = 16 MiB, so the default 32 MiB cap is raised
// to leave headroom.
const OPTIONS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

/** Returns hex-encoded { hash, salt }. */
export async function hashPassword(password) {
  const salt = randomBytes(SALT_BYTES);
  const derived = await scryptAsync(password, salt, KEY_BYTES, OPTIONS);
  return { hash: derived.toString('hex'), salt: salt.toString('hex') };
}

/**
 * Constant-time comparison. Returns false rather than throwing on malformed
 * stored values, so a corrupted row cannot be told apart from a wrong password.
 */
export async function verifyPassword(password, hash, salt) {
  try {
    const saltBuffer = Buffer.from(salt, 'hex');
    const expected = Buffer.from(hash, 'hex');
    if (saltBuffer.length === 0 || expected.length !== KEY_BYTES) return false;
    const derived = await scryptAsync(password, saltBuffer, KEY_BYTES, OPTIONS);
    return timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}
