-- One row per pair of users, never two.
--
-- UNIQUE (requester_id, addressee_id) only stops a duplicate in the same
-- direction, so the pair index below normalises the two ids and makes a second
-- row for the same pair impossible whichever way round it is sent. Without it,
-- A requesting B while B requests A produces two rows and a friendship that
-- can never be resolved.
CREATE TABLE friendships (
  id           INTEGER PRIMARY KEY,
  requester_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  addressee_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  status       TEXT    NOT NULL
                       CHECK (status IN ('pending', 'accepted', 'declined', 'blocked')),
  created_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  responded_at TEXT,
  UNIQUE (requester_id, addressee_id),
  CHECK (requester_id <> addressee_id)
);

CREATE UNIQUE INDEX friendships_pair ON friendships (
  min(requester_id, addressee_id),
  max(requester_id, addressee_id)
);

CREATE INDEX friendships_addressee ON friendships (addressee_id, status);
CREATE INDEX friendships_requester ON friendships (requester_id, status);
