import { Router } from 'express';
import db from '../db.js';
import { requireRole } from '../middleware/auth.js';
import { ok, str, toId, toRangeEnd, toRangeStart } from '../utils.js';

const router = Router();
router.use(requireRole('admin'));

router.get('/', (req, res) => {
  const where = [];
  const params = {};
  if (str(req.query.action)) {
    where.push('a.action = @action');
    params.action = str(req.query.action);
  }
  if (req.query.userId) {
    where.push('a.userId = @userId');
    params.userId = toId(req.query.userId);
  }
  const from = toRangeStart(req.query.from);
  const to = toRangeEnd(req.query.to);
  if (from) {
    where.push('a.createdAt >= @from');
    params.from = from;
  }
  if (to) {
    where.push('a.createdAt < @to');
    params.to = to;
  }
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
  const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const total = db.prepare(`SELECT COUNT(*) AS n FROM activity_log a ${whereSql}`).get(params).n;
  const items = db
    .prepare(
      // Entries by a deleted user keep the actor's name/role in details (see DELETE /users/:id).
      `SELECT a.*, COALESCE(u.fullName, json_extract(a.details, '$.actorName')) AS userName,
              COALESCE(u.role, json_extract(a.details, '$.actorRole')) AS userRole FROM activity_log a
       LEFT JOIN users u ON u.id = a.userId ${whereSql}
       ORDER BY a.createdAt DESC, a.id DESC LIMIT @limit OFFSET @offset`
    )
    .all({ ...params, limit, offset })
    .map((row) => ({ ...row, details: row.details ? safeParse(row.details) : null }));

  const actions = db.prepare('SELECT DISTINCT action FROM activity_log ORDER BY action').all().map((r) => r.action);

  ok(res, { items, total, limit, offset, actions });
});

function safeParse(s) {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}

export default router;
