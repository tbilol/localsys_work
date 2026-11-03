import { Router } from 'express';
import db from '../db.js';
import { requireRole } from '../middleware/auth.js';
import { fromSqlTs, ok, toSqlTs } from '../utils.js';

const router = Router();
router.use(requireRole('admin', 'owner'));

// Day boundaries are computed in the server's local time and compared against stored UTC SQL timestamps.
const startOfDay = (d = new Date()) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};
const addDays = (d, n) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};
const startOfWeek = () => {
  const today = startOfDay();
  const dow = (today.getDay() + 6) % 7; // Monday = 0
  return addDays(today, -dow);
};
const localDateKey = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

router.get('/stats', (_req, res) => {
  const today = toSqlTs(startOfDay());
  const tomorrow = toSqlTs(addDays(startOfDay(), 1));
  const weekStart = toSqlTs(startOfWeek());

  const totalWorkers = db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'worker' AND status = 'active'").get().n;
  const tasksToday = db.prepare('SELECT COUNT(*) AS n FROM tasks WHERE createdAt >= ? AND createdAt < ?').get(today, tomorrow).n;
  const completedThisWeek = db
    .prepare("SELECT COUNT(*) AS n FROM tasks WHERE status = 'bajarildi' AND completedAt >= ?")
    .get(weekStart).n;
  // Active workers who have not submitted a report today.
  const pendingReports = db
    .prepare(
      `SELECT COUNT(*) AS n FROM users u
       WHERE u.role = 'worker' AND u.status = 'active'
         AND NOT EXISTS (SELECT 1 FROM reports r WHERE r.userId = u.id AND r.createdAt >= ? AND r.createdAt < ?)`
    )
    .get(today, tomorrow).n;

  const statusCounts = Object.fromEntries(
    db.prepare('SELECT status, COUNT(*) AS n FROM tasks GROUP BY status').all().map((r) => [r.status, r.n])
  );
  const overdue = db
    .prepare("SELECT COUNT(*) AS n FROM tasks WHERE status IN ('kutilmoqda','jarayonda') AND deadline < ?")
    .get(toSqlTs(new Date())).n;

  const recentTasks = db
    .prepare(
      `SELECT t.id, t.title, t.priority, t.status, t.deadline, t.createdAt, w.fullName AS assignedToName
       FROM tasks t JOIN users w ON w.id = t.assignedTo ORDER BY t.createdAt DESC, t.id DESC LIMIT 10`
    )
    .all();
  const recentReports = db
    .prepare(
      `SELECT r.id, r.title, r.department, r.createdAt, u.fullName AS userName
       FROM reports r JOIN users u ON u.id = r.userId ORDER BY r.createdAt DESC, r.id DESC LIMIT 8`
    )
    .all();

  ok(res, {
    totalWorkers,
    tasksToday,
    completedThisWeek,
    pendingReports,
    overdue,
    statusCounts: {
      kutilmoqda: statusCounts.kutilmoqda || 0,
      jarayonda: statusCounts.jarayonda || 0,
      bajarildi: statusCounts.bajarildi || 0,
      rad_etildi: statusCounts.rad_etildi || 0,
    },
    recentTasks,
    recentReports,
  });
});

router.get('/chart-data', (_req, res) => {
  const first = addDays(startOfDay(), -6);
  const end = addDays(startOfDay(), 1);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(first, i);
    return { date: localDateKey(d), created: 0, completed: 0, rejected: 0 };
  });
  const byKey = Object.fromEntries(days.map((d) => [d.date, d]));

  const bucket = (ts) => byKey[localDateKey(fromSqlTs(ts))];

  for (const { createdAt } of db
    .prepare('SELECT createdAt FROM tasks WHERE createdAt >= ? AND createdAt < ?')
    .all(toSqlTs(first), toSqlTs(end))) {
    const b = bucket(createdAt);
    if (b) b.created++;
  }
  for (const { completedAt } of db
    .prepare("SELECT completedAt FROM tasks WHERE status = 'bajarildi' AND completedAt >= ? AND completedAt < ?")
    .all(toSqlTs(first), toSqlTs(end))) {
    const b = bucket(completedAt);
    if (b) b.completed++;
  }
  for (const { createdAt } of db
    .prepare(
      `SELECT h.createdAt FROM task_status_history h JOIN tasks t ON t.id = h.taskId
       WHERE h.toStatus = 'rad_etildi' AND t.status = 'rad_etildi' AND h.createdAt >= ? AND h.createdAt < ?`
    )
    .all(toSqlTs(first), toSqlTs(end))) {
    const b = bucket(createdAt);
    if (b) b.rejected++;
  }

  ok(res, days);
});

export default router;
