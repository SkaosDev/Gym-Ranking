/**
 * Per-exercise and overall ranks.
 *
 * The time decay is deliberate: holding a rank requires still training. In a
 * solo app with no leaderboard, that is the only thing standing between a
 * rank and a trophy you won once and keep forever.
 */
import { all, get } from '../lib/db.js';
import {
  ageCoefficientForAge,
  ageOn,
  clampBodyweight,
  indexToRank,
  scoreForIndex,
} from '../lib/scoring.js';
import { dotsPolynomial } from '../lib/scoring-config.js';
import { latestBodyweight } from '../lib/users.js';
import { makeBodyweightResolver, scoreRow } from './performances.js';

/** A best inside this window counts as current. */
export const RECENT_WINDOW_DAYS = 120;

/** Compounded weekly beyond the window. */
export const DECAY_PER_WEEK = 0.005;

/** However long ago it was, a best never falls below this share of itself. */
export const DECAY_FLOOR = 0.6;

/** The overall rank stays hidden until this many weighted exercises have data. */
export const MIN_EXERCISES_FOR_OVERALL = 3;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const today = () => new Date().toISOString().slice(0, 10);

function daysBetween(fromDate, toDate) {
  const from = Date.parse(`${fromDate}T00:00:00Z`);
  const to = Date.parse(`${toDate}T00:00:00Z`);
  return Math.round((to - from) / MS_PER_DAY);
}

/**
 * 0.5% per week compounded, starting only once the best is older than the
 * window, and never below the floor.
 */
export function decayFactor(daysOld) {
  if (daysOld <= RECENT_WINDOW_DAYS) return 1;
  const weeksBeyond = (daysOld - RECENT_WINDOW_DAYS) / 7;
  return Math.max(DECAY_FLOOR, (1 - DECAY_PER_WEEK) ** weeksBeyond);
}

const round = (value, decimals = 1) => {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};

const roundUp = (value, decimals = 1) => {
  const factor = 10 ** decimals;
  return Math.ceil(value * factor) / factor;
};

/**
 * What an index is worth in kilograms for this user right now: at today's
 * bodyweight and today's age coefficient, as a single-rep equivalent.
 */
function kilogramsForIndex({ index, sex, exerciseCode, bodyweightKg, ageCoefficient }) {
  const score = scoreForIndex(index, sex, exerciseCode);
  if (score === null) return null;
  const { value } = clampBodyweight(sex, bodyweightKg);
  return ((score / ageCoefficient) * dotsPolynomial(sex, value)) / 500;
}

/**
 * Ranks for every exercise, plus the weighted overall.
 * `asOf` exists so tests can pin the clock.
 */
