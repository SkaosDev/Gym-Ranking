import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';

const workDir = mkdtempSync(path.join(tmpdir(), 'gymrank-friends-test-'));
process.env.DB_PATH = path.join(workDir, 'test.db');
process.env.SESSION_SECRET = 'friends-test-secret';

const { closeDb, get } = await import('../lib/db.js');
const { runMigrations } = await import('../lib/migrate.js');
const { createApp } = await import('../app.js');

let baseUrl;
let server;
const EX = { squat: 1, bench: 2, deadlift: 3, ohp: 4, pullup: 5 };

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
  const details = {
    email: `friend${counter}@example.com`,
    username: `frienduser${counter}`,
    password: 'a-sufficient-password',
    sex: 'M',
    birth_date: '1996-04-12',
    height_cm: 182,
    weight_kg: 90,
    ...overrides,
  };
  const res = await client.request('POST', '/api/auth/signup', details);
  assert.equal(res.status, 201, res.text);
  return { client, profile: res.json, details };
}

/** Every key anywhere in a JSON tree, so nothing hides in a nested object. */
function allKeys(value, found = new Set()) {
  if (Array.isArray(value)) {
    for (const item of value) allKeys(item, found);
  } else if (value && typeof value === 'object') {
    for (const [key, nested] of Object.entries(value)) {
      found.add(key);
      allKeys(nested, found);
    }
  }
  return found;
}

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

describe('sending a request', () => {
  it('refuses a request to yourself', async () => {
    const me = await signUp();
    const res = await me.client.request('POST', '/api/friends/requests', {
      username: me.profile.username,
    });
    assert.equal(res.status, 422);
    assert.match(res.json.error.fields.username, /yourself/i);
  });

  it('refuses an unknown username', async () => {
    const me = await signUp();
    const res = await me.client.request('POST', '/api/friends/requests', { username: 'nobodyhere' });
    assert.equal(res.status, 404);
  });

  it('creates one pending request', async () => {
    const a = await signUp();
    const b = await signUp();
    const res = await a.client.request('POST', '/api/friends/requests', {
      username: b.profile.username,
    });
    assert.equal(res.status, 201, res.text);
    assert.equal(res.json.outcome, 'requested');

    const mine = await a.client.request('GET', '/api/friends');
    assert.equal(mine.json.outgoing.length, 1);
    assert.equal(mine.json.outgoing[0].username, b.profile.username);

    const theirs = await b.client.request('GET', '/api/friends');
    assert.equal(theirs.json.incoming.length, 1);
    assert.equal(theirs.json.incoming[0].username, a.profile.username);
  });

  it('refuses a duplicate request', async () => {
    const a = await signUp();
    const b = await signUp();
    await a.client.request('POST', '/api/friends/requests', { username: b.profile.username });
    const again = await a.client.request('POST', '/api/friends/requests', {
      username: b.profile.username,
    });
    assert.equal(again.status, 409);
  });

  it('refuses a request to someone already a friend', async () => {
    const a = await signUp();
    const b = await signUp();
    const created = await a.client.request('POST', '/api/friends/requests', {
      username: b.profile.username,
    });
    await b.client.request('POST', `/api/friends/requests/${created.json.id}/accept`);

    const again = await a.client.request('POST', '/api/friends/requests', {
      username: b.profile.username,
    });
    assert.equal(again.status, 409);
    assert.match(again.json.error.message, /already friends/i);
  });

  it('accepts the existing request when both ask at once, leaving one row', async () => {
    // The classic bug in this kind of system: B asking A while A's request is
    // pending must resolve that row, not create a second one.
    const a = await signUp();
    const b = await signUp();

    await a.client.request('POST', '/api/friends/requests', { username: b.profile.username });
    const crossed = await b.client.request('POST', '/api/friends/requests', {
      username: a.profile.username,
    });

    assert.equal(crossed.status, 200);
    assert.equal(crossed.json.outcome, 'accepted_existing');

    const rows = get(
      `SELECT count(1) AS n FROM friendships
        WHERE (requester_id = :a AND addressee_id = :b)
           OR (requester_id = :b AND addressee_id = :a)`,
      { a: a.profile.id, b: b.profile.id },
    );
    assert.equal(rows.n, 1, 'exactly one row for the pair');

    for (const side of [a, b]) {
      const list = await side.client.request('GET', '/api/friends');
      assert.equal(list.json.friends.length, 1);
      assert.equal(list.json.incoming.length, 0);
      assert.equal(list.json.outgoing.length, 0);
    }
  });

  it('lets a declined request be sent again', async () => {
    const a = await signUp();
    const b = await signUp();
    const created = await a.client.request('POST', '/api/friends/requests', {
      username: b.profile.username,
    });
    await b.client.request('POST', `/api/friends/requests/${created.json.id}/decline`);

    const again = await a.client.request('POST', '/api/friends/requests', {
      username: b.profile.username,
    });
    assert.equal(again.status, 201, 'a fresh request, reusing the one row');
    assert.equal(again.json.outcome, 'requested');

    const rows = get(
      `SELECT count(1) AS n FROM friendships
        WHERE (requester_id = :a AND addressee_id = :b)
           OR (requester_id = :b AND addressee_id = :a)`,
      { a: a.profile.id, b: b.profile.id },
    );
    assert.equal(rows.n, 1, 'still one row for the pair');
  });
});

