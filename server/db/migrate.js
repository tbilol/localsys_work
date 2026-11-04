import bcrypt from 'bcrypt';
import { pathToFileURL } from 'node:url';
import pool, { dialect, SQLITE_FILE } from './pool.js';

export const DEFAULT_ADMIN_PHONE = '+998000000000';

const CHECKS = {
  role: "role IN ('admin','owner','worker')",
  userStatus: "status IN ('active','inactive')",
  priority: "priority IN ('past','orta','yuqori','shoshilinch')",
  taskStatus: "status IN ('kutilmoqda','jarayonda','bajarildi','rad_etildi')",
};

// Column types differ per dialect; everything else is shared. camelCase names are quoted so
// PostgreSQL keeps their case.
function schema({ id, ts, now }) {
  return [
    `CREATE TABLE IF NOT EXISTS users (
      id          ${id},
      "fullName"  TEXT NOT NULL,
      phone       TEXT NOT NULL UNIQUE,
      password    TEXT NOT NULL,
      role        TEXT NOT NULL CHECK (${CHECKS.role}),
      department  TEXT,
      status      TEXT NOT NULL DEFAULT 'active' CHECK (${CHECKS.userStatus}),
      "createdAt" ${ts} NOT NULL DEFAULT ${now},
      "createdBy" INTEGER REFERENCES users(id)
    )`,
    `CREATE TABLE IF NOT EXISTS tasks (
      id                ${id},
      title             TEXT NOT NULL,
      description       TEXT,
      priority          TEXT NOT NULL DEFAULT 'orta' CHECK (${CHECKS.priority}),
      status            TEXT NOT NULL DEFAULT 'kutilmoqda' CHECK (${CHECKS.taskStatus}),
      "assignedTo"      INTEGER NOT NULL REFERENCES users(id),
      "assignedBy"      INTEGER REFERENCES users(id),
      deadline          ${ts},
      "completedAt"     ${ts},
      "rejectionReason" TEXT,
      "createdAt"       ${ts} NOT NULL DEFAULT ${now}
    )`,
    `CREATE TABLE IF NOT EXISTS task_status_history (
      id           ${id},
      "taskId"     INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      "fromStatus" TEXT,
      "toStatus"   TEXT NOT NULL,
      "changedBy"  INTEGER REFERENCES users(id),
      note         TEXT,
      "createdAt"  ${ts} NOT NULL DEFAULT ${now}
    )`,
    `CREATE TABLE IF NOT EXISTS reports (
      id          ${id},
      "userId"    INTEGER NOT NULL REFERENCES users(id),
      department  TEXT,
      title       TEXT NOT NULL,
      content     TEXT NOT NULL,
      "createdAt" ${ts} NOT NULL DEFAULT ${now}
    )`,
    `CREATE TABLE IF NOT EXISTS activity_log (
      id          ${id},
      action      TEXT NOT NULL,
      "userId"    INTEGER REFERENCES users(id),
      "targetId"  INTEGER,
      details     TEXT,
      "createdAt" ${ts} NOT NULL DEFAULT ${now}
    )`,
    'CREATE INDEX IF NOT EXISTS idx_tasks_assignedTo ON tasks("assignedTo")',
    'CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)',
    'CREATE INDEX IF NOT EXISTS idx_tasks_createdAt ON tasks("createdAt")',
    'CREATE INDEX IF NOT EXISTS idx_reports_userId ON reports("userId")',
    'CREATE INDEX IF NOT EXISTS idx_reports_createdAt ON reports("createdAt")',
    'CREATE INDEX IF NOT EXISTS idx_activity_createdAt ON activity_log("createdAt")',
    'CREATE INDEX IF NOT EXISTS idx_activity_userId ON activity_log("userId")',
    'CREATE INDEX IF NOT EXISTS idx_history_taskId ON task_status_history("taskId")',
  ];
}

// Arbitrary constant so concurrently starting instances do not run the DDL at the same time.
const MIGRATION_LOCK = 7_414_201;
const SQLITE_SCHEMA_VERSION = 3;

export async function migrate() {
  if (dialect === 'postgres') {
    await pool.transaction(async (q) => {
      await q('SELECT pg_advisory_xact_lock($1)', [MIGRATION_LOCK]);
      for (const stmt of schema({ id: 'SERIAL PRIMARY KEY', ts: 'TIMESTAMPTZ', now: 'NOW()' })) await q(stmt);
    });
    return;
  }

  // SQLite: refuse to reuse a file created by an older, incompatible schema.
  const db = pool.sqlite;
  const hasTables = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'users'").get();
  if (hasTables && db.pragma('user_version', { simple: true }) !== SQLITE_SCHEMA_VERSION) {
    throw new Error(
      `Ma'lumotlar bazasi eski sxemada yaratilgan: ${SQLITE_FILE}\n` +
        "Eski bazani o'chiring yoki ko'chiring, so'ng qayta ishga tushiring."
    );
  }
  for (const stmt of schema({ id: 'INTEGER PRIMARY KEY', ts: 'TEXT', now: 'CURRENT_TIMESTAMP' })) db.exec(stmt);
  db.pragma(`user_version = ${SQLITE_SCHEMA_VERSION}`);
}

// Creates the default admin when no admin exists. Returns true if one was created.
export async function seedDefaultAdmin() {
  const { rows } = await pool.query("SELECT COUNT(*) AS n FROM users WHERE role = 'admin'");
  if (rows[0].n > 0) return false;
  const hash = await bcrypt.hash('admin123', 10);
  const { rowCount } = await pool.query(
    `INSERT INTO users ("fullName", phone, password, role, status)
     VALUES ($1, $2, $3, 'admin', 'active') ON CONFLICT (phone) DO NOTHING`,
    ['Administrator', DEFAULT_ADMIN_PHONE, hash]
  );
  return rowCount > 0;
}

// `npm run migrate` / `node db/migrate.js`
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await migrate();
    console.log(`Migratsiya bajarildi (${dialect === 'postgres' ? 'PostgreSQL' : 'SQLite'})`);
  } catch (err) {
    console.error(err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
