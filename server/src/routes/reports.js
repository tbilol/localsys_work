import { Router } from 'express';
import db, { logActivity } from '../db.js';
import { requireRole } from '../middleware/auth.js';
import { ApiError, DEPARTMENTS, ok, str, toId, toRangeEnd, toRangeStart } from '../utils.js';

const router = Router();

const REPORT_SELECT = `
  SELECT r.*, u.fullName AS userName FROM reports r JOIN users u ON u.id = r.userId`;

function loadReportFor(user, id) {
  const report = db.prepare(`${REPORT_SELECT} WHERE r.id = ?`).get(id);
  if (!report || (user.role === 'worker' && report.userId !== user.id)) throw new ApiError(404, 'Hisobot topilmadi');
  return report;
}

router.get('/', (req, res) => {
  const where = [];
  const params = {};
  if (req.user.role === 'worker') {
    where.push('r.userId = @me');
    params.me = req.user.id;
  } else {
    if (req.query.userId) {
      where.push('r.userId = @userId');
      params.userId = toId(req.query.userId);
    }
    if (DEPARTMENTS.includes(req.query.department)) {
      where.push('r.department = @department');
      params.department = req.query.department;
    }
  }
  const from = toRangeStart(req.query.from);
  const to = toRangeEnd(req.query.to);
  if (from) {
    where.push('r.createdAt >= @from');
    params.from = from;
  }
  if (to) {
    where.push('r.createdAt < @to');
    params.to = to;
  }
  if (str(req.query.search)) {
    where.push('(r.title LIKE @q OR r.content LIKE @q)');
    params.q = `%${str(req.query.search)}%`;
  }

  const rows = db
    .prepare(`${REPORT_SELECT} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY r.createdAt DESC, r.id DESC`)
    .all(params);
  ok(res, rows);
});

router.post('/', requireRole('worker'), (req, res) => {
  const title = str(req.body.title);
  const content = str(req.body.content);
  if (!title || !content) throw new ApiError(400, 'Sarlavha va mazmun kiritilishi shart');

  const { lastInsertRowid } = db
    .prepare('INSERT INTO reports (userId, department, title, content) VALUES (?, ?, ?, ?)')
    .run(req.user.id, req.user.department, title, content);

  logActivity('report.create', req.user.id, lastInsertRowid, { title, department: req.user.department });
  ok(res, loadReportFor(req.user, lastInsertRowid), 201);
});

router.get('/:id', (req, res) => {
  ok(res, loadReportFor(req.user, toId(req.params.id)));
});

export default router;
