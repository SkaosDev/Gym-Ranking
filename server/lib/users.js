import { get } from './db.js';
import { ageCoefficientForAge, ageOn } from './scoring.js';

/** Columns safe to hold in memory for the signed-in user. Never the secrets. */
const PUBLIC_COLUMNS = `
  id, email, username, sex, birth_date, height_cm,
  ranks_visible_to_friends, created_at
`;

export function findUserById(id) {
  return get(`SELECT ${PUBLIC_COLUMNS} FROM users WHERE id = ?`, [id]);
}

export function findUserByUsername(username) {
  return get(`SELECT ${PUBLIC_COLUMNS} FROM users WHERE lower(username) = lower(?)`, [username]);
}

/** Only login uses this: it is the single place the hash leaves the database. */
export function findAuthUserByEmail(email) {
  return get(
    `SELECT id, email, password_hash, password_salt FROM users WHERE lower(email) = lower(?)`,
    [email],
  );
}

export function latestBodyweight(userId) {
  return get(
    `SELECT weight_kg, measured_at FROM body_weights
      WHERE user_id = ? ORDER BY measured_at DESC LIMIT 1`,
    [userId],
  );
}

/**
 * The bodyweight a performance is scored against: the most recent weigh-in on
 * or before the day it was performed, falling back to the earliest on record
 * for lifts logged before the first weigh-in.
 */
export function bodyweightOn(userId, date) {
  return (
    get(
      `SELECT weight_kg, measured_at FROM body_weights
        WHERE user_id = ? AND measured_at <= ?
        ORDER BY measured_at DESC LIMIT 1`,
      [userId, date],
    ) ??
    get(
      `SELECT weight_kg, measured_at FROM body_weights
        WHERE user_id = ? ORDER BY measured_at ASC LIMIT 1`,
      [userId],
    ) ??
    null
  );
}

/**
 * The account owner's own view of themselves. Used by /api/auth/me and the
 * profile page; the friend-facing view is a separate query on purpose.
 */
export function ownerProfile(row) {
  const weight = latestBodyweight(row.id);
  const age = ageOn(row.birth_date, new Date().toISOString().slice(0, 10));

  return {
    id: row.id,
    email: row.email,
    username: row.username,
    sex: row.sex,
    birth_date: row.birth_date,
    height_cm: row.height_cm,
    ranks_visible_to_friends: Boolean(row.ranks_visible_to_friends),
    created_at: row.created_at,
    age,
    age_coefficient: ageCoefficientForAge(age).coefficient,
    current_weight_kg: weight?.weight_kg ?? null,
    weighed_at: weight?.measured_at ?? null,
  };
}