describe('answering a request', () => {
  it('lets only the addressee accept or decline', async () => {
    const a = await signUp();
    const b = await signUp();
    const stranger = await signUp();
    const created = await a.client.request('POST', '/api/friends/requests', {
      username: b.profile.username,
    });

    // The requester cannot accept their own request, and a third party cannot
    // touch it at all. Both answer 404 rather than confirming it exists.
    assert.equal(
      (await a.client.request('POST', `/api/friends/requests/${created.json.id}/accept`)).status,
      404,
    );
    assert.equal(
      (await stranger.client.request('POST', `/api/friends/requests/${created.json.id}/accept`))
        .status,
      404,
    );

    const accepted = await b.client.request(
      'POST',
      `/api/friends/requests/${created.json.id}/accept`,
    );
    assert.equal(accepted.status, 200);
  });

  it('cancels an outgoing request and removes a friend', async () => {
    const a = await signUp();
    const b = await signUp();

    const pending = await a.client.request('POST', '/api/friends/requests', {
      username: b.profile.username,
    });
    const cancelled = await a.client.request('DELETE', `/api/friends/${pending.json.id}`);
    assert.equal(cancelled.status, 200);
    assert.equal((await a.client.request('GET', '/api/friends')).json.outgoing.length, 0);

    const again = await a.client.request('POST', '/api/friends/requests', {
      username: b.profile.username,
    });
    await b.client.request('POST', `/api/friends/requests/${again.json.id}/accept`);
    assert.equal((await a.client.request('GET', '/api/friends')).json.friends.length, 1);

    const removed = await b.client.request('DELETE', `/api/friends/${again.json.id}`);
    assert.equal(removed.status, 200);
    assert.equal((await a.client.request('GET', '/api/friends')).json.friends.length, 0);
  });

  it('tells the addressee to decline rather than delete', async () => {
    const a = await signUp();
    const b = await signUp();
    const pending = await a.client.request('POST', '/api/friends/requests', {
      username: b.profile.username,
    });
    const res = await b.client.request('DELETE', `/api/friends/${pending.json.id}`);
    assert.equal(res.status, 400);
  });
});

describe('searching for people', () => {
  it('needs at least three characters', async () => {
    const me = await signUp();
    const res = await me.client.request('GET', '/api/friends/search?q=ab');
    assert.equal(res.status, 422);
    assert.ok(res.json.error.fields.q);
  });

  it('matches a username prefix, never the email', async () => {
    const me = await signUp();
    const target = await signUp({ username: 'searchable', email: 'hidden-address@example.com' });

    const byPrefix = await me.client.request('GET', '/api/friends/search?q=sea');
    assert.ok(byPrefix.json.items.some((i) => i.username === 'searchable'));

    // Not a prefix of the username.
    const byMiddle = await me.client.request('GET', '/api/friends/search?q=archable');
    assert.equal(byMiddle.json.items.length, 0, 'prefix only, so no substring matching');

    const byEmail = await me.client.request('GET', '/api/friends/search?q=hidden-address');
    assert.equal(byEmail.json.items.length, 0, 'the email is never searchable');
    assert.ok(!byPrefix.text.includes('hidden-address'), 'and never returned');
    assert.ok(target.profile.id);
  });

  it('never returns the whole directory', async () => {
    const me = await signUp();
    for (let i = 0; i < 14; i += 1) {
      await signUp({ username: `crowd${String(i).padStart(2, '0')}`, email: `crowd${i}@example.com` });
    }
    const res = await me.client.request('GET', '/api/friends/search?q=crowd');
    assert.equal(res.json.items.length, 10, 'capped at ten results');
  });

  it('excludes the searcher and reports the friendship state', async () => {
    const me = await signUp({ username: 'selfsearcher' });
    const other = await signUp({ username: 'selfseeker' });
    await me.client.request('POST', '/api/friends/requests', { username: other.profile.username });

    const res = await me.client.request('GET', '/api/friends/search?q=self');
    assert.ok(!res.json.items.some((i) => i.username === 'selfsearcher'));
    const found = res.json.items.find((i) => i.username === 'selfseeker');
    assert.equal(found.friendship.status, 'pending');
    assert.equal(found.friendship.direction, 'outgoing');
  });
});

