# The maths behind a GymRank rank

Every number GymRank shows comes from a published formula or a published table,
applied to one set of yours. This document gives each one, where it comes from,
and — the part that matters most — what it cannot tell you.

The engine lives in [`server/lib/scoring.js`](server/lib/scoring.js). It is a
pure module: no database, no clock, explicit inputs and outputs, so all of it
can be checked on its own. Every constant and every table is in
[`server/lib/scoring-config.js`](server/lib/scoring-config.js).

A set becomes a rank in six steps:

```
bar load, or bodyweight share + added weight
        ↓  effective load
estimated 1RM               Epley + Brzycki (barbell) or Epley (bodyweight)
        ↓
age-adjusted 1RM            × Foster or McCulloch coefficient
        ↓
standards at YOUR weight    Strength Level tables, interpolated by bodyweight
        ↓
strength index 0–1000       interpolated between those standards
        ↓
rank and division           Iron V … Unkillable Demon King I
```

Scores are never stored: they are recomputed from the raw sets every time they
are read, so a correction to any table here applies to the whole history at
once.

---

## Step 1 — Effective load

```
barbell lifts      load = weight on the bar
bodyweight lifts   load = bw_factor × bodyweight + added weight
```

`bw_factor` is the fraction of bodyweight the movement actually moves:

| Exercise | `bw_factor` | Why |
|---|---|---|
| Pull-up, dip | 1.00 | the whole body is lifted; Strength Level's own rep and 1RM tables only reconcile with the full bodyweight |
| Push-up | 0.64 | force-plate measurement of the standard push-up (Ebben et al. 2011). Suprak et al. 2011 report 69% at the top and 75% at the bottom; 0.64 is the whole-movement figure |
| Squat, bench, deadlift, overhead press | 0 | the bar is the load |

Added weight may be negative, for band assistance. If the effective load comes
out at zero or less the set is stored but not scored.

**Limitation.** A single factor per exercise ignores limb lengths. For a
weighted push-up, the plate is counted in full; no study measures how much of a
plate on the back the hands actually carry, so this is an assumption — a
conservative one, since it can only make a weighted push-up look *less*
impressive than counting a fraction would.

---

## Step 2 — Estimated one-rep max

One rep is already a maximum, so it is used unchanged.

**Barbell lifts, 2 to 12 reps** — the mean of two formulas:

```
Epley     1RM = load × (1 + reps / 30)                 Epley, 1985
Brzycki   1RM = load × 36 / (37 − reps)                Brzycki, 1993
```

They are averaged because they err in opposite directions. At exactly ten reps
they coincide — both give 133.33 kg for 100 kg × 10, and a test pins that.
**Above 12 reps a barbell set does not feed the rank**: the two formulas
diverge by 15–20% and the set measures endurance, not maximal strength. It is
still stored and shown in your history.

**Bodyweight movements, up to 100 reps** — Epley alone:

```
1RM = load × (1 + reps / 30)
```

This is not a convenience. Strength Level publishes both rep standards
("14 pull-ups is Intermediate") and 1RM standards ("+31 kg is Intermediate"),
and the two convert into each other almost exactly with Epley on the total
load: a 70 kg man doing 14 pull-ups gives 70 × (1 + 14/30) = 102.7 kg, against
their 70 + 31 = 101 kg. Using the same formula keeps fifteen strict pull-ups
and three weighted ones on the same scale as the standards they are compared
with. Brzycki cannot be used here at all: it reaches zero at 37 reps.

**Limitation.** All rep-based formulas were fitted on sets of roughly 1–10
reps. Measured 20-rep sets sit at about 62% of 1RM (Reynolds et al. 2006),
which Epley matches (60%); past about 25 reps no formula has been validated.
For push-ups that is acceptable only because the standards themselves were
converted the same way — the score compares like with like. A push-up "1RM"
of 180 kg is a bookkeeping number, never a lift anyone is told to attempt.

---

## Step 3 — Age adjustment

```
adjusted 1RM = estimated 1RM × age coefficient
```

Age is taken **as of the day of the performance**, not today, so last year's
training is scored against last year's you.

| Age | Coefficient | Table |
|---|---|---|
| 14–23 | 1.23 down to 1.00 | Foster |
| 24–39 | 1.00 | peak maximal strength; no adjustment |
| 40–90 | 1.000 up to 2.549 | McCulloch |

Both are the tables used by USA Powerlifting. Below 14 no published table
applies, so account creation is refused. Above 90 the value for 90 is used.

