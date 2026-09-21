import { Router } from 'express';

import { ApiError } from '../lib/errors.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { validateBody, validateQuery } from '../middleware/validate.js';
import {
  acceptRequest,
  declineRequest,
  listFriends,
  removeFriendship,
  requestFriendship,
  searchUsers,
} from '../services/friends.js';

const router = Router();
router.use(requireAuth);

function parseId(raw) {
  const id = Number(raw);
  if (!Number.isInteger(id) || id < 1) throw ApiError.notFound('No such friend request.');
  return id;
}

/** Incoming, outgoing and accepted in one payload, so the page needs one call. */
router.get('/', (req, res) => {
  res.json(listFriends(req.user));
});

router.get('/search', validateQuery({ q: { type: 'string', required: true, max: 20 } }), (req, res) => {
  res.json(searchUsers(req.user, req.validQuery.q));
});

router.post('/requests', validateBody({ username: { type: 'string', required: true, max: 20 } }), (req, res) => {
  const result = requestFriendship(req.user, req.valid.username);
  res.status(result.outcome === 'requested' ? 201 : 200).json(result);
});

router.post('/requests/:id/accept', (req, res) => {
  res.json(acceptRequest(req.user, parseId(req.params.id)));
});

router.post('/requests/:id/decline', (req, res) => {
  res.json(declineRequest(req.user, parseId(req.params.id)));
});

router.delete('/:id', (req, res) => {
  res.json(removeFriendship(req.user, parseId(req.params.id)));
});

export default router;
