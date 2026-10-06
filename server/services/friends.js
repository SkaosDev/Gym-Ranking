/**
 * Friendships, and the one place in this project where a leak would have real
 * consequences.
 *
 * The scoping is done by the queries, not by the response mapper. A field that
 * is dropped late is a field that was still selected, and one careless
 * res.json(row) puts it back on the wire. So there are two separate readers
 * below: one returns only what a stranger may see, and one returns the
 * scoring inputs, is named to say it must never be serialised, and is only
 * ever passed into the scoring engine.
 */
import { all, get, run } from '../lib/db.js';
import { ApiError } from '../lib/errors.js';
import { ageOn } from '../lib/scoring.js';
import { computeRanks } from './ranks.js';
import { RANK_THRESHOLDS, activitySeries, bodyweightSeries, indexSeries } from './stats.js';

export const SEARCH_MIN_LENGTH = 3;
export const SEARCH_LIMIT = 10;

const nowIso = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

/**
 * Everything another account is ever allowed to learn about a user, and
 * nothing else. No email, date of birth, height, or bodyweight is selected,
 * so none of it can reach a response by accident.
 */
function readPublicIdentity(username) {
  return get(
    `SELECT id, username, created_at, ranks_visible_to_friends
       FROM users
      WHERE lower(username) = lower(?)`,
    [username],
  );
}

/**
 * NEVER SERIALISE THE RESULT OF THIS. Sex and date of birth are scoring
 * inputs; they are owner-only data and exist here solely to be handed to the
 * scoring engine.
 */
function readScoringIdentityNeverSerialise(userId) {
  return get('SELECT id, sex, birth_date FROM users WHERE id = ?', [userId]);
}

/**
 * The body details friends are shown: age, sex, height and the latest
 * weigh-in. The age is computed here so the date of birth itself never
 * leaves, and the weight history stays with the owner.
 */
function readFriendDetails(userId) {
  const row = get('SELECT sex, birth_date, height_cm FROM users WHERE id = ?', [userId]);
  const weight = get(
    'SELECT weight_kg FROM body_weights WHERE user_id = ? ORDER BY measured_at DESC LIMIT 1',
    [userId],
  );
  return {
    age: ageOn(row.birth_date, new Date().toISOString().slice(0, 10)),
    sex: row.sex,
    height_cm: row.height_cm,
    weight_kg: weight?.weight_kg ?? null,
  };
}

/** The overall index day by day, without the bodyweight it sits next to. */
function overallTimeline(scoring) {
  return bodyweightSeries(scoring)
    .points.filter((point) => point.overall_index !== null)
    .map((point) => ({ date: point.date, overall_index: point.overall_index }));
}

/** The single row for this pair, whichever direction it was sent in. */
function findPair(oneId, otherId) {
  return get(
    `SELECT * FROM friendships
      WHERE (requester_id = :one AND addressee_id = :other)
         OR (requester_id = :other AND addressee_id = :one)`,
    { one: oneId, other: otherId },
  );
}