describe('the public profile, scoped by friendship', () => {
  /** A user with plenty of private data to leak, if it were going to. */
  async function richUser(overrides = {}) {
    // Unique where the database demands it, distinctive everywhere the leak
    // check looks.
    const tag = counter + 1;
    const user = await signUp({
      email: `private-address-${tag}@example.com`,
      username: `richuser${tag}`,
      birth_date: '1991-07-23',
      height_cm: 193,
      weight_kg: 87.3,
      ...overrides,
    });
    await user.client.request('POST', '/api/performances', {
      exercise_id: EX.squat,
      weight_kg: 177.5,
      reps: 3,
      performed_at: '2026-06-01',
      notes: 'secret-training-note',
    });
    await user.client.request('POST', '/api/performances', {
      exercise_id: EX.bench,
      weight_kg: 122.5,
      reps: 3,
      performed_at: '2026-06-02',
    });
    await user.client.request('POST', '/api/performances', {
      exercise_id: EX.deadlift,
      weight_kg: 210,
      reps: 1,
      performed_at: '2026-06-03',
    });
    return user;
  }

  const FORBIDDEN_KEYS = [
    'email',
    'birth_date',
    'height_cm',
    'weight_kg',
    'bodyweight_kg',
    'current_weight_kg',
    'weighed_at',
    'notes',
    'e1rm_kg',
    'dots_points',
    'adjusted_score',
    'effective_load_kg',
    'target_e1rm_kg',
    'kg_needed',
    'password_hash',
    'password_salt',
  ];

  const FORBIDDEN_VALUES = [
    'private-address',
    '1991-07-23',
    'secret-training-note',
    '193',
    '87.3',
    '177.5',
    '122.5',
  ];

  it('shows a stranger the username and nothing else', async () => {
    const owner = await richUser();
    const stranger = await signUp();

    const res = await stranger.client.request('GET', `/api/users/${owner.profile.username}`);
    assert.equal(res.status, 200, res.text);
    assert.equal(res.json.visibility, 'stranger');
    assert.equal(res.json.username, owner.profile.username);
    assert.equal(res.json.created_at, null, 'not even the join date');
    assert.equal(res.json.overall, null);
    assert.equal(res.json.exercises, null);
    assert.equal(res.json.index_series, null);
    assert.equal(res.json.friendship.status, 'none');
  });

  it('tells a stranger whether a request is already pending', async () => {
    const owner = await richUser();
    const stranger = await signUp();
    await stranger.client.request('POST', '/api/friends/requests', {
      username: owner.profile.username,
    });

    const res = await stranger.client.request('GET', `/api/users/${owner.profile.username}`);
    assert.equal(res.json.friendship.status, 'pending');
    assert.equal(res.json.friendship.direction, 'outgoing');
  });

  it('shows a friend with ranks hidden the username and join date only', async () => {
    const owner = await richUser();
    await owner.client.request('PATCH', '/api/me/profile', { ranks_visible_to_friends: false });

    const friend = await signUp();
    const created = await friend.client.request('POST', '/api/friends/requests', {
      username: owner.profile.username,
    });
    await owner.client.request('POST', `/api/friends/requests/${created.json.id}/accept`);

    const res = await friend.client.request('GET', `/api/users/${owner.profile.username}`);
    assert.equal(res.json.visibility, 'ranks_hidden');
    assert.ok(res.json.created_at, 'the join date is shared');
    assert.equal(res.json.overall, null);
    assert.equal(res.json.exercises, null);
    assert.equal(res.json.index_series, null);
  });

  it('shows a friend the ranks and the index series', async () => {
    const owner = await richUser();
    const friend = await signUp();
    const created = await friend.client.request('POST', '/api/friends/requests', {
      username: owner.profile.username,
    });
    await owner.client.request('POST', `/api/friends/requests/${created.json.id}/accept`);

    const res = await friend.client.request('GET', `/api/users/${owner.profile.username}`);
    assert.equal(res.json.visibility, 'full');
    assert.ok(res.json.overall.index > 0);
    assert.ok(res.json.overall.rank.label.length > 0);
    assert.equal(res.json.exercises.length, 3);
    assert.ok(res.json.exercises.every((e) => e.index > 0 && e.rank.label));
    assert.ok(res.json.index_series.length > 0);
    assert.ok(res.json.index_series[0].points.every((p) => p.date && typeof p.index === 'number'));
  });

  it('never leaks body data, loads or notes, in any of the three views', async () => {
    const owner = await richUser();
    const stranger = await signUp();
    const hiddenFriend = await signUp();
    const fullFriend = await signUp();

    for (const friend of [hiddenFriend, fullFriend]) {
      const created = await friend.client.request('POST', '/api/friends/requests', {
        username: owner.profile.username,
      });
      await owner.client.request('POST', `/api/friends/requests/${created.json.id}/accept`);
    }

    const views = [];
    views.push(await stranger.client.request('GET', `/api/users/${owner.profile.username}`));
    views.push(await fullFriend.client.request('GET', `/api/users/${owner.profile.username}`));

    await owner.client.request('PATCH', '/api/me/profile', { ranks_visible_to_friends: false });
    views.push(await hiddenFriend.client.request('GET', `/api/users/${owner.profile.username}`));

    // Also the friends list, which carries each friend's overall rank.
    views.push(await fullFriend.client.request('GET', '/api/friends'));
    views.push(await stranger.client.request('GET', '/api/friends/search?q=rich'));

    for (const view of views) {
      const keys = allKeys(view.json);
      for (const forbidden of FORBIDDEN_KEYS) {
        assert.ok(!keys.has(forbidden), `key "${forbidden}" appeared in ${view.text.slice(0, 200)}`);
      }
      for (const forbidden of FORBIDDEN_VALUES) {
        assert.ok(
          !view.text.includes(forbidden),
          `value "${forbidden}" appeared in ${view.text.slice(0, 200)}`,
        );
      }
    }
  });

  it('lets you see your own profile in full', async () => {
    const owner = await richUser();
    const res = await owner.client.request('GET', `/api/users/${owner.profile.username}`);
    assert.equal(res.json.visibility, 'self');
    assert.ok(res.json.overall.index > 0);
  });

  it('is a 404 for an unknown username, and needs a session', async () => {
    const me = await signUp();
    assert.equal((await me.client.request('GET', '/api/users/nobodyhere')).status, 404);
    assert.equal((await makeClient().request('GET', '/api/users/anyone')).status, 401);
    assert.equal((await makeClient().request('GET', '/api/friends')).status, 401);
  });
});

