import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';

// Point the connection at a scratch database before anything opens it.
const workDir = mkdtempSync(path.join(tmpdir(), 'gymrank-db-test-'));
process.env.DB_PATH = path.join(workDir, 'test.db');

const { all, closeDb, get, getDb, run, tx } = await import('../lib/db.js');
const { runMigrations } = await import('../lib/migrate.js');

/** Insert a valid user and return its id, overriding any field. */
function insertUser(overrides = {}) {
  const user = {
    email: 'lifter@example.com',
    password_hash: 'hash',
    password_salt: 'salt',
    username: 'lifter',
    sex: 'M',
    birth_date: '2000-05-17',
    height_cm: 180,
    ...overrides,
  };
  return run(
    `INSERT INTO users (email, password_hash, password_salt, username, sex, birth_date, height_cm)
     VALUES (:email, :password_hash, :password_salt, :username, :sex, :birth_date, :height_cm)`,
    user,
  ).lastInsertRowid;
}

before(() => {
  runMigrations();
});

after(() => {
  closeDb();
  rmSync(workDir, { recursive: true, force: true });
});

describe('connection pragmas', () => {
  it('enables foreign keys, which SQLite does not do by default', () => {
    assert.equal(get('PRAGMA foreign_keys').foreign_keys, 1);
  });

  it('uses WAL journalling', () => {
    assert.equal(get('PRAGMA journal_mode').journal_mode, 'wal');
  });
});

describe('migrations', () => {
  it('creates every table the data model needs', () => {
    const names = all("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").map(
      (row) => row.name,
    );
    for (const table of ['body_weights', 'exercises', 'migrations', 'performances', 'users']) {
      assert.ok(names.includes(table), `missing table ${table}`);
    }
  });

  it('is idempotent', () => {
    const second = runMigrations();
    assert.deepEqual(second.applied, [], 'a second run must apply nothing');
    assert.ok(second.skipped.length > 0, 'and must recognise the ones already applied');
    assert.equal(
      get('SELECT count(1) AS n FROM migrations').n,
      second.skipped.length,
      'the ledger and the skipped list must agree',
    );
  });
});

describe('exercise seed', () => {
  it('seeds the seven exercises in specification order', () => {
    const rows = all('SELECT code, label, type, bw_factor, global_weight FROM exercises ORDER BY id');
    assert.deepEqual(
      rows.map((r) => r.code),
      ['squat', 'bench', 'deadlift', 'ohp', 'pullup', 'dip', 'pushup'],
    );
  });

  it('carries the bodyweight factors and global weights', () => {
    const byCode = Object.fromEntries(all('SELECT * FROM exercises').map((r) => [r.code, r]));
    assert.equal(byCode.pushup.bw_factor, 0.7);
    assert.equal(byCode.pullup.bw_factor, 1);
    assert.equal(byCode.squat.bw_factor, 0);
    assert.equal(byCode.dip.global_weight, 0);
    assert.equal(byCode.ohp.global_weight, 0.5);
    // Exactly five exercises carry weight in the overall rank.
    assert.equal(get('SELECT count(*) AS n FROM exercises WHERE global_weight > 0').n, 5);
  });

  it('re-seeding does not duplicate rows', () => {
    runMigrations();
    assert.equal(get('SELECT count(*) AS n FROM exercises').n, 7);
  });
});

describe('user constraints', () => {
  it('rejects a duplicate email regardless of case', () => {
    const id = insertUser({ email: 'dup@example.com', username: 'dup1' });
    assert.ok(id);
    assert.throws(() => insertUser({ email: 'DUP@EXAMPLE.COM', username: 'dup2' }), /UNIQUE/i);
  });

  it('rejects a duplicate username regardless of case', () => {
    insertUser({ email: 'a@example.com', username: 'takenname' });
    assert.throws(() => insertUser({ email: 'b@example.com', username: 'TakenName' }), /UNIQUE/i);
  });

  it('rejects usernames outside [a-z0-9_-] or the 3-20 length range', () => {
    for (const username of ['ab', 'a'.repeat(21), 'has space', 'bang!', 'dots.dots']) {
      assert.throws(
        () => insertUser({ email: `${Math.random()}@example.com`, username }),
        /CHECK/i,
        `should have rejected ${JSON.stringify(username)}`,
      );
    }
  });

  it('accepts hyphen, underscore and digits', () => {
    const id = insertUser({ email: 'ok@example.com', username: 'cl-ment_99' });
    assert.ok(id);
  });

  it('rejects an unknown sex, a malformed birth date and an absurd height', () => {
    assert.throws(() => insertUser({ email: 'c@example.com', username: 'sexbad', sex: 'X' }), /CHECK/i);
    assert.throws(
      () => insertUser({ email: 'd@example.com', username: 'datebad', birth_date: '17/05/2000' }),
      /CHECK/i,
    );
    assert.throws(
      () => insertUser({ email: 'e@example.com', username: 'tallbad', height_cm: 40 }),
      /CHECK/i,
    );
  });
});

