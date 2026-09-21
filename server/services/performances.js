/**
 * Everything that turns stored performance rows into scored ones.
 *
 * The scoring engine stays pure; this is the layer that knows about the
 * database: which bodyweight applies to which date, which rows corroborate a
 * suspicious one, and what the API shape looks like.
 */
import { all, get, run, tx } from '../lib/db.js';
import { ApiError } from '../lib/errors.js';
import { scoreLift } from '../lib/scoring.js';

/** A jump larger than this above the confirmed best is treated as suspicious. */
export const SUSPICIOUS_JUMP_RATIO = 1.25;

/** A later set reaching this share of a flagged e1RM corroborates it. */
export const CORROBORATION_RATIO = 0.9;

const ROW_SELECT = `
  SELECT p.id, p.user_id, p.exercise_id, p.weight_kg, p.reps, p.performed_at,
         p.notes, p.needs_confirmation, p.created_at, p.updated_at,
         e.code AS exercise_code, e.label AS exercise_label,
         e.type AS exercise_type, e.bw_factor, e.global_weight
    FROM performances p
    JOIN exercises e ON e.id = p.exercise_id
`;

const nowIso = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

/**
 * Loads the whole weight history once and resolves the weight in force on any
 * date, so scoring a page of rows costs one query rather than one per row.
 */
export function makeBodyweightResolver(userId) {
  const history = all(
    `SELECT weight_kg, measured_at FROM body_weights
      WHERE user_id = ? ORDER BY measured_at DESC`,
    [userId],
  );
  const earliest = history.at(-1) ?? null;

  // Most recent weigh-in on or before the date; before the first weigh-in, the
  // earliest known weight is the honest stand-in.
  return (date) => history.find((row) => row.measured_at <= date) ?? earliest;
}

function snakeRank(rank) {
  if (!rank) return null;
  return {
    index: rank.index,
    rank: rank.rank,
    abbreviation: rank.abbreviation,
    division: rank.division,
    label: rank.label,
    color: rank.color,
    gradient: rank.gradient,
    meaning: rank.meaning,
    division_min: rank.divisionMin,
    division_max: rank.divisionMax,
    within_division_pct: rank.withinDivisionPct,
  };
}

function snakeNextDivision(next) {
  if (!next) return null;
  return {
    rank: next.rank,
    division: next.division,
    label: next.label,
    index: next.index,
    target_e1rm_kg: next.targetE1rmKg,
    kg_needed: next.kgNeeded,
  };
}

/** Scores one joined row. Returns the API shape, in snake_case throughout. */
export function scoreRow(user, row, resolveBodyweight) {
  const weight = resolveBodyweight(row.performed_at);

  const base = {
    id: row.id,
    exercise_id: row.exercise_id,
    exercise_code: row.exercise_code,
    exercise_label: row.exercise_label,
    exercise_type: row.exercise_type,
    weight_kg: row.weight_kg,
    reps: row.reps,
    performed_at: row.performed_at,
    notes: row.notes,
    needs_confirmation: Boolean(row.needs_confirmation),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };

  if (!weight) {
    return {
      ...base,
      bodyweight_kg: null,
      counts_toward_rank: false,
      effective_load_kg: null,
      e1rm_kg: null,
      dots_points: null,
      age: null,
      age_coefficient: null,
      adjusted_score: null,
      strength_index: null,
      rank: null,
      next_division: null,
      flags: [
        {
          code: 'NO_BODYWEIGHT',
          message: 'No bodyweight on record, so this set cannot be scored yet.',
        },
      ],
    };
  }

  const score = scoreLift({
    sex: user.sex,
    birthDate: user.birth_date,
    performedAt: row.performed_at,
    bodyweightKg: weight.weight_kg,
    exercise: { code: row.exercise_code, type: row.exercise_type, bwFactor: row.bw_factor },
    weightKg: row.weight_kg,
    reps: row.reps,
  });

  const flags = [...score.flags];
  if (base.needs_confirmation) {
    flags.push({
      code: 'NEEDS_CONFIRMATION',
      message:
        'This is a large jump on your previous best, so it is held out of your rank until a ' +
        'second set at a similar level confirms it, or you confirm it yourself.',
    });
  }

  return {
    ...base,
    bodyweight_kg: weight.weight_kg,
    // A flagged row is stored and shown, but deliberately excluded from ranks.
    counts_toward_rank: score.ranked && !base.needs_confirmation,
    effective_load_kg: score.effectiveLoadKg,
    e1rm_kg: score.e1rmKg,
    dots_points: score.dotsPoints,
    age: score.age,
    age_coefficient: score.ageCoefficient,
    adjusted_score: score.adjustedScore,
    strength_index: score.strengthIndex,
    rank: snakeRank(score.rank),
    next_division: snakeNextDivision(score.nextDivision),
    flags,
  };
}

