/**
 * End-to-end smoke checks against a running GymRank server, using Node's
 * built-in fetch. No dependencies, no test framework: it prints a
 * check/result table and exits non-zero if anything failed.
 *
 *   node scripts/smoke.mjs [baseUrl]
 *
 * It grows one section per build phase.
 */

const BASE = (process.env.SMOKE_BASE_URL ?? process.argv[2] ?? 'http://localhost:3000').replace(
  /\/$/,
  '',
);

const results = [];

function record(name, ok, detail = '') {
  results.push({ name, ok, detail });
}

/** Assert and record in one step, so a thrown error cannot skip the record. */
function expect(name, ok, detail = '') {
  record(name, Boolean(ok), detail);
  return Boolean(ok);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Poll until the server answers, so no shell-level sleep is needed. */
async function waitForServer(timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = 'no attempt made';
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/api/healthz`);
      if (res.ok) return true;
      lastError = `HTTP ${res.status}`;
    } catch (error) {
      lastError = error.code ?? error.message;
    }
    await sleep(250);
  }
  throw new Error(`server at ${BASE} never became ready (${lastError})`);
}

/** One cookie jar for the whole run, so the script behaves like one browser. */
let cookie = null;
export const jar = {
  clear: () => {
    cookie = null;
  },
  get value() {
    return cookie;
  },
};

async function req(
  method,
  path,
  { body, contentType = 'application/json', raw = false, sendCookie = true, headers: extra = {} } = {},
) {
  const headers = { ...extra };
  let payload;
  if (body !== undefined) {
    if (contentType) headers['Content-Type'] = contentType;
    payload = raw ? body : JSON.stringify(body);
  } else if (contentType && method !== 'GET') {
    // Mutating requests must declare JSON even when they carry no body.
    headers['Content-Type'] = contentType;
  }
  if (sendCookie && cookie) headers.Cookie = cookie;

  const res = await fetch(`${BASE}${path}`, { method, headers, body: payload });
  for (const raw of res.headers.getSetCookie()) cookie = raw.split(';')[0];
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* not JSON, which some checks expect */
  }
  return { status: res.status, headers: res.headers, text, json };
}

/** An error body must be exactly { error: { code, message, fields? } }. */
function isCleanErrorShape(json) {
  if (!json || typeof json.error !== 'object' || json.error === null) return false;
  if (Object.keys(json).length !== 1) return false;
  const allowed = new Set(['code', 'message', 'fields']);
  const keys = Object.keys(json.error);
  if (!keys.every((k) => allowed.has(k))) return false;
  return typeof json.error.code === 'string' && typeof json.error.message === 'string';
}

function looksLikeStackTrace(text) {
  return /\n\s+at\s+\S+|node:internal|node_modules[/\\]/.test(text);
}

// ---------------------------------------------------------------------------
// Phase 1 - scaffold, JSON error handling, static client and SPA fallback
// ---------------------------------------------------------------------------
async function phase1() {
  const health = await req('GET', '/api/healthz');
  expect('GET /api/healthz returns 200', health.status === 200, `got ${health.status}`);
  expect(
    'healthz reports status ok and a Node version',
    health.json?.status === 'ok' && /^v\d+\./.test(health.json?.node ?? ''),
    JSON.stringify(health.json),
  );

  const unknown = await req('GET', '/api/does-not-exist');
  expect('unknown /api path returns 404', unknown.status === 404, `got ${unknown.status}`);
  expect(
    'unknown /api path uses the JSON error shape',
    isCleanErrorShape(unknown.json) && unknown.json.error.code === 'NOT_FOUND',
    unknown.text.slice(0, 120),
  );

  const wrongMethod = await req('POST', '/api/healthz', { body: {} });
  expect(
    'wrong method on a known route returns 404, not HTML',
    wrongMethod.status === 404 && isCleanErrorShape(wrongMethod.json),
    `got ${wrongMethod.status}`,
  );

  const badJson = await req('POST', '/api/healthz', { body: '{"oops":', raw: true });
  expect(
    'malformed JSON body returns 400 INVALID_JSON',
    badJson.status === 400 && badJson.json?.error?.code === 'INVALID_JSON',
    `got ${badJson.status} ${badJson.text.slice(0, 80)}`,
  );
  expect(
    'no stack trace leaks in an error body',
    !looksLikeStackTrace(badJson.text) && !looksLikeStackTrace(unknown.text),
    'error bodies contained stack-like text',
  );

  const root = await req('GET', '/');
  const served = root.status === 200 && /<div id="root">/.test(root.text);
  const noBuild = root.status === 404 && root.json?.error?.code === 'NO_CLIENT_BUILD';
  expect(
    'GET / serves the SPA shell, or says the build is missing',
    served || noBuild,
    served ? 'serving client/dist' : `no build (HTTP ${root.status})`,
  );

  if (served) {
    const deep = await req('GET', '/progress');
    expect(
      'deep link /progress falls back to the SPA shell',
      deep.status === 200 && /<div id="root">/.test(deep.text),
      `got ${deep.status}`,
    );
    const deepApi = await req('GET', '/api/progress');
    expect(
      'SPA fallback does not swallow unknown /api paths',
      deepApi.status === 404 && isCleanErrorShape(deepApi.json),
      `got ${deepApi.status}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Phase 4 - accounts, sessions and the JSON-only policy
// ---------------------------------------------------------------------------
async function phase4() {
  // A fresh identity per run keeps repeated smoke runs independent.
  const tag = Date.now().toString(36);
  const account = {
    email: `smoke-${tag}@example.com`,
    username: `smoke${tag}`.slice(0, 20),
    password: 'smoke-test-password',
    sex: 'M',
    birth_date: '1996-04-12',
    height_cm: 182,
    // 90 kg so the bench set below reproduces reference case 1 end to end.
    weight_kg: 90,
  };

  jar.clear();
  const anonymous = await req('GET', '/api/auth/me');
  expect(
    'GET /api/auth/me is 401 when signed out',
    anonymous.status === 401 && anonymous.json?.error?.code === 'UNAUTHENTICATED',
    `got ${anonymous.status}`,
  );

  const formPost = await req('POST', '/api/auth/login', {
    body: 'email=a@b.co&password=x',
    contentType: 'application/x-www-form-urlencoded',
    raw: true,
  });
  expect(
    'form-encoded POST is refused (CSRF vector)',
    formPost.status === 415 && formPost.json?.error?.code === 'UNSUPPORTED_MEDIA_TYPE',
    `got ${formPost.status}`,
  );

  const signup = await req('POST', '/api/auth/signup', { body: account });
  expect('POST /api/auth/signup creates an account', signup.status === 201, signup.text.slice(0, 160));
  expect(
    'signup returns the owner profile with a computed age',
    signup.json?.username === account.username && typeof signup.json?.age === 'number',
    JSON.stringify(signup.json)?.slice(0, 160),
  );
  expect(
    'signup seeds the bodyweight history',
    signup.json?.current_weight_kg === account.weight_kg,
    `got ${signup.json?.current_weight_kg}`,
  );

  const cookieHeader = jar.value ?? '';
  expect('a session cookie was issued', cookieHeader.startsWith('gymrank.sid='), cookieHeader);

  const me = await req('GET', '/api/auth/me');
  expect('GET /api/auth/me returns the profile once signed in', me.status === 200, `got ${me.status}`);

  const leaked = ['password_hash', 'password_salt', account.password].filter((needle) =>
    `${signup.text}${me.text}`.includes(needle),
  );
  expect('no password material appears in any response', leaked.length === 0, leaked.join(', '));

  const duplicate = await req('POST', '/api/auth/signup', {
    body: { ...account, email: account.email.toUpperCase(), username: account.username.toUpperCase() },
  });
  expect(
    'duplicate email and username are refused, case-insensitively',
    duplicate.status === 409 && duplicate.json?.error?.fields?.email && duplicate.json?.error?.fields?.username,
    `got ${duplicate.status}`,
  );

  const invalid = await req('POST', '/api/auth/signup', {
    body: { email: 'nope', username: 'A B', password: 'short', sex: 'X', birth_date: '2026-02-30', height_cm: 5, weight_kg: 900 },
  });
  expect(
    'invalid signup reports every field at once',
    invalid.status === 422 && Object.keys(invalid.json?.error?.fields ?? {}).length === 7,
    `got ${invalid.status} with ${Object.keys(invalid.json?.error?.fields ?? {}).length} fields`,
  );

  const logout = await req('POST', '/api/auth/logout');
  expect('POST /api/auth/logout succeeds', logout.status === 200, `got ${logout.status}`);
  const afterLogout = await req('GET', '/api/auth/me');
  expect('the session is dead after logout', afterLogout.status === 401, `got ${afterLogout.status}`);

  const wrongPassword = await req('POST', '/api/auth/login', {
    body: { email: account.email, password: 'not-the-password' },
  });
  const unknownEmail = await req('POST', '/api/auth/login', {
    body: { email: `nobody-${tag}@example.com`, password: 'not-the-password' },
  });
  expect(
    'a wrong password and an unknown email are indistinguishable',
    wrongPassword.status === 401 &&
      unknownEmail.status === 401 &&
      wrongPassword.json?.error?.message === unknownEmail.json?.error?.message,
    `${wrongPassword.status}/${unknownEmail.status}`,
  );

  const login = await req('POST', '/api/auth/login', {
    body: { email: account.email, password: account.password },
  });
  expect('POST /api/auth/login signs back in', login.status === 200, login.text.slice(0, 160));
  const meAgain = await req('GET', '/api/auth/me');
  expect('the new session works', meAgain.status === 200 && meAgain.json?.username === account.username, `got ${meAgain.status}`);
}

// ---------------------------------------------------------------------------
// Phase 5 - performance CRUD, enrichment and the confirmation guard
// Runs on the session phase 4 left signed in.
// ---------------------------------------------------------------------------
async function phase5() {
  const exercises = await req('GET', '/api/exercises');
  expect(
    'GET /api/exercises returns the seven seeded exercises',
    exercises.status === 200 && exercises.json?.items?.length === 7,
    `got ${exercises.status} with ${exercises.json?.items?.length} items`,
  );
  const byCode = Object.fromEntries((exercises.json?.items ?? []).map((e) => [e.code, e]));

  const created = await req('POST', '/api/performances', {
    body: { exercise_id: byCode.bench?.id, weight_kg: 100, reps: 5, performed_at: '2026-06-15', notes: 'smoke' },
  });
  expect('POST /api/performances creates a set', created.status === 201, created.text.slice(0, 160));
  // Reference case 1, all the way through the HTTP API: a 90 kg man benching
  // 100 kg for 5 gives e1RM 114.58, DOTS 74.09, index 459.3, Gold V.
  expect(
    'reference case 1 reproduces end to end',
    Math.abs((created.json?.e1rm_kg ?? 0) - 114.58) < 0.01 &&
      Math.abs((created.json?.dots_points ?? 0) - 74.09) < 0.01 &&
      Math.abs((created.json?.strength_index ?? 0) - 459.3) < 0.1 &&
      created.json?.rank?.label === 'Gold V',
    `e1RM ${created.json?.e1rm_kg}, DOTS ${created.json?.dots_points}, ` +
      `index ${created.json?.strength_index}, rank ${created.json?.rank?.label}`,
  );
  expect(
    'it names the kilograms needed for the next division',
    (created.json?.next_division?.kg_needed ?? 0) > 0,
    JSON.stringify(created.json?.next_division),
  );

  const list = await req('GET', '/api/performances?exercise=bench&sort=date_desc');
  expect(
    'GET /api/performances lists and filters',
    list.status === 200 && list.json.items.some((row) => row.id === created.json.id),
    `got ${list.status} with ${list.json?.items?.length} rows`,
  );

  const updated = await req('PATCH', `/api/performances/${created.json.id}`, { body: { weight_kg: 105 } });
  expect(
    'PATCH rescores the row',
    updated.status === 200 && updated.json.weight_kg === 105 && updated.json.e1rm_kg > created.json.e1rm_kg,
    `got ${updated.status}`,
  );

  const endurance = await req('POST', '/api/performances', {
    body: { exercise_id: byCode.squat?.id, weight_kg: 60, reps: 20, performed_at: '2026-06-15' },
  });
  expect(
    'a set above 12 reps is kept but excluded from the rank',
    endurance.status === 201 &&
      endurance.json.e1rm_kg === null &&
      endurance.json.counts_toward_rank === false,
    `e1RM ${endurance.json?.e1rm_kg}, counts ${endurance.json?.counts_toward_rank}`,
  );

  await req('POST', '/api/performances', {
    body: { exercise_id: byCode.deadlift?.id, weight_kg: 150, reps: 1, performed_at: '2026-06-01' },
  });
  const jump = await req('POST', '/api/performances', {
    body: { exercise_id: byCode.deadlift?.id, weight_kg: 250, reps: 1, performed_at: '2026-06-02' },
  });
  expect(
    'a jump beyond 25% is flagged and held out of the rank',
    jump.json?.needs_confirmation === true && jump.json?.counts_toward_rank === false,
    `flag ${jump.json?.needs_confirmation}, counts ${jump.json?.counts_toward_rank}`,
  );

  const confirmed = await req('POST', `/api/performances/${jump.json.id}/confirm`);
  expect(
    'confirming it by hand lets it count again',
    confirmed.status === 200 &&
      confirmed.json.needs_confirmation === false &&
      confirmed.json.counts_toward_rank === true,
    `got ${confirmed.status}`,
  );

  const removed = await req('DELETE', `/api/performances/${created.json.id}`);
  const gone = await req('GET', `/api/performances/${created.json.id}`);
  expect(
    'DELETE removes it for good',
    removed.status === 200 && gone.status === 404,
    `delete ${removed.status}, fetch ${gone.status}`,
  );

  const validation = await req('POST', '/api/performances', {
    body: { exercise_id: byCode.squat?.id, weight_kg: -20, reps: 0, performed_at: '2099-01-01' },
  });
  expect(
    'invalid input is refused with per-field messages',
    validation.status === 422 && Object.keys(validation.json?.error?.fields ?? {}).length >= 2,
    `got ${validation.status}`,
  );
}

// ---------------------------------------------------------------------------
async function main() {
  console.log(`\nGymRank smoke checks against ${BASE}\n`);
  await waitForServer();
  await phase1();
  await phase4();
  await phase5();

  const nameWidth = Math.max(...results.map((r) => r.name.length), 6);
  console.log(`${'CHECK'.padEnd(nameWidth)}  RESULT  DETAIL`);
  console.log(`${'-'.repeat(nameWidth)}  ------  ------`);
  for (const r of results) {
    console.log(
      `${r.name.padEnd(nameWidth)}  ${r.ok ? 'PASS  ' : 'FAIL  '}  ${r.ok ? '' : r.detail}`,
    );
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed.\n`);
  process.exitCode = failed.length > 0 ? 1 : 0;
}

main().catch((error) => {
  console.error(`\nsmoke run aborted: ${error.message}\n`);
  process.exitCode = 1;
});
