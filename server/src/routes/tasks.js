import { Router } from 'express';
import pool from '../../db/pool.js';
import { requireRole } from '../middleware/auth.js';
import {
  ApiError,
  logActivity,
  ok,
  paramList,
  PRIORITIES,
  STATUS_LABELS,
  str,
  TASK_STATUSES,
  toId,
  toRangeEnd,
  toRangeStart,
  toTs,
} from '../utils.js';
import { bulkStatusRules, createTaskRules, taskStatusRules, updateTaskRules } from '../validation.js';

const router = Router();
const defaultQuery = pool.query.bind(pool);

const TASK_SELECT = `
  SELECT t.*, w."fullName" AS "assignedToName", w.department AS "assignedToDepartment",
         w.profession AS "assignedToProfession", b."fullName" AS "assignedByName"
  FROM tasks t
  JOIN users w ON w.id = t."assignedTo"
  LEFT JOIN users b ON b.id = t."assignedBy"`;

const getTask = async (id, query = defaultQuery) => (await query(`${TASK_SELECT} WHERE t.id = $1`, [id])).rows[0];

const getHistory = async (taskId) =>
  (
    await pool.query(
      `SELECT h.*, u."fullName" AS "changedByName" FROM task_status_history h
       LEFT JOIN users u ON u.id = h."changedBy" WHERE h."taskId" = $1 ORDER BY h."createdAt" ASC, h.id ASC`,
      [taskId]
    )
  ).rows;

const addHistory = (query, taskId, fromStatus, toStatus, changedBy, note = null) =>
  query('INSERT INTO task_status_history ("taskId", "fromStatus", "toStatus", "changedBy", note) VALUES ($1, $2, $3, $4, $5)', [
    taskId,
    fromStatus,
    toStatus,
    changedBy,
    note,
  ]);

async function loadTaskFor(user, id) {
  const task = await getTask(id);
  if (!task) throw new ApiError(404, 'Vazifa topilmadi');
  if (user.role === 'worker' && task.assignedTo !== user.id) throw new ApiError(404, 'Vazifa topilmadi');
  return task;
}

async function assertActiveWorker(id) {
  const { rows } = await pool.query("SELECT id, status FROM users WHERE id = $1 AND role = 'worker'", [id]);
  if (!rows[0]) throw new ApiError(400, 'Vazifani faqat xodimga biriktirish mumkin');
  if (rows[0].status !== 'active') throw new ApiError(400, "Faol bo'lmagan xodimga vazifa biriktirib bo'lmaydi");
}

// Workers move their own tasks forward; owners/admins can set any status.
const WORKER_TRANSITIONS = {
  kutilmoqda: ['jarayonda', 'bajarildi', 'rad_etildi'],
  jarayonda: ['bajarildi', 'rad_etildi'],
  bajarildi: [],
  rad_etildi: [],
};

async function applyStatusChange(query, task, status, reason, user) {
  if (!TASK_STATUSES.includes(status)) throw new ApiError(400, "Noto'g'ri holat");
  if (task.status === status) return false;
  if (user.role === 'worker' && !WORKER_TRANSITIONS[task.status].includes(status)) {
    throw new ApiError(
      400,
      `"${STATUS_LABELS[task.status]}" holatidagi vazifani "${STATUS_LABELS[status]}" holatiga o'tkazib bo'lmaydi`
    );
  }
  const rejectionReason = status === 'rad_etildi' ? str(reason) : null;
  if (status === 'rad_etildi' && !rejectionReason) throw new ApiError(400, 'Rad etish sababini kiriting');

  await query(
    `UPDATE tasks SET status = $1, "rejectionReason" = $2,
       "completedAt" = ${status === 'bajarildi' ? 'CURRENT_TIMESTAMP' : 'NULL'}
     WHERE id = $3`,
    [status, rejectionReason, task.id]
  );
  await addHistory(query, task.id, task.status, status, user.id, rejectionReason);
  await logActivity(
    'task.status',
    user.id,
    task.id,
    { title: task.title, from: task.status, to: status, ...(rejectionReason ? { reason: rejectionReason } : {}) },
    query
  );
  return true;
}

