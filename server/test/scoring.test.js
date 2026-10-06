import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  FOSTER_COEFFICIENTS,
  MCCULLOCH_COEFFICIENTS,
  STANDARDS,
} from '../lib/scoring-config.js';
import {
  ageCoefficientForAge,
  ageOn,
  brzycki,
  effectiveLoad,
  epley,
  estimate1rm,
  estimate1rmBodyweight,
  indexToRank,
  kgForIndex,
  scoreLift,
  standardsFor,
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

const PUSHUP = { code: 'pushup', type: 'bodyweight', bwFactor: 0.64 };

describe('standards at the lifter\'s bodyweight', () => {
  it('returns the published table values exactly on a listed bodyweight', () => {
    // Strength Level, men's bench at 90 kg: 65 / 85 / 109 / 137 / 165.
    assert.deepEqual(standardsFor('M', 'bench', 90).anchorsKg.slice(0, 5), [65, 85, 109, 137, 165]);
  });

  it('interpolates between two listed bodyweights', () => {
    // Halfway between 70 kg (116) and 80 kg (132) on the men's squat.
    closeTo(standardsFor('M', 'squat', 75).anchorsKg[2], 124, 1e-9, 'Intermediate squat at 75 kg');
  });

  it('asks more of a heavier lifter in kilograms, less per kilogram of bodyweight', () => {
    const light = standardsFor('M', 'deadlift', 60).anchorsKg[2];
    const heavy = standardsFor('M', 'deadlift', 110).anchorsKg[2];
    assert.ok(heavy > light, 'more absolute weight for the heavier lifter');
    assert.ok(heavy / 110 < light / 60, 'but a smaller multiple of bodyweight');
  });

  it('reads pull-up and dip standards as weight added to bodyweight', () => {
    // Men at 70 kg: Intermediate pull-up is +31 kg, so 101 kg in total.
    assert.equal(standardsFor('M', 'pullup', 70).anchorsKg[2], 101);
  });

  it('reads push-up standards as reps, converted with Epley at the bodyweight share', () => {
    // Men at 70 kg: Intermediate is 40 strict push-ups.
    const base = 0.64 * 70;
    closeTo(standardsFor('M', 'pushup', 70, 0.64).anchorsKg[2], epley(base, 40), 1e-9, '40 push-ups');
  });

  it('rises strictly across the six anchors for every table and bodyweight', () => {
    for (const [sex, byExercise] of Object.entries(STANDARDS)) {
      for (const code of Object.keys(byExercise)) {
        for (let bw = 35; bw <= 160; bw += 5) {
          const { anchorsKg } = standardsFor(sex, code, bw, code === 'pushup' ? 0.64 : 1);
          assert.equal(anchorsKg.length, 6, `${sex}/${code}`);
          for (let i = 1; i < anchorsKg.length; i += 1) {
            assert.ok(anchorsKg[i] > anchorsKg[i - 1], `${sex}/${code} at ${bw} kg, anchor ${i}`);
          }
        }
      }
    }
  });

  it('flags a bodyweight outside the published tables, and still scores it', () => {
    const result = scoreLift({
      sex: 'M',
      birthDate: '1996-01-01',
      performedAt: '2026-06-15',
      bodyweightKg: 150,
      exercise: BENCH,
      weightKg: 100,
      reps: 1,
    });
    assert.equal(result.ranked, true);
    assert.ok(result.flags.some((f) => f.code === 'BODYWEIGHT_OUTSIDE_TABLE'));
  });

  it('returns null for an exercise with no published standards', () => {
    assert.equal(standardsFor('M', 'not-an-exercise', 80), null);
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

  it('uses Epley alone for bodyweight movements, up to 100 reps', () => {
    closeTo(estimate1rmBodyweight(70, 14), epley(70, 14), 1e-9, '14 pull-ups');
    closeTo(estimate1rmBodyweight(45, 60), epley(45, 60), 1e-9, '60 push-ups');
    assert.equal(estimate1rmBodyweight(45, 101), null);
  });

  it('keeps a high-rep barbell set in the history but out of the rank', () => {
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

describe('strength index', () => {
  const anchors = standardsFor('M', 'squat', 90).anchorsKg;

  it('places an anchor exactly on its index', () => {
    closeTo(strengthIndex(anchors[2], anchors), 450, 1e-9, 'Intermediate');
    closeTo(strengthIndex(anchors[4], anchors), 825, 1e-9, 'Elite');
  });

  it('rises monotonically with the lift and caps at 1000', () => {
    let previous = -1;
    for (let kg = 0; kg <= 400; kg += 0.5) {
      const index = strengthIndex(kg, anchors);
      assert.ok(index >= previous, `index dropped at ${kg} kg`);
      assert.ok(index <= 1000, `index exceeded 1000 at ${kg} kg`);
      previous = index;
    }
    assert.equal(strengthIndex(10_000, anchors), 1000);
    assert.equal(strengthIndex(0, anchors), 0);
    assert.equal(strengthIndex(-5, anchors), 0);
  });

  it('inverts exactly', () => {
    const deadlift = standardsFor('M', 'deadlift', 80).anchorsKg;
    for (const index of [1, 100, 190.6, 250, 402, 459.3, 650, 825, 999]) {
      closeTo(strengthIndex(kgForIndex(index, deadlift), deadlift), index, 1e-6, `round trip at ${index}`);
    }
  });

  it('returns null without standards', () => {
    assert.equal(strengthIndex(100, null), null);
  });
});

describe('ranks and divisions', () => {
  it('places every band boundary on the right rank and division', () => {
    const expected = [
      [0, 'Iron IV'], [99, 'Iron I'],
      [100, 'Bronze IV'], [249, 'Bronze I'],
      [250, 'Silver IV'], [449, 'Silver I'],
      [450, 'Gold IV'], [649, 'Gold I'],
      [650, 'Platinum IV'], [824, 'Platinum I'],
      [825, 'Diamond IV'], [924, 'Diamond I'],
      [925, 'Master IV'], [979, 'Master I'],
      [980, 'Unkillable Demon King IV'], [1000, 'Unkillable Demon King I'],
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
    assert.equal(indexToRank(449).nextDivision.label, 'Gold IV');
    assert.equal(indexToRank(979).nextDivision.label, 'Unkillable Demon King IV');
    assert.equal(indexToRank(1000).nextDivision, null);
  });

  it('reports position within the division', () => {
    assert.equal(indexToRank(450).withinDivisionPct, 0);
    assert.equal(indexToRank(470).withinDivisionPct, 40);
    closeTo(indexToRank(489).withinDivisionPct, 78, 0.1, 'most of the way through Gold IV');
  });
});

describe('reference cases', () => {
  it('man, 25, 90 kg, bench 100 kg x 5 -> Gold IV', () => {
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
    assert.equal(result.ageCoefficient, 1);
    // 114.58 kg sits between Intermediate (109) and Advanced (137) at 90 kg.
    closeTo(result.strengthIndex, 489.9, 0.1, 'index');
    assert.equal(result.rank.label, 'Gold IV');
  });

  it('woman, 20, 50 kg, one strict pull-up -> Silver III', () => {
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
    assert.equal(result.ageCoefficient, 1.03);
    closeTo(result.adjustedE1rmKg, 51.5, 0.01, 'age-adjusted');
    closeTo(result.strengthIndex, 341.7, 0.1, 'index');
    assert.equal(result.rank.label, 'Silver III');
  });

  it('man, 60, 90 kg, one strict pull-up -> Silver I', () => {
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
    assert.equal(result.ageCoefficient, 1.34);
    closeTo(result.adjustedE1rmKg, 120.6, 0.01, 'age-adjusted');
    closeTo(result.strengthIndex, 406.0, 0.1, 'index');
    assert.equal(result.rank.label, 'Silver I');
  });

  it('man, 25, 72 kg, push-ups with 20 kg x 10 -> Silver III, not the top rank', () => {
    // The case that exposed the old calibration, which made this world-class.
    const result = scoreLift({
      sex: 'M',
      birthDate: '2001-01-01',
      performedAt: '2026-06-15',
      bodyweightKg: 72,
      exercise: PUSHUP,
      weightKg: 20,
      reps: 10,
    });
    closeTo(result.effectiveLoadKg, 66.08, 0.01, 'effective load');
    closeTo(result.strengthIndex, 325.1, 0.1, 'index');
    assert.equal(result.rank.label, 'Silver III');
  });

  it('scores bodyweight push-ups like the published rep standards', () => {
    const at = (reps) =>
      scoreLift({
        sex: 'M',
        birthDate: '2001-01-01',
        performedAt: '2026-06-15',
        bodyweightKg: 70,
        exercise: PUSHUP,
        weightKg: 0,
        reps,
      }).strengthIndex;
    // Men at 70 kg: Novice 20, Intermediate 40, Elite 89 push-ups.
    closeTo(at(20), 250, 0.1, 'Novice');
    closeTo(at(40), 450, 0.1, 'Intermediate');
    closeTo(at(89), 825, 0.1, 'Elite');
  });

  it('rates the same apparent pull-up higher for the older, heavier lifter', () => {
    const common = { performedAt: '2026-06-15', exercise: PULLUP, weightKg: 0, reps: 1 };
    const youngWoman = scoreLift({ ...common, sex: 'F', birthDate: '2006-01-01', bodyweightKg: 50 });
    const olderMan = scoreLift({ ...common, sex: 'M', birthDate: '1966-01-01', bodyweightKg: 90 });
    assert.ok(olderMan.strengthIndex > youngWoman.strengthIndex);
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

  it('gives the strict reps at bodyweight for a bodyweight movement', () => {
    const current = scoreLift({
      sex: 'M',
      birthDate: '1996-01-01',
      performedAt: '2026-06-15',
      bodyweightKg: 70,
      exercise: PUSHUP,
      weightKg: 0,
      reps: 25,
    });
    const reps = current.nextDivision.bodyweightReps;
    assert.ok(reps > 25, `the next division needs more than 25 reps, got ${reps}`);
    const atTarget = scoreLift({
      sex: 'M',
      birthDate: '1996-01-01',
      performedAt: '2026-06-15',
      bodyweightKg: 70,
      exercise: PUSHUP,
      weightKg: 0,
      reps,
    });
    assert.ok(atTarget.strengthIndex >= current.nextDivision.index);
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
  it('needs a world-record squat for the highest rank', () => {
    const kg = kgForIndex(980, standardsFor('M', 'squat', 90).anchorsKg);
    assert.ok(kg > 320, `entering the top rank should demand more than 320 kg, got ${kg}`);
  });

  it('gives the first rank up at the beginner standard', () => {
    // Strength Level's Beginner squat for a 90 kg man is 87 kg.
    const result = scoreLift({
      sex: 'M',
      birthDate: '1996-01-01',
      performedAt: '2026-06-15',
      bodyweightKg: 90,
      exercise: { code: 'squat', type: 'external', bwFactor: 0 },
      weightKg: 87,
      reps: 1,
    });
    closeTo(result.strengthIndex, 100, 0.5, 'Beginner anchor');
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
