/**
 * Time series for the progress charts.
 *
 * Only performances that count toward a rank appear: a set held for
 * confirmation, or one above 12 reps, would otherwise put a spike in the
 * curve that the rank itself does not recognise.
 */
import { all } from '../lib/db.js';
import { RANKS } from '../lib/scoring-config.js';
import { makeBodyweightResolver, scoreRow } from './performances.js';
import { MIN_EXERCISES_FOR_OVERALL, RECENT_WINDOW_DAYS, computeRanks, decayFactor } from './ranks.js';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const today = () => new Date().toISOString().slice(0, 10);

function daysBetween(fromDate, toDate) {
  return Math.round(
    (Date.parse(`${toDate}T00:00:00Z`) - Date.parse(`${fromDate}T00:00:00Z`)) / MS_PER_DAY,
  );
}

const round = (value, decimals = 1) => {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};

/** The floor of each rank band, drawn behind the index curve. */
export const RANK_THRESHOLDS = RANKS.filter((rank) => rank.min > 0).map((rank) => ({
  rank: rank.name,
  abbreviation: rank.abbreviation ?? rank.name,
  index: rank.min,
  color: rank.color,
}));

function loadCountedPerformances(user) {
  const rows = all(
    `SELECT p.id, p.user_id, p.exercise_id, p.weight_kg, p.reps, p.performed_at,
            p.notes, p.needs_confirmation, p.created_at, p.updated_at,
            e.code AS exercise_code, e.label AS exercise_label,
            e.type AS exercise_type, e.bw_factor, e.global_weight
       FROM performances p
       JOIN exercises e ON e.id = p.exercise_id
      WHERE p.user_id = ?
      ORDER BY p.performed_at ASC`,
    [user.id],
  );

  const resolve = makeBodyweightResolver(user.id);
  return rows.map((row) => scoreRow(user, row, resolve)).filter((row) => row.counts_toward_rank);
}

/** One point per day: the best set of that day, so the line is not jagged. */
function bestPerDay(rows, key) {
  const byDate = new Map();
  for (const row of rows) {
    const current = byDate.get(row.performed_at);
    if (!current || row[key] > current[key]) byDate.set(row.performed_at, row);
  }
  return [...byDate.values()].sort((a, b) => a.performed_at.localeCompare(b.performed_at));
}

function seriesByExercise(user, valueKey, mapPoint, exerciseCode) {
  const counted = loadCountedPerformances(user);
  const exercises = all('SELECT code, label FROM exercises ORDER BY id');

  return exercises
    .filter((exercise) => !exerciseCode || exercise.code === exerciseCode)
    .map((exercise) => ({
      code: exercise.code,
      label: exercise.label,
      points: bestPerDay(
        counted.filter((row) => row.exercise_code === exercise.code),
        valueKey,
      ).map(mapPoint),
    }))
    .filter((series) => series.points.length > 0);
}

export function e1rmSeries(user, { exerciseCode = null } = {}) {
  return {
    series: seriesByExercise(
      user,
      'e1rm_kg',
      (row) => ({
        performed_at: row.performed_at,
        e1rm_kg: row.e1rm_kg,
        performance_id: row.id,
      }),
      exerciseCode,
    ),
  };
}

export function indexSeries(user, { exerciseCode = null } = {}) {
  return {
    series: seriesByExercise(
      user,
      'strength_index',
      (row) => ({
        performed_at: row.performed_at,
        strength_index: row.strength_index,
        rank: row.rank?.label ?? null,
        performance_id: row.id,
      }),
      exerciseCode,
    ),
    thresholds: RANK_THRESHOLDS,
  };
}

/** Current index per exercise, which shows an imbalance at a glance. */
export function radarSnapshot(user) {
  const ranks = computeRanks(user);
  return {
    overall_index: ranks.overall.index,
    items: ranks.exercises.map((entry) => ({
      code: entry.exercise.code,
      label: entry.exercise.label,
      global_weight: entry.exercise.global_weight,
      has_data: entry.has_data,
      index: entry.effective_index ?? 0,
      color: entry.rank?.color ?? null,
      rank: entry.rank?.label ?? null,
    })),
  };
}

/**
 * The overall index as it stood on a given day, using the same window and
 * decay rules as the live rank. A test pins this against computeRanks so the
 * two cannot drift apart.
 */
export function overallIndexOn(counted, weightedExercises, asOf) {
  const contributions = [];

  for (const exercise of weightedExercises) {
    const rows = counted.filter(
      (row) => row.exercise_code === exercise.code && row.performed_at <= asOf,
    );
    if (rows.length === 0) continue;

    const best = rows.reduce((a, b) => (b.strength_index > a.strength_index ? b : a));
    const recent = rows.filter((row) => daysBetween(row.performed_at, asOf) <= RECENT_WINDOW_DAYS);
    const bestRecent =
      recent.length > 0 ? recent.reduce((a, b) => (b.strength_index > a.strength_index ? b : a)) : null;

    const index = bestRecent
      ? bestRecent.strength_index
      : best.strength_index * decayFactor(daysBetween(best.performed_at, asOf));

    contributions.push({ index, weight: exercise.global_weight });
  }

  if (contributions.length < MIN_EXERCISES_FOR_OVERALL) return null;

  const totalWeight = contributions.reduce((sum, entry) => sum + entry.weight, 0);
  const weightedSum = contributions.reduce((sum, entry) => sum + entry.index * entry.weight, 0);
  return round(weightedSum / totalWeight);
}

/**
 * Bodyweight against the overall index. The two moving together is the point:
 * the score is relative, so gaining weight can hold a rank back even while
 * the bar gets heavier.
 */
export function bodyweightSeries(user, { asOf = today() } = {}) {
  const weights = all(
    `SELECT weight_kg, measured_at FROM body_weights
      WHERE user_id = ? ORDER BY measured_at ASC`,
    [user.id],
  );

  const counted = loadCountedPerformances(user);
  const weightedExercises = all(
    'SELECT code, global_weight FROM exercises WHERE global_weight > 0 ORDER BY id',
  );

  const dates = [
    ...new Set([
      ...weights.map((row) => row.measured_at),
      ...counted.map((row) => row.performed_at),
    ]),
  ]
    .filter((date) => date <= asOf)
    .sort();

  const points = dates.map((date) => {
    const inForce = weights.filter((row) => row.measured_at <= date).at(-1) ?? weights[0] ?? null;
    return {
      date,
      weight_kg: inForce?.weight_kg ?? null,
      overall_index: overallIndexOn(counted, weightedExercises, date),
    };
  });

  return { points };
}