function rowsForExercise(userId, exerciseId) {
  return all(`${ROW_SELECT} WHERE p.user_id = ? AND p.exercise_id = ?`, [userId, exerciseId]);
}

/** Best confirmed e1RM on an exercise, ignoring one row if asked. */
export function bestConfirmedE1rm(user, exerciseId, { excludeId = null } = {}) {
  const resolve = makeBodyweightResolver(user.id);
  let best = null;

  for (const row of rowsForExercise(user.id, exerciseId)) {
    if (excludeId !== null && row.id === excludeId) continue;
    if (row.needs_confirmation) continue;
    const scored = scoreRow(user, row, resolve);
    if (scored.e1rm_kg !== null && (best === null || scored.e1rm_kg > best)) best = scored.e1rm_kg;
  }

  return best;
}

/**
 * Decides whether a set should be held for confirmation: a typo that implies a
 * 1RM far above anything previously logged would otherwise wreck the curve.
 */
export function shouldFlag(user, { exerciseId, e1rmKg, excludeId = null }) {
  if (e1rmKg === null) return false;
  const best = bestConfirmedE1rm(user, exerciseId, { excludeId });
  if (best === null) return false; // nothing to be suspicious about yet
  return e1rmKg > best * SUSPICIOUS_JUMP_RATIO;
}

/**
 * Clears flags that a second set has since corroborated. Only ever clears:
 * removing a corroborating set later does not re-raise a flag.
 */
export function reconcileConfirmations(user, exerciseId) {
  const resolve = makeBodyweightResolver(user.id);
  const scored = rowsForExercise(user.id, exerciseId).map((row) => scoreRow(user, row, resolve));

  let cleared = 0;
  for (const candidate of scored) {
    if (!candidate.needs_confirmation || candidate.e1rm_kg === null) continue;

    const corroborated = scored.some(
      (other) =>
        other.id !== candidate.id &&
        other.e1rm_kg !== null &&
        other.e1rm_kg >= candidate.e1rm_kg * CORROBORATION_RATIO,
    );

    if (corroborated) {
      run('UPDATE performances SET needs_confirmation = 0, updated_at = ? WHERE id = ?', [
        nowIso(),
        candidate.id,
      ]);
      cleared += 1;
    }
  }

  return cleared;
}

