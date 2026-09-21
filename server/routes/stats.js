import { Router } from 'express';

import { get } from '../lib/db.js';
import { ApiError } from '../lib/errors.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { validateQuery } from '../middleware/validate.js';
import { bodyweightSeries, e1rmSeries, indexSeries, radarSnapshot } from '../services/stats.js';

const router = Router();
router.use(requireAuth);

const exerciseQuery = { exercise: { type: 'string', required: false, max: 30 } };

/** Resolves an optional ?exercise= filter to a code, or throws. */
function exerciseCode(req) {
  const value = req.validQuery.exercise;
  if (!value) return null;
  const found = get('SELECT code FROM exercises WHERE code = ?', [value]);
  if (!found) {
    throw ApiError.unprocessable('Some fields need attention.', { exercise: 'Unknown exercise.' });
  }
  return found.code;
}

router.get('/e1rm', validateQuery(exerciseQuery), (req, res) => {
  res.json(e1rmSeries(req.user, { exerciseCode: exerciseCode(req) }));
});

router.get('/index', validateQuery(exerciseQuery), (req, res) => {
  res.json(indexSeries(req.user, { exerciseCode: exerciseCode(req) }));
});

router.get('/radar', (req, res) => {
  res.json(radarSnapshot(req.user));
});

router.get('/bodyweight', (req, res) => {
  res.json(bodyweightSeries(req.user));
});

export default router;
