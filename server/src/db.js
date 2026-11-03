import Database from 'better-sqlite3';
import bcrypt from 'bcrypt';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = path.resolve(__dirname, '..', 'data');
export const DB_FILE = path.join(DATA_DIR, 'localsystem.db');
const SCHEMA_VERSION = 3;
export const DEFAULT_ADMIN_PHONE = '+998000000000';

fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(DB_FILE);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// A database created by an older, incompatible schema cannot be reused as-is.
const hasTables = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'users'").get();
if (hasTables && db.pragma('user_version', { simple: true }) !== SCHEMA_VERSION) {
  console.error(
    `Ma'lumotlar bazasi eski sxemada yaratilgan: ${DB_FILE}\n` +
      "Server to'xtatildi. Eski bazani o'chiring yoki ko'chiring, so'ng qayta ishga tushiring."
  );
  process.exit(1);
}

// Timestamps are stored in SQLite's CURRENT_TIMESTAMP format: "YYYY-MM-DD HH:MM:SS" (UTC).
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id          INTEGER PRIMARY KEY,
    fullName    TEXT NOT NULL,
    phone       TEXT NOT NULL UNIQUE,
    password    TEXT NOT NULL,
    role        TEXT NOT NULL CHECK (role IN ('admin','owner','worker')),
    department  TEXT,
    status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
    createdAt   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    createdBy   INTEGER REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id              INTEGER PRIMARY KEY,
    title           TEXT NOT NULL,
    description     TEXT,
    priority        TEXT NOT NULL DEFAULT 'orta' CHECK (priority IN ('past','orta','yuqori','shoshilinch')),
    status          TEXT NOT NULL DEFAULT 'kutilmoqda' CHECK (status IN ('kutilmoqda','jarayonda','bajarildi','rad_etildi')),
    assignedTo      INTEGER NOT NULL REFERENCES users(id),
    assignedBy      INTEGER REFERENCES users(id),
    deadline        TEXT,
    completedAt     TEXT,
    rejectionReason TEXT,
    createdAt       TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS task_status_history (
    id         INTEGER PRIMARY KEY,
    taskId     INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    fromStatus TEXT,
    toStatus   TEXT NOT NULL,
    changedBy  INTEGER REFERENCES users(id),
    note       TEXT,
    createdAt  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS reports (
    id         INTEGER PRIMARY KEY,
    userId     INTEGER NOT NULL REFERENCES users(id),
    department TEXT,
    title      TEXT NOT NULL,
    content    TEXT NOT NULL,
    createdAt  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS activity_log (
    id        INTEGER PRIMARY KEY,
    action    TEXT NOT NULL,
    userId    INTEGER REFERENCES users(id),
    targetId  INTEGER,
    details   TEXT,
    createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_tasks_assignedTo ON tasks(assignedTo);
  CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
  CREATE INDEX IF NOT EXISTS idx_tasks_createdAt ON tasks(createdAt);
  CREATE INDEX IF NOT EXISTS idx_reports_userId ON reports(userId);
  CREATE INDEX IF NOT EXISTS idx_reports_createdAt ON reports(createdAt);
  CREATE INDEX IF NOT EXISTS idx_activity_createdAt ON activity_log(createdAt);
  CREATE INDEX IF NOT EXISTS idx_history_taskId ON task_status_history(taskId);
`);
db.pragma(`user_version = ${SCHEMA_VERSION}`);

export function seedDefaultAdmin() {
  const { count } = db.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'admin'").get();
  if (count > 0) return false;
  const hash = bcrypt.hashSync('admin123', 10);
  db.prepare(
    "INSERT INTO users (fullName, phone, password, role, status) VALUES (?, ?, ?, 'admin', 'active')"
  ).run('Administrator', DEFAULT_ADMIN_PHONE, hash);
  return true;
}

export function logActivity(action, userId, targetId = null, details = null) {
  db.prepare('INSERT INTO activity_log (action, userId, targetId, details) VALUES (?, ?, ?, ?)').run(
    action,
    userId ?? null,
    targetId ?? null,
    details ? JSON.stringify(details) : null
  );
}

export default db;
