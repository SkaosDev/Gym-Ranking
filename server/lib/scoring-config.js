/**
 * Every constant the scoring engine uses. Nothing here is invented: each table
 * is cited, and MATHS.md records the sources and the limitations.
 */

// ---------------------------------------------------------------------------
// Estimated 1RM
// ---------------------------------------------------------------------------

/**
 * Barbell lifts: above this many reps, Epley and Brzycki diverge by 15-20% and
 * the set is measuring muscular endurance rather than maximal strength. Such a
 * set is still stored in the history; it simply does not feed the rank.
 */
export const MAX_RANKED_REPS = 12;

/**
 * Bodyweight movements are scored with Epley alone, because that is the
 * conversion Strength Level itself uses between its rep tables and its 1RM
 * tables, so it is the one that keeps us consistent with the standards. Their
 * standards go up to about 100 strict push-ups, hence the higher ceiling.
 */
export const MAX_RANKED_REPS_BODYWEIGHT = 100;

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
// Strength standards, by sex and bodyweight
// ---------------------------------------------------------------------------

/**
 * The five measured levels come from Strength Level (strengthlevel.com,
 * fetched October 2026), built from about seven million logged lifts. Each
 * level is a percentile of lifters: Beginner beats 5%, Novice 20%,
 * Intermediate 50%, Advanced 80%, Elite 95%. A sixth, World-class, is derived
 * from raw powerlifting records (see WORLD_CLASS below).
 */
export const ANCHOR_LEVELS = [
  'Beginner',
  'Novice',
  'Intermediate',
  'Advanced',
  'Elite',
  'World-class',
];

/** Index awarded at each anchor; a leading 0 anchors the bottom of the scale. */
export const ANCHOR_INDICES = [0, 100, 250, 450, 650, 825, 1000];

export const MAX_INDEX = 1000;

const MEN_BARBELL_BW = [50, 60, 70, 80, 90, 100, 110, 120];
const WOMEN_BARBELL_BW = [40, 50, 60, 70, 80, 90, 100];
const MEN_BODYWEIGHT_BW = [50, 60, 70, 80, 90, 100];
const WOMEN_BODYWEIGHT_BW = [40, 50, 60, 70, 80, 90];

/**
 * One row per bodyweight, five values per row (Beginner to Elite).
 *
 *   kind 'one_rep_max'  barbell 1RM in kg
 *   kind 'added'        1RM as weight added to bodyweight (negative = assisted)
 *   kind 'reps'         strict reps at bodyweight; Strength Level publishes no
 *                       loaded push-up table, so reps are the standard
 *
 * Between two rows the values are interpolated linearly, so the standards are
 * those of the lifter's own bodyweight rather than of a reference lifter.
 */
