import { Router } from 'express';
import bcrypt from 'bcrypt';
import pool, { sql } from '../../db/pool.js';
import { requireRole } from '../middleware/auth.js';
import { ApiError, DEPARTMENTS, logActivity, ok, paramList, ROLES, str, toId, toPhone } from '../utils.js';
import { createUserRules, updateUserRules, userIdRules } from '../validation.js';

const router = Router();

const USER_COLUMNS = `u.id, u."fullName", u.phone, u.role, u.department, u.status, u."createdAt", u."createdBy",
  c."fullName" AS "createdByName"`;

const getUser = async (id) =>
  (await pool.query(`SELECT ${USER_COLUMNS} FROM users u LEFT JOIN users c ON c.id = u."createdBy" WHERE u.id = $1`, [id]))
    .rows[0];

const activeAdminCount = async () =>
  (await pool.query("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND status = 'active'")).rows[0].n;

const phoneTaken = async (phone, exceptId = 0) =>
  (await pool.query('SELECT 1 FROM users WHERE phone = $1 AND id <> $2', [phone, exceptId])).rows.length > 0;

function validateDepartment(role, department) {
  if (role !== 'worker') return null;
  const dep = str(department).toLowerCase();
  if (!dep) throw new ApiError(400, "Xodim uchun bo'lim tanlanishi shart");
  if (!DEPARTMENTS.includes(dep)) throw new ApiError(400, `Bo'lim quyidagilardan biri bo'lishi kerak: ${DEPARTMENTS.join(', ')}`);
  return dep;
}

// Lightweight worker list used by owners/admins when assigning tasks or filtering.
router.get('/workers', requireRole('admin', 'owner'), async (req, res) => {
  const includeInactive = req.query.all === 'true';
  const { rows } = await pool.query(
    `SELECT id, "fullName", phone, department, status FROM users
     WHERE role = 'worker' ${includeInactive ? '' : "AND status = 'active'"}
     ORDER BY LOWER("fullName")`
  );
  ok(res, rows);
});

router.use(requireRole('admin', 'owner'));

// Admins manage everyone; owners manage workers only.
const manageableRoles = (actor) => (actor.role === 'admin' ? ROLES : ['worker']);

async function loadManageable(actor, id) {
  const user = (await pool.query('SELECT * FROM users WHERE id = $1', [id])).rows[0];
  if (!user) throw new ApiError(404, 'Foydalanuvchi topilmadi');
  if (!manageableRoles(actor).includes(user.role)) {
    throw new ApiError(403, 'Egasi faqat xodimlarni boshqarishi mumkin');
  }
  return user;
}

function assertRoleAllowed(actor, role) {
  if (!ROLES.includes(role)) throw new ApiError(400, "Noto'g'ri rol");
  if (!manageableRoles(actor).includes(role)) throw new ApiError(403, "Egasi faqat «Xodim» rolini tanlay oladi");
}

router.get('/', async (req, res) => {
  const where = [];
  const { params, p } = paramList();
  if (req.user.role !== 'admin') where.push("u.role = 'worker'");
  if (ROLES.includes(req.query.role)) where.push(`u.role = ${p(req.query.role)}`);
  if (['active', 'inactive'].includes(req.query.status)) where.push(`u.status = ${p(req.query.status)}`);
  if (str(req.query.search)) {
    const q = p(`%${str(req.query.search).toLowerCase()}%`);
    where.push(`(LOWER(u."fullName") LIKE ${q} OR u.phone LIKE ${q})`);
  }
  const { rows } = await pool.query(
    `SELECT ${USER_COLUMNS} FROM users u LEFT JOIN users c ON c.id = u."createdBy"
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY u."createdAt" DESC, u.id DESC`,
    params
  );
  ok(res, rows);
});

router.post('/', createUserRules, async (req, res) => {
  const fullName = str(req.body.fullName);
  const password = req.body.password;
  const role = str(req.body.role) || 'worker';
  const phone = toPhone(req.body.phone);
  assertRoleAllowed(req.user, role);
  const department = validateDepartment(role, req.body.department);

  if (await phoneTaken(phone)) throw new ApiError(409, 'Bu telefon raqam bilan foydalanuvchi allaqachon mavjud');

  const hash = await bcrypt.hash(password, 10);
  const { rows } = await pool.query(
    `INSERT INTO users ("fullName", phone, password, role, department, status, "createdBy")
     VALUES ($1, $2, $3, $4, $5, 'active', $6) RETURNING id`,
    [fullName, phone, hash, role, department, req.user.id]
  );
  const { id } = rows[0];

  await logActivity('user.create', req.user.id, id, { fullName, phone, role, department });
  ok(res, await getUser(id), 201);
});

