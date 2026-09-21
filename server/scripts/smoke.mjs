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

async function req(method, path, { body, contentType = 'application/json', raw = false } = {}) {
  const headers = {};
  let payload;
  if (body !== undefined) {
    if (contentType) headers['Content-Type'] = contentType;
    payload = raw ? body : JSON.stringify(body);
  }
  const res = await fetch(`${BASE}${path}`, { method, headers, body: payload });
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
async function main() {
  console.log(`\nGymRank smoke checks against ${BASE}\n`);
  await waitForServer();
  await phase1();

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