describe('referential integrity', () => {
  it('refuses a bodyweight row for a user that does not exist', () => {
    assert.throws(
      () => run('INSERT INTO body_weights (user_id, weight_kg, measured_at) VALUES (?, ?, ?)', [
        999_999,
        80,
        '2026-01-01',
      ]),
      /FOREIGN KEY/i,
    );
  });

  it('cascades a user delete to weights and performances', () => {
    const userId = insertUser({ email: 'cascade@example.com', username: 'cascade' });
    const squatId = get("SELECT id FROM exercises WHERE code = 'squat'").id;
    run('INSERT INTO body_weights (user_id, weight_kg, measured_at) VALUES (?, ?, ?)', [
      userId,
      88,
      '2026-01-01',
    ]);
    run(
      `INSERT INTO performances (user_id, exercise_id, weight_kg, reps, performed_at)
       VALUES (?, ?, ?, ?, ?)`,
      [userId, squatId, 140, 3, '2026-01-02'],
    );

    run('DELETE FROM users WHERE id = ?', [userId]);
    assert.equal(get('SELECT count(*) AS n FROM body_weights WHERE user_id = ?', [userId]).n, 0);
    assert.equal(get('SELECT count(*) AS n FROM performances WHERE user_id = ?', [userId]).n, 0);
  });

  it('keeps one weigh-in per day per user', () => {
    const userId = insertUser({ email: 'weigh@example.com', username: 'weigh' });
    run('INSERT INTO body_weights (user_id, weight_kg, measured_at) VALUES (?, ?, ?)', [
      userId,
      90,
      '2026-02-01',
    ]);
    assert.throws(
      () => run('INSERT INTO body_weights (user_id, weight_kg, measured_at) VALUES (?, ?, ?)', [
        userId,
        91,
        '2026-02-01',
      ]),
      /UNIQUE/i,
    );
  });
});

describe('performance constraints', () => {
  it('allows negative added load for band-assisted bodyweight work', () => {
    const userId = insertUser({ email: 'band@example.com', username: 'bandwork' });
    const pullupId = get("SELECT id FROM exercises WHERE code = 'pullup'").id;
    const result = run(
      `INSERT INTO performances (user_id, exercise_id, weight_kg, reps, performed_at)
       VALUES (?, ?, ?, ?, ?)`,
      [userId, pullupId, -20, 5, '2026-03-01'],
    );
    assert.ok(result.lastInsertRowid);
  });

  it('rejects zero reps and a load beyond the accepted range', () => {
    const userId = insertUser({ email: 'range@example.com', username: 'rangecheck' });
    const squatId = get("SELECT id FROM exercises WHERE code = 'squat'").id;
    const insert = (weight, reps) =>
      run(
        `INSERT INTO performances (user_id, exercise_id, weight_kg, reps, performed_at)
         VALUES (?, ?, ?, ?, ?)`,
        [userId, squatId, weight, reps, '2026-03-02'],
      );
    assert.throws(() => insert(100, 0), /CHECK/i);
    assert.throws(() => insert(100, 101), /CHECK/i);
    assert.throws(() => insert(600, 1), /CHECK/i);
  });
});

describe('query helpers', () => {
  it('converts booleans and Date objects, which SQLite cannot bind', () => {
    const userId = insertUser({ email: 'coerce@example.com', username: 'coerce' });
    run('UPDATE users SET ranks_visible_to_friends = ? WHERE id = ?', [false, userId]);
    assert.equal(get('SELECT ranks_visible_to_friends AS v FROM users WHERE id = ?', [userId]).v, 0);

    const squatId = get("SELECT id FROM exercises WHERE code = 'squat'").id;
    run(
      `INSERT INTO performances (user_id, exercise_id, weight_kg, reps, performed_at, notes)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [userId, squatId, 100, 5, '2026-03-03', null],
    );
    assert.equal(get('SELECT notes FROM performances WHERE user_id = ?', [userId]).notes, null);
  });

  it('rolls back a failed transaction completely', () => {
    const before = get('SELECT count(*) AS n FROM users').n;
    assert.throws(() => {
      tx(() => {
        insertUser({ email: 'rollback@example.com', username: 'rollbackme' });
        throw new Error('boom');
      });
    }, /boom/);
    assert.equal(get('SELECT count(*) AS n FROM users').n, before);
  });

  it('commits a successful transaction and supports nesting', () => {
    const before = get('SELECT count(*) AS n FROM users').n;
    tx(() => {
      insertUser({ email: 'outer@example.com', username: 'outeruser' });
      tx(() => insertUser({ email: 'inner@example.com', username: 'inneruser' }));
    });
    assert.equal(get('SELECT count(*) AS n FROM users').n, before + 2);
  });

  it('exposes the connection for callers that need raw access', () => {
    assert.ok(typeof getDb().prepare === 'function');
  });
});
