import { Router } from 'express';
import pool, { sql } from '../../db/pool.js';
import { requireRole } from '../middleware/auth.js';
import { ok, paramList, str, toId, toRangeEnd, toRangeStart } from '../utils.js';

const router = Router();
router.use(requireRole('admin'));

router.get('/', async (req, res) => {
  const where = [];
  const { params, p } = paramList();
  if (str(req.query.action)) where.push(`a.action = ${p(str(req.query.action))}`);
  if (req.query.userId) where.push(`a."userId" = ${p(toId(req.query.userId))}`);
  const from = toRangeStart(req.query.from);
  const to = toRangeEnd(req.query.to);
  if (from) where.push(`a."createdAt" >= ${p(from)}`);
  if (to) where.push(`a."createdAt" < ${p(to)}`);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
  const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const filterParams = [...params];

  const [total, items, actions] = await Promise.all([
    pool.query(`SELECT COUNT(*) AS n FROM activity_log a ${whereSql}`, filterParams).then((r) => r.rows[0].n),
    // Entries by a deleted user keep the actor's name/role in details (see DELETE /users/:id).
    pool
      .query(
        `SELECT a.*, COALESCE(u."fullName", ${sql.jsonText('a.details', 'actorName')}) AS "userName",
                COALESCE(u.role, ${sql.jsonText('a.details', 'actorRole')}) AS "userRole"
         FROM activity_log a LEFT JOIN users u ON u.id = a."userId" ${whereSql}
         ORDER BY a."createdAt" DESC, a.id DESC LIMIT ${p(limit)} OFFSET ${p(offset)}`,
        params
      )
      .then((r) => r.rows.map((row) => ({ ...row, details: row.details ? safeParse(row.details) : null }))),
    pool.query('SELECT DISTINCT action FROM activity_log ORDER BY action').then((r) => r.rows.map((x) => x.action)),
  ]);

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
