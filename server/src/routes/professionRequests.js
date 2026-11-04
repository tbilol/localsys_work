import { Router } from 'express';
import pool from '../../db/pool.js';
import { requireRole } from '../middleware/auth.js';
import { logActivity, ok, str, toId } from '../utils.js';
import { createProfessionRequestRules } from '../validation.js';

const router = Router();
router.use(requireRole('admin', 'owner'));

// Logs a custom ("Boshqa") profession entered on the worker form, so an admin can later decide
// whether to add it to the predefined list. Also mirrored into activity_log for visibility there.
router.post('/', createProfessionRequestRules, async (req, res) => {
  const profession = str(req.body.profession);
  const message = str(req.body.message) || null;
  const targetUserId = req.body.userId ? toId(req.body.userId) : null;

  const { rows } = await pool.query(
    'INSERT INTO profession_requests ("userId", profession, message) VALUES ($1, $2, $3) RETURNING id',
    [req.user.id, profession, message]
  );

  await logActivity('profession.request', req.user.id, targetUserId, { profession, message });
  ok(res, { id: rows[0].id }, 201);
});

export default router;
