/**
 * The scoring engine: pure functions, no database, no clock. Every input is
 * explicit and every output is derived, which is what makes it unit-testable
 * on its own and what lets /rank-explained show the working.
 *
 * The pipeline is:
 *   effective load -> estimated 1RM -> DOTS points -> age adjustment
 *   -> strength index (0-1000) -> rank and division
 */
import {
  ANCHOR_INDICES,
  ANCHOR_LEVELS,
  DIVISIONS,
  DOTS_BODYWEIGHT_BOUNDS,
  FLAGS,
  FOSTER_COEFFICIENTS,
  MAX_AGE_IN_TABLE,
  MAX_INDEX,
  MAX_RANKED_REPS,
  MCCULLOCH_COEFFICIENTS,
  MIN_AGE,
  PEAK_AGE_RANGE,
  RANKS,
  dotsPolynomial,
} from './scoring-config.js';
import { DOTS_THRESHOLDS } from './thresholds.js';

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const round = (value, decimals = 2) => {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};

/**
 * Requirements round UP. A lifter told "4.4 kg to Silver III" who adds exactly
 * 4.4 kg must land in Silver III, so the figure shown can never be short.
 */
const roundUp = (value, decimals = 2) => {
  const factor = 10 ** decimals;
  return Math.ceil(value * factor) / factor;
};

function flag(code) {
  return { code, message: FLAGS[code] };
}

// ---------------------------------------------------------------------------
// Dates and age
// ---------------------------------------------------------------------------

/** Accepts 'YYYY-MM-DD' or a Date, and returns 'YYYY-MM-DD'. */
export function toDateString(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  throw new TypeError(`expected a YYYY-MM-DD date, received ${JSON.stringify(value)}`);
}

function dateParts(value) {
  const [year, month, day] = toDateString(value).split('-').map(Number);
  return { year, month, day };
}

/** Completed years between two dates. */
export function ageOn(birthDate, onDate) {
  const born = dateParts(birthDate);
  const at = dateParts(onDate);
  let age = at.year - born.year;
  if (at.month < born.month || (at.month === born.month && at.day < born.day)) age -= 1;
  return age;
}

/**
 * Foster below 24, nothing between 24 and 39, McCulloch from 40.
 * Both tables are sex-neutral, so sex is deliberately not a parameter.
 */
export function ageCoefficientForAge(age) {
  if (!Number.isInteger(age)) throw new TypeError(`age must be an integer, received ${age}`);

  if (age < MIN_AGE) {
    return { coefficient: FOSTER_COEFFICIENTS[MIN_AGE], flags: [flag('AGE_BELOW_TABLE')] };
  }
  if (age <= 23) {
    return { coefficient: FOSTER_COEFFICIENTS[age], flags: [] };
  }
  if (age <= PEAK_AGE_RANGE.max) {
    return { coefficient: 1, flags: [] };
  }
  if (age <= MAX_AGE_IN_TABLE) {
    return { coefficient: MCCULLOCH_COEFFICIENTS[age], flags: [] };
  }
  return { coefficient: MCCULLOCH_COEFFICIENTS[MAX_AGE_IN_TABLE], flags: [flag('AGE_ABOVE_TABLE')] };
}

/** Age is taken as of the performance date, not today. */
export function ageCoefficient(birthDate, performedAt) {
  const age = ageOn(birthDate, performedAt);
  return { age, ...ageCoefficientForAge(age) };
}

// ---------------------------------------------------------------------------
// Step 1 - effective load
// ---------------------------------------------------------------------------

/**
 * External lifts move the bar. Bodyweight lifts move a fraction of the lifter
 * plus whatever was added, which may be negative when a band assists.
 */
export function effectiveLoad({ type, bwFactor = 0, bodyweightKg, weightKg }) {
  if (type === 'external') return weightKg;
  if (type === 'bodyweight') return bwFactor * bodyweightKg + weightKg;
  throw new TypeError(`unknown exercise type ${JSON.stringify(type)}`);
}

// ---------------------------------------------------------------------------
// Step 2 - estimated 1RM
// ---------------------------------------------------------------------------

export const epley = (loadKg, reps) => loadKg * (1 + reps / 30);
export const brzycki = (loadKg, reps) => (loadKg * 36) / (37 - reps);

/**
 * A single rep is its own maximum. Between 2 and 12 reps both formulas sit
 * within about 5% of reality and err in opposite directions, so their mean is
 * steadier than either alone. Past 12 reps we return null rather than a number
 * we would have to disclaim.
 */
