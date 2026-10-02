/**
 * The scoring engine: pure functions, no database, no clock. Every input is
 * explicit and every output is derived, which is what makes it unit-testable
 * on its own and what lets /rank-explained show the working.
 *
 * The pipeline is:
 *   effective load -> estimated 1RM -> age adjustment
 *   -> compared with the standards at the lifter's own bodyweight
 *   -> strength index (0-1000) -> rank and division
 */
import {
  ANCHOR_INDICES,
  ANCHOR_LEVELS,
  DIVISIONS,
  FLAGS,
  FOSTER_COEFFICIENTS,
  MAX_AGE_IN_TABLE,
  MAX_INDEX,
  MAX_RANKED_REPS,
  MAX_RANKED_REPS_BODYWEIGHT,
  MCCULLOCH_COEFFICIENTS,
  MIN_AGE,
  PEAK_AGE_RANGE,
  RANKS,
  STANDARDS,
  WORLD_CLASS,
} from './scoring-config.js';

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

/** Inverse of Epley: the reps at `loadKg` that equal a given 1RM. */
export const epleyReps = (loadKg, oneRepMaxKg) => (oneRepMaxKg / loadKg - 1) * 30;

function assertReps(reps) {
  if (!Number.isInteger(reps) || reps < 1) {
    throw new RangeError(`reps must be a positive integer, received ${reps}`);
  }
}

/**
 * Barbell lifts. A single rep is its own maximum. Between 2 and 12 reps both
 * formulas sit within about 5% of reality and err in opposite directions, so
 * their mean is steadier than either alone. Past 12 reps we return null rather
 * than a number we would have to disclaim.
 */
export function estimate1rm(loadKg, reps) {
  assertReps(reps);
  if (reps === 1) return loadKg;
  if (reps > MAX_RANKED_REPS) return null;
  return (epley(loadKg, reps) + brzycki(loadKg, reps)) / 2;
}

/**
 * Bodyweight movements: Epley alone, up to 100 reps. Strength Level's rep
 * tables and 1RM tables convert into each other with exactly this formula, so
 * using it keeps fifteen pull-ups and three weighted ones on the same scale as
 * the standards they are compared with. Brzycki is unusable here: it reaches
 * zero at 37 reps.
 */
export function estimate1rmBodyweight(loadKg, reps) {
  assertReps(reps);
  if (reps === 1) return loadKg;
  if (reps > MAX_RANKED_REPS_BODYWEIGHT) return null;
  return epley(loadKg, reps);
}

/** The right estimator for the exercise type. */
export function estimate1rmFor(type, loadKg, reps) {
  return type === 'bodyweight' ? estimate1rmBodyweight(loadKg, reps) : estimate1rm(loadKg, reps);
}

// ---------------------------------------------------------------------------
// Step 3 - age adjustment, applied by the caller as e1RM x coefficient
// Step 4 - the standards at the lifter's own bodyweight
// ---------------------------------------------------------------------------

/** Linear interpolation of the row values at `bodyweightKg`, extended past the ends. */
function interpolateRows(bodyweights, rows, bodyweightKg) {
  const last = bodyweights.length - 1;
  let i = 0;
  while (i < last - 1 && bodyweightKg > bodyweights[i + 1]) i += 1;
  const fraction = (bodyweightKg - bodyweights[i]) / (bodyweights[i + 1] - bodyweights[i]);
  return rows[i].map((low, level) => low + fraction * (rows[i + 1][level] - low));
}

/**
 * The six anchors, in kilograms of estimated 1RM, for this sex, exercise and
 * bodyweight. For bodyweight movements the kilograms are effective load
 * (bodyweight share plus added weight), so they compare with the set directly.
 *
 * Returns null when the exercise has no published standards.
 */
export function standardsFor(sex, exerciseCode, bodyweightKg, bwFactor = 1) {
  const table = STANDARDS[sex]?.[exerciseCode];
  if (!table) return null;

  const { bodyweights, rows, kind } = table;
  const outside = bodyweightKg < bodyweights[0] || bodyweightKg > bodyweights.at(-1);
  const values = interpolateRows(bodyweights, rows, bodyweightKg);

  // `base` is what the lifter moves for one rep with nothing added.
  let base = 0;
  let measured;
  if (kind === 'one_rep_max') {
    measured = values;
  } else if (kind === 'added') {
    base = bodyweightKg;
    measured = values.map((added) => bodyweightKg + added);
  } else {
    base = bwFactor * bodyweightKg;
    measured = values.map((reps) => epley(base, Math.max(reps, 0)));
  }

  const elite = measured.at(-1);
  const worldClass =
    kind === 'one_rep_max'
      ? elite * WORLD_CLASS.barbell[exerciseCode]
      : base + (elite - base) * WORLD_CLASS.bodyweightExcess;

  // An extrapolated anchor must never fall to or below the one beneath it.
  const anchorsKg = [...measured, worldClass];
  for (let level = 0; level < anchorsKg.length; level += 1) {
    const floor = level === 0 ? 0.5 : anchorsKg[level - 1] + 0.5;
    anchorsKg[level] = Math.max(anchorsKg[level], floor);
  }

  return { kind, baseKg: base, anchorsKg, outside };
}

