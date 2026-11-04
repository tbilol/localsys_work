import jwt from 'jsonwebtoken';
import pool from '../../db/pool.js';
import { ApiError } from '../utils.js';

if (!process.env.JWT_SECRET && process.env.NODE_ENV === 'production') {
  console.error("NODE_ENV=production rejimida JWT_SECRET o'rnatilishi shart");
  process.exit(1);
}
export const JWT_SECRET = process.env.JWT_SECRET || 'localsystem-dev-secret-change-me';
export const JWT_EXPIRES_IN = '24h';

export const signToken = (user) => jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

export async function authenticate(req, _res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return next(new ApiError(401, 'Avtorizatsiya talab qilinadi'));

  let payload;
  try {
    payload = jwt.verify(token, JWT_SECRET);
  } catch {
    return next(new ApiError(401, 'Sessiya tugagan yoki yaroqsiz'));
  }

  // Re-read the user so role changes and deactivation take effect immediately.
  const { rows } = await pool.query(
    'SELECT id, "fullName", phone, role, department, status, "createdAt", "createdBy" FROM users WHERE id = $1',
    [payload.id]
  );
  const user = rows[0];
  if (!user || user.status !== 'active') return next(new ApiError(401, "Hisob faol emas yoki o'chirilgan"));

  req.user = user;
  next();
}

export const requireRole =
  (...roles) =>
  (req, _res, next) => {
    if (!req.user) return next(new ApiError(401, 'Avtorizatsiya talab qilinadi'));
    if (!roles.includes(req.user.role)) return next(new ApiError(403, "Bu amalni bajarishga ruxsatingiz yo'q"));
    next();
  };
