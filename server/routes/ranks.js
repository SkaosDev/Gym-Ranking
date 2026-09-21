import { Router } from 'express';

import { get } from '../lib/db.js';
import { ApiError } from '../lib/errors.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { explainPerformance } from '../services/explain.js';
import { computeRanks } from '../services/ranks.js';

const router = Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  res.json(computeRanks(req.user));
});

/**
 * `latest` resolves to the most recent performance, so the explanation page
 * has something to show without the client hunting for an id first.
 */
router.get('/explain/:perfId', (req, res) => {
  let id;

  if (req.params.perfId === 'latest') {
    const row = get(
      `SELECT id FROM performances WHERE user_id = ?
        ORDER BY performed_at DESC, id DESC LIMIT 1`,
      [req.user.id],
    );
    if (!row) throw ApiError.notFound('You have not logged a performance yet.');
    id = row.id;
  } else {
    id = Number(req.params.perfId);
    if (!Number.isInteger(id) || id < 1) throw ApiError.notFound('No such performance.');
  }

  res.json(explainPerformance(req.user, id));
});

export default router;
