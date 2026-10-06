import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';

const workDir = mkdtempSync(path.join(tmpdir(), 'gymrank-stats-test-'));
process.env.DB_PATH = path.join(workDir, 'test.db');
process.env.SESSION_SECRET = 'stats-test-secret';

const { closeDb } = await import('../lib/db.js');
const { runMigrations } = await import('../lib/migrate.js');
const { createApp } = await import('../app.js');
const { findUserById } = await import('../lib/users.js');
const { computeRanks } = await import('../services/ranks.js');
const { activitySeries, bodyweightSeries, e1rmSeries, indexSeries, radarSnapshot } = await import(
  '../services/stats.js'
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
    email: `stats${counter}@example.com`,
    username: `statsuser${counter}`,
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

const daysAgo = (days) =>
  new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);

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

describe('estimated 1RM series', () => {
  it('returns one point per training day, keeping the best set', async () => {
    const { client, user } = await signUp();
    await log(client, EX.squat, 100, 5, '2026-06-01');
    await log(client, EX.squat, 120, 5, '2026-06-01'); // same day, heavier
    await log(client, EX.squat, 110, 5, '2026-06-08');

    const { series } = e1rmSeries(user);
    const squat = series.find((s) => s.code === 'squat');
    assert.equal(squat.points.length, 2, 'two days, not three sets');
    assert.ok(squat.points[0].e1rm_kg > 130, 'the heavier set of the day won');
    assert.deepEqual(
      squat.points.map((p) => p.performed_at),
      ['2026-06-01', '2026-06-08'],
      'points are in date order',
    );
  });

  it('leaves out sets that do not count toward a rank', async () => {
    const { client, user } = await signUp();
    await log(client, EX.bench, 100, 1, '2026-06-01');
    await log(client, EX.bench, 60, 20, '2026-06-02'); // endurance
    const flagged = await log(client, EX.bench, 250, 1, '2026-06-03'); // suspicious
    assert.equal(flagged.json.needs_confirmation, true);

    const bench = e1rmSeries(user).series.find((s) => s.code === 'bench');
    assert.equal(bench.points.length, 1, 'only the one counted set is plotted');
    assert.equal(bench.points[0].e1rm_kg, 100);
  });

  it('omits exercises with no data rather than drawing an empty line', async () => {
    const { client, user } = await signUp();
    await log(client, EX.squat, 100, 5, '2026-06-01');
    const { series } = e1rmSeries(user);
    assert.equal(series.length, 1);
    assert.equal(series[0].code, 'squat');
  });

  it('filters to one exercise', async () => {
    const { client, user } = await signUp();
    await log(client, EX.squat, 100, 5, '2026-06-01');
    await log(client, EX.bench, 80, 5, '2026-06-01');
    assert.equal(e1rmSeries(user, { exerciseCode: 'bench' }).series.length, 1);
  });
});

