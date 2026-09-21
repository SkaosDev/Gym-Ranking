import { Router } from 'express';

import { all, run } from '../lib/db.js';
import { ApiError } from '../lib/errors.js';
import { findUserById, ownerProfile } from '../lib/users.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { validateBody } from '../middleware/validate.js';

const router = Router();
router.use(requireAuth);

const today = () => new Date().toISOString().slice(0, 10);

router.get('/profile', (req, res) => {
  res.json(ownerProfile(req.user));
});

const profileSchema = {
  height_cm: { type: 'number', required: false, min: 100, max: 250 },
  sex: { type: 'enum', values: ['M', 'F'], required: false },
  ranks_visible_to_friends: { type: 'boolean', required: false },
};

router.patch('/profile', validateBody(profileSchema), (req, res) => {
  const updates = req.valid;
  if (Object.keys(updates).length === 0) {
    throw ApiError.badRequest('Provide at least one field to update.');
  }

  const assignments = Object.keys(updates).map((field) => `${field} = :${field}`);
  run(`UPDATE users SET ${assignments.join(', ')} WHERE id = :id`, { ...updates, id: req.user.id });

  res.json(ownerProfile(findUserById(req.user.id)));
});

router.get('/weights', (req, res) => {
  res.json({
    items: all(
      `SELECT id, weight_kg, measured_at, created_at FROM body_weights
        WHERE user_id = ? ORDER BY measured_at DESC`,
      [req.user.id],
    ),
  });
});

const weightSchema = {
  weight_kg: { type: 'number', required: true, min: 30, max: 250 },
  measured_at: { type: 'date', required: false, notFuture: true, notBefore: '1900-01-01' },
};

router.post('/weights', validateBody(weightSchema), (req, res) => {
  const measuredAt = req.valid.measured_at ?? today();

  // One weigh-in per day: logging twice on the same day corrects it rather
  // than adding a second reading.
  run(
    `INSERT INTO body_weights (user_id, weight_kg, measured_at) VALUES (?, ?, ?)
     ON CONFLICT (user_id, measured_at) DO UPDATE SET weight_kg = excluded.weight_kg`,
    [req.user.id, req.valid.weight_kg, measuredAt],
  );

  // Scores depend on bodyweight, so ranks move with this. A rank that rises
  // because someone cut weight is correct and expected.
  res.status(201).json(ownerProfile(findUserById(req.user.id)));
});

export default router;