export function estimate1rm(loadKg, reps) {
  if (!Number.isInteger(reps) || reps < 1) {
    throw new RangeError(`reps must be a positive integer, received ${reps}`);
  }
  if (reps === 1) return loadKg;
  if (reps > MAX_RANKED_REPS) return null;
  return (epley(loadKg, reps) + brzycki(loadKg, reps)) / 2;
}

// ---------------------------------------------------------------------------
// Step 3 - DOTS bodyweight normalisation
// ---------------------------------------------------------------------------

/** Clamps rather than extrapolating a quartic beyond its fitted range. */
export function clampBodyweight(sex, bodyweightKg) {
  const bounds = DOTS_BODYWEIGHT_BOUNDS[sex];
  if (!bounds) throw new TypeError(`unknown sex ${JSON.stringify(sex)}`);
  const value = clamp(bodyweightKg, bounds.min, bounds.max);
  return { value, clamped: value !== bodyweightKg };
}

export function dotsPoints(e1rmKg, sex, bodyweightKg) {
  const { value } = clampBodyweight(sex, bodyweightKg);
  return (e1rmKg * 500) / dotsPolynomial(sex, value);
}

// ---------------------------------------------------------------------------
// Step 5 - strength index
// ---------------------------------------------------------------------------

export function thresholdsFor(sex, exerciseCode) {
  return DOTS_THRESHOLDS[sex]?.[exerciseCode] ?? null;
}

/** Piecewise linear over [0, ...thresholds] mapped onto ANCHOR_INDICES. */
export function strengthIndex(adjustedScore, sex, exerciseCode) {
  const thresholds = thresholdsFor(sex, exerciseCode);
  if (!thresholds) return null;

  const points = [0, ...thresholds];
  if (adjustedScore <= 0) return 0;
  if (adjustedScore >= points.at(-1)) return MAX_INDEX;

  for (let i = 0; i < points.length - 1; i += 1) {
    if (adjustedScore <= points[i + 1]) {
      const span = points[i + 1] - points[i];
      const fraction = span === 0 ? 0 : (adjustedScore - points[i]) / span;
      return ANCHOR_INDICES[i] + fraction * (ANCHOR_INDICES[i + 1] - ANCHOR_INDICES[i]);
    }
  }
  return MAX_INDEX;
}

/** The inverse: the adjusted score an index corresponds to. */
export function scoreForIndex(index, sex, exerciseCode) {
  const thresholds = thresholdsFor(sex, exerciseCode);
  if (!thresholds) return null;

  const points = [0, ...thresholds];
  const target = clamp(index, 0, MAX_INDEX);
  if (target <= 0) return 0;
  if (target >= MAX_INDEX) return points.at(-1);

  for (let i = 0; i < ANCHOR_INDICES.length - 1; i += 1) {
    if (target <= ANCHOR_INDICES[i + 1]) {
      const span = ANCHOR_INDICES[i + 1] - ANCHOR_INDICES[i];
      const fraction = (target - ANCHOR_INDICES[i]) / span;
      return points[i] + fraction * (points[i + 1] - points[i]);
    }
  }
  return points.at(-1);
}

/** Which named level an index sits at or above, for explanatory copy. */
export function anchorLevelForIndex(index) {
  let level = null;
  for (let i = 1; i < ANCHOR_INDICES.length; i += 1) {
    if (index >= ANCHOR_INDICES[i]) level = ANCHOR_LEVELS[i - 1];
  }
  return level;
}

// ---------------------------------------------------------------------------
// Step 6 - ranks and divisions
// ---------------------------------------------------------------------------

/** Rank band and division slot for an index, without the next-division lookup. */
function bandAt(index) {
  const value = clamp(index, 0, MAX_INDEX);
  const rank = RANKS.find((candidate) => Math.floor(value) <= candidate.max) ?? RANKS.at(-1);
  const span = (rank.max + 1 - rank.min) / DIVISIONS.length;
  const slot = clamp(Math.floor((value - rank.min) / span), 0, DIVISIONS.length - 1);
  const divisionMin = rank.min + slot * span;
  return { value, rank, span, slot, divisionMin, divisionMax: divisionMin + span };
}

