import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';

const workDir = mkdtempSync(path.join(tmpdir(), 'gymrank-ranks-test-'));
process.env.DB_PATH = path.join(workDir, 'test.db');
process.env.SESSION_SECRET = 'ranks-test-secret';

const { closeDb } = await import('../lib/db.js');
const { runMigrations } = await import('../lib/migrate.js');
const { createApp } = await import('../app.js');
const { findUserById } = await import('../lib/users.js');
const { DECAY_FLOOR, RECENT_WINDOW_DAYS, computeRanks, decayFactor } = await import(
  '../services/ranks.js'
);

let baseUrl;
let server;
const EX = { squat: 1, bench: 2, deadlift: 3, ohp: 4, pullup: 5, dip: 6, pushup: 7 };

function makeClient() {
  let cookie = null;
  return {
    async request(method, urlPath, body) {
      const headers = {};
      if (cookie) headers.Cookie = cookie;
      if (method !== 'GET') headers['Content-Type'] = 'application/json';
      const res = await fetch(`${baseUrl}${urlPath}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      for (const raw of res.headers.getSetCookie()) cookie = raw.split(';')[0];
      const text = await res.text();
      let json = null;
      try {
        json = JSON.parse(text);
      } catch {
        /* not JSON */
      }
      return { status: res.status, text, json };
    },
  };
}

let counter = 0;
async function signUp(overrides = {}) {
  counter += 1;
  const client = makeClient();
  const res = await client.request('POST', '/api/auth/signup', {
    email: `ranks${counter}@example.com`,
    username: `ranksuser${counter}`,
    password: 'a-sufficient-password',
    sex: 'M',
    birth_date: '1996-04-12',
    height_cm: 182,
    weight_kg: 90,
    ...overrides,
  });
  assert.equal(res.status, 201, res.text);
  return { client, profile: res.json, user: findUserById(res.json.id) };
}

const log = (client, exerciseId, weightKg, reps, performedAt) =>
  client.request('POST', '/api/performances', {
    exercise_id: exerciseId,
    weight_kg: weightKg,
    reps,
    performed_at: performedAt,
  });

before(async () => {
  runMigrations();
  const app = createApp();
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server?.close();
  closeDb();
  rmSync(workDir, { recursive: true, force: true });
});

describe('time decay', () => {
  it('leaves anything inside the window untouched', () => {
    assert.equal(decayFactor(0), 1);
    assert.equal(decayFactor(RECENT_WINDOW_DAYS), 1);
  });

  it('compounds 0.5% per week beyond the window', () => {
    assert.ok(Math.abs(decayFactor(RECENT_WINDOW_DAYS + 7) - 0.995) < 1e-9);
    assert.ok(Math.abs(decayFactor(RECENT_WINDOW_DAYS + 14) - 0.995 ** 2) < 1e-9);
  });

  it('never falls below the floor', () => {
    assert.equal(decayFactor(100_000), DECAY_FLOOR);
    assert.ok(decayFactor(RECENT_WINDOW_DAYS + 7 * 200) >= DECAY_FLOOR);
  });

  it('decreases monotonically', () => {
    let previous = 1.1;
    for (let days = 0; days <= 2000; days += 10) {
      const factor = decayFactor(days);
      assert.ok(factor <= previous, `decay rose at ${days} days`);
      previous = factor;
    }
  });
});

describe('per-exercise ranks', () => {
  it('reports nothing for an exercise with no data', async () => {
    const { user } = await signUp();
    const ranks = computeRanks(user, { asOf: '2026-06-15' });
    const squat = ranks.exercises.find((e) => e.exercise.code === 'squat');
    assert.equal(squat.has_data, false);
    assert.equal(squat.rank, null);
    assert.equal(squat.effective_index, null);
  });

  it('uses the best counted performance and names the next division', async () => {
    const { client, user } = await signUp();
    await log(client, EX.squat, 140, 5, '2026-06-01');
    await log(client, EX.squat, 150, 5, '2026-06-08');

    const ranks = computeRanks(user, { asOf: '2026-06-15' });
    const squat = ranks.exercises.find((e) => e.exercise.code === 'squat');

    assert.equal(squat.has_data, true);
    assert.equal(squat.counted_performances, 2);
    assert.equal(squat.best.performed_at, '2026-06-08', 'the heavier set is the best');
    assert.equal(squat.decayed, false);
    assert.ok(squat.rank.label.length > 0);
    assert.ok(squat.next_division.kg_needed > 0);
    assert.ok(squat.next_division.label.length > 0);
  });

  it('ignores sets that do not count toward the rank', async () => {
    const { client, user } = await signUp();
    await log(client, EX.bench, 100, 1, '2026-06-01');
    await log(client, EX.bench, 60, 20, '2026-06-02'); // endurance, excluded
    const flagged = await log(client, EX.bench, 200, 1, '2026-06-03'); // suspicious jump
    assert.equal(flagged.json.needs_confirmation, true);

    const ranks = computeRanks(user, { asOf: '2026-06-15' });
    const bench = ranks.exercises.find((e) => e.exercise.code === 'bench');
    assert.equal(bench.counted_performances, 1);
    assert.equal(bench.best.e1rm_kg, 100, 'the flagged 200 kg set must not become the best');
  });

  it('counts a flagged set once it has been confirmed', async () => {
    const { client, user } = await signUp();
    await log(client, EX.bench, 100, 1, '2026-06-01');
    const flagged = await log(client, EX.bench, 200, 1, '2026-06-03');
    await client.request('POST', `/api/performances/${flagged.json.id}/confirm`);

    const bench = computeRanks(user, { asOf: '2026-06-15' }).exercises.find(
      (e) => e.exercise.code === 'bench',
    );
    assert.equal(bench.best.e1rm_kg, 200);
  });

  it('decays a best that has gone stale', async () => {
    const { client, user } = await signUp();
    await log(client, EX.squat, 150, 1, '2026-01-01');

    const fresh = computeRanks(user, { asOf: '2026-05-01' }); // exactly 120 days
    const stale = computeRanks(user, { asOf: '2026-05-08' }); // 127 days
    const veryStale = computeRanks(user, { asOf: '2030-01-01' });

    const squatOf = (ranks) => ranks.exercises.find((e) => e.exercise.code === 'squat');

    assert.equal(squatOf(fresh).decayed, false, 'the window boundary is inclusive');
    assert.equal(squatOf(stale).decayed, true);
    assert.ok(squatOf(stale).effective_index < squatOf(fresh).effective_index);
    assert.ok(
      squatOf(veryStale).effective_index >= squatOf(fresh).effective_index * DECAY_FLOOR - 0.5,
      'a very old best is floored, not erased',
    );
  });

  it('prefers a recent best over a better stale one, which is the point', async () => {
    const { client, user } = await signUp();
    await log(client, EX.deadlift, 220, 1, '2026-01-01'); // strong, long ago
    await log(client, EX.deadlift, 170, 1, '2026-06-10'); // weaker, recent

    const ranks = computeRanks(user, { asOf: '2026-06-15' });
    const deadlift = ranks.exercises.find((e) => e.exercise.code === 'deadlift');

    assert.equal(deadlift.best.e1rm_kg, 220, 'the all-time best is still reported');
    assert.equal(deadlift.recent_best.e1rm_kg, 170);
    assert.equal(
      deadlift.effective_index,
      deadlift.recent_best.strength_index,
      'what counts is what you can do now',
    );
    assert.equal(deadlift.decayed, false);
  });
});

describe('overall rank', () => {
  it('stays incomplete below three weighted exercises and says what is missing', async () => {
    const { client, user } = await signUp();
    await log(client, EX.squat, 140, 5, '2026-06-01');
    await log(client, EX.bench, 100, 5, '2026-06-01');
    await log(client, EX.dip, 0, 5, '2026-06-01'); // global_weight 0, does not count

    const { overall } = computeRanks(user, { asOf: '2026-06-15' });
    assert.equal(overall.complete, false);
    assert.equal(overall.exercises_with_data, 2);
    assert.equal(overall.weighted_exercises, 5);
    assert.equal(overall.index, null);
    assert.deepEqual(
      overall.missing.map((m) => m.code).sort(),
      ['deadlift', 'ohp', 'pullup'],
    );
  });

  it('is the weighted mean once three weighted exercises have data', async () => {
    const { client, user } = await signUp();
    await log(client, EX.squat, 140, 5, '2026-06-01');
    await log(client, EX.bench, 100, 5, '2026-06-01');
    await log(client, EX.ohp, 60, 5, '2026-06-01');

    const ranks = computeRanks(user, { asOf: '2026-06-15' });
    const { overall } = ranks;
    assert.equal(overall.complete, true);
    assert.equal(overall.exercises_with_data, 3);

    const byCode = Object.fromEntries(ranks.exercises.map((e) => [e.exercise.code, e]));
    const expected =
      (byCode.squat.effective_index * 1.0 +
        byCode.bench.effective_index * 1.0 +
        byCode.ohp.effective_index * 0.5) /
      2.5;

    assert.ok(Math.abs(overall.index - expected) < 0.05, `${overall.index} vs ${expected}`);
    assert.equal(overall.rank.label, ranks.exercises.length > 0 ? overall.rank.label : null);
    assert.ok(overall.rank.label.length > 0);
    assert.equal(overall.contributions.length, 3);
  });

  it('weights the overhead press and pull-up at half', async () => {
    const { client, user } = await signUp();
    const ranks = computeRanks(user, { asOf: '2026-06-15' });
    const weights = Object.fromEntries(
      ranks.exercises.map((e) => [e.exercise.code, e.exercise.global_weight]),
    );
    assert.deepEqual(weights, {
      squat: 1,
      bench: 1,
      deadlift: 1,
      ohp: 0.5,
      pullup: 0.5,
      dip: 0,
      pushup: 0,
    });
  });
});

describe('bodyweight changes move the ranks', () => {
  it('raises an external lift rank when the lifter cuts weight', async () => {
    const { client, user, profile } = await signUp({ weight_kg: 100 });
    const day = profile.weighed_at; // signup dates its weigh-in today
    await log(client, EX.squat, 150, 1, day);

    const before = computeRanks(user, { asOf: day }).exercises.find(
      (e) => e.exercise.code === 'squat',
    );

    // Same day, lighter: the same bar is a better lift.
    const update = await client.request('POST', '/api/me/weights', { weight_kg: 85, measured_at: day });
    assert.equal(update.status, 201, update.text);

    const after = computeRanks(user, { asOf: day }).exercises.find(
      (e) => e.exercise.code === 'squat',
    );

    assert.ok(
      after.effective_index > before.effective_index,
      `expected a rise, ${before.effective_index} -> ${after.effective_index}`,
    );
  });
});

describe('GET /api/ranks', () => {
  it('returns the overall rank and every exercise', async () => {
    const { client } = await signUp();
    await log(client, EX.squat, 140, 5, '2026-06-01');

    const res = await client.request('GET', '/api/ranks');
    assert.equal(res.status, 200, res.text);
    assert.equal(res.json.exercises.length, 7);
    assert.ok('overall' in res.json);
    assert.equal(res.json.current_weight_kg, 90);
    assert.equal(typeof res.json.age_coefficient, 'number');
  });

  it('needs a session', async () => {
    assert.equal((await makeClient().request('GET', '/api/ranks')).status, 401);
  });
});

describe('GET /api/ranks/explain', () => {
  it('shows every step for reference case 1', async () => {
    const { client } = await signUp();
    const created = await log(client, EX.bench, 100, 5, '2026-06-15');

    const res = await client.request('GET', `/api/ranks/explain/${created.json.id}`);
    assert.equal(res.status, 200, res.text);

    const [load, e1rm, dots, age, index, rank] = res.json.steps;
    assert.equal(load.result_kg, 100);
    assert.ok(Math.abs(e1rm.epley.result_kg - 116.67) < 0.01);
    assert.ok(Math.abs(e1rm.brzycki.result_kg - 112.5) < 0.01);
    assert.ok(Math.abs(e1rm.result_kg - 114.58) < 0.01);
    assert.ok(Math.abs(dots.polynomial_value - 773.27) < 0.01);
    assert.ok(Math.abs(dots.result - 74.09) < 0.01);
    assert.equal(age.coefficient, 1);
    assert.match(age.table, /Peak strength/);
    assert.equal(index.anchors.length, 6);
    assert.equal(index.segment.from.level, 'Intermediate');
    assert.equal(index.segment.to.level, 'Advanced');
    assert.ok(Math.abs(index.result - 459.3) < 0.1);
    assert.equal(rank.result.label, 'Gold V');
  });

  it('explains why a high-rep set does not count', async () => {
    const { client } = await signUp();
    const created = await log(client, EX.squat, 60, 20, '2026-06-15');
    const res = await client.request('GET', `/api/ranks/explain/${created.json.id}`);
    assert.equal(res.json.steps[1].excluded, true);
    assert.match(res.json.steps[1].reason, /endurance/);
    assert.equal(res.json.counts_toward_rank, false);
  });

  it('resolves "latest" to the most recent performance', async () => {
    const { client } = await signUp();
    await log(client, EX.squat, 100, 5, '2026-05-01');
    const newest = await log(client, EX.bench, 80, 5, '2026-06-01');

    const res = await client.request('GET', '/api/ranks/explain/latest');
    assert.equal(res.status, 200);
    assert.equal(res.json.performance.id, newest.json.id);
  });

  it('is a 404 for another account’s performance', async () => {
    const owner = await signUp();
    const created = await log(owner.client, EX.squat, 140, 3, '2026-06-01');
    const stranger = await signUp();
    const res = await stranger.client.request('GET', `/api/ranks/explain/${created.json.id}`);
    assert.equal(res.status, 404);
  });
});

describe('profile and weights', () => {
  it('lists the weight history, newest first', async () => {
    const { client } = await signUp({ weight_kg: 88 });
    await client.request('POST', '/api/me/weights', { weight_kg: 86.5, measured_at: '2026-06-01' });
    await client.request('POST', '/api/me/weights', { weight_kg: 87.2, measured_at: '2026-05-01' });

    const res = await client.request('GET', '/api/me/weights');
    assert.equal(res.status, 200);
    const dates = res.json.items.map((i) => i.measured_at);
    assert.deepEqual([...dates].sort().reverse(), dates, 'newest first');
    assert.equal(res.json.items.length, 3);
  });

  it('corrects rather than duplicates a weigh-in on the same day', async () => {
    const { client } = await signUp();
    await client.request('POST', '/api/me/weights', { weight_kg: 91, measured_at: '2026-06-01' });
    await client.request('POST', '/api/me/weights', { weight_kg: 92, measured_at: '2026-06-01' });

    const res = await client.request('GET', '/api/me/weights');
    const onThatDay = res.json.items.filter((i) => i.measured_at === '2026-06-01');
    assert.equal(onThatDay.length, 1);
    assert.equal(onThatDay[0].weight_kg, 92);
  });

  it('rejects an impossible weight or a future date', async () => {
    const { client } = await signUp();
    assert.equal((await client.request('POST', '/api/me/weights', { weight_kg: 5 })).status, 422);
    assert.equal(
      (await client.request('POST', '/api/me/weights', { weight_kg: 90, measured_at: '2099-01-01' }))
        .status,
      422,
    );
  });

  it('updates height, sex and rank visibility', async () => {
    const { client } = await signUp();
    const res = await client.request('PATCH', '/api/me/profile', {
      height_cm: 176,
      ranks_visible_to_friends: false,
    });
    assert.equal(res.status, 200, res.text);
    assert.equal(res.json.height_cm, 176);
    assert.equal(res.json.ranks_visible_to_friends, false);

    const reread = await client.request('GET', '/api/me/profile');
    assert.equal(reread.json.height_cm, 176);
    assert.equal(reread.json.ranks_visible_to_friends, false);
  });

  it('rejects an empty update and an out-of-range height', async () => {
    const { client } = await signUp();
    assert.equal((await client.request('PATCH', '/api/me/profile', {})).status, 400);
    assert.equal(
      (await client.request('PATCH', '/api/me/profile', { height_cm: 20 })).status,
      422,
    );
  });

  it('changing sex re-scores against the other standards', async () => {
    const { client, user } = await signUp({ sex: 'M', weight_kg: 70 });
    await log(client, EX.bench, 80, 3, '2026-06-01');
    const asMan = computeRanks(user, { asOf: '2026-06-15' }).exercises.find(
      (e) => e.exercise.code === 'bench',
    ).effective_index;

    await client.request('PATCH', '/api/me/profile', { sex: 'F' });
    const asWoman = computeRanks(findUserById(user.id), { asOf: '2026-06-15' }).exercises.find(
      (e) => e.exercise.code === 'bench',
    ).effective_index;

    assert.ok(asWoman > asMan, 'the same lift rates higher against the women’s standards');
  });
});