describe('strength index series', () => {
  it('carries the rank thresholds for the reference lines', async () => {
    const { client, user } = await signUp();
    await log(client, EX.squat, 140, 5, '2026-06-01');

    const { series, thresholds } = indexSeries(user);
    assert.ok(series[0].points[0].strength_index > 0);
    assert.deepEqual(
      thresholds.map((t) => t.index),
      [100, 250, 450, 650, 825, 925, 980],
      'one line per rank floor, Iron at zero excluded',
    );
    assert.ok(thresholds.every((t) => /^#[0-9a-f]{6}$/i.test(t.color)));
    assert.equal(thresholds.at(-1).abbreviation, 'UDK');
  });
});

describe('radar snapshot', () => {
  it('reports every exercise, with zero where there is no data', async () => {
    const { client, user } = await signUp();
    await log(client, EX.squat, 140, 5, '2026-06-01');

    const radar = radarSnapshot(user);
    assert.equal(radar.items.length, 7);
    const squat = radar.items.find((i) => i.code === 'squat');
    const dip = radar.items.find((i) => i.code === 'dip');
    assert.ok(squat.index > 0 && squat.has_data);
    assert.equal(dip.index, 0);
    assert.equal(dip.has_data, false);
  });

  it('agrees with the dashboard', async () => {
    const { client, user } = await signUp();
    await log(client, EX.squat, 140, 5, '2026-06-01');
    await log(client, EX.bench, 100, 5, '2026-06-01');
    await log(client, EX.ohp, 60, 5, '2026-06-01');

    const radar = radarSnapshot(user);
    const ranks = computeRanks(user);
    assert.equal(radar.overall_index, ranks.overall.index);
    for (const item of radar.items) {
      const entry = ranks.exercises.find((e) => e.exercise.code === item.code);
      assert.equal(item.index, entry.effective_index ?? 0, item.code);
    }
  });
});

describe('bodyweight series', () => {
  it('pairs each date with the weight in force and the overall index', async () => {
    const { client, user } = await signUp({ weight_kg: 90 });
    await client.request('POST', '/api/me/weights', { weight_kg: 92, measured_at: daysAgo(30) });
    await log(client, EX.squat, 140, 5, daysAgo(20));
    await log(client, EX.bench, 100, 5, daysAgo(20));
    await log(client, EX.ohp, 60, 5, daysAgo(10));

    const { points } = bodyweightSeries(user);
    assert.ok(points.length >= 3);
    assert.ok(points.every((p) => p.date && p.weight_kg !== null));
    assert.deepEqual([...points].sort((a, b) => a.date.localeCompare(b.date)), points);

    // Only two weighted exercises until the overhead press appears.
    const before = points.find((p) => p.date === daysAgo(20));
    const after = points.find((p) => p.date === daysAgo(10));
    assert.equal(before.overall_index, null, 'two exercises is not enough for an overall');
    assert.ok(after.overall_index > 0, 'the third exercise completes it');
  });

  it('matches the live overall rank at the most recent date', async () => {
    // This is the guard on the timeline: it reimplements the window and decay
    // rules, so it must not drift from the rank the dashboard shows.
    const { client, user } = await signUp();
    await log(client, EX.squat, 140, 5, daysAgo(40));
    await log(client, EX.bench, 100, 5, daysAgo(30));
    await log(client, EX.deadlift, 180, 3, daysAgo(20));
    await log(client, EX.ohp, 60, 5, daysAgo(10));
    await log(client, EX.pullup, 10, 5, daysAgo(2));

    const timeline = bodyweightSeries(user).points;
    const live = computeRanks(user).overall.index;
    assert.equal(
      timeline.at(-1).overall_index,
      live,
      'the last point of the timeline is today’s overall rank',
    );
  });

  it('reflects a stale best by decaying the timeline', async () => {
    const { client, user } = await signUp();
    await log(client, EX.squat, 140, 5, daysAgo(400));
    await log(client, EX.bench, 100, 5, daysAgo(400));
    await log(client, EX.ohp, 60, 5, daysAgo(400));

    const points = bodyweightSeries(user).points;
    const atTheTime = points.find((p) => p.date === daysAgo(400));
    const live = computeRanks(user).overall.index;
    assert.ok(atTheTime.overall_index > live, 'everything has decayed since');
  });
});

describe('the stats endpoints', () => {
  it('serve all four series', async () => {
    const { client } = await signUp();
    await log(client, EX.squat, 140, 5, '2026-06-01');

    for (const [path, check] of [
      ['/api/stats/e1rm', (json) => Array.isArray(json.series)],
      ['/api/stats/index', (json) => Array.isArray(json.thresholds)],
      ['/api/stats/radar', (json) => json.items.length === 7],
      ['/api/stats/bodyweight', (json) => Array.isArray(json.points)],
    ]) {
      const res = await client.request('GET', path);
      assert.equal(res.status, 200, `${path} -> ${res.text}`);
      assert.ok(check(res.json), `${path} returned ${res.text.slice(0, 120)}`);
    }
  });

  it('accept an exercise filter and reject an unknown one', async () => {
    const { client } = await signUp();
    await log(client, EX.squat, 140, 5, '2026-06-01');

    const filtered = await client.request('GET', '/api/stats/e1rm?exercise=squat');
    assert.equal(filtered.status, 200);
    assert.equal(filtered.json.series.length, 1);

    const bad = await client.request('GET', '/api/stats/index?exercise=nonsense');
    assert.equal(bad.status, 422);
    assert.ok(bad.json.error.fields.exercise);
  });

  it('require a session', async () => {
    const anonymous = makeClient();
    for (const path of ['/api/stats/e1rm', '/api/stats/index', '/api/stats/radar', '/api/stats/bodyweight']) {
      assert.equal((await anonymous.request('GET', path)).status, 401, path);
    }
  });

  it('keep one account’s history out of another’s charts', async () => {
    const a = await signUp();
    await log(a.client, EX.squat, 140, 5, '2026-06-01');
    const b = await signUp();
    const res = await b.client.request('GET', '/api/stats/e1rm');
    assert.equal(res.json.series.length, 0);
  });
});

describe('activity', () => {
  it('counts sets per training day and summarises the streak', async () => {
    const { client, user } = await signUp();
    // asOf is a Wednesday; sessions in this week and the two before it.
    await log(client, EX.squat, 100, 5, '2026-09-28');
    await log(client, EX.bench, 80, 5, '2026-09-28');
    await log(client, EX.squat, 100, 5, '2026-09-22');
    await log(client, EX.squat, 100, 5, '2026-09-14');
    await log(client, EX.squat, 100, 5, '2026-08-01'); // after a gap

    const activity = activitySeries(user, { asOf: '2026-09-30' });
    assert.deepEqual(activity.days.find((d) => d.date === '2026-09-28'), { date: '2026-09-28', sets: 2 });
    assert.equal(activity.streak_weeks, 3, 'three consecutive weeks, the gap ends it');
    assert.equal(activity.sessions_last_30_days, 3);
    assert.equal(activity.sets_last_30_days, 4);
    assert.equal(activity.last_session, '2026-09-28');
  });

  it('does not break the streak before the current week is over', async () => {
    const { client, user } = await signUp();
    await log(client, EX.squat, 100, 5, '2026-09-25'); // last week
    const activity = activitySeries(user, { asOf: '2026-09-28' }); // Monday, nothing yet
    assert.equal(activity.streak_weeks, 1);
  });

  it('is empty for a new account', async () => {
    const { user } = await signUp();
    const activity = activitySeries(user);
    assert.deepEqual(activity.days, []);
    assert.equal(activity.streak_weeks, 0);
    assert.equal(activity.last_session, null);
  });
});