/** Estimated 1RM a set would imply, without touching the database. */
export function estimateForInput(user, exercise, { weightKg, reps, performedAt }) {
  const resolve = makeBodyweightResolver(user.id);
  const weight = resolve(performedAt);
  if (!weight) return { e1rmKg: null, score: null };

  const score = scoreLift({
    sex: user.sex,
    birthDate: user.birth_date,
    performedAt,
    bodyweightKg: weight.weight_kg,
    exercise: { code: exercise.code, type: exercise.type, bwFactor: exercise.bw_factor },
    weightKg,
    reps,
  });
  return { e1rmKg: score.e1rmKg, score };
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

const SORTS = {
  date_desc: 'p.performed_at DESC, p.id DESC',
  date_asc: 'p.performed_at ASC, p.id ASC',
};

export function listPerformances(user, { exerciseId = null, page = 1, perPage = 20, sort = 'date_desc' } = {}) {
  const orderBy = SORTS[sort] ?? SORTS.date_desc;
  const where = ['p.user_id = ?'];
  const params = [user.id];

  if (exerciseId !== null) {
    where.push('p.exercise_id = ?');
    params.push(exerciseId);
  }

  const whereSql = `WHERE ${where.join(' AND ')}`;
  const total = get(`SELECT count(1) AS n FROM performances p ${whereSql}`, params).n;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const safePage = Math.min(Math.max(1, page), totalPages);

  const rows = all(`${ROW_SELECT} ${whereSql} ORDER BY ${orderBy} LIMIT ? OFFSET ?`, [
    ...params,
    perPage,
    (safePage - 1) * perPage,
  ]);

  const resolve = makeBodyweightResolver(user.id);
  return {
    items: rows.map((row) => scoreRow(user, row, resolve)),
    page: safePage,
    per_page: perPage,
    total,
    total_pages: totalPages,
  };
}

/** Throws 404 rather than 403 for someone else's row: existence is not leaked. */
export function getPerformanceOr404(user, id) {
  const row = get(`${ROW_SELECT} WHERE p.id = ? AND p.user_id = ?`, [id, user.id]);
  if (!row) throw ApiError.notFound('No such performance.');
  return row;
}

export function getScoredPerformance(user, id) {
  const row = getPerformanceOr404(user, id);
  return scoreRow(user, row, makeBodyweightResolver(user.id));
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export function createPerformance(user, exercise, data) {
  const { e1rmKg } = estimateForInput(user, exercise, {
    weightKg: data.weight_kg,
    reps: data.reps,
    performedAt: data.performed_at,
  });

  const flagged = shouldFlag(user, { exerciseId: exercise.id, e1rmKg });

  const id = tx(() => {
    const inserted = run(
      `INSERT INTO performances (user_id, exercise_id, weight_kg, reps, performed_at, notes, needs_confirmation)
       VALUES (:user_id, :exercise_id, :weight_kg, :reps, :performed_at, :notes, :needs_confirmation)`,
      {
        user_id: user.id,
        exercise_id: exercise.id,
        weight_kg: data.weight_kg,
        reps: data.reps,
        performed_at: data.performed_at,
        notes: data.notes ?? null,
        needs_confirmation: flagged,
      },
    );
    return Number(inserted.lastInsertRowid);
  });

  reconcileConfirmations(user, exercise.id);
  return getScoredPerformance(user, id);
}

export function updatePerformance(user, id, exercise, data) {
  const existing = getPerformanceOr404(user, id);

  const merged = {
    weight_kg: data.weight_kg ?? existing.weight_kg,
    reps: data.reps ?? existing.reps,
    performed_at: data.performed_at ?? existing.performed_at,
    notes: data.notes !== undefined ? data.notes : existing.notes,
  };

  const { e1rmKg } = estimateForInput(user, exercise, {
    weightKg: merged.weight_kg,
    reps: merged.reps,
    performedAt: merged.performed_at,
  });

  // The flag is recomputed from the edited values, excluding this row from its
  // own comparison, so correcting a typo clears the flag it caused.
  const flagged = shouldFlag(user, { exerciseId: exercise.id, e1rmKg, excludeId: id });

  run(
    `UPDATE performances
        SET exercise_id = :exercise_id, weight_kg = :weight_kg, reps = :reps,
            performed_at = :performed_at, notes = :notes,
            needs_confirmation = :needs_confirmation, updated_at = :updated_at
      WHERE id = :id AND user_id = :user_id`,
    {
      id,
      user_id: user.id,
      exercise_id: exercise.id,
      ...merged,
      needs_confirmation: flagged,
      updated_at: nowIso(),
    },
  );

  reconcileConfirmations(user, exercise.id);
  if (exercise.id !== existing.exercise_id) reconcileConfirmations(user, existing.exercise_id);

  return getScoredPerformance(user, id);
}

export function deletePerformance(user, id) {
  getPerformanceOr404(user, id);
  run('DELETE FROM performances WHERE id = ? AND user_id = ?', [id, user.id]);
}

/** The owner vouching for a set by hand. */
export function confirmPerformance(user, id) {
  const row = getPerformanceOr404(user, id);
  if (row.needs_confirmation) {
    run('UPDATE performances SET needs_confirmation = 0, updated_at = ? WHERE id = ? AND user_id = ?', [
      nowIso(),
      id,
      user.id,
    ]);
  }
  return getScoredPerformance(user, id);
}
