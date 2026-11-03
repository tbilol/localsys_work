import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_ADMIN_PHONE, seedDefaultAdmin } from './db.js';
import { authenticate } from './middleware/auth.js';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import taskRoutes from './routes/tasks.js';
import reportRoutes from './routes/reports.js';
import dashboardRoutes from './routes/dashboard.js';
import activityRoutes from './routes/activity.js';
import { ApiError } from './utils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 4000;

const app = express();
app.disable('x-powered-by');
app.use(cors({ origin: process.env.CORS_ORIGIN || true }));
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_req, res) => res.json({ success: true, data: { status: 'ok' }, error: null }));
app.use('/api/auth', authRoutes);
app.use('/api/users', authenticate, userRoutes);
app.use('/api/tasks', authenticate, taskRoutes);
app.use('/api/reports', authenticate, reportRoutes);
app.use('/api/dashboard', authenticate, dashboardRoutes);
app.use('/api/activity', authenticate, activityRoutes);

app.use('/api', (_req, res) => res.status(404).json({ success: false, data: null, error: "So'rov manzili topilmadi" }));

// Serve the built client in production (npm run build in /client).
const clientDist = path.resolve(__dirname, '..', '..', 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('/{*splat}', (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  let status = err.status || err.statusCode || 500;
  let message = err.message || 'Serverda ichki xatolik yuz berdi';
  if (err.type === 'entity.parse.failed') {
    status = 400;
    message = "So'rov tanasi noto'g'ri JSON formatida";
  } else if (!(err instanceof ApiError) && status < 500) {
    message = "Noto'g'ri so'rov";
  }
  if (status >= 500) {
    console.error(err);
    message = 'Serverda ichki xatolik yuz berdi';
  }
  res.status(status).json({ success: false, data: null, error: message });
});

if (seedDefaultAdmin()) {
  console.log(`Administrator yaratildi: telefon '${DEFAULT_ADMIN_PHONE}', parol 'admin123'`);
}

app.listen(PORT, () => console.log(`Local System serveri ishga tushdi: http://localhost:${PORT}`));
