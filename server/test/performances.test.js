import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, beforeEach, describe, it } from 'node:test';

const workDir = mkdtempSync(path.join(tmpdir(), 'gymrank-perf-test-'));
process.env.DB_PATH = path.join(workDir, 'test.db');
process.env.SESSION_SECRET = 'performance-test-secret';

const { closeDb, get, run } = await import('../lib/db.js');
const { runMigrations } = await import('../lib/migrate.js');
const { createApp } = await import('../app.js');

let baseUrl;
let server;
let exercises;

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

let accountCounter = 0;
async function signUp(overrides = {}) {
  accountCounter += 1;
  const client = makeClient();
  const res = await client.request('POST', '/api/auth/signup', {
    email: `perf${accountCounter}@example.com`,
    username: `perfuser${accountCounter}`,
    password: 'a-sufficient-password',
    sex: 'M',
    birth_date: '1996-04-12',
    height_cm: 182,
    weight_kg: 90,
    ...overrides,
  });
  assert.equal(res.status, 201, res.text);
  return { client, profile: res.json };
}

const codeToId = (code) => exercises.find((e) => e.code === code).id;

before(async () => {
  runMigrations();
  const app = createApp();
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  const { client } = await signUp();
  exercises = (await client.request('GET', '/api/exercises')).json.items;
});

after(() => {
  server?.close();
  closeDb();
  rmSync(workDir, { recursive: true, force: true });
});

describe('exercise reference table', () => {
  it('serves the seven seeded exercises in specification order', () => {
    assert.deepEqual(
      exercises.map((e) => e.code),
      ['squat', 'bench', 'deadlift', 'ohp', 'pullup', 'dip', 'pushup'],
    );
  });

  it('requires a session', async () => {
    const res = await makeClient().request('GET', '/api/exercises');
    assert.equal(res.status, 401);
  });
});

describe('creating a performance', () => {
  it('stores it and returns it fully scored', async () => {
    const { client } = await signUp();
    const res = await client.request('POST', '/api/performances', {
      exercise_id: codeToId('bench'),
      weight_kg: 100,
      reps: 5,
      performed_at: '2026-06-15',
      notes: 'felt strong',
    });

    assert.equal(res.status, 201, res.text);
    const body = res.json;
    assert.equal(body.exercise_code, 'bench');
    assert.equal(body.weight_kg, 100);
    assert.equal(body.reps, 5);
    assert.equal(body.notes, 'felt strong');
    assert.equal(body.bodyweight_kg, 90);
    assert.equal(body.effective_load_kg, 100);
    assert.ok(Math.abs(body.e1rm_kg - 114.58) < 0.01, `e1RM ${body.e1rm_kg}`);
    assert.ok(Math.abs(body.dots_points - 74.09) < 0.01, `DOTS ${body.dots_points}`);
    assert.equal(body.rank.label, 'Gold V');
    assert.equal(body.counts_toward_rank, true);
    assert.ok(body.next_division.kg_needed > 0);
  });

  it('adds the bodyweight fraction for a bodyweight exercise', async () => {
    const { client } = await signUp();
    const res = await client.request('POST', '/api/performances', {
      exercise_id: codeToId('pullup'),
      weight_kg: 10,
      reps: 1,
      performed_at: '2026-06-15',
    });
    assert.equal(res.json.effective_load_kg, 100, '90 kg bodyweight plus 10 kg added');
  });

  it('accepts band assistance as a negative added load', async () => {
    const { client } = await signUp();
    const res = await client.request('POST', '/api/performances', {
      exercise_id: codeToId('pullup'),
      weight_kg: -30,
      reps: 3,
      performed_at: '2026-06-15',
    });
    assert.equal(res.status, 201, res.text);
    assert.equal(res.json.effective_load_kg, 60);
  });

  it('keeps a set above 12 reps out of the rank but in the history', async () => {
    const { client } = await signUp();
    const res = await client.request('POST', '/api/performances', {
      exercise_id: codeToId('squat'),
      weight_kg: 60,
      reps: 20,
      performed_at: '2026-06-15',
    });
    assert.equal(res.status, 201);
    assert.equal(res.json.e1rm_kg, null);
    assert.equal(res.json.counts_toward_rank, false);
    assert.ok(res.json.flags.some((f) => f.code === 'ENDURANCE_REPS'));
  });
});

