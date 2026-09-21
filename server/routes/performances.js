import { Router } from 'express';

import { get } from '../lib/db.js';
import { ApiError } from '../lib/errors.js';
import { effectiveLoad, ageOn } from '../lib/scoring.js';
import { MIN_AGE } from '../lib/scoring-config.js';
import { bodyweightOn } from '../lib/users.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { validateBody, validateQuery } from '../middleware/validate.js';
import {
  confirmPerformance,
  createPerformance,
  deletePerformance,
  getScoredPerformance,
  listPerformances,
  updatePerformance,
} from '../services/performances.js';

const router = Router();
router.use(requireAuth);

const createSchema = {
  exercise_id: { type: 'integer', required: true, min: 1 },
  // Negative values are legitimate for band-assisted bodyweight work; the
  // per-exercise rules below narrow this.
  weight_kg: { type: 'number', required: true, min: -200, max: 500 },
  reps: { type: 'integer', required: true, min: 1, max: 100 },
  performed_at: { type: 'date', required: true, notFuture: true, notBefore: '1900-01-01' },
  notes: { type: 'string', required: false, max: 500 },
};

const updateSchema = Object.fromEntries(
  Object.entries(createSchema).map(([field, rule]) => [field, { ...rule, required: false }]),
);

const listQuerySchema = {
  exercise: { type: 'string', required: false, max: 30 },
  page: { type: 'integer', required: false, min: 1, default: 1 },
  per_page: { type: 'integer', required: false, min: 1, max: 100, default: 20 },
  sort: { type: 'enum', values: ['date_desc', 'date_asc'], required: false, default: 'date_desc' },
};

function parseId(raw) {
  const id = Number(raw);
  if (!Number.isInteger(id) || id < 1) throw ApiError.notFound('No such performance.');
  return id;
}

function requireExercise(exerciseId) {
  const exercise = get('SELECT * FROM exercises WHERE id = ?', [exerciseId]);
  if (!exercise) {
    throw ApiError.unprocessable('Some fields need attention.', {
      exercise_id: 'Unknown exercise.',
    });
  }
  return exercise;
}

/**
 * Rules that need the exercise and the user, so they cannot live in the
 * declarative schema. All of them are enforced here, on the server.
 */
function assertConsistent(user, exercise, values) {
  const fields = {};

  if (exercise.type === 'external' && values.weight_kg < 0) {
    fields.weight_kg = 'An external lift cannot carry a negative load.';
  }

  if (ageOn(user.birth_date, values.performed_at) < MIN_AGE) {
    fields.performed_at = `This date is before your ${MIN_AGE}th birthday.`;
  }

  // Only when the load itself is not already at fault, so the specific message
  // is not overwritten by the general one.
  const weight = fields.weight_kg ? null : bodyweightOn(user.id, values.performed_at);
  if (weight) {
    const load = effectiveLoad({
      type: exercise.type,
      bwFactor: exercise.bw_factor,
      bodyweightKg: weight.weight_kg,
      weightKg: values.weight_kg,
    });
    if (load <= 0) {
      fields.weight_kg = 'With that much assistance the effective load is zero or less.';
    }
  }

  if (Object.keys(fields).length > 0) {
    throw ApiError.unprocessable('Some fields need attention.', fields);
  }
}

router.get('/', validateQuery(listQuerySchema), (req, res) => {
  const { exercise, page, per_page: perPage, sort } = req.validQuery;

  let exerciseId = null;
  if (exercise) {
    // Accepts a code such as "squat", or a numeric id.
    const found = /^\d+$/.test(exercise)
      ? get('SELECT id FROM exercises WHERE id = ?', [Number(exercise)])
      : get('SELECT id FROM exercises WHERE code = ?', [exercise]);
    if (!found) {
      throw ApiError.unprocessable('Some fields need attention.', {
        exercise: 'Unknown exercise.',
      });
    }
    exerciseId = found.id;
  }

  res.json(listPerformances(req.user, { exerciseId, page, perPage, sort }));
});

router.post('/', validateBody(createSchema), (req, res) => {
  const exercise = requireExercise(req.valid.exercise_id);
  assertConsistent(req.user, exercise, req.valid);
  res.status(201).json(createPerformance(req.user, exercise, req.valid));
});

router.get('/:id', (req, res) => {
  res.json(getScoredPerformance(req.user, parseId(req.params.id)));
});

router.patch('/:id', validateBody(updateSchema), (req, res) => {
  const id = parseId(req.params.id);
  if (Object.keys(req.valid).length === 0) {
    throw ApiError.badRequest('Provide at least one field to update.');
  }

  const existing = get('SELECT * FROM performances WHERE id = ? AND user_id = ?', [id, req.user.id]);
  if (!existing) throw ApiError.notFound('No such performance.');

  const exercise = requireExercise(req.valid.exercise_id ?? existing.exercise_id);
  assertConsistent(req.user, exercise, {
    weight_kg: req.valid.weight_kg ?? existing.weight_kg,
    reps: req.valid.reps ?? existing.reps,
    performed_at: req.valid.performed_at ?? existing.performed_at,
  });

  res.json(updatePerformance(req.user, id, exercise, req.valid));
});

router.delete('/:id', (req, res) => {
  deletePerformance(req.user, parseId(req.params.id));
  res.json({ ok: true });
});

/** The owner vouching for a set that was held back as a suspicious jump. */
router.post('/:id/confirm', (req, res) => {
  res.json(confirmPerformance(req.user, parseId(req.params.id)));
});

export default router;