// ---------------------------------------------------------------------------
// Step 5 - strength index
// ---------------------------------------------------------------------------

/** Piecewise linear over [0, ...anchors] mapped onto ANCHOR_INDICES. */
export function strengthIndex(adjustedKg, anchorsKg) {
  if (!anchorsKg) return null;

  const points = [0, ...anchorsKg];
  if (adjustedKg <= 0) return 0;
  if (adjustedKg >= points.at(-1)) return MAX_INDEX;

  for (let i = 0; i < points.length - 1; i += 1) {
    if (adjustedKg <= points[i + 1]) {
      const span = points[i + 1] - points[i];
      const fraction = span === 0 ? 0 : (adjustedKg - points[i]) / span;
      return ANCHOR_INDICES[i] + fraction * (ANCHOR_INDICES[i + 1] - ANCHOR_INDICES[i]);
    }
  }
  return MAX_INDEX;
}

/** The inverse: the age-adjusted kilograms an index corresponds to. */
export function kgForIndex(index, anchorsKg) {
  if (!anchorsKg) return null;

  const points = [0, ...anchorsKg];
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
 * What a target 1RM means for this lifter in plain terms: kilograms on top of
 * the current best, and for bodyweight movements the strict reps at bodyweight
 * that would reach it in one set.
 */
export function targetFor({ targetE1rmKg, currentE1rmKg, exercise, bodyweightKg }) {
  const target = {
    targetE1rmKg: roundUp(targetE1rmKg),
    kgNeeded: roundUp(Math.max(targetE1rmKg - currentE1rmKg, 0), 1),
    bodyweightReps: null,
  };
  if (exercise.type === 'bodyweight') {
    const base = exercise.bwFactor * bodyweightKg;
    const reps = Math.max(1, Math.ceil(epleyReps(base, targetE1rmKg) - 1e-9));
    target.bodyweightReps = reps <= MAX_RANKED_REPS_BODYWEIGHT ? reps : null;
  }
  return target;
}

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

  const standards = standardsFor(sex, exercise.code, bodyweightKg, exercise.bwFactor);
  if (standards?.outside) flags.push(flag('BODYWEIGHT_OUTSIDE_TABLE'));

  const unranked = (extraFlag, partial = {}) => {
    if (extraFlag) flags.push(flag(extraFlag));
    return {
      ranked: false,
      effectiveLoadKg: round(loadKg),
      e1rmKg: null,
      age,
      ageCoefficient: coefficient,
      adjustedE1rmKg: null,
      standardsKg: standards ? standards.anchorsKg.map((kg) => round(kg, 1)) : null,
      strengthIndex: null,
      rank: null,
      nextDivision: null,
      flags,
      ...partial,
    };
  };

  if (loadKg <= 0) return unranked('NON_POSITIVE_LOAD');

  const e1rmKg = estimate1rmFor(exercise.type, loadKg, reps);
  if (e1rmKg === null) return unranked('ENDURANCE_REPS');

  const adjustedE1rmKg = e1rmKg * coefficient;

  if (!standards) {
    return unranked('NO_ANCHORS', { e1rmKg: round(e1rmKg), adjustedE1rmKg: round(adjustedE1rmKg) });
  }

  const index = strengthIndex(adjustedE1rmKg, standards.anchorsKg);
  const rank = indexToRank(index);

  // What the next division takes, at this bodyweight. The age coefficient is
  // divided back out, so the figure is in real kilograms.
  let nextDivision = null;
  if (rank.nextDivision) {
    const targetE1rmKg = kgForIndex(rank.nextDivision.index, standards.anchorsKg) / coefficient;
    nextDivision = {
      ...rank.nextDivision,
      ...targetFor({ targetE1rmKg, currentE1rmKg: e1rmKg, exercise, bodyweightKg }),
    };
  }

  return {
    ranked: true,
    effectiveLoadKg: round(loadKg),
    e1rmKg: round(e1rmKg),
    age,
    ageCoefficient: coefficient,
    adjustedE1rmKg: round(adjustedE1rmKg),
    standardsKg: standards.anchorsKg.map((kg) => round(kg, 1)),
    strengthIndex: round(index, 1),
    rank,
    nextDivision,
    flags,
  };
}