describe('server-side validation', () => {
  let client;
  before(async () => {
    ({ client } = await signUp());
  });

  const base = { weight_kg: 100, reps: 5, performed_at: '2026-06-15' };

  it('rejects an unknown exercise', async () => {
    const res = await client.request('POST', '/api/performances', { ...base, exercise_id: 9999 });
    assert.equal(res.status, 422);
    assert.ok(res.json.error.fields.exercise_id);
  });

  it('rejects a date in the future', async () => {
    const future = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    const res = await client.request('POST', '/api/performances', {
      ...base,
      exercise_id: codeToId('squat'),
      performed_at: future,
    });
    assert.equal(res.status, 422);
    assert.ok(res.json.error.fields.performed_at);
  });

  it('rejects rep counts and loads outside the accepted ranges', async () => {
    for (const [field, patch] of [
      ['reps', { reps: 0 }],
      ['reps', { reps: 101 }],
      ['weight_kg', { weight_kg: 600 }],
    ]) {
      const res = await client.request('POST', '/api/performances', {
        ...base,
        exercise_id: codeToId('squat'),
        ...patch,
      });
      assert.equal(res.status, 422, JSON.stringify(patch));
      assert.ok(res.json.error.fields[field], `expected an error on ${field}`);
    }
  });

  it('refuses a negative load on an external lift', async () => {
    const res = await client.request('POST', '/api/performances', {
      ...base,
      exercise_id: codeToId('squat'),
      weight_kg: -20,
    });
    assert.equal(res.status, 422);
    assert.match(res.json.error.fields.weight_kg, /negative/i);
  });

  it('refuses assistance that cancels out the bodyweight', async () => {
    const res = await client.request('POST', '/api/performances', {
      ...base,
      exercise_id: codeToId('pullup'),
      weight_kg: -95,
    });
    assert.equal(res.status, 422);
    assert.match(res.json.error.fields.weight_kg, /zero or less/i);
  });

  it('refuses a date before the lifter turned 14', async () => {
    const res = await client.request('POST', '/api/performances', {
      ...base,
      exercise_id: codeToId('squat'),
      performed_at: '2005-01-01',
    });
    assert.equal(res.status, 422);
    assert.match(res.json.error.fields.performed_at, /14th birthday/);
  });
});

describe('reading and listing', () => {
  let client;

  before(async () => {
    ({ client } = await signUp());
    const squat = codeToId('squat');
    const bench = codeToId('bench');
    for (const [exercise_id, performed_at, weight_kg] of [
      [squat, '2026-01-10', 100],
      [squat, '2026-02-10', 110],
      [squat, '2026-03-10', 115],
      [bench, '2026-03-11', 80],
    ]) {
      await client.request('POST', '/api/performances', {
        exercise_id,
        weight_kg,
        reps: 5,
        performed_at,
      });
    }
  });

  it('lists newest first by default', async () => {
    const res = await client.request('GET', '/api/performances');
    assert.equal(res.status, 200);
    assert.equal(res.json.total, 4);
    assert.deepEqual(
      res.json.items.map((i) => i.performed_at),
      ['2026-03-11', '2026-03-10', '2026-02-10', '2026-01-10'],
    );
  });

  it('sorts oldest first on request', async () => {
    const res = await client.request('GET', '/api/performances?sort=date_asc');
    assert.equal(res.json.items[0].performed_at, '2026-01-10');
  });

  it('filters by exercise code and by id', async () => {
    const byCode = await client.request('GET', '/api/performances?exercise=squat');
    assert.equal(byCode.json.total, 3);
    const byId = await client.request('GET', `/api/performances?exercise=${codeToId('squat')}`);
    assert.equal(byId.json.total, 3);
  });

  it('rejects an unknown exercise filter', async () => {
    const res = await client.request('GET', '/api/performances?exercise=nonsense');
    assert.equal(res.status, 422);
  });

  it('paginates', async () => {
    const page1 = await client.request('GET', '/api/performances?per_page=3&page=1');
    assert.equal(page1.json.items.length, 3);
    assert.equal(page1.json.total_pages, 2);
    const page2 = await client.request('GET', '/api/performances?per_page=3&page=2');
    assert.equal(page2.json.items.length, 1);
    assert.equal(page2.json.page, 2);
  });

  it('clamps a page beyond the end instead of returning nothing', async () => {
    const res = await client.request('GET', '/api/performances?per_page=3&page=99');
    assert.equal(res.json.page, 2);
    assert.equal(res.json.items.length, 1);
  });

  it('fetches one performance by id', async () => {
    const list = await client.request('GET', '/api/performances');
    const first = list.json.items[0];
    const one = await client.request('GET', `/api/performances/${first.id}`);
    assert.equal(one.status, 200);
    assert.equal(one.json.id, first.id);
  });
});

