-- Seed the exercise reference table. Idempotent on code, so re-running leaves
-- existing rows and their foreign keys untouched.
--
-- bw_factor 0.70 for push-ups: force-plate studies report roughly 69% of
-- bodyweight in the up position and 75% in the down position, so 0.70 is the
-- usual midpoint. Pull-ups and dips move essentially the whole body.

INSERT OR IGNORE INTO exercises (code, label, type, bw_factor, global_weight) VALUES
  ('squat',    'Back Squat',      'external',   0.00, 1.0),
  ('bench',    'Bench Press',     'external',   0.00, 1.0),
  ('deadlift', 'Deadlift',        'external',   0.00, 1.0),
  ('ohp',      'Overhead Press',  'external',   0.00, 0.5),
  ('pullup',   'Pull-up',         'bodyweight', 1.00, 0.5),
  ('dip',      'Dip',             'bodyweight', 1.00, 0.0),
  ('pushup',   'Push-up',         'bodyweight', 0.70, 0.0);
