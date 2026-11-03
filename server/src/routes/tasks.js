import { Router } from 'express';
import db, { logActivity } from '../db.js';
import { requireRole } from '../middleware/auth.js';
import {
  ApiError,
  ok,
  PRIORITIES,
  STATUS_LABELS,
  str,
  TASK_STATUSES,
  toId,
  toRangeEnd,
  toRangeStart,
  toTs,
} from '../utils.js';

const router = Router();

const TASK_SELECT = `
  SELECT t.*, w.fullName AS assignedToName, w.department AS assignedToDepartment,
         b.fullName AS assignedByName
  FROM tasks t
  JOIN users w ON w.id = t.assignedTo
  LEFT JOIN users b ON b.id = t.assignedBy`;

const getTask = (id) => db.prepare(`${TASK_SELECT} WHERE t.id = ?`).get(id);

const getHistory = (taskId) =>
  db
    .prepare(
      `SELECT h.*, u.fullName AS changedByName FROM task_status_history h
       LEFT JOIN users u ON u.id = h.changedBy WHERE h.taskId = ? ORDER BY h.createdAt ASC, h.id ASC`
    )
    .all(taskId);

const addHistory = (taskId, fromStatus, toStatus, changedBy, note = null) =>
  db
    .prepare('INSERT INTO task_status_history (taskId, fromStatus, toStatus, changedBy, note) VALUES (?, ?, ?, ?, ?)')
    .run(taskId, fromStatus, toStatus, changedBy, note);

function loadTaskFor(user, id) {
  const task = getTask(id);
  if (!task) throw new ApiError(404, 'Vazifa topilmadi');
  if (user.role === 'worker' && task.assignedTo !== user.id) throw new ApiError(404, 'Vazifa topilmadi');
  return task;
}

function assertActiveWorker(id) {
  const worker = db.prepare("SELECT id, status FROM users WHERE id = ? AND role = 'worker'").get(id);
  if (!worker) throw new ApiError(400, 'Vazifani faqat xodimga biriktirish mumkin');
  if (worker.status !== 'active') throw new ApiError(400, "Faol bo'lmagan xodimga vazifa biriktirib bo'lmaydi");
}

// Workers move their own tasks forward; owners/admins can set any status.
const WORKER_TRANSITIONS = {
  kutilmoqda: ['jarayonda', 'bajarildi', 'rad_etildi'],
  jarayonda: ['bajarildi', 'rad_etildi'],
  bajarildi: [],
  rad_etildi: [],
};

function applyStatusChange(task, status, reason, user) {
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

  db.prepare(
    `UPDATE tasks SET status = ?, rejectionReason = ?,
       completedAt = CASE WHEN ? = 'bajarildi' THEN CURRENT_TIMESTAMP ELSE NULL END
     WHERE id = ?`
  ).run(status, rejectionReason, status, task.id);
  addHistory(task.id, task.status, status, user.id, rejectionReason);
  logActivity('task.status', user.id, task.id, {
    title: task.title,
    from: task.status,
    to: status,
    ...(rejectionReason ? { reason: rejectionReason } : {}),
  });
  return true;
}

router.get('/', (req, res) => {
  const where = [];
  const params = {};
  if (req.user.role === 'worker') {
    where.push('t.assignedTo = @me');
    params.me = req.user.id;
  } else if (req.query.assignedTo) {
    where.push('t.assignedTo = @assignedTo');
    params.assignedTo = toId(req.query.assignedTo);
  }
  if (TASK_STATUSES.includes(req.query.status)) {
    where.push('t.status = @status');
    params.status = req.query.status;
  }
  if (PRIORITIES.includes(req.query.priority)) {
    where.push('t.priority = @priority');
    params.priority = req.query.priority;
  }
  const from = toRangeStart(req.query.from);
  const to = toRangeEnd(req.query.to);
  if (from) {
    where.push('t.createdAt >= @from');
    params.from = from;
  }
  if (to) {
    where.push('t.createdAt < @to');
    params.to = to;
  }
  if (str(req.query.search)) {
    where.push('(t.title LIKE @q OR t.description LIKE @q)');
    params.q = `%${str(req.query.search)}%`;
  }

  const rows = db
    .prepare(
      `${TASK_SELECT} ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY t.createdAt DESC, t.id DESC`
    )
    .all(params);
  ok(res, rows);
});