export const STANDARDS = {
  M: {
    squat: {
      kind: 'one_rep_max',
      bodyweights: MEN_BARBELL_BW,
      rows: [
        [36, 55, 78, 106, 137], [49, 71, 98, 129, 162], [62, 86, 116, 149, 185],
        [75, 101, 132, 168, 206], [87, 115, 148, 186, 226], [98, 128, 163, 203, 244],
        [109, 140, 177, 218, 261], [120, 152, 191, 233, 278],
      ],
    },
    bench: {
      kind: 'one_rep_max',
      bodyweights: MEN_BARBELL_BW,
      rows: [
        [27, 41, 58, 78, 101], [37, 53, 72, 95, 119], [47, 64, 85, 110, 136],
        [56, 75, 98, 124, 151], [65, 85, 109, 137, 165], [73, 95, 120, 149, 179],
        [81, 104, 131, 160, 191], [89, 113, 140, 171, 203],
      ],
    },
    deadlift: {
      kind: 'one_rep_max',
      bodyweights: MEN_BARBELL_BW,
      rows: [
        [46, 68, 96, 129, 164], [61, 86, 117, 153, 191], [75, 103, 137, 175, 216],
        [89, 119, 155, 196, 239], [102, 134, 172, 215, 260], [114, 148, 188, 232, 279],
        [126, 161, 203, 249, 298], [137, 174, 217, 265, 315],
      ],
    },
    ohp: {
      kind: 'one_rep_max',
      bodyweights: MEN_BARBELL_BW,
      rows: [
        [15, 24, 36, 51, 67], [21, 32, 45, 62, 79], [27, 39, 54, 72, 90],
        [33, 46, 62, 81, 101], [38, 53, 70, 90, 111], [44, 59, 77, 98, 120],
        [49, 65, 84, 105, 128], [54, 71, 90, 113, 136],
      ],
    },
    pullup: {
      kind: 'added',
      bodyweights: MEN_BODYWEIGHT_BW,
      rows: [
        [-5, 7, 22, 39, 56], [-4, 11, 27, 45, 64], [-2, 13, 31, 50, 71],
        [-2, 14, 33, 54, 75], [-2, 15, 35, 57, 79], [-3, 15, 36, 59, 82],
      ],
    },
    dip: {
      kind: 'added',
      bodyweights: MEN_BODYWEIGHT_BW,
      rows: [
        [-5, 11, 31, 54, 78], [-1, 17, 39, 64, 91], [2, 22, 46, 73, 101],
        [5, 26, 52, 81, 111], [6, 30, 57, 87, 118], [8, 32, 61, 92, 125],
      ],
    },
    pushup: {
      kind: 'reps',
      bodyweights: MEN_BODYWEIGHT_BW,
      rows: [
        [1, 18, 42, 70, 102], [4, 19, 41, 67, 95], [5, 20, 40, 64, 89],
        [6, 20, 38, 60, 84], [6, 19, 37, 57, 79], [6, 19, 35, 54, 74],
      ],
    },
  },
  F: {
    squat: {
      kind: 'one_rep_max',
      bodyweights: WOMEN_BARBELL_BW,
      rows: [
        [19, 34, 53, 76, 102], [26, 42, 63, 88, 116], [32, 49, 72, 99, 129],
        [37, 56, 80, 109, 140], [42, 62, 88, 117, 149], [47, 68, 94, 125, 158],
        [52, 74, 101, 132, 166],
      ],
    },
    bench: {
      kind: 'one_rep_max',
      bodyweights: WOMEN_BARBELL_BW,
      rows: [
        [10, 19, 33, 49, 68], [14, 25, 40, 58, 79], [19, 31, 47, 66, 88],
        [22, 36, 53, 74, 96], [26, 40, 59, 80, 104], [30, 45, 64, 86, 111],
        [33, 49, 69, 92, 117],
      ],
    },
    deadlift: {
      kind: 'one_rep_max',
      bodyweights: WOMEN_BARBELL_BW,
      rows: [
        [26, 43, 65, 92, 121], [34, 52, 76, 105, 136], [40, 60, 86, 116, 149],
        [46, 68, 95, 126, 160], [52, 74, 102, 135, 170], [57, 80, 109, 143, 180],
        [61, 86, 116, 151, 188],
      ],
    },
    ohp: {
      kind: 'one_rep_max',
      bodyweights: WOMEN_BARBELL_BW,
      rows: [
        [7, 13, 22, 33, 45], [10, 17, 27, 38, 51], [12, 20, 31, 43, 57],
        [15, 23, 34, 47, 62], [17, 26, 37, 51, 66], [19, 28, 40, 54, 70],
        [21, 31, 43, 58, 74],
      ],
    },
    pullup: {
      kind: 'added',
      bodyweights: WOMEN_BODYWEIGHT_BW,
      rows: [
        [-14, -5, 6, 17, 30], [-14, -4, 8, 21, 35], [-16, -4, 9, 23, 38],
        [-18, -5, 9, 24, 40], [-20, -7, 8, 24, 41], [-23, -9, 7, 24, 41],
      ],
    },
    dip: {
      kind: 'added',
      bodyweights: WOMEN_BODYWEIGHT_BW,
      rows: [
        [-15, -4, 10, 26, 44], [-15, -2, 14, 32, 52], [-15, 0, 17, 37, 58],
        [-16, 0, 19, 40, 62], [-17, 0, 20, 42, 66], [-19, -1, 20, 43, 68],
      ],
    },
    pushup: {
      // Strength Level lists Beginner as "fewer than one": 0 here.
      kind: 'reps',
      bodyweights: WOMEN_BODYWEIGHT_BW,
      rows: [
        [0, 5, 19, 36, 55], [0, 7, 19, 34, 51], [0, 7, 18, 32, 47],
        [0, 7, 17, 30, 43], [0, 7, 16, 28, 40], [0, 6, 15, 26, 37],
      ],
    },
  },
};

