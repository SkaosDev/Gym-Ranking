/** CLI wrapper: node scripts/migrate.mjs */
import { closeDb, resolveDbPath } from '../lib/db.js';
import { runMigrations } from '../lib/migrate.js';

console.log(`[migrate] database: ${resolveDbPath()}`);
const { applied, skipped } = runMigrations({ log: true });
console.log(`[migrate] done: ${applied.length} applied, ${skipped.length} already present.`);
closeDb();
