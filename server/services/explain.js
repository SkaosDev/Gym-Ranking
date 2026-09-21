/**
 * Every intermediate value behind one performance's rank, with the formula and
 * the inputs that produced it. The point is that the scoring is inspectable
 * rather than a black box.
 */
import {
  ageOn,
  brzycki,
  clampBodyweight,
  effectiveLoad,
  epley,
  estimate1rm,
  indexToRank,
  strengthIndex,
  thresholdsFor,
  ageCoefficientForAge,
} from '../lib/scoring.js';
import {
  ANCHOR_INDICES,
  ANCHOR_LEVELS,
  DOTS_COEFFICIENTS,
  DOTS_BODYWEIGHT_BOUNDS,
  MAX_AGE_IN_TABLE,
  MAX_RANKED_REPS,
  MIN_AGE,
  PEAK_AGE_RANGE,
  REFERENCE_BODYWEIGHT_KG,
  dotsPolynomial,
} from '../lib/scoring-config.js';
import { ApiError } from '../lib/errors.js';
import { getPerformanceOr404, makeBodyweightResolver } from './performances.js';

const round = (value, decimals = 2) => {
  if (value === null || value === undefined) return null;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};

function ageTableFor(age) {
  if (age < MIN_AGE) return `Below ${MIN_AGE}: no published table, clamped to ${MIN_AGE}`;
  if (age <= 23) return 'Foster (ages 14-23)';
  if (age <= PEAK_AGE_RANGE.max) return `Peak strength (ages 24-${PEAK_AGE_RANGE.max}), no adjustment`;
  if (age <= MAX_AGE_IN_TABLE) return 'McCulloch (age 40 and above)';
  return `Above ${MAX_AGE_IN_TABLE}: clamped to the value for ${MAX_AGE_IN_TABLE}`;
}