router.post('/', requireRole('admin', 'owner'), (req, res) => {
  const title = str(req.body.title);
  const description = str(req.body.description) || null;
  const priority = str(req.body.priority) || 'orta';
  if (!title) throw new ApiError(400, 'Sarlavha kiritilishi shart');
  if (!PRIORITIES.includes(priority)) throw new ApiError(400, "Noto'g'ri muhimlik darajasi");
  if (!req.body.assignedTo) throw new ApiError(400, 'Vazifani xodimga biriktiring');
  const assignedTo = toId(req.body.assignedTo);
  assertActiveWorker(assignedTo);
  const deadline = toTs(req.body.deadline);
  if (!deadline) throw new ApiError(400, 'Muddat kiritilishi shart');

  const id = db.transaction(() => {
    const { lastInsertRowid } = db
      .prepare(
        `INSERT INTO tasks (title, description, priority, status, assignedTo, assignedBy, deadline)
         VALUES (?, ?, ?, 'kutilmoqda', ?, ?, ?)`
      )
      .run(title, description, priority, assignedTo, req.user.id, deadline);
    addHistory(lastInsertRowid, null, 'kutilmoqda', req.user.id);
    logActivity('task.create', req.user.id, lastInsertRowid, { title, priority, assignedTo });
    return lastInsertRowid;
  })();

  ok(res, getTask(id), 201);
});

router.put('/bulk/status', requireRole('admin', 'owner'), (req, res) => {
  const ids = Array.isArray(req.body.ids) ? [...new Set(req.body.ids.map(toId))] : [];
  const status = str(req.body.status);
  if (!ids.length) throw new ApiError(400, 'Hech qanday vazifa tanlanmagan');
  if (!TASK_STATUSES.includes(status) || status === 'rad_etildi') {
    throw new ApiError(400, "Ommaviy yangilashda rad etish mumkin emas");
  }

  const updated = db.transaction(() => {
    let n = 0;
    for (const id of ids) {
      const task = getTask(id);
      if (task && applyStatusChange(task, status, null, req.user)) n++;
    }
    return n;
  })();

  ok(res, { updated });
});

router.get('/:id', (req, res) => {
  const task = loadTaskFor(req.user, toId(req.params.id));
  ok(res, { ...task, history: getHistory(task.id) });
});

router.put('/:id', requireRole('admin', 'owner'), (req, res) => {
  const task = loadTaskFor(req.user, toId(req.params.id));
  const updates = {};

  if (req.body.title !== undefined) {
    updates.title = str(req.body.title);
    if (!updates.title) throw new ApiError(400, "Sarlavha bo'sh bo'lishi mumkin emas");
  }
  if (req.body.description !== undefined) updates.description = str(req.body.description) || null;
  if (req.body.priority !== undefined) {
    if (!PRIORITIES.includes(req.body.priority)) throw new ApiError(400, "Noto'g'ri muhimlik darajasi");
    updates.priority = req.body.priority;
  }
  if (req.body.assignedTo !== undefined) {
    const assignedTo = toId(req.body.assignedTo);
    if (assignedTo !== task.assignedTo) {
      assertActiveWorker(assignedTo);
      updates.assignedTo = assignedTo;
    }
  }
  if (req.body.deadline !== undefined) {
    updates.deadline = toTs(req.body.deadline);
    if (!updates.deadline) throw new ApiError(400, 'Muddat kiritilishi shart');
  }

  db.transaction(() => {
    const keys = Object.keys(updates);
    if (keys.length) {
      db.prepare(`UPDATE tasks SET ${keys.map((k) => `${k} = @${k}`).join(', ')} WHERE id = @id`).run({
        ...updates,
        id: task.id,
      });
      logActivity('task.update', req.user.id, task.id, { title: task.title, changes: updates });
    }
    if (req.body.status !== undefined) {
      applyStatusChange(getTask(task.id), str(req.body.status), req.body.rejectionReason, req.user);
    }
  })();

  ok(res, { ...getTask(task.id), history: getHistory(task.id) });
});

router.put('/:id/status', (req, res) => {
  const task = loadTaskFor(req.user, toId(req.params.id));
  db.transaction(() => applyStatusChange(task, str(req.body.status), req.body.rejectionReason ?? req.body.reason, req.user))();
  ok(res, { ...getTask(task.id), history: getHistory(task.id) });
});

export default router;
