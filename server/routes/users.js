import { Router } from 'express';

import { requireAuth } from '../middleware/requireAuth.js';
import { publicProfile } from '../services/friends.js';

const router = Router();
router.use(requireAuth);

/**
 * Authorisation happens here, on the server, and the payload is scoped by the
 * queries behind publicProfile. A React component never decides what a viewer
 * is allowed to see.
 */
router.get('/:username', (req, res) => {
  res.json(publicProfile(req.user, req.params.username));
});

export default router;
