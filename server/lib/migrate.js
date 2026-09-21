import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { getDb } from './db.js';

const MIGRATIONS_DIR = path.resolve(import.meta.dirname, '..', 'migrations');

function checksum(contents) {
  return createHash('sha256').update(contents).digest('hex').slice(0, 16);
}

function listMigrationFiles() {
  return readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith('.sql'))
    .sort(); // numbered prefixes make lexicographic order the right order
}

/**
 * Applies any migration file not yet recorded, each in its own transaction.
 * Running it again is a no-op, so it is safe to call on every server start.
 */
export function runMigrations({ log = false } = {}) {
  const db = getDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      filename   TEXT PRIMARY KEY,
      checksum   TEXT NOT NULL,
      applied_at TEXT NOT NULL
    )
  `);

  const alreadyApplied = new Map(
    db
      .prepare('SELECT filename, checksum FROM migrations')
      .all()
      .map((row) => [row.filename, row.checksum]),
  );

  const applied = [];
  const skipped = [];

  for (const filename of listMigrationFiles()) {
    const contents = readFileSync(path.join(MIGRATIONS_DIR, filename), 'utf8');
    const sum = checksum(contents);
    const previous = alreadyApplied.get(filename);

    if (previous !== undefined) {
      skipped.push(filename);
      if (previous !== sum) {
        // Editing an applied migration means the database no longer matches the
        // file. Loud warning rather than a throw, because during this build the
        // fix is simply to delete the dev database and re-run.
        console.warn(
          `[migrate] ${filename} changed since it was applied ` +
            `(${previous} -> ${sum}). The database may not match the file.`,
        );
      }
      continue;
    }

    db.exec('BEGIN');
    try {
      db.exec(contents);
      db.prepare(
        `INSERT INTO migrations (filename, checksum, applied_at)
         VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`,
      ).run(filename, sum);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw new Error(`migration ${filename} failed: ${error.message}`, { cause: error });
    }

    applied.push(filename);
    if (log) console.log(`[migrate] applied ${filename}`);
  }

  if (log && applied.length === 0) {
    console.log(`[migrate] up to date (${skipped.length} migrations already applied)`);
  }

  return { applied, skipped };
}