/**
 * World-class, the sixth anchor. Raw IPF records divided by Strength Level's
 * Elite at the same bodyweight come out at 1.54-1.60 for the three
 * powerlifts (OpenPowerlifting, men ~80 kg and women ~60 kg), so World-class
 * is Elite times that ratio. The overhead press is not a competition lift and
 * takes 1.5 by analogy.
 *
 * For bodyweight movements the factor applies only to the part above the
 * bodyweight itself: a 70 kg man's world-class pull-up is then about +106 kg,
 * which is where weighted pull-up records sit.
 */
export const WORLD_CLASS = {
  barbell: { squat: 1.55, bench: 1.55, deadlift: 1.6, ohp: 1.5 },
  bodyweightExcess: 1.5,
};

// ---------------------------------------------------------------------------
// Ranks and divisions
// ---------------------------------------------------------------------------

/**
 * Absolute and static: a user's rank never depends on another user's. Each
 * rank splits into four equal divisions, IV through I, I being the highest.
 */
export const RANKS = [
  { name: 'Iron',     min: 0,   max: 99,   color: '#6b7280', meaning: 'below the beginner standard' },
  { name: 'Bronze',   min: 100, max: 249,  color: '#b4652a', meaning: 'beginner, stronger than about 5% of lifters' },
  { name: 'Silver',   min: 250, max: 449,  color: '#8a94a3', meaning: 'novice, stronger than about 20% of lifters' },
  { name: 'Gold',     min: 450, max: 649,  color: '#d4a017', meaning: 'intermediate, stronger than about half of lifters' },
  { name: 'Platinum', min: 650, max: 824,  color: '#14b8a6', meaning: 'advanced, stronger than about 80% of lifters' },
  { name: 'Diamond',  min: 825, max: 924,  color: '#0ea5e9', meaning: 'elite, stronger than about 95% of lifters' },
  { name: 'Master',   min: 925, max: 979,  color: '#8b5cf6', meaning: 'national-level competitor' },
  {
    name: 'Unkillable Demon King',
    // Only ever used where space genuinely forces it, never in headings or docs.
    abbreviation: 'UDK',
    min: 980,
    max: 1000,
    color: '#dc2626',
    gradient: 'linear-gradient(90deg, #dc2626 0%, #d4a017 100%)',
    meaning: 'world-record territory',
  },
];

/** Lowest to highest, so index 0 of this array is the entry division. */
export const DIVISIONS = ['IV', 'III', 'II', 'I'];

// ---------------------------------------------------------------------------
// Flags attached to a score rather than thrown
// ---------------------------------------------------------------------------

export const FLAGS = {
  ENDURANCE_REPS:
    'Above 12 reps on a barbell lift the 1RM formulas diverge and measure endurance rather than maximal strength, so this set does not count toward your rank.',
  BODYWEIGHT_OUTSIDE_TABLE:
    'Your bodyweight is outside the range the published standards cover, so they were extended from the nearest bodyweights.',
  AGE_BELOW_TABLE:
    'Age on the performance date is below 14, where no published coefficient applies; the value for 14 was used.',
  AGE_ABOVE_TABLE:
    'Age on the performance date is above 90, where the McCulloch table ends; the value for 90 was used.',
  NON_POSITIVE_LOAD:
    'The effective load works out at zero or less, so no strength estimate can be made from this set.',
  NO_ANCHORS:
    'This exercise has no published strength standards, so it is tracked but not ranked.',
};