**Limitation.** These coefficients describe how a *population* of competitive
lifters declines with age. A 60-year-old's ×1.340 is a statement about
60-year-olds in general, not a measurement of what age has cost you.

---

## Step 4 — The standards at your bodyweight

This is the step that makes a rank personal. For every exercise and both sexes,
GymRank carries a table of strength standards **by bodyweight, every 10 kg**,
and reads it at your exact weight.

### Where the numbers come from

The five measured levels are [Strength Level](https://strengthlevel.com/strength-standards)'s,
fetched in October 2026. They are built from about seven million logged lifts
(the squat page alone: 7,039,938 qualifying results out of 24,988,444), and
each level is a percentile:

| Level | Stronger than | Strength Level's definition |
|---|---|---|
| Beginner | 5% of lifters | can perform the movement correctly, practised for at least a month |
| Novice | 20% | trained regularly for at least six months |
| Intermediate | 50% | trained regularly for at least two years |
| Advanced | 80% | progressed for over five years |
| Elite | 95% | dedicated over five years to become competitive at strength sports |

They were cross-checked against two independent sources:

- **ExRx** (the Kilgore / Rippetoe / Pendlay tables). Elite and Advanced agree
  within ±5% for men up to 90 kg. ExRx's Intermediate runs 10–20% lower, so
  Strength Level is, if anything, slightly demanding in the middle.
- **OpenPowerlifting** raw IPF records, which set the sixth level (below).

The tables are stored in three forms, depending on what Strength Level
publishes for the exercise:

| Exercise | Stored as | Read as kilograms |
|---|---|---|
| Squat, bench, deadlift, overhead press | 1RM in kg | as is |
| Pull-up, dip | 1RM as weight *added* to bodyweight (negative = assisted) | bodyweight + added |
| Push-up | strict reps at bodyweight (no loaded table exists) | Epley(0.64 × bodyweight, reps) |

### Reading the table at your weight

Between two listed bodyweights the values are interpolated linearly. Below the
lightest or above the heaviest listed bodyweight (50–120 kg for men's barbell
lifts, 40–100 kg for women's; 50–100 / 40–90 for bodyweight movements) the
line through the two nearest rows is extended, and the set carries a flag
saying so.

Men's back squat, straight from the table:

| Bodyweight | Beginner | Novice | Intermediate | Advanced | Elite |
|---|---|---|---|---|---|
| 60 kg | 49 | 71 | 98 | 129 | 162 |
| 70 kg | 62 | 86 | 116 | 149 | 185 |
| 90 kg | 87 | 115 | 148 | 186 | 226 |
| 120 kg | 120 | 152 | 191 | 233 | 278 |

A heavier lifter needs more kilograms, but a *smaller multiple of bodyweight*:
Intermediate is 1.63 × bodyweight at 60 kg and 1.59 × at 120 kg on the squat,
and the gap widens on the presses. That is the non-linearity of strength
against body mass, taken from measured data rather than from a formula.

### The sixth level: World-class

Raw IPF records divided by Strength Level's Elite at the same bodyweight come
out at **1.54–1.60** for all three powerlifts, for men around 80 kg and women
around 60 kg. World-class is therefore Elite × 1.55 (squat, bench), × 1.6
(deadlift) and × 1.5 (overhead press, which is not a competition lift and takes
the same order by analogy). For a 90 kg man that puts World-class at 350 kg on
the squat, against a raw record of 340 kg at that class.

For bodyweight movements the factor applies only to the part above bodyweight:
`World-class = base + 1.5 × (Elite − base)`. A 72 kg man's world-class pull-up
is then about +108 kg, which is where weighted pull-up records sit.

---

## Step 5 — Strength index, 0 to 1000

The adjusted 1RM is placed on a fixed 0–1000 scale by linear interpolation
between the six standards of step 4:

| Standard | Index |
|---|---|
| (nothing lifted) | 0 |
| Beginner | 100 |
| Novice | 250 |
| Intermediate | 450 |
| Advanced | 650 |
| Elite | 825 |
| World-class | 1000 |

Above World-class the index caps at 1000.

The uneven spacing is deliberate. The first rank arrives within weeks of
starting, so the app is encouraging early. Each later tier costs progressively
more real kilograms, and the Elite → World-class gap is wide enough that the
top is unreachable without competing internationally: a 90 kg man needs
**336 kg** on the squat to enter the top rank.

**Limitation — the softest part of the system.** Strength Level's data is
self-reported by people who use a lifting app. It is large and consistent, but
it describes *people who log their training*, not the population at large, and
nobody checks the entries. The percentiles are "of lifters", not "of people".

---

## Step 6 — Ranks and divisions

Each rank starts exactly on a standard, so a badge means something concrete:

| Rank | Index | Meaning |
|---|---|---|
| Iron | 0–99 | below the beginner standard |
| Bronze | 100–249 | beginner, stronger than about 5% of lifters |
| Silver | 250–449 | novice, stronger than about 20% of lifters |
| Gold | 450–649 | intermediate, stronger than about half of lifters |
| Platinum | 650–824 | advanced, stronger than about 80% of lifters |
| Diamond | 825–924 | elite, stronger than about 95% of lifters |
| Master | 925–979 | national-level competitor |
| Unkillable Demon King | 980–1000 | world-record territory |

Each rank splits into five equal divisions, **V** to **I**, with I the highest.
The division arithmetic is `(max + 1 − min) / 5`, so Silver's 200 points give
divisions of 40: Silver V is 250–289, Silver I is 410–449. The displayed index
is always rounded **down**, because rounding 409.5 up to 410 beside a Silver II
badge reads as a bug.

**What the next division takes.** The engine inverts step 5 at your current
bodyweight and age, and divides the age coefficient back out, so the figure is
in real kilograms. For barbell lifts the dashboard says "+4.2 kg on your best";
for bodyweight movements it says "**25 reps** in one set", the strict reps at
bodyweight that reach the target. Both are rounded up, so the promise is never
short.

---

## Step 7 — The overall rank

```
for each exercise whose global_weight > 0:
    use the best index of the last 120 days
    if there is none, use the all-time best, decayed
overall = mean weighted by global_weight
```

| Exercise | Weight |
|---|---|
| Squat, bench press, deadlift | 1.0 |
| Overhead press, pull-up | 0.5 |
| Dip, push-up | 0 (tracked, not counted) |

The overall rank appears only once **at least three of the five weighted
exercises** have data.

**Decay.** Beyond the 120-day window a best decays 0.5% per week, compounded,
with a floor at 60% of its value:

| Time since the best | Factor |
|---|---|
| Up to 120 days | 1.000 |
| 127 days | 0.995 |
| 1 year | 0.839 |
| 2 years | 0.646 |
| ~10 years and beyond | 0.600 (floor) |

A *recent* best always wins over a better stale one. In an app with no
leaderboard, decay is the only thing standing between a rank and a trophy you
won once and keep forever.

---

## Guard rails

**Ranges are enforced on the server**: bodyweight 30–250 kg, height 100–250 cm,
load 0–500 kg (negative only as band assistance on bodyweight movements), reps
1–100, and no performance dated in the future or before your 14th birthday.

**Implausible jumps are held back.** A set implying a 1RM more than 25% above
your best confirmed effort on that exercise is stored, shown, and **excluded
from your rank** until a second set reaches 90% of it or you confirm it by hand.

---

## Two consequences worth understanding

### Your rank changes when your bodyweight changes

Every set is judged against the standards of the bodyweight you had **on that
day**. The same training, a 25-year-old man going from 75 kg to 70 kg:

| Set | at 75 kg | at 70 kg | |
|---|---|---|---|
| Squat 100 × 5 | 388 | 441 | ↑ |
| Bench 70 × 5 | 347 | 404 | ↑ |
| **Pull-up × 10** | **374** | **365** | **↓** |
| **Push-up × 30** | **355** | **350** | **↓** |

The barbell lifts rise because the same bar is a better lift for a lighter
person. **The bodyweight movements fall**, because a lighter person moving their
own body is moving less. Both directions come from the same tables being
honest.

### Heavier lifters are not punished on bodyweight movements

One strict pull-up for a 25-year-old man scores 140 at 60 kg, 119 at 80 kg and
125 at 100 kg. Strength Level's data shows the heaviest lifters need slightly
*less* added weight relative to their mass, and hauling 100 kg over a bar is a
real feat. The scale reflects that rather than assuming strength grows in
proportion to mass.

---

## The reference cases

These are the worked examples the test suite asserts.

### Case 1 — Man, 25, 90 kg. Bench press 100 kg × 5

| | |
|---|---|
| Effective load | 100 kg |
| Epley | 100 × (1 + 5/30) = 116.67 kg |
| Brzycki | 100 × 36/32 = 112.50 kg |
| Estimated 1RM | 114.58 kg |
| Age coefficient | ×1.00 (age 24–39) |
| Standards at 90 kg | 65 / 85 / **109** / **137** / 165 / 255.8 kg |
| Index | 450 + 200 × (114.58 − 109) / (137 − 109) = **489.9** |
| Rank | **Gold V** |

### Case 2 — Woman, 20, 50 kg. One strict pull-up

| | |
|---|---|
| Effective load | 1.00 × 50 + 0 = 50 kg |
| Estimated 1RM | 50 kg (a single rep is its own maximum) |
| Age coefficient | ×1.03 (Foster, age 20) |
| Adjusted 1RM | 51.5 kg |
| Standards at 50 kg | 36 / **46** / **58** / 71 / 85 / 102.5 kg (bodyweight + added) |
| Index | **341.7** |
| Rank | **Silver III** |

### Case 3 — Man, 60, 90 kg. One strict pull-up

| | |
|---|---|
| Effective load | 1.00 × 90 + 0 = 90 kg |
| Age coefficient | ×1.340 (McCulloch, age 60) |
| Adjusted 1RM | 120.6 kg |
| Standards at 90 kg | 88 / **105** / **125** / 147 / 169 / 208.5 kg |
| Index | **406.0** |
| Rank | **Silver II** |

### Case 4 — Man, 25, 72 kg. Push-ups with 20 kg × 10

The case that exposed the previous calibration, which rated it world-class.

| | |
|---|---|
| Effective load | 0.64 × 72 + 20 = 66.08 kg |
| Estimated 1RM | 66.08 × (1 + 10/30) = 88.11 kg |
| Standards at 72 kg | 54.1 / **76.8** / **106.9** / 143.2 / 181.2 / 248.8 kg |
| … the same as reps | 5 / **20** / **40** / 63 / 88 / 132 strict push-ups |
| Index | **325.1** |
| Rank | **Silver IV** — equivalent to about 27 strict push-ups |

---

## What changed, and why

An earlier version normalised every lift with the **DOTS** powerlifting
coefficient and compared it with standards expressed as bodyweight multiples
at a single reference bodyweight (90 kg for men, 65 kg for women). Two things
were wrong with it:

1. **The push-up standards were in the wrong unit.** They were multiples of
   bodyweight (0.5 to 1.1), but the effective load already included 70% of
   bodyweight, so a *single* push-up landed at Advanced and ten reps at Elite.
   A 72 kg man doing +20 kg × 10 was rated world-class.
2. **One reference bodyweight per sex.** DOTS was fitted on powerlifting
   *totals*, never on single lifts, let alone on push-ups; using it to move
   standards from a 90 kg reference to a 60 kg lifter was an extrapolation
   nobody had validated.

Reading measured, per-bodyweight standards directly removes both problems: no
coefficient sits between your lift and the data, and the standards for a 72 kg
lifter are the ones measured for 70–80 kg lifters.

---

## Sources

| Input | Source |
|---|---|
| Strength standards, all seven exercises | Strength Level, strengthlevel.com/strength-standards (squat, bench-press, deadlift, shoulder-press, pull-ups, dips, push-ups), fetched October 2026 |
| Cross-check of the barbell standards | ExRx.net, Kilgore / Rippetoe / Pendlay strength standards |
| World-class level | OpenPowerlifting, raw IPF-and-affiliates records |
| Push-up bodyweight share | Ebben W. et al. (2011), *Kinetic analysis of several variations of push-ups*, J Strength Cond Res 25(10):2891; Suprak D. et al. (2011), J Strength Cond Res 25(2):497 |
| High-rep 1RM accuracy | Reynolds J. et al. (2006), *Prediction of one repetition maximum strength from multiple repetition maximum testing*, J Strength Cond Res 20(3):584 |
| Epley formula | Epley, 1985 |
| Brzycki formula | Brzycki, 1993 |
| Foster coefficients (14–23) | Age-adjustment table used by USA Powerlifting |
| McCulloch coefficients (40+) | Age-adjustment table used by USA Powerlifting |

---

## What this is not

GymRank estimates. It does not measure. Every number here rests on
population-level data applied to one person, and the weakest link — the
standards themselves, self-reported by app users — is the one that decides
which badge you see.

It is not medical advice, not a training programme, and not a reason to attempt
a one-rep max. If the number disagrees with how strong you feel, the number is
the thing that is more likely to be wrong.