export function computeRanks(user, { asOf = today() } = {}) {
  const exercises = all(
    'SELECT id, code, label, type, bw_factor, global_weight FROM exercises ORDER BY id',
  );

  const rows = all(
    `SELECT p.id, p.user_id, p.exercise_id, p.weight_kg, p.reps, p.performed_at,
            p.notes, p.needs_confirmation, p.created_at, p.updated_at,
            e.code AS exercise_code, e.label AS exercise_label,
            e.type AS exercise_type, e.bw_factor, e.global_weight
       FROM performances p
       JOIN exercises e ON e.id = p.exercise_id
      WHERE p.user_id = ?`,
    [user.id],
  );

  const resolve = makeBodyweightResolver(user.id);
  const scored = rows.map((row) => scoreRow(user, row, resolve));

  const weight = latestBodyweight(user.id);
  const currentBodyweightKg = weight?.weight_kg ?? null;
  const ageToday = ageOn(user.birth_date, asOf);
  const ageCoefficient = ageCoefficientForAge(ageToday).coefficient;

  const perExercise = exercises.map((exercise) => {
    const counted = scored.filter(
      (row) => row.exercise_id === exercise.id && row.counts_toward_rank,
    );

    const summarise = (row) =>
      row && {
        performance_id: row.id,
        performed_at: row.performed_at,
        strength_index: row.strength_index,
        e1rm_kg: row.e1rm_kg,
        dots_points: row.dots_points,
        adjusted_score: row.adjusted_score,
        rank: row.rank,
      };

    if (counted.length === 0) {
      return {
        exercise,
        has_data: false,
        counted_performances: 0,
        best: null,
        recent_best: null,
        effective_index: null,
        decay_factor: 1,
        decayed: false,
        days_since_best: null,
        rank: null,
        next_division: null,
      };
    }

    const bestOverall = counted.reduce((a, b) => (b.strength_index > a.strength_index ? b : a));
    const recent = counted.filter(
      (row) => daysBetween(row.performed_at, asOf) <= RECENT_WINDOW_DAYS,
    );
    const bestRecent =
      recent.length > 0 ? recent.reduce((a, b) => (b.strength_index > a.strength_index ? b : a)) : null;

    const daysSinceBest = daysBetween(bestOverall.performed_at, asOf);
    const factor = bestRecent ? 1 : decayFactor(daysSinceBest);
    const source = bestRecent ?? bestOverall;
    const effectiveIndex = round(
      bestRecent ? bestRecent.strength_index : bestOverall.strength_index * factor,
    );

    const rank = indexToRank(effectiveIndex);

    // Kilograms to the next division, at the CURRENT bodyweight and age, so
    // the sentence on the card is about the lift the user would make today.
    let nextDivision = null;
    if (rank.nextDivision && currentBodyweightKg !== null) {
      const currentKg = kilogramsForIndex({
        index: effectiveIndex,
        sex: user.sex,
        exerciseCode: exercise.code,
        bodyweightKg: currentBodyweightKg,
        ageCoefficient,
      });
      const targetKg = kilogramsForIndex({
        index: rank.nextDivision.index,
        sex: user.sex,
        exerciseCode: exercise.code,
        bodyweightKg: currentBodyweightKg,
        ageCoefficient,
      });

      if (currentKg !== null && targetKg !== null) {
        nextDivision = {
          rank: rank.nextDivision.rank,
          division: rank.nextDivision.division,
          label: rank.nextDivision.label,
          index: rank.nextDivision.index,
          target_e1rm_kg: roundUp(targetKg, 1),
          kg_needed: roundUp(Math.max(targetKg - currentKg, 0), 1),
          // For a bodyweight movement the same target read as added load.
          target_added_load_kg:
            exercise.type === 'bodyweight'
              ? roundUp(targetKg - exercise.bw_factor * currentBodyweightKg, 1)
              : null,
        };
      }
    }

    return {
      exercise,
      has_data: true,
      counted_performances: counted.length,
      best: summarise(bestOverall),
      recent_best: summarise(bestRecent),
      effective_index: effectiveIndex,
      decay_factor: round(factor, 4),
      decayed: factor < 1,
      days_since_best: daysSinceBest,
      source_performance_id: source.id,
      rank: {
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
      },
      next_division: nextDivision,
    };
  });

  // -------------------------------------------------------------- overall ---
  const weighted = perExercise.filter((entry) => entry.exercise.global_weight > 0);
  const withData = weighted.filter((entry) => entry.has_data);

  const overall = {
    required_exercises: MIN_EXERCISES_FOR_OVERALL,
    weighted_exercises: weighted.length,
    exercises_with_data: withData.length,
    missing: weighted
      .filter((entry) => !entry.has_data)
      .map((entry) => ({ code: entry.exercise.code, label: entry.exercise.label })),
    complete: withData.length >= MIN_EXERCISES_FOR_OVERALL,
    index: null,
    rank: null,
    contributions: withData.map((entry) => ({
      code: entry.exercise.code,
      label: entry.exercise.label,
      global_weight: entry.exercise.global_weight,
      effective_index: entry.effective_index,
      decayed: entry.decayed,
    })),
  };

  if (overall.complete) {
    const totalWeight = withData.reduce((sum, entry) => sum + entry.exercise.global_weight, 0);
    const weightedSum = withData.reduce(
      (sum, entry) => sum + entry.effective_index * entry.exercise.global_weight,
      0,
    );
    const overallIndex = round(weightedSum / totalWeight);
    const rank = indexToRank(overallIndex);

    overall.index = overallIndex;
    overall.rank = {
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
      next_division: rank.nextDivision
        ? {
            rank: rank.nextDivision.rank,
            division: rank.nextDivision.division,
            label: rank.nextDivision.label,
            index: rank.nextDivision.index,
            index_needed: round(rank.nextDivision.index - overallIndex),
          }
        : null,
    };
  }

  return {
    as_of: asOf,
    age: ageToday,
    age_coefficient: ageCoefficient,
    current_weight_kg: currentBodyweightKg,
    weighed_at: weight?.measured_at ?? null,
    overall,
    exercises: perExercise,
  };
}
