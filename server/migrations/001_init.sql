-- Core schema: accounts, bodyweight history, the exercise reference table and
-- the performances that drive every score.
--
-- Derived values (e1rm_kg, effective_load_kg, dots_points, adjusted_score,
-- strength_index, rank) are deliberately absent: they are computed on read by
-- the scoring engine, never stored as a source of truth.

CREATE TABLE users (
  id                       INTEGER PRIMARY KEY,
  email                    TEXT    NOT NULL,
  password_hash            TEXT    NOT NULL,
  password_salt            TEXT    NOT NULL,
  -- Public handle: 3-20 characters, lowercase letters, digits, underscore, hyphen.
  username                 TEXT    NOT NULL
                                   CHECK (length(username) BETWEEN 3 AND 20
                                          AND lower(username) NOT GLOB '*[^a-z0-9_-]*'),
  sex                      TEXT    NOT NULL CHECK (sex IN ('M', 'F')),
  birth_date               TEXT    NOT NULL
                                   CHECK (birth_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  height_cm                REAL    NOT NULL CHECK (height_cm BETWEEN 100 AND 250),
  ranks_visible_to_friends INTEGER NOT NULL DEFAULT 1
                                   CHECK (ranks_visible_to_friends IN (0, 1)),
  created_at               TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- Case-insensitive uniqueness: expression indexes, so SQLite enforces it rather
-- than the application remembering to lower() on every lookup.
CREATE UNIQUE INDEX users_email_unique    ON users (lower(email));
CREATE UNIQUE INDEX users_username_unique ON users (lower(username));

-- Weight changes, and the score depends on it: a performance is scored against
-- the most recent weigh-in dated at or before the day it was performed.
CREATE TABLE body_weights (
  id          INTEGER PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  weight_kg   REAL    NOT NULL CHECK (weight_kg BETWEEN 30 AND 250),
  measured_at TEXT    NOT NULL
                      CHECK (measured_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  -- One weigh-in per day keeps "the weight on that date" unambiguous; a second
  -- entry for the same day replaces the first.
  UNIQUE (user_id, measured_at)
);

CREATE INDEX body_weights_user_measured ON body_weights (user_id, measured_at DESC);

-- Reference table, seeded, not user-editable.
CREATE TABLE exercises (
  id            INTEGER PRIMARY KEY,
  code          TEXT    NOT NULL UNIQUE,
  label         TEXT    NOT NULL,
  type          TEXT    NOT NULL CHECK (type IN ('external', 'bodyweight')),
  -- Fraction of bodyweight lifted; 0 for external loads.
  bw_factor     REAL    NOT NULL DEFAULT 0 CHECK (bw_factor BETWEEN 0 AND 2),
  -- This exercise's weight in the overall rank; 0 means it does not count.
  global_weight REAL    NOT NULL DEFAULT 0 CHECK (global_weight >= 0)
);

-- The core CRUD entity.
CREATE TABLE performances (
  id                 INTEGER PRIMARY KEY,
  user_id            INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  exercise_id        INTEGER NOT NULL REFERENCES exercises (id),
  -- External lifts: the load itself. Bodyweight lifts: ADDED load, which may be
  -- 0, or negative when a band assists. Route validation is stricter per type;
  -- this bound only stops absurd values reaching the file.
  weight_kg          REAL    NOT NULL CHECK (weight_kg BETWEEN -200 AND 500),
  reps               INTEGER NOT NULL CHECK (reps BETWEEN 1 AND 100),
  performed_at       TEXT    NOT NULL
                             CHECK (performed_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  notes              TEXT,
  -- Set when the implied 1RM jumps more than 25% above the previous best;
  -- such a row stays in the history but is excluded from the rank.
  needs_confirmation INTEGER NOT NULL DEFAULT 0 CHECK (needs_confirmation IN (0, 1)),
  created_at         TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at         TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX performances_user_date          ON performances (user_id, performed_at DESC);
CREATE INDEX performances_user_exercise_date ON performances (user_id, exercise_id, performed_at DESC);