router.get('/', async (req, res) => {
  const where = [];
  const { params, p } = paramList();
  if (req.user.role === 'worker') where.push(`t."assignedTo" = ${p(req.user.id)}`);
  else if (req.query.assignedTo) where.push(`t."assignedTo" = ${p(toId(req.query.assignedTo))}`);
  if (TASK_STATUSES.includes(req.query.status)) where.push(`t.status = ${p(req.query.status)}`);
  if (PRIORITIES.includes(req.query.priority)) where.push(`t.priority = ${p(req.query.priority)}`);
  const from = toRangeStart(req.query.from);
  const to = toRangeEnd(req.query.to);
  if (from) where.push(`t."createdAt" >= ${p(from)}`);
  if (to) where.push(`t."createdAt" < ${p(to)}`);
  if (str(req.query.search)) {
    const q = p(`%${str(req.query.search).toLowerCase()}%`);
    where.push(`(LOWER(t.title) LIKE ${q} OR LOWER(COALESCE(t.description, '')) LIKE ${q})`);
  }

  const { rows } = await pool.query(
    `${TASK_SELECT} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY t."createdAt" DESC, t.id DESC`,
    params
  );
  ok(res, rows);
});

router.post('/', requireRole('admin', 'owner'), createTaskRules, async (req, res) => {
  const title = str(req.body.title);
  const description = str(req.body.description) || null;
  const priority = str(req.body.priority) || 'orta';
  if (!title) throw new ApiError(400, 'Sarlavha kiritilishi shart');
  const assignedTo = toId(req.body.assignedTo);
  await assertActiveWorker(assignedTo);
  const deadline = toTs(req.body.deadline);

  const id = await pool.transaction(async (q) => {
    const { rows } = await q(
      `INSERT INTO tasks (title, description, priority, status, "assignedTo", "assignedBy", deadline)
       VALUES ($1, $2, $3, 'kutilmoqda', $4, $5, $6) RETURNING id`,
      [title, description, priority, assignedTo, req.user.id, deadline]
    );
    const taskId = rows[0].id;
    await addHistory(q, taskId, null, 'kutilmoqda', req.user.id);
    await logActivity('task.create', req.user.id, taskId, { title, priority, assignedTo }, q);
    return taskId;
  });

  ok(res, await getTask(id), 201);
});

router.put('/bulk/status', requireRole('admin', 'owner'), bulkStatusRules, async (req, res) => {
  const ids = [...new Set(req.body.ids.map(toId))];
  const status = str(req.body.status);
  if (status === 'rad_etildi') throw new ApiError(400, 'Ommaviy yangilashda rad etish mumkin emas');

  const updated = await pool.transaction(async (q) => {
    let n = 0;
    for (const id of ids) {
      const task = await getTask(id, q);
      if (task && (await applyStatusChange(q, task, status, null, req.user))) n++;
    }
    return n;
  });

  ok(res, { updated });
});

router.get('/:id', async (req, res) => {
  const task = await loadTaskFor(req.user, toId(req.params.id));
  ok(res, { ...task, history: await getHistory(task.id) });
});

router.put('/:id', requireRole('admin', 'owner'), updateTaskRules, async (req, res) => {
  const task = await loadTaskFor(req.user, toId(req.params.id));
  const updates = {};

  if (req.body.title !== undefined && req.body.title !== null) {
    updates.title = str(req.body.title);
    if (!updates.title) throw new ApiError(400, "Sarlavha bo'sh bo'lishi mumkin emas");
  }
  if (req.body.description !== undefined) updates.description = str(req.body.description) || null;
  if (req.body.priority) updates.priority = req.body.priority;
  if (req.body.assignedTo !== undefined) {
    const assignedTo = toId(req.body.assignedTo);
    if (assignedTo !== task.assignedTo) {
      await assertActiveWorker(assignedTo);
      updates.assignedTo = assignedTo;
    }
  }
  if (req.body.deadline !== undefined) updates.deadline = toTs(req.body.deadline);

  await pool.transaction(async (q) => {
    const keys = Object.keys(updates);
    if (keys.length) {
      const { params, p } = paramList();
      await q(`UPDATE tasks SET ${keys.map((k) => `"${k}" = ${p(updates[k])}`).join(', ')} WHERE id = ${p(task.id)}`, params);
      await logActivity('task.update', req.user.id, task.id, { title: task.title, changes: updates }, q);
    }
    if (req.body.status) {
      await applyStatusChange(q, await getTask(task.id, q), str(req.body.status), req.body.rejectionReason, req.user);
    }
  });

  ok(res, { ...(await getTask(task.id)), history: await getHistory(task.id) });
});

router.put('/:id/status', taskStatusRules, async (req, res) => {
  const task = await loadTaskFor(req.user, toId(req.params.id));
  await pool.transaction((q) =>
    applyStatusChange(q, task, str(req.body.status), req.body.rejectionReason ?? req.body.reason, req.user)
  );
  ok(res, { ...(await getTask(task.id)), history: await getHistory(task.id) });
});

export default router;