describe('ownership', () => {
  it('hides another account’s performance behind a 404', async () => {
    const owner = await signUp();
    const created = await owner.client.request('POST', '/api/performances', {
      exercise_id: codeToId('squat'),
      weight_kg: 140,
      reps: 3,
      performed_at: '2026-06-15',
    });

    const stranger = await signUp();
    for (const [method, body] of [
      ['GET', undefined],
      ['PATCH', { reps: 4 }],
      ['DELETE', undefined],
    ]) {
      const res = await stranger.client.request(method, `/api/performances/${created.json.id}`, body);
      assert.equal(res.status, 404, `${method} should be 404, not 403`);
    }

    // And it is genuinely untouched.
    const still = await owner.client.request('GET', `/api/performances/${created.json.id}`);
    assert.equal(still.status, 200);
    assert.equal(still.json.reps, 3);
  });

  it('requires a session for every endpoint', async () => {
    const anonymous = makeClient();
    assert.equal((await anonymous.request('GET', '/api/performances')).status, 401);
    assert.equal((await anonymous.request('POST', '/api/performances', {})).status, 401);
  });
});

describe('updating and deleting', () => {
  it('updates fields and rescores the row', async () => {
    const { client } = await signUp();
    const created = await client.request('POST', '/api/performances', {
      exercise_id: codeToId('bench'),
      weight_kg: 100,
      reps: 5,
      performed_at: '2026-06-15',
    });

    const updated = await client.request('PATCH', `/api/performances/${created.json.id}`, {
      weight_kg: 110,
      notes: 'corrected',
    });
    assert.equal(updated.status, 200, updated.text);
    assert.equal(updated.json.weight_kg, 110);
    assert.equal(updated.json.notes, 'corrected');
    assert.ok(updated.json.e1rm_kg > created.json.e1rm_kg, 'the score follows the edit');
  });

  it('rejects an empty update', async () => {
    const { client } = await signUp();
    const created = await client.request('POST', '/api/performances', {
      exercise_id: codeToId('bench'),
      weight_kg: 100,
      reps: 5,
      performed_at: '2026-06-15',
    });
    const res = await client.request('PATCH', `/api/performances/${created.json.id}`, {});
    assert.equal(res.status, 400);
  });

  it('deletes, and the row is gone', async () => {
    const { client } = await signUp();
    const created = await client.request('POST', '/api/performances', {
      exercise_id: codeToId('bench'),
      weight_kg: 100,
      reps: 5,
      performed_at: '2026-06-15',
    });
    const removed = await client.request('DELETE', `/api/performances/${created.json.id}`);
    assert.equal(removed.status, 200);
    assert.equal((await client.request('GET', `/api/performances/${created.json.id}`)).status, 404);
  });
});