export function friendshipStateFor(viewerId, otherId) {
  const pair = findPair(viewerId, otherId);
  if (!pair) return { status: 'none', friendship_id: null, direction: null };
  return {
    status: pair.status,
    friendship_id: pair.id,
    direction: pair.requester_id === viewerId ? 'outgoing' : 'incoming',
  };
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** Overall rank only, and only when that friend allows it. */
function overallRankFor(identity) {
  if (!identity.ranks_visible_to_friends) return null;
  const scoring = readScoringIdentityNeverSerialise(identity.id);
  const ranks = computeRanks(scoring);
  if (!ranks.overall.complete) return null;
  return { index: ranks.overall.index, rank: ranks.overall.rank };
}

export function listFriends(user) {
  const rows = all(
    `SELECT f.id, f.status, f.requester_id, f.addressee_id, f.created_at, f.responded_at,
            u.id AS other_id, u.username, u.ranks_visible_to_friends
       FROM friendships f
       JOIN users u
         ON u.id = CASE WHEN f.requester_id = :me THEN f.addressee_id ELSE f.requester_id END
      WHERE (f.requester_id = :me OR f.addressee_id = :me)
        AND f.status IN ('pending', 'accepted')`,
    { me: user.id },
  );

  const incoming = rows
    .filter((row) => row.status === 'pending' && row.addressee_id === user.id)
    .map((row) => ({ id: row.id, username: row.username, requested_at: row.created_at }));

  const outgoing = rows
    .filter((row) => row.status === 'pending' && row.requester_id === user.id)
    .map((row) => ({ id: row.id, username: row.username, requested_at: row.created_at }));

  const friends = rows
    .filter((row) => row.status === 'accepted')
    // Alphabetical: this is the address book. The leaderboard orders the
    // same people by rank on the client.
    .sort((a, b) => a.username.localeCompare(b.username))
    .map((row) => ({
      id: row.id,
      username: row.username,
      friends_since: row.responded_at ?? row.created_at,
      ranks_visible: Boolean(row.ranks_visible_to_friends),
      overall: overallRankFor({
        id: row.other_id,
        ranks_visible_to_friends: row.ranks_visible_to_friends,
      }),
    }));

  return { incoming, outgoing, friends };
}

/**
 * Prefix search on the username only. Never the email, and never an unbounded
 * list: without both of those an account directory is an enumeration tool.
 */
export function searchUsers(user, query) {
  const term = String(query ?? '').trim().toLowerCase();
  if (term.length < SEARCH_MIN_LENGTH) {
    throw ApiError.unprocessable('Some fields need attention.', {
      q: `Type at least ${SEARCH_MIN_LENGTH} characters.`,
    });
  }

  const rows = all(
    `SELECT id, username FROM users
      WHERE lower(username) LIKE ? ESCAPE '\\'
        AND id <> ?
      ORDER BY username
      LIMIT ?`,
    [`${term.replace(/[\\%_]/g, '\\$&')}%`, user.id, SEARCH_LIMIT],
  );

  return {
    items: rows.map((row) => ({
      username: row.username,
      friendship: friendshipStateFor(user.id, row.id),
    })),
  };
}

/**
 * The public profile, scoped by friendship. Built as explicit object literals
 * from the public identity: the scoring identity never reaches this shape.
 */
export function publicProfile(viewer, username) {
  const identity = readPublicIdentity(username);
  if (!identity) throw ApiError.notFound('No such user.');

  const isSelf = identity.id === viewer.id;
  const friendship = isSelf
    ? { status: 'self', friendship_id: null, direction: null }
    : friendshipStateFor(viewer.id, identity.id);

  const areFriends = isSelf || friendship.status === 'accepted';

  // A stranger learns that the username exists and whether a request is
  // already in flight. Not the join date, not anything else.
  if (!areFriends) {
    return {
      username: identity.username,
      visibility: 'stranger',
      friendship,
      created_at: null,
      details: null,
      overall: null,
      exercises: null,
      index_series: null,
    };
  }

  // Friends always see each other's age, sex, height and current weight.
  const details = readFriendDetails(identity.id);

  if (!identity.ranks_visible_to_friends && !isSelf) {
    return {
      username: identity.username,
      visibility: 'ranks_hidden',
      friendship,
      created_at: identity.created_at,
      details,
      overall: null,
      exercises: null,
      index_series: null,
    };
  }

  const scoring = readScoringIdentityNeverSerialise(identity.id);
  const ranks = computeRanks(scoring);

  return {
    username: identity.username,
    visibility: isSelf ? 'self' : 'full',
    friendship,
    created_at: identity.created_at,
    details,
    overall: ranks.overall.complete
      ? { index: ranks.overall.index, rank: ranks.overall.rank }
      : null,
    // Ranks and indices only. Kilogram loads, estimated maxes and standards
    // all stay with the owner.
    exercises: ranks.exercises
      .filter((entry) => entry.has_data)
      .map((entry) => ({
        code: entry.exercise.code,
        label: entry.exercise.label,
        index: entry.effective_index,
        rank: entry.rank,
      })),
    index_series: indexSeries(scoring).series.map((series) => ({
      code: series.code,
      label: series.label,
      points: series.points.map((point) => ({
        date: point.performed_at,
        index: point.strength_index,
      })),
    })),
    overall_series: overallTimeline(scoring),
    thresholds: RANK_THRESHOLDS,
    // Which days they trained, and how many sets: never what was on the bar.
    activity: activitySeries(scoring),
  };
}

/**
 * The overall rank over time for you and every friend who shares ranks, for
 * the comparison chart. Friends with hidden ranks are left out entirely.
 */
export function friendsProgress(user) {
  const friends = all(
    `SELECT u.id, u.username
       FROM friendships f
       JOIN users u
         ON u.id = CASE WHEN f.requester_id = :me THEN f.addressee_id ELSE f.requester_id END
      WHERE (f.requester_id = :me OR f.addressee_id = :me)
        AND f.status = 'accepted'
        AND u.ranks_visible_to_friends = 1
      ORDER BY lower(u.username)`,
    { me: user.id },
  );

  const people = [
    { id: user.id, username: user.username, is_self: true },
    ...friends.map((friend) => ({ id: friend.id, username: friend.username, is_self: false })),
  ];

  return {
    thresholds: RANK_THRESHOLDS,
    people: people.map((person) => ({
      username: person.username,
      is_self: person.is_self,
      points: overallTimeline(readScoringIdentityNeverSerialise(person.id)),
    })),
  };
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export function requestFriendship(user, username) {
  const target = readPublicIdentity(username);
  if (!target) throw ApiError.notFound('No such user.');

  if (target.id === user.id) {
    throw ApiError.unprocessable('Some fields need attention.', {
      username: 'You cannot add yourself.',
    });
  }

  const pair = findPair(user.id, target.id);

  if (!pair) {
    const inserted = run(
      'INSERT INTO friendships (requester_id, addressee_id, status) VALUES (?, ?, ?)',
      [user.id, target.id, 'pending'],
    );
    return { outcome: 'requested', id: Number(inserted.lastInsertRowid) };
  }

  if (pair.status === 'accepted') {
    throw ApiError.conflict(`You and ${target.username} are already friends.`);
  }

  if (pair.status === 'blocked') {
    throw ApiError.forbidden('That request cannot be sent.');
  }

  if (pair.status === 'pending') {
    if (pair.requester_id === user.id) {
      throw ApiError.conflict(`You have already asked ${target.username}.`);
    }

    // They asked first. Accept that row instead of creating a second one:
    // this is the crossed-request case, and duplicating here is the classic
    // bug in this kind of system.
    run('UPDATE friendships SET status = ?, responded_at = ? WHERE id = ?', [
      'accepted',
      nowIso(),
      pair.id,
    ]);
    return { outcome: 'accepted_existing', id: pair.id };
  }

  // Previously declined: reuse the one row for the pair, pointing the other
  // way if the other person is the one asking now.
  run(
    `UPDATE friendships
        SET requester_id = ?, addressee_id = ?, status = 'pending',
            created_at = ?, responded_at = NULL
      WHERE id = ?`,
    [user.id, target.id, nowIso(), pair.id],
  );
  return { outcome: 'requested', id: pair.id };
}

/** Only the addressee may answer, and a stranger's row is simply not found. */
function loadPendingForAddressee(user, friendshipId) {
  const row = get(
    `SELECT * FROM friendships WHERE id = ? AND addressee_id = ? AND status = 'pending'`,
    [friendshipId, user.id],
  );
  if (!row) throw ApiError.notFound('No such friend request.');
  return row;
}

export function acceptRequest(user, friendshipId) {
  const row = loadPendingForAddressee(user, friendshipId);
  run('UPDATE friendships SET status = ?, responded_at = ? WHERE id = ?', [
    'accepted',
    nowIso(),
    row.id,
  ]);
  return { outcome: 'accepted', id: row.id };
}

export function declineRequest(user, friendshipId) {
  const row = loadPendingForAddressee(user, friendshipId);
  run('UPDATE friendships SET status = ?, responded_at = ? WHERE id = ?', [
    'declined',
    nowIso(),
    row.id,
  ]);
  return { outcome: 'declined', id: row.id };
}

/** Removes a friend, or cancels a request you sent. Either party may do it. */
export function removeFriendship(user, friendshipId) {
  const row = get(
    'SELECT * FROM friendships WHERE id = ? AND (requester_id = ? OR addressee_id = ?)',
    [friendshipId, user.id, user.id],
  );
  if (!row) throw ApiError.notFound('No such friendship.');
  if (row.status === 'pending' && row.addressee_id === user.id) {
    // Answering an incoming request is decline, not delete.
    throw ApiError.badRequest('Decline this request instead of removing it.');
  }

  run('DELETE FROM friendships WHERE id = ?', [row.id]);
  return { outcome: 'removed', id: row.id };
}
