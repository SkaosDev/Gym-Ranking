/**
 * Every intermediate value behind one performance's rank, with the formula and
 * the inputs that produced it. The point is that the scoring is inspectable
 * rather than a black box.
 */
import {
  ageCoefficientForAge,
  ageOn,
  brzycki,
  effectiveLoad,
  epley,
  epleyReps,
  estimate1rmFor,
  indexToRank,
  standardsFor,
  strengthIndex,
} from '../lib/scoring.js';
import {
  ANCHOR_INDICES,
  ANCHOR_LEVELS,
  MAX_AGE_IN_TABLE,
  MAX_RANKED_REPS,
  MAX_RANKED_REPS_BODYWEIGHT,
  MIN_AGE,
  PEAK_AGE_RANGE,
  STANDARDS,
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
  const isBodyweight = row.exercise_type === 'bodyweight';

  // Step 1 --------------------------------------------------------------
  const loadKg = effectiveLoad({
    type: row.exercise_type,
    bwFactor: row.bw_factor,
    bodyweightKg,
    weightKg: row.weight_kg,
  });

  const step1 = {
    title: 'Effective load',
    formula: isBodyweight
      ? 'load = share of bodyweight moved x bodyweight + added weight'
      : 'load = weight on the bar',
    inputs: {
      exercise_type: row.exercise_type,
      bw_factor: row.bw_factor,
      bodyweight_kg: bodyweightKg,
      weight_kg: row.weight_kg,
    },
    working: isBodyweight
      ? `${row.bw_factor} x ${bodyweightKg} + ${row.weight_kg} = ${round(loadKg)} kg`
      : `${row.weight_kg} kg`,
    result_kg: round(loadKg),
  };

  // Step 2 --------------------------------------------------------------
  const repLimit = isBodyweight ? MAX_RANKED_REPS_BODYWEIGHT : MAX_RANKED_REPS;
  const e1rmKg = loadKg > 0 ? estimate1rmFor(row.exercise_type, loadKg, row.reps) : null;

  let step2;
  if (row.reps > repLimit) {
    step2 = {
      title: 'Estimated one-rep max',
      excluded: true,
      reason: isBodyweight
        ? `Above ${repLimit} reps no formula says anything useful about maximal strength. The set stays in your history but does not feed your rank.`
        : `Above ${repLimit} reps on a barbell, Epley and Brzycki diverge by 15-20% and the set measures endurance rather than maximal strength. It stays in your history but does not feed your rank.`,
      inputs: { reps: row.reps },
      result_kg: null,
    };
  } else if (row.reps === 1) {
    step2 = {
      title: 'Estimated one-rep max',
      formula: 'A single rep is already the maximum',
      inputs: { load_kg: round(loadKg), reps: row.reps },
      epley: null,
      brzycki: null,
      result_kg: round(e1rmKg),
    };
  } else {
    step2 = {
      title: 'Estimated one-rep max',
      formula: isBodyweight
        ? 'Epley, the formula the bodyweight standards themselves are converted with'
        : 'mean of Epley and Brzycki, which err in opposite directions',
      inputs: { load_kg: round(loadKg), reps: row.reps },
      epley: { formula: 'load x (1 + reps / 30)', result_kg: round(epley(loadKg, row.reps)) },
      brzycki: isBodyweight
        ? null
        : { formula: 'load x 36 / (37 - reps)', result_kg: round(brzycki(loadKg, row.reps)) },
      result_kg: round(e1rmKg),
    };
  }

  // Step 3 --------------------------------------------------------------
  const age = ageOn(user.birth_date, row.performed_at);
  const { coefficient } = ageCoefficientForAge(age);
  const adjustedKg = e1rmKg === null ? null : e1rmKg * coefficient;

  const step3 = {
    title: 'Age adjustment',
    formula: 'adjusted 1RM = estimated 1RM x age coefficient',
    note: 'Age is taken as of the day of the performance, not today.',
    inputs: { birth_date: user.birth_date, performed_at: row.performed_at },
    age,
    table: ageTableFor(age),
    coefficient,
    raw_kg: round(e1rmKg),
    result_kg: round(adjustedKg),
  };

  // Step 4 --------------------------------------------------------------
  const standards = standardsFor(user.sex, row.exercise_code, bodyweightKg, row.bw_factor);
  const table = STANDARDS[user.sex]?.[row.exercise_code];

  const step4 = {
    title: `The standards at your bodyweight (${bodyweightKg} kg)`,
    formula: 'published standards for your sex, interpolated between the two nearest bodyweights',
    note: standards?.outside
      ? `Your bodyweight is outside the ${table.bodyweights[0]}-${table.bodyweights.at(-1)} kg the standards cover, so they were extended from the nearest bodyweights.`
      : 'Beginner to Elite: Strength Level, from about seven million logged lifts. World-class: derived from raw powerlifting records.',
    kind: standards?.kind ?? null,
    anchors: (standards?.anchorsKg ?? []).map((kg, i) => ({
      level: ANCHOR_LEVELS[i],
      kg: round(kg, 1),
      // For a bodyweight movement the same anchor read as strict reps.
      bodyweight_reps:
        isBodyweight && standards.baseKg > 0
          ? Math.max(0, Math.round(epleyReps(row.bw_factor * bodyweightKg, kg)))
          : null,
      index: ANCHOR_INDICES[i + 1],
      reached: adjustedKg !== null && adjustedKg >= kg,
    })),
  };

  // Step 5 --------------------------------------------------------------
  const anchors = standards?.anchorsKg ?? null;
  const index = adjustedKg === null || !anchors ? null : strengthIndex(adjustedKg, anchors);

  let segment = null;
  if (index !== null) {
    const points = [0, ...anchors];
    for (let i = 0; i < points.length - 1; i += 1) {
      if (adjustedKg <= points[i + 1] || i === points.length - 2) {
        segment = {
          from: { level: i === 0 ? 'Zero' : ANCHOR_LEVELS[i - 1], kg: round(points[i], 1), index: ANCHOR_INDICES[i] },
          to: { level: ANCHOR_LEVELS[i], kg: round(points[i + 1], 1), index: ANCHOR_INDICES[i + 1] },
          fraction: round(
            Math.min(1, points[i + 1] === points[i] ? 0 : (adjustedKg - points[i]) / (points[i + 1] - points[i])),
            4,
          ),
        };
        break;
      }
    }
  }

  const step5 = {
    title: 'Strength index (0 to 1000)',
    formula: 'linear interpolation between the two standards your lift falls between',
    segment,
    result: index === null ? null : round(index, 1),
  };

  // Step 6 --------------------------------------------------------------
  const rank = index === null ? null : indexToRank(index);
  const step6 = {
    title: 'Rank and division',
    formula: 'each rank spans a fixed index range, split into four equal divisions',
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
