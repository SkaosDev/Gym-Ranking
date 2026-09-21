/**
 * Creates a demo account with roughly six months of plausible training, so the
 * charts have something to show. A fresh account demonstrates the empty
 * states, not the product.
 *
 *   npm run seed:demo
 *
 * It only ever touches the one account named below, which it recreates from
 * scratch on each run.
 */
import { closeDb, get, run, tx } from '../lib/db.js';
import { runMigrations } from '../lib/migrate.js';
import { hashPassword } from '../lib/password.js';

const DEMO = {
  email: 'demo@gymrank.local',
  username: 'demo',
  password: 'demo-password',
  sex: 'M',
  birth_date: '2001-03-14',
  height_cm: 179,
};

const WEEKS = 26;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Deterministic jitter, so every run produces the same believable history. */
function wobble(seed) {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x); // 0..1
}

const isoDaysAgo = (days) => new Date(Date.now() - days * MS_PER_DAY).toISOString().slice(0, 10);

/**
 * Linear progress with a plateau in the middle and a light deload, which is
 * what real training looks like and makes the charts worth reading.
 */
function loadForWeek(week, { start, end }) {
  const progress = week / (WEEKS - 1);
  // Slower in the middle third: newbie gains, then a grind.
  const shaped = progress < 0.35 ? progress * 1.3 : 0.455 + (progress - 0.35) * 0.84;
  const base = start + (end - start) * Math.min(shaped, 1);
  const deload = week === 12 || week === 20 ? 0.92 : 1;
  const noise = 1 + (wobble(week) - 0.5) * 0.02;
  return Math.round(base * deload * noise * 2) / 2; // to the nearest 0.5 kg
}

const PLAN = [
  { code: 'squat', reps: 5, start: 95, end: 145, everyWeeks: 1 },
  { code: 'bench', reps: 5, start: 67.5, end: 95, everyWeeks: 1 },
  { code: 'deadlift', reps: 3, start: 115, end: 175, everyWeeks: 2 },
  { code: 'ohp', reps: 5, start: 42.5, end: 62.5, everyWeeks: 2 },
  { code: 'pullup', reps: 6, start: 0, end: 17.5, everyWeeks: 2 },
];

console.log('[seed] applying migrations');
runMigrations();

const existing = get('SELECT id FROM users WHERE lower(email) = lower(?)', [DEMO.email]);
if (existing) {
  console.log(`[seed] removing the previous demo account (id ${existing.id})`);
  run('DELETE FROM users WHERE id = ?', [existing.id]);
}

const { hash, salt } = await hashPassword(DEMO.password);

const userId = tx(() => {
  const inserted = run(
    `INSERT INTO users (email, password_hash, password_salt, username, sex, birth_date, height_cm)
     VALUES (:email, :hash, :salt, :username, :sex, :birth_date, :height_cm)`,
    {
      // Only the columns the statement names: node:sqlite rejects extras,
      // and DEMO also carries the plain password.
      email: DEMO.email,
      username: DEMO.username,
      sex: DEMO.sex,
      birth_date: DEMO.birth_date,
      height_cm: DEMO.height_cm,
      hash,
      salt,
    },
  );
  return Number(inserted.lastInsertRowid);
});

// A slow bulk: 78 kg to 84 kg, which is exactly the story the bodyweight chart
// is there to tell.
let weighIns = 0;
for (let week = 0; week < WEEKS; week += 2) {
  const weight = 78 + (6 * week) / (WEEKS - 1) + (wobble(week + 99) - 0.5) * 0.8;
  run('INSERT INTO body_weights (user_id, weight_kg, measured_at) VALUES (?, ?, ?)', [
    userId,
    Math.round(weight * 10) / 10,
    isoDaysAgo((WEEKS - 1 - week) * 7),
  ]);
  weighIns += 1;
}

const exerciseIds = Object.fromEntries(
  PLAN.map((entry) => [entry.code, get('SELECT id FROM exercises WHERE code = ?', [entry.code]).id]),
);

let sets = 0;
tx(() => {
  for (const entry of PLAN) {
    for (let week = 0; week < WEEKS; week += entry.everyWeeks) {
      const load = loadForWeek(week, entry);
      run(
        `INSERT INTO performances (user_id, exercise_id, weight_kg, reps, performed_at)
         VALUES (?, ?, ?, ?, ?)`,
        [
          userId,
          exerciseIds[entry.code],
          load,
          entry.reps,
          isoDaysAgo((WEEKS - 1 - week) * 7 - (entry.code === 'bench' ? 2 : 0)),
        ],
      );
      sets += 1;
    }
  }
});

console.log(`[seed] demo account ready: ${DEMO.email} / ${DEMO.password}`);
console.log(`[seed] ${weighIns} weigh-ins and ${sets} sets across ${WEEKS} weeks`);
closeDb();
