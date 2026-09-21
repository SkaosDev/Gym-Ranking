-- Sessions live in SQLite rather than the express-session default MemoryStore,
-- so restarting the dev server does not log everyone out.
CREATE TABLE sessions (
  sid        TEXT PRIMARY KEY,
  data       TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE INDEX sessions_expires_at ON sessions (expires_at);
