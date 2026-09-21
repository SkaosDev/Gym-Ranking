import { createApp } from './app.js';
import { resolveDbPath } from './lib/db.js';
import { runMigrations } from './lib/migrate.js';

const port = Number(process.env.PORT ?? 3000);

// Migrations run on every start and are a no-op when up to date, so a fresh
// clone needs no setup step before the server works.
console.log(`GymRank database: ${resolveDbPath()}`);
runMigrations({ log: true });

const app = createApp();
app.listen(port, () => {
  console.log(`GymRank API listening on http://localhost:${port}`);
});