router.get('/:id', userIdRules, async (req, res) => {
  const { id } = await loadManageable(req.user, toId(req.params.id));
  ok(res, await getUser(id));
});

router.put('/:id', updateUserRules, async (req, res) => {
  const id = toId(req.params.id);
  const existing = await loadManageable(req.user, id);

  const isSelf = id === req.user.id;
  const updates = {};

  if (req.body.fullName !== undefined && req.body.fullName !== null) {
    const fullName = str(req.body.fullName);
    if (!fullName) throw new ApiError(400, "To'liq ism bo'sh bo'lishi mumkin emas");
    updates.fullName = fullName;
  }
  if (req.body.phone !== undefined) {
    const phone = toPhone(req.body.phone);
    if (await phoneTaken(phone, id)) throw new ApiError(409, 'Bu telefon raqam bilan foydalanuvchi allaqachon mavjud');
    updates.phone = phone;
  }
  if (req.body.password) updates.password = await bcrypt.hash(String(req.body.password), 10);

  const role = req.body.role ? str(req.body.role) : existing.role;
  assertRoleAllowed(req.user, role);
  if (role !== existing.role) {
    if (isSelf) throw new ApiError(400, "O'z rolingizni o'zgartira olmaysiz");
    if (existing.role === 'admin' && existing.status === 'active' && (await activeAdminCount()) <= 1) {
      throw new ApiError(400, "Oxirgi faol administratorning rolini o'zgartirib bo'lmaydi");
    }
    updates.role = role;
  }
  if (req.body.department !== undefined || role !== existing.role) {
    updates.department = validateDepartment(role, req.body.department ?? existing.department);
  }

  if (req.body.status) {
    const status = str(req.body.status);
    if (status !== existing.status) {
      if (isSelf && status === 'inactive') throw new ApiError(400, "O'z hisobingizni faolsizlantira olmaysiz");
      if (status === 'inactive' && existing.role === 'admin' && (await activeAdminCount()) <= 1) {
        throw new ApiError(400, "Oxirgi faol administratorni faolsizlantirib bo'lmaydi");
      }
      updates.status = status;
    }
  }

  const keys = Object.keys(updates);
  if (keys.length) {
    const { params, p } = paramList();
    await pool.query(
      `UPDATE users SET ${keys.map((k) => `"${k}" = ${p(updates[k])}`).join(', ')} WHERE id = ${p(id)}`,
      params
    );
    const { password, ...logged } = updates;
    await logActivity(
      updates.status ? `user.${updates.status === 'active' ? 'activate' : 'deactivate'}` : 'user.update',
      req.user.id,
      id,
      { fullName: existing.fullName, changes: { ...logged, ...(password ? { password: '(changed)' } : {}) } }
    );
  }
  ok(res, await getUser(id));
});

// Permanent delete: removes the user together with the tasks assigned to them and their reports.
// Tasks they assigned to others are kept (assignedBy becomes NULL); their past log entries keep
// the actor's name in details so the activity feed stays readable.
router.delete('/:id', userIdRules, async (req, res) => {
  const id = toId(req.params.id);
  const existing = await loadManageable(req.user, id);
  if (id === req.user.id) throw new ApiError(400, "O'z hisobingizni o'chira olmaysiz");
  if (existing.role === 'admin' && existing.status === 'active' && (await activeAdminCount()) <= 1) {
    throw new ApiError(400, "Oxirgi faol administratorni o'chirib bo'lmaydi");
  }

  const result = await pool.transaction(async (q) => {
    const tasks = (await q('DELETE FROM tasks WHERE "assignedTo" = $1', [id])).rowCount;
    const reports = (await q('DELETE FROM reports WHERE "userId" = $1', [id])).rowCount;
    await q('UPDATE tasks SET "assignedBy" = NULL WHERE "assignedBy" = $1', [id]);
    await q('UPDATE task_status_history SET "changedBy" = NULL WHERE "changedBy" = $1', [id]);
    await q('UPDATE users SET "createdBy" = NULL WHERE "createdBy" = $1', [id]);
    await q(
      `UPDATE activity_log
       SET details = ${sql.jsonMerge('details', [['actorName', '$1'], ['actorRole', '$2']])}, "userId" = NULL
       WHERE "userId" = $3`,
      [existing.fullName, existing.role, id]
    );
    await q('DELETE FROM users WHERE id = $1', [id]);
    await logActivity(
      'user.delete',
      req.user.id,
      id,
      { fullName: existing.fullName, phone: existing.phone, role: existing.role, tasks, reports },
      q
    );
    return { id, tasks, reports };
  });

  ok(res, result);
});

export default router;
