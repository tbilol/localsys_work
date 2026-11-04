import { Router } from 'express';
import bcrypt from 'bcrypt';
import rateLimit from 'express-rate-limit';
import pool from '../../db/pool.js';
import { authenticate, signToken } from '../middleware/auth.js';
import { ApiError, logActivity, ok, publicUser, toPhone } from '../utils.js';
import { loginRules } from '../validation.js';

const router = Router();

// Brute-force protection: LOGIN_RATE_LIMIT attempts per minute per IP (default 5).
const loginLimiter = rateLimit({
  windowMs: 60_000,
  limit: Number(process.env.LOGIN_RATE_LIMIT) || 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (_req, res) =>
    res.status(429).json({
      success: false,
      data: null,
      error: "Juda ko'p urinish. Bir daqiqadan so'ng qayta urinib ko'ring.",
    }),
});

router.post('/login', loginLimiter, loginRules, async (req, res) => {
  const phone = toPhone(req.body.phone);
  const { rows } = await pool.query('SELECT * FROM users WHERE phone = $1', [phone]);
  const user = rows[0];
  if (!user || !(await bcrypt.compare(req.body.password, user.password))) {
    throw new ApiError(401, "Telefon raqam yoki parol noto'g'ri");
  }
  if (user.status !== 'active') throw new ApiError(403, 'Bu hisob faolsizlantirilgan');

  await logActivity('auth.login', user.id, user.id);
  ok(res, { token: signToken(user), user: publicUser(user) });
});

router.get('/me', authenticate, (req, res) => ok(res, req.user));

export default router;