describe('the friends list', () => {
  it('is alphabetical, with no ordering by rank', async () => {
    const me = await signUp();
    for (const username of ['zulu', 'alpha', 'mike']) {
      const other = await signUp({ username, email: `${username}@example.com` });
      const created = await me.client.request('POST', '/api/friends/requests', { username });
      await other.client.request('POST', `/api/friends/requests/${created.json.id}/accept`);
    }

    const res = await me.client.request('GET', '/api/friends');
    assert.deepEqual(
      res.json.friends.map((f) => f.username),
      ['alpha', 'mike', 'zulu'],
    );
  });

  it('omits a friend’s rank when they have hidden it', async () => {
    const me = await signUp();
    const shy = await signUp();
    await shy.client.request('POST', '/api/performances', {
      exercise_id: EX.squat,
      weight_kg: 150,
      reps: 5,
      performed_at: '2026-06-01',
    });
    await shy.client.request('PATCH', '/api/me/profile', { ranks_visible_to_friends: false });

    const created = await me.client.request('POST', '/api/friends/requests', {
      username: shy.profile.username,
    });
    await shy.client.request('POST', `/api/friends/requests/${created.json.id}/accept`);

    const res = await me.client.request('GET', '/api/friends');
    const entry = res.json.friends.find((f) => f.username === shy.profile.username);
    assert.equal(entry.ranks_visible, false);
    assert.equal(entry.overall, null);
  });
});
