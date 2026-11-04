import { Router } from 'express';
import pool from '../../db/pool.js';
import { requireRole } from '../middleware/auth.js';
import { ok } from '../utils.js';

const router = Router();
router.use(requireRole('admin', 'owner'));

// Day boundaries are computed in the server's local time (set TZ, e.g. TZ=Asia/Tashkent, in production).
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

const count = async (text, params) => (await pool.query(text, params)).rows[0].n;

router.get('/stats', async (_req, res) => {
  const today = startOfDay();
  const tomorrow = addDays(today, 1);
  const weekStart = startOfWeek();

  const [totalWorkers, tasksToday, completedThisWeek, pendingReports, overdue, statusRows, recentTasks, recentReports] =
    await Promise.all([
      count("SELECT COUNT(*) AS n FROM users WHERE role = 'worker' AND status = 'active'"),
      count('SELECT COUNT(*) AS n FROM tasks WHERE "createdAt" >= $1 AND "createdAt" < $2', [today, tomorrow]),
      count(`SELECT COUNT(*) AS n FROM tasks WHERE status = 'bajarildi' AND "completedAt" >= $1`, [weekStart]),
      // Active workers who have not submitted a report today.
      count(
        `SELECT COUNT(*) AS n FROM users u
         WHERE u.role = 'worker' AND u.status = 'active'
           AND NOT EXISTS (SELECT 1 FROM reports r WHERE r."userId" = u.id AND r."createdAt" >= $1 AND r."createdAt" < $2)`,
        [today, tomorrow]
      ),
      count(`SELECT COUNT(*) AS n FROM tasks WHERE status IN ('kutilmoqda','jarayonda') AND deadline < $1`, [new Date()]),
      pool.query('SELECT status, COUNT(*) AS n FROM tasks GROUP BY status').then((r) => r.rows),
      pool
        .query(
          `SELECT t.id, t.title, t.priority, t.status, t.deadline, t."createdAt", w."fullName" AS "assignedToName"
           FROM tasks t JOIN users w ON w.id = t."assignedTo" ORDER BY t."createdAt" DESC, t.id DESC LIMIT 10`
        )
        .then((r) => r.rows),
      pool
        .query(
          `SELECT r.id, r.title, r.department, r."createdAt", u."fullName" AS "userName"
           FROM reports r JOIN users u ON u.id = r."userId" ORDER BY r."createdAt" DESC, r.id DESC LIMIT 8`
        )
        .then((r) => r.rows),
    ]);

  const statusCounts = Object.fromEntries(statusRows.map((r) => [r.status, r.n]));

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

router.get('/chart-data', async (_req, res) => {
  const first = addDays(startOfDay(), -6);
  const end = addDays(startOfDay(), 1);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(first, i);
    return { date: localDateKey(d), created: 0, completed: 0, rejected: 0 };
  });
  const byKey = Object.fromEntries(days.map((d) => [d.date, d]));
  const bump = (ts, field) => {
    const b = byKey[localDateKey(new Date(ts))];
    if (b) b[field]++;
  };

  const [created, completed, rejected] = await Promise.all([
    pool.query('SELECT "createdAt" AS ts FROM tasks WHERE "createdAt" >= $1 AND "createdAt" < $2', [first, end]),
    pool.query(
      `SELECT "completedAt" AS ts FROM tasks WHERE status = 'bajarildi' AND "completedAt" >= $1 AND "completedAt" < $2`,
      [first, end]
    ),
    pool.query(
      `SELECT h."createdAt" AS ts FROM task_status_history h JOIN tasks t ON t.id = h."taskId"
       WHERE h."toStatus" = 'rad_etildi' AND t.status = 'rad_etildi' AND h."createdAt" >= $1 AND h."createdAt" < $2`,
      [first, end]
    ),
  ]);
  created.rows.forEach((r) => bump(r.ts, 'created'));
  completed.rows.forEach((r) => bump(r.ts, 'completed'));
  rejected.rows.forEach((r) => bump(r.ts, 'rejected'));

  ok(res, days);
});

export default router;