export function indexToRank(index) {
  const band = bandAt(index);
  const division = DIVISIONS[band.slot];
  const nextIndex = band.divisionMax;

  let nextDivision = null;
  if (nextIndex <= MAX_INDEX) {
    const nextBand = bandAt(nextIndex);
    nextDivision = {
      rank: nextBand.rank.name,
      division: DIVISIONS[nextBand.slot],
      label: `${nextBand.rank.name} ${DIVISIONS[nextBand.slot]}`,
      index: round(nextIndex, 1),
    };
  }

  return {
    index: round(band.value, 1),
    rank: band.rank.name,
    abbreviation: band.rank.abbreviation ?? band.rank.name,
    division,
    label: `${band.rank.name} ${division}`,
    color: band.rank.color,
    gradient: band.rank.gradient ?? null,
    meaning: band.rank.meaning,
    divisionMin: round(band.divisionMin, 1),
    divisionMax: round(band.divisionMax, 1),
    withinDivisionPct: round(clamp(((band.value - band.divisionMin) / band.span) * 100, 0, 100), 1),
    nextDivision,
  };
}

// ---------------------------------------------------------------------------
// Composition
// ---------------------------------------------------------------------------

/**
 * Scores one set end to end.
 *
 * @param {object} input
 * @param {'M'|'F'} input.sex
 * @param {string}  input.birthDate     YYYY-MM-DD
 * @param {string}  input.performedAt   YYYY-MM-DD
 * @param {number}  input.bodyweightKg  bodyweight on the performance date
 * @param {{code: string, type: string, bwFactor: number}} input.exercise
 * @param {number}  input.weightKg      bar load, or added load for bodyweight work
 * @param {number}  input.reps
 */
export function scoreLift({
  sex,
  birthDate,
  performedAt,
  bodyweightKg,
  exercise,
  weightKg,
  reps,
}) {
  const flags = [];

  const loadKg = effectiveLoad({
    type: exercise.type,
    bwFactor: exercise.bwFactor,
    bodyweightKg,
    weightKg,
  });

  const { age, coefficient, flags: ageFlags } = ageCoefficient(birthDate, performedAt);
  flags.push(...ageFlags);

  const { value: bodyweightForDots, clamped } = clampBodyweight(sex, bodyweightKg);
  if (clamped) flags.push(flag('BODYWEIGHT_CLAMPED'));

  const unranked = (extraFlag) => {
    if (extraFlag) flags.push(flag(extraFlag));
    return {
      ranked: false,
      effectiveLoadKg: round(loadKg),
      e1rmKg: null,
      dotsPoints: null,
      age,
      ageCoefficient: coefficient,
      adjustedScore: null,
      strengthIndex: null,
      rank: null,
      nextDivision: null,
      flags,
    };
  };

  if (loadKg <= 0) return unranked('NON_POSITIVE_LOAD');

  const e1rmKg = estimate1rm(loadKg, reps);
  if (e1rmKg === null) return unranked('ENDURANCE_REPS');

  const polynomial = dotsPolynomial(sex, bodyweightForDots);
  const points = (e1rmKg * 500) / polynomial;
  const adjustedScore = points * coefficient;

  const index = strengthIndex(adjustedScore, sex, exercise.code);
  if (index === null) {
    const partial = unranked('NO_ANCHORS');
    return {
      ...partial,
      e1rmKg: round(e1rmKg),
      dotsPoints: round(points),
      adjustedScore: round(adjustedScore),
    };
  }

  const rank = indexToRank(index);

  // Kilograms still needed for the next division, at this bodyweight and as a
  // single-rep equivalent. The delta is the same whether it is read as bar load
  // or as added load, because the bodyweight contribution is constant.
  let nextDivision = null;
  if (rank.nextDivision) {
    const targetScore = scoreForIndex(rank.nextDivision.index, sex, exercise.code);
    const targetE1rm = ((targetScore / coefficient) * polynomial) / 500;
    nextDivision = {
      ...rank.nextDivision,
      targetE1rmKg: roundUp(targetE1rm),
      kgNeeded: roundUp(Math.max(targetE1rm - e1rmKg, 0), 1),
    };
  }

  return {
    ranked: true,
    effectiveLoadKg: round(loadKg),
    e1rmKg: round(e1rmKg),
    dotsPoints: round(points),
    age,
    ageCoefficient: coefficient,
    adjustedScore: round(adjustedScore),
    strengthIndex: round(index, 1),
    rank,
    nextDivision,
    flags,
  };
}