export function explainPerformance(user, performanceId) {
  const row = getPerformanceOr404(user, performanceId);
  const weight = makeBodyweightResolver(user.id)(row.performed_at);

  if (!weight) {
    throw ApiError.unprocessable('No bodyweight on record, so this set cannot be explained yet.');
  }

  const bodyweightKg = weight.weight_kg;
  const { value: bodyweightUsed, clamped } = clampBodyweight(user.sex, bodyweightKg);
  const bounds = DOTS_BODYWEIGHT_BOUNDS[user.sex];

  // Step 1 --------------------------------------------------------------
  const loadKg = effectiveLoad({
    type: row.exercise_type,
    bwFactor: row.bw_factor,
    bodyweightKg,
    weightKg: row.weight_kg,
  });

  const step1 = {
    title: 'Effective load',
    formula:
      row.exercise_type === 'external'
        ? 'load = weight on the bar'
        : 'load = bodyweight factor x bodyweight + added weight',
    inputs: {
      exercise_type: row.exercise_type,
      bw_factor: row.bw_factor,
      bodyweight_kg: bodyweightKg,
      weight_kg: row.weight_kg,
    },
    working:
      row.exercise_type === 'external'
        ? `${row.weight_kg} kg`
        : `${row.bw_factor} x ${bodyweightKg} + ${row.weight_kg} = ${round(loadKg)}`,
    result_kg: round(loadKg),
  };

  // Step 2 --------------------------------------------------------------
  const e1rmKg = loadKg > 0 ? estimate1rm(loadKg, row.reps) : null;
  const step2 =
    row.reps > MAX_RANKED_REPS
      ? {
          title: 'Estimated one-rep max',
          excluded: true,
          reason: `Above ${MAX_RANKED_REPS} reps, Epley and Brzycki diverge by 15-20% and the set measures endurance rather than maximal strength. It stays in your history but does not feed your rank.`,
          inputs: { reps: row.reps },
          result_kg: null,
        }
      : {
          title: 'Estimated one-rep max',
          formula:
            row.reps === 1
              ? 'A single rep is already the maximum'
              : 'mean of Epley and Brzycki, which err in opposite directions',
          inputs: { load_kg: round(loadKg), reps: row.reps },
          epley:
            row.reps === 1
              ? null
              : { formula: 'load x (1 + reps / 30)', result_kg: round(epley(loadKg, row.reps)) },
          brzycki:
            row.reps === 1
              ? null
              : { formula: 'load x 36 / (37 - reps)', result_kg: round(brzycki(loadKg, row.reps)) },
          result_kg: round(e1rmKg),
        };

  // Step 3 --------------------------------------------------------------
  const polynomial = dotsPolynomial(user.sex, bodyweightUsed);
  const dotsPoints = e1rmKg === null ? null : (e1rmKg * 500) / polynomial;

  const step3 = {
    title: 'Bodyweight normalisation (DOTS)',
    formula: 'DOTS = estimated 1RM x 500 / P(bodyweight),  P(bw) = a + b*bw + c*bw^2 + d*bw^3 + e*bw^4',
    note: 'DOTS is the coefficient most powerlifting federations adopted around 2019-2020, replacing Wilks.',
    inputs: {
      sex: user.sex,
      bodyweight_kg: bodyweightKg,
      bodyweight_used_kg: bodyweightUsed,
      clamped,
      bounds,
      coefficients: DOTS_COEFFICIENTS[user.sex],
    },
    polynomial_value: round(polynomial, 5),
    result: round(dotsPoints),
  };

  // Step 4 --------------------------------------------------------------
  const age = ageOn(user.birth_date, row.performed_at);
  const { coefficient } = ageCoefficientForAge(age);
  const adjustedScore = dotsPoints === null ? null : dotsPoints * coefficient;

  const step4 = {
    title: 'Age adjustment',
    formula: 'adjusted score = DOTS x age coefficient',
    note: 'Age is taken as of the day of the performance, not today.',
    inputs: { birth_date: user.birth_date, performed_at: row.performed_at },
    age,
    table: ageTableFor(age),
    coefficient,
    raw_score: round(dotsPoints),
    result: round(adjustedScore),
  };

  // Step 5 --------------------------------------------------------------
  const thresholds = thresholdsFor(user.sex, row.exercise_code);
  const index = adjustedScore === null ? null : strengthIndex(adjustedScore, user.sex, row.exercise_code);

  const anchorTable = (thresholds ?? []).map((dots, i) => ({
    level: ANCHOR_LEVELS[i],
    dots_points: round(dots),
    index: ANCHOR_INDICES[i + 1],
    reached: adjustedScore !== null && adjustedScore >= dots,
  }));

  let segment = null;
  if (index !== null && thresholds) {
    const points = [0, ...thresholds];
    for (let i = 0; i < points.length - 1; i += 1) {
      if (adjustedScore <= points[i + 1] || i === points.length - 2) {
        segment = {
          from: { level: i === 0 ? 'Zero' : ANCHOR_LEVELS[i - 1], dots_points: round(points[i]), index: ANCHOR_INDICES[i] },
          to: { level: ANCHOR_LEVELS[i], dots_points: round(points[i + 1]), index: ANCHOR_INDICES[i + 1] },
          fraction: round(
            points[i + 1] === points[i] ? 0 : (adjustedScore - points[i]) / (points[i + 1] - points[i]),
            4,
          ),
        };
        break;
      }
    }
  }

  const step5 = {
    title: 'Strength index (0 to 1000)',
    formula: 'linear interpolation between the calibrated anchors for this exercise and sex',
    note: `Anchors are published strength standards expressed at a reference bodyweight of ${REFERENCE_BODYWEIGHT_KG[user.sex]} kg, converted to DOTS points.`,
    anchors: anchorTable,
    segment,
    result: index === null ? null : round(index, 1),
  };

  // Step 6 --------------------------------------------------------------
  const rank = index === null ? null : indexToRank(index);
  const step6 = {
    title: 'Rank and division',
    formula: 'each rank spans a fixed index range, split into five equal divisions',
    result: rank && {
      index: rank.index,
      rank: rank.rank,
      division: rank.division,
      label: rank.label,
      color: rank.color,
      gradient: rank.gradient,
      meaning: rank.meaning,
      division_min: rank.divisionMin,
      division_max: rank.divisionMax,
      within_division_pct: rank.withinDivisionPct,
      next_division: rank.nextDivision,
    },
  };

  return {
    performance: {
      id: row.id,
      exercise_code: row.exercise_code,
      exercise_label: row.exercise_label,
      exercise_type: row.exercise_type,
      bw_factor: row.bw_factor,
      weight_kg: row.weight_kg,
      reps: row.reps,
      performed_at: row.performed_at,
      needs_confirmation: Boolean(row.needs_confirmation),
    },
    bodyweight: { weight_kg: bodyweightKg, measured_at: weight.measured_at },
    counts_toward_rank: index !== null && !row.needs_confirmation,
    steps: [step1, step2, step3, step4, step5, step6],
  };
}
