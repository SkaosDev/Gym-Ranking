/**
 * Every constant the scoring engine uses. Nothing here is invented: each table
 * is cited, and MATHS.md records the sources and the limitations.
 */

// ---------------------------------------------------------------------------
// Estimated 1RM
// ---------------------------------------------------------------------------

/**
 * Above this many reps, Epley and Brzycki diverge by 15-20% and the set is
 * measuring muscular endurance rather than maximal strength. Such a set is
 * still stored in the history; it simply does not feed the rank.
 */
export const MAX_RANKED_REPS = 12;

// ---------------------------------------------------------------------------
// DOTS bodyweight normalisation
// ---------------------------------------------------------------------------

/**
 * Fourth-degree polynomial coefficients [a, b, c, d, e] for
 * P(bw) = a + b*bw + c*bw^2 + d*bw^3 + e*bw^4.
 *
 * DOTS is the coefficient most powerlifting federations adopted around
 * 2019-2020 to replace Wilks, which flattered very heavy men and penalised
 * light and heavy women.
 */
export const DOTS_COEFFICIENTS = {
  M: [-307.75076, 24.0900756, -0.1918759221, 0.0007391293, -0.000001093],
  F: [-57.96288, 13.6175032, -0.1126655495, 0.0005158568, -0.0000010706],
};

/**
 * The polynomial is fitted on adult competitive bodyweights. Outside this
 * range we clamp to the nearest bound and flag it rather than extrapolating a
 * quartic curve that turns over.
 */
export const DOTS_BODYWEIGHT_BOUNDS = {
  M: { min: 40, max: 210 },
  F: { min: 40, max: 150 },
};

/** Reference bodyweight the strength anchors are expressed at, per sex. */
export const REFERENCE_BODYWEIGHT_KG = { M: 90, F: 65 };

// ---------------------------------------------------------------------------
// Age coefficients (the tables used by USA Powerlifting)
// ---------------------------------------------------------------------------

/** Foster, ages 14-23: compensates for incomplete development. */
export const FOSTER_COEFFICIENTS = {
  14: 1.23,
  15: 1.18,
  16: 1.13,
  17: 1.08,
  18: 1.06,
  19: 1.04,
  20: 1.03,
  21: 1.02,
  22: 1.01,
  23: 1.0,
};

/** McCulloch, age 40 and above. */
export const MCCULLOCH_COEFFICIENTS = {
  40: 1.0,   41: 1.01,  42: 1.02,  43: 1.031, 44: 1.043, 45: 1.055, 46: 1.068,
  47: 1.082, 48: 1.097, 49: 1.113, 50: 1.13,  51: 1.147, 52: 1.165, 53: 1.184,
  54: 1.204, 55: 1.225, 56: 1.246, 57: 1.268, 58: 1.291, 59: 1.315, 60: 1.34,
  61: 1.366, 62: 1.393, 63: 1.421, 64: 1.45,  65: 1.48,  66: 1.511, 67: 1.543,
  68: 1.576, 69: 1.61,  70: 1.645, 71: 1.681, 72: 1.718, 73: 1.756, 74: 1.795,
  75: 1.835, 76: 1.876, 77: 1.918, 78: 1.961, 79: 2.005, 80: 2.05,  81: 2.096,
  82: 2.143, 83: 2.19,  84: 2.238, 85: 2.287, 86: 2.337, 87: 2.388, 88: 2.44,
  89: 2.494, 90: 2.549,
};

/** Ages 24-39 are peak maximal strength and take no adjustment. */
export const PEAK_AGE_RANGE = { min: 24, max: 39 };

/** Below this age no published table applies, and account creation is refused. */
export const MIN_AGE = 14;

/** Above this age the McCulloch table stops and we clamp to its last value. */
export const MAX_AGE_IN_TABLE = 90;

// ---------------------------------------------------------------------------
// Strength anchors
// ---------------------------------------------------------------------------

export const ANCHOR_LEVELS = [
  'Untrained',
  'Novice',
  'Intermediate',
  'Advanced',
  'Elite',
  'World-class',
];

/** Index awarded at each anchor; a leading 0 anchors the bottom of the scale. */
export const ANCHOR_INDICES = [0, 100, 250, 450, 650, 825, 1000];

export const MAX_INDEX = 1000;

/**
 * Bodyweight multiples at the reference bodyweight, in ANCHOR_LEVELS order.
 *
 * Pull-up and dip multiples are of the TOTAL load including bodyweight, so
 * 1.00 is one strict unweighted rep. Push-up multiples apply to the effective
 * load, which already has the 0.70 bodyweight factor applied upstream.
 */
