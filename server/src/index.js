import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pool, { dialect } from '../db/pool.js';
import { DEFAULT_ADMIN_PHONE, migrate, seedDefaultAdmin } from '../db/migrate.js';
import { authenticate } from './middleware/auth.js';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import taskRoutes from './routes/tasks.js';
import reportRoutes from './routes/reports.js';
import dashboardRoutes from './routes/dashboard.js';
import activityRoutes from './routes/activity.js';
import professionRequestRoutes from './routes/professionRequests.js';
import { ApiError } from './utils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;

// FRONTEND_URL may list several origins separated by commas. Unset = any origin (local development).
const allowedOrigins = (process.env.FRONTEND_URL || '')
  .split(',')
  .map((o) => o.trim().replace(/\/+$/, ''))
  .filter(Boolean);
if (!allowedOrigins.length && process.env.NODE_ENV === 'production') {
  console.warn("Ogohlantirish: FRONTEND_URL o'rnatilmagan — barcha manzillardan so'rovlarga ruxsat berilgan");
}

const app = express();
// Railway (and most hosts) sit behind one proxy; needed for the per-IP login rate limit.
app.set('trust proxy', Number(process.env.TRUST_PROXY ?? 1));
app.use(helmet({ contentSecurityPolicy: { directives: { 'upgrade-insecure-requests': null } } }));
app.use(cors({ origin: allowedOrigins.length ? allowedOrigins : true }));
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_req, res) => res.json({ status: 'ok', timestamp: new Date() }));
app.use('/api/auth', authRoutes);
app.use('/api/users', authenticate, userRoutes);
app.use('/api/tasks', authenticate, taskRoutes);
app.use('/api/reports', authenticate, reportRoutes);
app.use('/api/dashboard', authenticate, dashboardRoutes);
app.use('/api/activity', authenticate, activityRoutes);
app.use('/api/profession-requests', authenticate, professionRequestRoutes);

app.use('/api', (_req, res) => res.status(404).json({ success: false, data: null, error: "So'rov manzili topilmadi" }));

// Optional single-host mode: serve the built client if it exists (npm run build in /client).
const clientDist = path.resolve(__dirname, '..', '..', 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('/{*splat}', (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

// Database constraint errors that slip past route checks (e.g. two requests racing on the same phone).
const PG_CODES = { 23505: [409, "Bunday yozuv allaqachon mavjud"], 23503: [409, "Bog'liq yozuv mavjud emas yoki ishlatilmoqda"] };
const SQLITE_CODES = {
  SQLITE_CONSTRAINT_UNIQUE: PG_CODES[23505],
  SQLITE_CONSTRAINT_PRIMARYKEY: PG_CODES[23505],
  SQLITE_CONSTRAINT_FOREIGNKEY: PG_CODES[23503],
};

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  let status = err.status || err.statusCode || 500;
  let message = err.message || 'Serverda ichki xatolik yuz berdi';
  const dbError = PG_CODES[err.code] || SQLITE_CODES[err.code];
  if (err.type === 'entity.parse.failed') {
    status = 400;
    message = "So'rov tanasi noto'g'ri JSON formatida";
  } else if (dbError && !(err instanceof ApiError)) {
    [status, message] = dbError;
  } else if (!(err instanceof ApiError) && status < 500) {
    message = "Noto'g'ri so'rov";
  }
  if (status >= 500) {
    console.error(err);
    message = 'Serverda ichki xatolik yuz berdi';
  }
  res.status(status).json({ success: false, data: null, error: message });
});

try {
  await migrate();
  if (await seedDefaultAdmin()) {
    console.log(`Administrator yaratildi: telefon '${DEFAULT_ADMIN_PHONE}', parol 'admin123'`);
  }
} catch (err) {
  console.error(`Ma'lumotlar bazasini tayyorlab bo'lmadi: ${err.message}`);
  console.error("Server to'xtatildi.");
  await pool.end().catch(() => {});
  process.exit(1);
}

const server = app.listen(PORT, () =>
  console.log(
    `Local System serveri ishga tushdi: http://localhost:${PORT} (${dialect === 'postgres' ? 'PostgreSQL' : 'SQLite'})`
  )
);

// Railway sends SIGTERM on redeploy: finish in-flight requests, then close the database.
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    server.close(() => pool.end().finally(() => process.exit(0)));
    setTimeout(() => process.exit(0), 10_000).unref();
  });
}
