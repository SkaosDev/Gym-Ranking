import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  DOTS_BODYWEIGHT_BOUNDS,
  FOSTER_COEFFICIENTS,
  MCCULLOCH_COEFFICIENTS,
  REFERENCE_BODYWEIGHT_KG,
  dotsPolynomial,
} from '../lib/scoring-config.js';
import { DOTS_THRESHOLDS } from '../lib/thresholds.js';
import { computeThresholds } from '../scripts/calibrate.js';
import {
  ageCoefficientForAge,
  ageOn,
  brzycki,
  clampBodyweight,
  dotsPoints,
  effectiveLoad,
  epley,
  estimate1rm,
  indexToRank,
  scoreForIndex,
  scoreLift,
  strengthIndex,
} from '../lib/scoring.js';

function closeTo(actual, expected, tolerance, label = '') {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${label} expected ${expected} +/- ${tolerance}, received ${actual}`,
  );
}

const PULLUP = { code: 'pullup', type: 'bodyweight', bwFactor: 1 };
const BENCH = { code: 'bench', type: 'external', bwFactor: 0 };

describe('DOTS polynomial', () => {
  it('reproduces the published control values', () => {
    closeTo(dotsPolynomial('M', 90), 773.27, 0.01, 'P_men(90)');
    closeTo(dotsPolynomial('F', 65), 473.72, 0.01, 'P_women(65)');
    closeTo(dotsPolynomial('F', 50), 399.04, 0.01, 'P_women(50)');
  });

  it('scores a heavier lifter lower for the same lift', () => {
    const light = dotsPoints(150, 'M', 70);
    const heavy = dotsPoints(150, 'M', 110);
    assert.ok(light > heavy, 'bodyweight normalisation should favour the lighter lifter');
  });
});

describe('bodyweight clamping', () => {
  it('clamps below and above the fitted range instead of extrapolating', () => {
    for (const sex of ['M', 'F']) {
      const { min, max } = DOTS_BODYWEIGHT_BOUNDS[sex];
      assert.deepEqual(clampBodyweight(sex, min - 10), { value: min, clamped: true });
      assert.deepEqual(clampBodyweight(sex, max + 10), { value: max, clamped: true });
      assert.deepEqual(clampBodyweight(sex, min + 1), { value: min + 1, clamped: false });
    }
  });

  it('uses the clamped bodyweight in the score', () => {
    assert.equal(dotsPoints(100, 'M', 20), dotsPoints(100, 'M', 40));
    assert.equal(dotsPoints(100, 'F', 300), dotsPoints(100, 'F', 150));
  });

  it('flags a clamped bodyweight on a scored lift', () => {
    const result = scoreLift({
      sex: 'M',
      birthDate: '1996-01-01',
      performedAt: '2026-06-15',
      bodyweightKg: 250,
      exercise: BENCH,
      weightKg: 100,
      reps: 1,
    });
    assert.ok(result.flags.some((f) => f.code === 'BODYWEIGHT_CLAMPED'));
  });
});

describe('estimated 1RM', () => {
  it('returns the load itself for a single rep', () => {
    assert.equal(estimate1rm(140, 1), 140);
  });

  it('matches Epley and Brzycki on known cases', () => {
    closeTo(epley(100, 5), 116.667, 0.001, 'Epley 100x5');
    closeTo(brzycki(100, 5), 112.5, 0.001, 'Brzycki 100x5');
    // The two formulas coincide at ten reps, which pins the average exactly.
    closeTo(epley(100, 10), 133.333, 0.001, 'Epley 100x10');
    closeTo(brzycki(100, 10), 133.333, 0.001, 'Brzycki 100x10');
    closeTo(estimate1rm(100, 10), 133.333, 0.001, 'average at 10 reps');
  });

  it('averages the two formulas between 2 and 12 reps', () => {
    for (const reps of [2, 5, 8, 12]) {
      const expected = (epley(100, reps) + brzycki(100, reps)) / 2;
      closeTo(estimate1rm(100, reps), expected, 1e-9, `${reps} reps`);
    }
  });

  it('excludes sets above 12 reps from the rank', () => {
    assert.equal(estimate1rm(100, 12) !== null, true);
    assert.equal(estimate1rm(100, 13), null);
    assert.equal(estimate1rm(100, 30), null);
  });

  it('rejects impossible rep counts', () => {
    assert.throws(() => estimate1rm(100, 0), RangeError);
    assert.throws(() => estimate1rm(100, -3), RangeError);
    assert.throws(() => estimate1rm(100, 2.5), RangeError);
  });

  it('keeps a high-rep set in the history but out of the rank', () => {
    const result = scoreLift({
      sex: 'M',
      birthDate: '1996-01-01',
      performedAt: '2026-06-15',
      bodyweightKg: 90,
      exercise: BENCH,
      weightKg: 60,
      reps: 20,
    });
    assert.equal(result.ranked, false);
    assert.equal(result.e1rmKg, null);
    assert.equal(result.strengthIndex, null);
    assert.equal(result.effectiveLoadKg, 60, 'the set itself is still described');
    assert.ok(result.flags.some((f) => f.code === 'ENDURANCE_REPS'));
  });
});

describe('effective load', () => {
  it('uses the bar load for external lifts', () => {
    assert.equal(effectiveLoad({ type: 'external', bwFactor: 0, bodyweightKg: 90, weightKg: 140 }), 140);
  });

  it('adds the bodyweight fraction for bodyweight lifts', () => {
    assert.equal(effectiveLoad({ type: 'bodyweight', bwFactor: 1, bodyweightKg: 90, weightKg: 0 }), 90);
    assert.equal(effectiveLoad({ type: 'bodyweight', bwFactor: 1, bodyweightKg: 90, weightKg: 20 }), 110);
    closeTo(
      effectiveLoad({ type: 'bodyweight', bwFactor: 0.7, bodyweightKg: 80, weightKg: 0 }),
      56,
      1e-9,
      'push-up at 80 kg',
    );
  });

  it('accepts band assistance as negative added load', () => {
    assert.equal(effectiveLoad({ type: 'bodyweight', bwFactor: 1, bodyweightKg: 90, weightKg: -30 }), 60);
  });

  it('refuses to score a set whose effective load is not positive', () => {
    const result = scoreLift({
      sex: 'M',
      birthDate: '1996-01-01',
      performedAt: '2026-06-15',
      bodyweightKg: 90,
      exercise: PULLUP,
      weightKg: -95,
      reps: 3,
    });
    assert.equal(result.ranked, false);
    assert.ok(result.flags.some((f) => f.code === 'NON_POSITIVE_LOAD'));
  });
});

describe('age coefficients', () => {
  it('computes age as of the performance date, not today', () => {
    assert.equal(ageOn('2001-06-16', '2026-06-15'), 24, 'the day before the birthday');
    assert.equal(ageOn('2001-06-15', '2026-06-15'), 25, 'on the birthday');
    assert.equal(ageOn('2001-06-14', '2026-06-15'), 25);
  });

  it('holds at every table boundary', () => {
    const expected = {
      13: FOSTER_COEFFICIENTS[14], // below the tables, clamped to 14
      14: 1.23,
      23: 1.0,
      24: 1.0,
      39: 1.0,
      40: 1.0,
      90: 2.549,
      91: MCCULLOCH_COEFFICIENTS[90], // above the tables, clamped to 90
    };
    for (const [age, coefficient] of Object.entries(expected)) {
      assert.equal(
        ageCoefficientForAge(Number(age)).coefficient,
        coefficient,
        `coefficient at age ${age}`,
      );
    }
  });

  it('flags ages outside the published tables', () => {
    assert.ok(ageCoefficientForAge(13).flags.some((f) => f.code === 'AGE_BELOW_TABLE'));
    assert.ok(ageCoefficientForAge(91).flags.some((f) => f.code === 'AGE_ABOVE_TABLE'));
    assert.deepEqual(ageCoefficientForAge(30).flags, []);
  });

  it('never dips below 1.0 and rises monotonically after 40', () => {
    for (let age = 14; age <= 95; age += 1) {
      assert.ok(ageCoefficientForAge(age).coefficient >= 1, `age ${age}`);
    }
    for (let age = 41; age <= 90; age += 1) {
      assert.ok(
        ageCoefficientForAge(age).coefficient > ageCoefficientForAge(age - 1).coefficient,
        `age ${age} should exceed ${age - 1}`,
      );
    }
    for (let age = 15; age <= 23; age += 1) {
      assert.ok(
        ageCoefficientForAge(age).coefficient < ageCoefficientForAge(age - 1).coefficient,
        `Foster should decay toward 1.0 at age ${age}`,
      );
    }
  });
});

describe('calibration', () => {
  it('the committed thresholds file matches a fresh calibration', () => {
    assert.deepEqual(computeThresholds(), DOTS_THRESHOLDS, 'run: npm run calibrate');
  });

  it('thresholds rise strictly across the six anchors', () => {
    for (const [sex, byExercise] of Object.entries(DOTS_THRESHOLDS)) {
      for (const [code, points] of Object.entries(byExercise)) {
        assert.equal(points.length, 6, `${sex}/${code}`);
        for (let i = 1; i < points.length; i += 1) {
          assert.ok(points[i] > points[i - 1], `${sex}/${code} anchor ${i} must exceed anchor ${i - 1}`);
        }
      }
    }
  });

  it('places an anchor exactly on its index', () => {
    // The third anchor is Intermediate, worth 450 by definition.
    const intermediate = DOTS_THRESHOLDS.M.squat[2];
    closeTo(strengthIndex(intermediate, 'M', 'squat'), 450, 1e-9, 'Intermediate squat');
    closeTo(strengthIndex(DOTS_THRESHOLDS.F.bench[4], 'F', 'bench'), 825, 1e-9, 'Elite bench');
  });
});

describe('strength index', () => {
  it('rises monotonically with the score and caps at 1000', () => {
    let previous = -1;
    for (let score = 0; score <= 400; score += 0.5) {
      const index = strengthIndex(score, 'M', 'squat');
      assert.ok(index >= previous, `index dropped at score ${score}`);
      assert.ok(index <= 1000, `index exceeded 1000 at score ${score}`);
      previous = index;
    }
    assert.equal(strengthIndex(10_000, 'M', 'squat'), 1000);
    assert.equal(strengthIndex(0, 'M', 'squat'), 0);
    assert.equal(strengthIndex(-5, 'M', 'squat'), 0);
  });

  it('inverts exactly', () => {
    for (const index of [1, 100, 190.6, 250, 402, 459.3, 650, 825, 999]) {
      const score = scoreForIndex(index, 'M', 'deadlift');
      closeTo(strengthIndex(score, 'M', 'deadlift'), index, 1e-6, `round trip at ${index}`);
    }
  });

  it('returns null for an exercise with no calibrated standards', () => {
    assert.equal(strengthIndex(100, 'M', 'not-an-exercise'), null);
  });
});

describe('ranks and divisions', () => {
  it('places every band boundary on the right rank and division', () => {
    const expected = [
      [0, 'Iron V'], [99, 'Iron I'],
      [100, 'Bronze V'], [249, 'Bronze I'],
      [250, 'Silver V'], [449, 'Silver I'],
      [450, 'Gold V'], [649, 'Gold I'],
      [650, 'Platinum V'], [824, 'Platinum I'],
      [825, 'Diamond V'], [924, 'Diamond I'],
      [925, 'Master V'], [979, 'Master I'],
      [980, 'Unkillable Demon King V'], [1000, 'Unkillable Demon King I'],
    ];
    for (const [index, label] of expected) {
      assert.equal(indexToRank(index).label, label, `index ${index}`);
    }
  });

  it('spells the top rank out in full and abbreviates it only on request', () => {
    const top = indexToRank(1000);
    assert.equal(top.rank, 'Unkillable Demon King');
    assert.equal(top.abbreviation, 'UDK');
    assert.ok(top.gradient, 'the top rank carries its red-to-gold gradient');
  });

  it('reports the next division, and none at the ceiling', () => {
    assert.equal(indexToRank(449).nextDivision.label, 'Gold V');
    assert.equal(indexToRank(979).nextDivision.label, 'Unkillable Demon King V');
    assert.equal(indexToRank(1000).nextDivision, null);
  });

  it('reports position within the division', () => {
    assert.equal(indexToRank(450).withinDivisionPct, 0);
    assert.equal(indexToRank(470).withinDivisionPct, 50);
    closeTo(indexToRank(489).withinDivisionPct, 97.5, 0.1, 'near the top of Gold V');
  });
});

describe('reference cases', () => {
  // Case 1. The specification quoted index ~430 and Gold IV; the formulas it
  // also specifies produce 459.3, which is Gold V. e1RM and DOTS match it
  // exactly, so the divergence is in the interpolation arithmetic alone.
  it('man, 25, 90 kg, bench 100 kg x 5 -> Gold V', () => {
    const result = scoreLift({
      sex: 'M',
      birthDate: '2001-01-01',
      performedAt: '2026-06-15',
      bodyweightKg: 90,
      exercise: BENCH,
      weightKg: 100,
      reps: 5,
    });
    assert.equal(result.age, 25);
    closeTo(result.e1rmKg, 114.58, 0.01, 'e1RM');
    closeTo(result.dotsPoints, 74.09, 0.01, 'DOTS');
    assert.equal(result.ageCoefficient, 1);
    closeTo(result.strengthIndex, 459.3, 0.1, 'index');
    assert.equal(result.rank.label, 'Gold V');
  });

  it('woman, 20, 50 kg, one strict pull-up -> Bronze II', () => {
    const result = scoreLift({
      sex: 'F',
      birthDate: '2006-01-01',
      performedAt: '2026-06-15',
      bodyweightKg: 50,
      exercise: PULLUP,
      weightKg: 0,
      reps: 1,
    });
    assert.equal(result.age, 20);
    assert.equal(result.effectiveLoadKg, 50);
    closeTo(result.dotsPoints, 62.65, 0.01, 'DOTS');
    assert.equal(result.ageCoefficient, 1.03);
    closeTo(result.adjustedScore, 64.53, 0.01, 'age-adjusted');
    closeTo(result.strengthIndex, 190.6, 0.1, 'index');
    assert.equal(result.rank.label, 'Bronze II');
  });

  // Case 3. The specification quoted index ~400, which is right, but labelled
  // it Silver I; Silver I begins at 410, so 402.0 is Silver II.
  it('man, 60, 90 kg, one strict pull-up -> Silver II', () => {
    const result = scoreLift({
      sex: 'M',
      birthDate: '1966-01-01',
      performedAt: '2026-06-15',
      bodyweightKg: 90,
      exercise: PULLUP,
      weightKg: 0,
      reps: 1,
    });
    assert.equal(result.age, 60);
    assert.equal(result.effectiveLoadKg, 90);
    closeTo(result.dotsPoints, 58.19, 0.01, 'DOTS');
    assert.equal(result.ageCoefficient, 1.34);
    closeTo(result.adjustedScore, 77.98, 0.01, 'age-adjusted');
    closeTo(result.strengthIndex, 402.0, 0.1, 'index');
    assert.equal(result.rank.label, 'Silver II');
  });

  it('rates the same apparent pull-up higher for the older, heavier lifter', () => {
    const common = { performedAt: '2026-06-15', exercise: PULLUP, weightKg: 0, reps: 1 };
    const youngWoman = scoreLift({ ...common, sex: 'F', birthDate: '2006-01-01', bodyweightKg: 50 });
    const olderMan = scoreLift({ ...common, sex: 'M', birthDate: '1966-01-01', bodyweightKg: 90 });
    assert.ok(
      olderMan.strengthIndex > youngWoman.strengthIndex,
      'the whole point of the calibration',
    );
  });
});

describe('kilograms to the next division', () => {
  it('lands exactly on the next division when the target is reached', () => {
    const base = {
      sex: 'M',
      birthDate: '2001-01-01',
      performedAt: '2026-06-15',
      bodyweightKg: 90,
      exercise: BENCH,
      reps: 1,
    };
    const current = scoreLift({ ...base, weightKg: 120 });
    assert.ok(current.nextDivision.kgNeeded > 0);

    // A single rep at the target load must reach the next division exactly.
    const atTarget = scoreLift({ ...base, weightKg: current.nextDivision.targetE1rmKg });
    closeTo(atTarget.strengthIndex, current.nextDivision.index, 0.2, 'index at the target load');
    assert.equal(atTarget.rank.label, current.nextDivision.label);
  });

  it('works for a bodyweight lift, where the delta is added load', () => {
    const current = scoreLift({
      sex: 'F',
      birthDate: '1996-01-01',
      performedAt: '2026-06-15',
      bodyweightKg: 60,
      exercise: PULLUP,
      weightKg: 5,
      reps: 1,
    });
    const needed = current.nextDivision.kgNeeded;
    const atTarget = scoreLift({
      sex: 'F',
      birthDate: '1996-01-01',
      performedAt: '2026-06-15',
      bodyweightKg: 60,
      exercise: PULLUP,
      weightKg: 5 + needed,
      reps: 1,
    });
    assert.equal(atTarget.rank.label, current.nextDivision.label);
  });

  it('reports no next division at the ceiling', () => {
    const maxed = scoreLift({
      sex: 'M',
      birthDate: '1996-01-01',
      performedAt: '2026-06-15',
      bodyweightKg: 90,
      exercise: BENCH,
      weightKg: 400,
      reps: 1,
    });
    assert.equal(maxed.strengthIndex, 1000);
    assert.equal(maxed.rank.label, 'Unkillable Demon King I');
    assert.equal(maxed.nextDivision, null);
  });
});

describe('the top is meant to be out of reach', () => {
  it('needs a world-class total for the highest rank', () => {
    const refBw = REFERENCE_BODYWEIGHT_KG.M;
    const score = scoreForIndex(980, 'M', 'squat');
    const kg = (score * dotsPolynomial('M', refBw)) / 500;
    assert.ok(kg > 300, `entering the top rank should demand more than 300 kg, got ${kg}`);
  });

  it('gives the first rank up quickly', () => {
    // An untrained man squatting 0.75x bodyweight is already on the board.
    const result = scoreLift({
      sex: 'M',
      birthDate: '1996-01-01',
      performedAt: '2026-06-15',
      bodyweightKg: 90,
      exercise: { code: 'squat', type: 'external', bwFactor: 0 },
      weightKg: 67.5,
      reps: 1,
    });
    closeTo(result.strengthIndex, 100, 0.5, 'Untrained anchor');
    assert.equal(result.rank.rank, 'Bronze');
  });
});

describe('the promised kilograms are always enough', () => {
  it('adding the displayed figure reaches the next division, across the range', () => {
    const cases = [];
    for (const [sex, bodyweightKg] of [['M', 90], ['M', 72], ['F', 60], ['F', 85]]) {
      for (const exercise of [BENCH, PULLUP]) {
        for (let weightKg = exercise === BENCH ? 40 : -20; weightKg <= 200; weightKg += 7) {
          cases.push({ sex, bodyweightKg, exercise, weightKg });
        }
      }
    }

    let checked = 0;
    for (const { sex, bodyweightKg, exercise, weightKg } of cases) {
      const base = { sex, birthDate: '1996-01-01', performedAt: '2026-06-15', bodyweightKg, exercise, reps: 1 };
      const current = scoreLift({ ...base, weightKg });
      if (!current.ranked || !current.nextDivision) continue;

      const reached = scoreLift({ ...base, weightKg: weightKg + current.nextDivision.kgNeeded });
      assert.ok(
        reached.strengthIndex >= current.nextDivision.index,
        `${sex} ${bodyweightKg}kg ${exercise.code} ${weightKg}kg: ` +
          `+${current.nextDivision.kgNeeded}kg reached ${reached.strengthIndex}, ` +
          `needed ${current.nextDivision.index}`,
      );
      checked += 1;
    }

    assert.ok(checked > 100, `expected a broad sweep, only checked ${checked} cases`);
  });
});