export const ANCHOR_MULTIPLES = {
  M: {
    squat:    [0.75, 1.25, 1.75, 2.5,  3.0,  3.6],
    bench:    [0.5,  0.75, 1.25, 1.75, 2.1,  2.6],
    deadlift: [1.0,  1.5,  2.25, 3.0,  3.5,  4.2],
    ohp:      [0.35, 0.55, 0.8,  1.1,  1.3,  1.6],
    pullup:   [1.0,  1.15, 1.4,  1.75, 2.0,  2.4],
    dip:      [1.0,  1.2,  1.45, 1.8,  2.05, 2.45],
    pushup:   [0.5,  0.6,  0.7,  0.85, 0.95, 1.1],
  },
  F: {
    squat:    [0.5,  0.85, 1.25, 1.75, 2.15, 2.6],
    bench:    [0.35, 0.5,  0.75, 1.0,  1.25, 1.6],
    deadlift: [0.6,  1.0,  1.5,  2.1,  2.5,  3.0],
    ohp:      [0.2,  0.35, 0.5,  0.7,  0.85, 1.05],
    pullup:   [0.85, 1.0,  1.15, 1.4,  1.6,  1.95],
    dip:      [0.85, 1.05, 1.2,  1.45, 1.65, 2.0],
    pushup:   [0.4,  0.5,  0.6,  0.72, 0.82, 0.95],
  },
};

// ---------------------------------------------------------------------------
// Ranks and divisions
// ---------------------------------------------------------------------------

/**
 * Absolute and static: a user's rank never depends on another user's. Each
 * rank splits into five equal divisions, V through I, I being the highest.
 */
export const RANKS = [
  { name: 'Iron',     min: 0,   max: 99,   color: '#8b949e', meaning: 'untrained' },
  { name: 'Bronze',   min: 100, max: 249,  color: '#cd7f32', meaning: 'beginner' },
  { name: 'Silver',   min: 250, max: 449,  color: '#c0c0c0', meaning: 'around six months of consistent training' },
  { name: 'Gold',     min: 450, max: 649,  color: '#ffd700', meaning: 'intermediate, one to two years' },
  { name: 'Platinum', min: 650, max: 824,  color: '#6ee7d0', meaning: 'advanced, three to five years' },
  { name: 'Diamond',  min: 825, max: 924,  color: '#7dd3fc', meaning: 'amateur elite' },
  { name: 'Master',   min: 925, max: 979,  color: '#c084fc', meaning: 'national-level competitor' },
  {
    name: 'Unkillable Demon King',
    // Only ever used where space genuinely forces it, never in headings or docs.
    abbreviation: 'UDK',
    min: 980,
    max: 1000,
    color: '#ff3b30',
    gradient: 'linear-gradient(90deg, #ff3b30 0%, #ffd700 100%)',
    meaning: 'world-class',
  },
];

/** Lowest to highest, so index 0 of this array is the entry division. */
export const DIVISIONS = ['V', 'IV', 'III', 'II', 'I'];

// ---------------------------------------------------------------------------
// Flags attached to a score rather than thrown
// ---------------------------------------------------------------------------

export const FLAGS = {
  ENDURANCE_REPS:
    'Above 12 reps the 1RM formulas diverge and measure endurance rather than maximal strength, so this set does not count toward your rank.',
  BODYWEIGHT_CLAMPED:
    'Bodyweight falls outside the range the DOTS formula was fitted on, so it was clamped to the nearest bound.',
  AGE_BELOW_TABLE:
    'Age on the performance date is below 14, where no published coefficient applies; the value for 14 was used.',
  AGE_ABOVE_TABLE:
    'Age on the performance date is above 90, where the McCulloch table ends; the value for 90 was used.',
  NON_POSITIVE_LOAD:
    'The effective load works out at zero or less, so no strength estimate can be made from this set.',
  NO_ANCHORS:
    'This exercise has no calibrated strength standards, so it is tracked but not ranked.',
};

// ---------------------------------------------------------------------------

/**
 * P(bw) = a + b*bw + c*bw^2 + d*bw^3 + e*bw^4.
 * No bounds checking: callers clamp the bodyweight first.
 */
export function dotsPolynomial(sex, bodyweightKg) {
  const [a, b, c, d, e] = DOTS_COEFFICIENTS[sex];
  const bw = bodyweightKg;
  return a + b * bw + c * bw ** 2 + d * bw ** 3 + e * bw ** 4;
}
