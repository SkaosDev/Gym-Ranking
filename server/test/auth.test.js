import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';

const workDir = mkdtempSync(path.join(tmpdir(), 'gymrank-auth-test-'));
process.env.DB_PATH = path.join(workDir, 'test.db');
process.env.SESSION_SECRET = 'test-secret-that-stays-stable-across-restarts';

const { closeDb, get } = await import('../lib/db.js');
const { runMigrations } = await import('../lib/migrate.js');
const { createApp } = await import('../app.js');
const { hashPassword, verifyPassword } = await import('../lib/password.js');

/** Minimal cookie jar so a test can behave like one browser. */
function makeClient(baseUrl) {
  let cookie = null;
  return {
    get cookie() {
      return cookie;
    },
    set cookie(value) {
      cookie = value;
    },
    async request(method, urlPath, { body, headers = {}, sendJsonHeader = true } = {}) {
      const finalHeaders = { ...headers };
      if (cookie) finalHeaders.Cookie = cookie;
      if (sendJsonHeader && method !== 'GET') finalHeaders['Content-Type'] = 'application/json';

      const res = await fetch(`${baseUrl}${urlPath}`, {
        method,
        headers: finalHeaders,
        body: body === undefined ? undefined : JSON.stringify(body),
      });

      for (const raw of res.headers.getSetCookie()) {
        cookie = raw.split(';')[0];
      }

      const text = await res.text();
      let json = null;
      try {
        json = JSON.parse(text);
      } catch {
        /* some responses are not JSON */
      }
      return { status: res.status, headers: res.headers, text, json };
    },
    get: (p, options) => this,
  };
}

let server;
let baseUrl;

const VALID_SIGNUP = {
  email: 'Lifter@Example.com',
  username: 'mainlifter',
  password: 'correct horse battery',
  sex: 'M',
  birth_date: '1996-04-12',
  height_cm: 182,
  weight_kg: 88.5,
};

async function listen(app) {
  const instance = app.listen(0);
  await new Promise((resolve) => instance.once('listening', resolve));
  return { instance, url: `http://127.0.0.1:${instance.address().port}` };
}

before(async () => {
  runMigrations();
  const started = await listen(createApp());
  server = started.instance;
  baseUrl = started.url;
});

after(() => {
  server?.close();
  closeDb();
  rmSync(workDir, { recursive: true, force: true });
});

describe('password hashing', () => {
  it('produces a distinct salt per password and verifies correctly', async () => {
    const a = await hashPassword('same-password');
    const b = await hashPassword('same-password');
    assert.notEqual(a.salt, b.salt, 'each hash gets its own salt');
    assert.notEqual(a.hash, b.hash, 'so identical passwords do not share a hash');
    assert.equal(await verifyPassword('same-password', a.hash, a.salt), true);
    assert.equal(await verifyPassword('wrong-password', a.hash, a.salt), false);
  });

  it('returns false rather than throwing on a corrupted stored value', async () => {
    assert.equal(await verifyPassword('whatever', 'not-hex', 'nor-this'), false);
    assert.equal(await verifyPassword('whatever', '', ''), false);
  });
});

