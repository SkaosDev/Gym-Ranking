import { Router } from 'express';

import { all } from '../lib/db.js';
import { requireAuth } from '../middleware/requireAuth.js';

const router = Router();

/** The seeded reference table. Ordered as specified, not alphabetically. */
router.get('/', requireAuth, (req, res) => {
  res.json({
    items: all(
      'SELECT id, code, label, type, bw_factor, global_weight FROM exercises ORDER BY id',
    ),
  });
});

export default router;
