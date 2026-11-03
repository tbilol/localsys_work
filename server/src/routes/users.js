import { Router } from 'express';
import bcrypt from 'bcrypt';
import db, { logActivity } from '../db.js';
import { requireRole } from '../middleware/auth.js';
import { ApiError, asyncHandler, DEPARTMENTS, ok, ROLES, str, toId, toPhone } from '../utils.js';

const router = Router();

const USER_COLUMNS = `u.id, u.fullName, u.phone, u.role, u.department, u.status, u.createdAt, u.createdBy,
  c.fullName AS createdByName`;

const getUser = (id) =>
  db.prepare(`SELECT ${USER_COLUMNS} FROM users u LEFT JOIN users c ON c.id = u.createdBy WHERE u.id = ?`).get(id);

const activeAdminCount = () =>
  db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND status = 'active'").get().n;

function validateDepartment(role, department) {
  if (role !== 'worker') return null;
  const dep = str(department).toLowerCase();
  if (!dep) throw new ApiError(400, "Xodim uchun bo'lim tanlanishi shart");
  if (!DEPARTMENTS.includes(dep)) throw new ApiError(400, `Bo'lim quyidagilardan biri bo'lishi kerak: ${DEPARTMENTS.join(', ')}`);
  return dep;
}

// Lightweight worker list used by owners/admins when assigning tasks or filtering.
router.get('/workers', requireRole('admin', 'owner'), (req, res) => {
  const includeInactive = req.query.all === 'true';
  const rows = db
    .prepare(
      `SELECT id, fullName, phone, department, status FROM users
       WHERE role = 'worker' ${includeInactive ? '' : "AND status = 'active'"}
       ORDER BY fullName COLLATE NOCASE`
    )
    .all();
  ok(res, rows);
});

router.use(requireRole('admin', 'owner'));

// Admins manage everyone; owners manage workers only.
const manageableRoles = (actor) => (actor.role === 'admin' ? ROLES : ['worker']);

function loadManageable(actor, id) {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
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

router.get('/', (req, res) => {
  const where = [];
  const params = {};
  if (req.user.role !== 'admin') where.push("u.role = 'worker'");
  if (ROLES.includes(req.query.role)) {
    where.push('u.role = @role');
    params.role = req.query.role;
  }
  if (['active', 'inactive'].includes(req.query.status)) {
    where.push('u.status = @status');
    params.status = req.query.status;
  }
  if (str(req.query.search)) {
    where.push('(u.fullName LIKE @q OR u.phone LIKE @q)');
    params.q = `%${str(req.query.search)}%`;
  }
  const rows = db
    .prepare(
      `SELECT ${USER_COLUMNS} FROM users u LEFT JOIN users c ON c.id = u.createdBy
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY u.createdAt DESC`
    )
    .all(params);
  ok(res, rows);
});

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const fullName = str(req.body.fullName);
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    const role = str(req.body.role) || 'worker';

    if (!fullName) throw new ApiError(400, "To'liq ism kiritilishi shart");
    if (!req.body.phone) throw new ApiError(400, 'Telefon raqam kiritilishi shart');
    const phone = toPhone(req.body.phone);
    if (password.length < 6) throw new ApiError(400, "Parol kamida 6 belgidan iborat bo'lishi kerak");
    assertRoleAllowed(req.user, role);
    const department = validateDepartment(role, req.body.department);

    if (db.prepare('SELECT 1 FROM users WHERE phone = ?').get(phone)) {
      throw new ApiError(409, 'Bu telefon raqam bilan foydalanuvchi allaqachon mavjud');
    }

    const hash = await bcrypt.hash(password, 10);
    const { lastInsertRowid } = db
      .prepare(
        `INSERT INTO users (fullName, phone, password, role, department, status, createdBy)
         VALUES (?, ?, ?, ?, ?, 'active', ?)`
      )
      .run(fullName, phone, hash, role, department, req.user.id);

    logActivity('user.create', req.user.id, lastInsertRowid, { fullName, phone, role, department });
    ok(res, getUser(lastInsertRowid), 201);
  })
);

router.get('/:id', (req, res) => {
  const { id } = loadManageable(req.user, toId(req.params.id));
  ok(res, getUser(id));
});