describe('signup', () => {
  it('creates the account, starts a session and returns the owner profile', async () => {
    const client = makeClient(baseUrl);
    const res = await client.request('POST', '/api/auth/signup', { body: VALID_SIGNUP });

    assert.equal(res.status, 201, res.text);
    assert.equal(res.json.username, 'mainlifter');
    assert.equal(res.json.email, 'lifter@example.com', 'email is normalised to lowercase');
    assert.equal(res.json.sex, 'M');
    assert.equal(res.json.ranks_visible_to_friends, true);
    assert.ok(res.json.age >= 29, 'age is computed');
    assert.equal(res.json.current_weight_kg, 88.5, 'the signup weight seeds the history');
    assert.ok(client.cookie?.startsWith('gymrank.sid='), 'a session cookie was issued');
  });

  it('never returns the password, its hash or its salt', async () => {
    const client = makeClient(baseUrl);
    await client.request('POST', '/api/auth/signup', {
      body: { ...VALID_SIGNUP, email: 'secrets@example.com', username: 'secretcheck' },
    });
    const me = await client.request('GET', '/api/auth/me');
    for (const forbidden of ['password', 'password_hash', 'password_salt', VALID_SIGNUP.password]) {
      assert.ok(!me.text.includes(forbidden), `response leaked ${forbidden}`);
    }
  });

  it('sets the session cookie HttpOnly, SameSite=Lax and not Secure on localhost', async () => {
    const res = await fetch(`${baseUrl}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...VALID_SIGNUP, email: 'cookie@example.com', username: 'cookieuser' }),
    });
    const raw = res.headers.getSetCookie().find((c) => c.startsWith('gymrank.sid='));
    assert.ok(raw, 'session cookie present');
    assert.match(raw, /HttpOnly/i);
    assert.match(raw, /SameSite=Lax/i);
    assert.ok(!/;\s*Secure/i.test(raw), 'Secure would break plain http on localhost');
  });

  it('records the signup weight as the first bodyweight entry', async () => {
    const client = makeClient(baseUrl);
    const res = await client.request('POST', '/api/auth/signup', {
      body: { ...VALID_SIGNUP, email: 'weightseed@example.com', username: 'weightseed', weight_kg: 71.2 },
    });
    const rows = get('SELECT count(1) AS n, max(weight_kg) AS w FROM body_weights WHERE user_id = ?', [
      res.json.id,
    ]);
    assert.equal(rows.n, 1);
    assert.equal(rows.w, 71.2);
  });

  it('refuses an applicant under 14', async () => {
    const tooYoung = new Date();
    tooYoung.setUTCFullYear(tooYoung.getUTCFullYear() - 13);
    const client = makeClient(baseUrl);
    const res = await client.request('POST', '/api/auth/signup', {
      body: {
        ...VALID_SIGNUP,
        email: 'young@example.com',
        username: 'tooyoung',
        birth_date: tooYoung.toISOString().slice(0, 10),
      },
    });
    assert.equal(res.status, 422, res.text);
    assert.match(res.json.error.fields.birth_date, /at least 14/);
  });

  it('reports every invalid field at once', async () => {
    const client = makeClient(baseUrl);
    const res = await client.request('POST', '/api/auth/signup', {
      body: {
        email: 'not-an-email',
        username: 'Has Spaces',
        password: 'short',
        sex: 'X',
        birth_date: '2026-02-30',
        height_cm: 40,
        weight_kg: 900,
      },
    });
    assert.equal(res.status, 422);
    for (const field of ['email', 'username', 'password', 'sex', 'birth_date', 'height_cm', 'weight_kg']) {
      assert.ok(res.json.error.fields[field], `expected an error for ${field}`);
    }
  });

  it('rejects a future birth date', async () => {
    const client = makeClient(baseUrl);
    const res = await client.request('POST', '/api/auth/signup', {
      body: { ...VALID_SIGNUP, email: 'future@example.com', username: 'futureborn', birth_date: '2099-01-01' },
    });
    assert.equal(res.status, 422);
    assert.ok(res.json.error.fields.birth_date);
  });

  it('refuses a duplicate email or username, case-insensitively', async () => {
    const client = makeClient(baseUrl);
    const res = await client.request('POST', '/api/auth/signup', {
      body: { ...VALID_SIGNUP, email: 'LIFTER@EXAMPLE.COM', username: 'MAINLIFTER' },
    });
    assert.equal(res.status, 409, res.text);
    assert.ok(res.json.error.fields.email);
    assert.ok(res.json.error.fields.username);
  });
});

describe('login', () => {
  const account = {
    ...VALID_SIGNUP,
    email: 'login@example.com',
    username: 'loginuser',
    password: 'a-good-enough-password',
  };

  before(async () => {
    await makeClient(baseUrl).request('POST', '/api/auth/signup', { body: account });
  });

  it('accepts correct credentials and regenerates the session id', async () => {
    const client = makeClient(baseUrl);
    // Touch the API first so a session cookie exists before logging in.
    await client.request('POST', '/api/auth/login', {
      body: { email: account.email, password: 'wrong-on-purpose' },
    });
    const before = client.cookie;

    const res = await client.request('POST', '/api/auth/login', {
      body: { email: account.email, password: account.password },
    });
    assert.equal(res.status, 200, res.text);
    assert.equal(res.json.username, 'loginuser');
    assert.notEqual(client.cookie, before, 'session id must change on login');
  });

  it('gives one generic error for a wrong password and for an unknown email', async () => {
    const client = makeClient(baseUrl);
    const wrongPassword = await client.request('POST', '/api/auth/login', {
      body: { email: account.email, password: 'definitely-not-it' },
    });
    const unknownEmail = await client.request('POST', '/api/auth/login', {
      body: { email: 'nobody@example.com', password: 'definitely-not-it' },
    });

    assert.equal(wrongPassword.status, 401);
    assert.equal(unknownEmail.status, 401);
    assert.equal(wrongPassword.json.error.code, 'INVALID_CREDENTIALS');
    assert.deepEqual(
      wrongPassword.json.error,
      unknownEmail.json.error,
      'the two cases must be indistinguishable',
    );
  });

  it('throttles repeated failures for the same email and address', async () => {
    const client = makeClient(baseUrl);
    const target = { email: 'throttle@example.com', password: 'never-right' };
    let last;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      last = await client.request('POST', '/api/auth/login', { body: target });
    }
    assert.equal(last.status, 429, last.text);
    assert.equal(last.json.error.code, 'TOO_MANY_REQUESTS');
    assert.ok(Number(last.headers.get('retry-after')) > 0, 'Retry-After is set');
  });
});

describe('session lifecycle', () => {
  it('rejects /api/auth/me without a session', async () => {
    const res = await makeClient(baseUrl).request('GET', '/api/auth/me');
    assert.equal(res.status, 401);
    assert.equal(res.json.error.code, 'UNAUTHENTICATED');
  });

  it('logs out and invalidates the session', async () => {
    const client = makeClient(baseUrl);
    await client.request('POST', '/api/auth/signup', {
      body: { ...VALID_SIGNUP, email: 'bye@example.com', username: 'byeuser' },
    });
    assert.equal((await client.request('GET', '/api/auth/me')).status, 200);

    const out = await client.request('POST', '/api/auth/logout');
    assert.equal(out.status, 200);
    assert.equal((await client.request('GET', '/api/auth/me')).status, 401);
  });

  it('survives a server restart, which is the point of the SQLite store', async () => {
    const client = makeClient(baseUrl);
    await client.request('POST', '/api/auth/signup', {
      body: { ...VALID_SIGNUP, email: 'persist@example.com', username: 'persistuser' },
    });
    const cookie = client.cookie;

    // A brand new app and store over the same database file stands in for a
    // restart; an in-memory store would have forgotten this session.
    const restarted = await listen(createApp());
    try {
      const res = await fetch(`${restarted.url}/api/auth/me`, { headers: { Cookie: cookie } });
      assert.equal(res.status, 200, 'the session should still be valid after a restart');
      const body = await res.json();
      assert.equal(body.username, 'persistuser');
    } finally {
      restarted.instance.close();
    }
  });

  it('stores sessions in SQLite rather than in memory', () => {
    assert.ok(get('SELECT count(1) AS n FROM sessions').n > 0, 'sessions table is populated');
  });
});

describe('JSON-only policy', () => {
  it('rejects a mutating request that does not declare application/json', async () => {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'email=a@b.co&password=whatever',
    });
    assert.equal(res.status, 415);
    const body = await res.json();
    assert.equal(body.error.code, 'UNSUPPORTED_MEDIA_TYPE');
  });

  it('rejects a mutating request with no Content-Type at all', async () => {
    const res = await fetch(`${baseUrl}/api/auth/logout`, { method: 'POST' });
    assert.equal(res.status, 415);
  });

  it('leaves GET requests alone', async () => {
    const res = await fetch(`${baseUrl}/api/healthz`);
    assert.equal(res.status, 200);
  });
});