describe('suspicious jumps', () => {
  const squatSet = (weight_kg, performed_at) => ({
    exercise_id: codeToId('squat'),
    weight_kg,
    reps: 1,
    performed_at,
  });

  it('never flags the very first set on an exercise', async () => {
    const { client } = await signUp();
    const res = await client.request('POST', '/api/performances', squatSet(250, '2026-01-01'));
    assert.equal(res.json.needs_confirmation, false);
    assert.equal(res.json.counts_toward_rank, true);
  });

  it('flags a jump beyond 25% and holds it out of the rank', async () => {
    const { client } = await signUp();
    await client.request('POST', '/api/performances', squatSet(100, '2026-01-01'));
    const jump = await client.request('POST', '/api/performances', squatSet(130, '2026-01-02'));

    assert.equal(jump.json.needs_confirmation, true, '130 is 1.30x the previous best');
    assert.equal(jump.json.counts_toward_rank, false);
    assert.ok(jump.json.flags.some((f) => f.code === 'NEEDS_CONFIRMATION'));
    // It is still stored and still visible.
    assert.equal(jump.json.e1rm_kg, 130);
  });

  it('leaves a jump of exactly 25% alone', async () => {
    const { client } = await signUp();
    await client.request('POST', '/api/performances', squatSet(100, '2026-01-01'));
    const edge = await client.request('POST', '/api/performances', squatSet(125, '2026-01-02'));
    assert.equal(edge.json.needs_confirmation, false);
  });

  it('clears the flag when a second set corroborates it', async () => {
    const { client } = await signUp();
    await client.request('POST', '/api/performances', squatSet(100, '2026-01-01'));
    const flagged = await client.request('POST', '/api/performances', squatSet(130, '2026-01-02'));
    assert.equal(flagged.json.needs_confirmation, true);

    // 120 is above 90% of 130, so it corroborates; it is not itself a jump
    // beyond 25% of the confirmed best of 100.
    await client.request('POST', '/api/performances', squatSet(120, '2026-01-09'));

    const after = await client.request('GET', `/api/performances/${flagged.json.id}`);
    assert.equal(after.json.needs_confirmation, false, 'corroborated, so it counts again');
    assert.equal(after.json.counts_toward_rank, true);
  });

  it('does not clear the flag on a set that is nowhere near', async () => {
    const { client } = await signUp();
    await client.request('POST', '/api/performances', squatSet(100, '2026-01-01'));
    const flagged = await client.request('POST', '/api/performances', squatSet(200, '2026-01-02'));
    await client.request('POST', '/api/performances', squatSet(105, '2026-01-09'));

    const after = await client.request('GET', `/api/performances/${flagged.json.id}`);
    assert.equal(after.json.needs_confirmation, true, '105 is far below 90% of 200');
  });

  it('clears the flag when the owner confirms it by hand', async () => {
    const { client } = await signUp();
    await client.request('POST', '/api/performances', squatSet(100, '2026-01-01'));
    const flagged = await client.request('POST', '/api/performances', squatSet(200, '2026-01-02'));
    assert.equal(flagged.json.needs_confirmation, true);

    const confirmed = await client.request('POST', `/api/performances/${flagged.json.id}/confirm`);
    assert.equal(confirmed.status, 200);
    assert.equal(confirmed.json.needs_confirmation, false);
    assert.equal(confirmed.json.counts_toward_rank, true);
  });

  it('clears the flag when the typo behind it is corrected', async () => {
    const { client } = await signUp();
    await client.request('POST', '/api/performances', squatSet(100, '2026-01-01'));
    const typo = await client.request('POST', '/api/performances', squatSet(1000 / 2, '2026-01-02'));
    assert.equal(typo.json.needs_confirmation, true);

    const fixed = await client.request('PATCH', `/api/performances/${typo.json.id}`, {
      weight_kg: 110,
    });
    assert.equal(fixed.json.needs_confirmation, false, 'the corrected value is no longer a jump');
    assert.equal(fixed.json.counts_toward_rank, true);
  });

  it('confirming someone else’s row is a 404', async () => {
    const owner = await signUp();
    await owner.client.request('POST', '/api/performances', squatSet(100, '2026-01-01'));
    const flagged = await owner.client.request('POST', '/api/performances', squatSet(200, '2026-01-02'));

    const stranger = await signUp();
    const res = await stranger.client.request('POST', `/api/performances/${flagged.json.id}/confirm`);
    assert.equal(res.status, 404);
  });
});

describe('bodyweight as of the performance date', () => {
  it('scores each set against the weight in force on its own date', async () => {
    const { client, profile } = await signUp({ weight_kg: 80 });

    // Weigh-ins inserted directly; the endpoint arrives with the profile page.
    // Signup dates its own weigh-in today, so these two are what the dated
    // performances below resolve against.
    for (const [weight, measuredAt] of [[80, '2026-01-01'], [95, '2026-06-01']]) {
      run('INSERT INTO body_weights (user_id, weight_kg, measured_at) VALUES (?, ?, ?)', [
        profile.id,
        weight,
        measuredAt,
      ]);
    }

    const before = await client.request('POST', '/api/performances', {
      exercise_id: codeToId('pullup'),
      weight_kg: 0,
      reps: 1,
      performed_at: '2026-05-01',
    });
    const after = await client.request('POST', '/api/performances', {
      exercise_id: codeToId('pullup'),
      weight_kg: 0,
      reps: 1,
      performed_at: '2026-06-15',
    });

    assert.equal(before.json.bodyweight_kg, 80, 'the earlier set uses the earlier weight');
    assert.equal(after.json.bodyweight_kg, 95, 'the later set uses the later weight');
    assert.equal(before.json.effective_load_kg, 80);
    assert.equal(after.json.effective_load_kg, 95);
    // The same apparent feat scores HIGHER at the heavier bodyweight, because
    // P(bw) flattens out: DOTS does not assume strength scales linearly with
    // mass, so hauling 95 kg up is worth more than hauling 80 kg up. This is
    // the same mechanism that puts reference case 3 above reference case 2.
    assert.ok(
      after.json.dots_points > before.json.dots_points,
      `${after.json.dots_points} should exceed ${before.json.dots_points}`,
    );
  });

  it('falls back to the earliest weigh-in for a set predating every weigh-in', async () => {
    const { client } = await signUp({ weight_kg: 77 });
    const res = await client.request('POST', '/api/performances', {
      exercise_id: codeToId('pullup'),
      weight_kg: 0,
      reps: 1,
      performed_at: '2020-01-01',
    });
    assert.equal(res.json.bodyweight_kg, 77);
  });
});