router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = toId(req.params.id);
    const existing = loadManageable(req.user, id);

    const isSelf = id === req.user.id;
    const updates = {};

    if (req.body.fullName !== undefined) {
      const fullName = str(req.body.fullName);
      if (!fullName) throw new ApiError(400, "To'liq ism bo'sh bo'lishi mumkin emas");
      updates.fullName = fullName;
    }
    if (req.body.phone !== undefined) {
      const phone = toPhone(req.body.phone);
      if (db.prepare('SELECT 1 FROM users WHERE phone = ? AND id != ?').get(phone, id)) {
        throw new ApiError(409, 'Bu telefon raqam bilan foydalanuvchi allaqachon mavjud');
      }
      updates.phone = phone;
    }
    if (req.body.password) {
      if (String(req.body.password).length < 6) throw new ApiError(400, "Parol kamida 6 belgidan iborat bo'lishi kerak");
      updates.password = await bcrypt.hash(String(req.body.password), 10);
    }

    const role = req.body.role !== undefined ? str(req.body.role) : existing.role;
    assertRoleAllowed(req.user, role);
    if (role !== existing.role) {
      if (isSelf) throw new ApiError(400, "O'z rolingizni o'zgartira olmaysiz");
      if (existing.role === 'admin' && existing.status === 'active' && activeAdminCount() <= 1) {
        throw new ApiError(400, "Oxirgi faol administratorning rolini o'zgartirib bo'lmaydi");
      }
      updates.role = role;
    }
    if (req.body.department !== undefined || role !== existing.role) {
      updates.department = validateDepartment(role, req.body.department ?? existing.department);
    }

    if (req.body.status !== undefined) {
      const status = str(req.body.status);
      if (!['active', 'inactive'].includes(status)) throw new ApiError(400, "Noto'g'ri holat");
      if (status !== existing.status) {
        if (isSelf && status === 'inactive') throw new ApiError(400, "O'z hisobingizni faolsizlantira olmaysiz");
        if (status === 'inactive' && existing.role === 'admin' && activeAdminCount() <= 1) {
          throw new ApiError(400, "Oxirgi faol administratorni faolsizlantirib bo'lmaydi");
        }
        updates.status = status;
      }
    }

    const keys = Object.keys(updates);
    if (keys.length) {
      db.prepare(`UPDATE users SET ${keys.map((k) => `${k} = @${k}`).join(', ')} WHERE id = @id`).run({ ...updates, id });
      const { password, ...logged } = updates;
      logActivity(updates.status ? `user.${updates.status === 'active' ? 'activate' : 'deactivate'}` : 'user.update', req.user.id, id, {
        fullName: existing.fullName,
        changes: { ...logged, ...(password ? { password: '(changed)' } : {}) },
      });
    }
    ok(res, getUser(id));
  })
);

// Permanent delete: removes the user together with the tasks assigned to them and their reports.
// Tasks they assigned to others are kept (assignedBy becomes NULL); their past log entries keep
// the actor's name in details so the activity feed stays readable.
router.delete('/:id', (req, res) => {
  const id = toId(req.params.id);
  const existing = loadManageable(req.user, id);
  if (id === req.user.id) throw new ApiError(400, "O'z hisobingizni o'chira olmaysiz");
  if (existing.role === 'admin' && existing.status === 'active' && activeAdminCount() <= 1) {
    throw new ApiError(400, "Oxirgi faol administratorni o'chirib bo'lmaydi");
  }

  const result = db.transaction(() => {
    const tasks = db.prepare('DELETE FROM tasks WHERE assignedTo = ?').run(id).changes;
    const reports = db.prepare('DELETE FROM reports WHERE userId = ?').run(id).changes;
    db.prepare('UPDATE tasks SET assignedBy = NULL WHERE assignedBy = ?').run(id);
    db.prepare('UPDATE task_status_history SET changedBy = NULL WHERE changedBy = ?').run(id);
    db.prepare('UPDATE users SET createdBy = NULL WHERE createdBy = ?').run(id);
    db.prepare(
      `UPDATE activity_log
       SET details = json_set(COALESCE(details, '{}'), '$.actorName', ?, '$.actorRole', ?), userId = NULL
       WHERE userId = ?`
    ).run(existing.fullName, existing.role, id);
    db.prepare('DELETE FROM users WHERE id = ?').run(id);
    logActivity('user.delete', req.user.id, id, {
      fullName: existing.fullName,
      phone: existing.phone,
      role: existing.role,
      tasks,
      reports,
    });
    return { id, tasks, reports };
  })();

  ok(res, result);
});

export default router;
