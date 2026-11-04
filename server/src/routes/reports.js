import { Router } from 'express';
import pool from '../../db/pool.js';
import { requireRole } from '../middleware/auth.js';
import { ApiError, logActivity, ok, paramList, str, toId, toRangeEnd, toRangeStart } from '../utils.js';
import { createReportRules } from '../validation.js';

const router = Router();

const REPORT_SELECT = `
  SELECT r.*, u."fullName" AS "userName" FROM reports r JOIN users u ON u.id = r."userId"`;

async function loadReportFor(user, id) {
  const report = (await pool.query(`${REPORT_SELECT} WHERE r.id = $1`, [id])).rows[0];
  if (!report || (user.role === 'worker' && report.userId !== user.id)) throw new ApiError(404, 'Hisobot topilmadi');
  return report;
}

router.get('/', async (req, res) => {
  const where = [];
  const { params, p } = paramList();
  if (req.user.role === 'worker') {
    where.push(`r."userId" = ${p(req.user.id)}`);
  } else {
    if (req.query.userId) where.push(`r."userId" = ${p(toId(req.query.userId))}`);
    if (str(req.query.profession)) where.push(`r.profession = ${p(str(req.query.profession))}`);
  }
  const from = toRangeStart(req.query.from);
  const to = toRangeEnd(req.query.to);
  if (from) where.push(`r."createdAt" >= ${p(from)}`);
  if (to) where.push(`r."createdAt" < ${p(to)}`);
  if (str(req.query.search)) {
    const q = p(`%${str(req.query.search).toLowerCase()}%`);
    where.push(`(LOWER(r.title) LIKE ${q} OR LOWER(r.content) LIKE ${q})`);
  }

  const { rows } = await pool.query(
    `${REPORT_SELECT} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY r."createdAt" DESC, r.id DESC`,
    params
  );
  ok(res, rows);
});

router.post('/', requireRole('worker'), createReportRules, async (req, res) => {
  const title = str(req.body.title);
  const content = str(req.body.content);
  if (!title || !content) throw new ApiError(400, 'Sarlavha va mazmun kiritilishi shart');

  const { rows } = await pool.query(
    'INSERT INTO reports ("userId", department, profession, title, content) VALUES ($1, $2, $3, $4, $5) RETURNING id',
    [req.user.id, req.user.department, req.user.profession, title, content]
  );
  const { id } = rows[0];

  await logActivity('report.create', req.user.id, id, { title, profession: req.user.profession });
  ok(res, await loadReportFor(req.user, id), 201);
});

router.get('/:id', async (req, res) => {
  ok(res, await loadReportFor(req.user, toId(req.params.id)));
});

export default router;
