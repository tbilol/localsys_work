import { Router } from 'express';
import bcrypt from 'bcrypt';
import db, { logActivity } from '../db.js';
import { authenticate, signToken } from '../middleware/auth.js';
import { ApiError, asyncHandler, ok, publicUser, toPhone } from '../utils.js';

const router = Router();

router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    if (!req.body.phone || !password) throw new ApiError(400, 'Telefon raqam va parol kiritilishi shart');
    const phone = toPhone(req.body.phone);

    const user = db.prepare('SELECT * FROM users WHERE phone = ?').get(phone);
    if (!user || !(await bcrypt.compare(password, user.password))) {
      throw new ApiError(401, "Telefon raqam yoki parol noto'g'ri");
    }
    if (user.status !== 'active') throw new ApiError(403, 'Bu hisob faolsizlantirilgan');

    logActivity('auth.login', user.id, user.id);
    ok(res, { token: signToken(user), user: publicUser(user) });
  })
);

router.get('/me', authenticate, (req, res) => ok(res, req.user));

export default router;
