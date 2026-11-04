import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// One query interface for both databases:
//   pool.query(text, params)    -> { rows, rowCount }   (text uses $1, $2 … placeholders)
//   pool.transaction(async (query) => …)
//   pool.end()
// With DATABASE_URL set it is a real pg Pool (PostgreSQL / Supabase). Without it, local development
// falls back to a SQLite file wrapped to look the same.
//
// Both modes return timestamps as ISO strings ("2026-11-03T12:00:00.000Z") and COUNT(*) as numbers.

export const dialect = process.env.DATABASE_URL ? 'postgres' : 'sqlite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// SQLITE_PATH overrides the default file location (useful for tests or a second local instance).
export const SQLITE_FILE = process.env.SQLITE_PATH
  ? path.resolve(process.env.SQLITE_PATH)
  : path.resolve(__dirname, '..', 'data', 'localsystem.db');

let pool;

if (dialect === 'postgres') {
  const { default: pg } = await import('pg');
  pg.types.setTypeParser(pg.types.builtins.INT8, (v) => Number.parseInt(v, 10));
  // "2026-11-03 17:00:00.123+05" -> ISO; the space/short-offset form is not reliably parsed by Date.
  pg.types.setTypeParser(pg.types.builtins.TIMESTAMPTZ, (v) =>
    new Date(v.replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00')).toISOString()
  );

  const url = new URL(process.env.DATABASE_URL);
  const isLocal = ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
  // Supabase requires TLS; its certificate chain is not in Node's default store.
  const ssl = process.env.PGSSL === 'disable' || isLocal ? false : { rejectUnauthorized: false };

  pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl,
    max: Number(process.env.PG_POOL_MAX) || 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
  pool.on('error', (err) => console.error("PostgreSQL ulanishida xatolik:", err.message));

  pool.transaction = async (fn) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn((text, params) => client.query(text, params));
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  };
} else {
  const { default: Database } = await import('better-sqlite3');
  fs.mkdirSync(path.dirname(SQLITE_FILE), { recursive: true });
  const db = new Database(SQLITE_FILE);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // SQLite stores timestamps as "YYYY-MM-DD HH:MM:SS" (UTC), the format CURRENT_TIMESTAMP produces.
  const TS_COLUMNS = new Set(['createdAt', 'completedAt', 'deadline']);
  const SQL_TS = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;
  const toParam = (v) => {
    if (v instanceof Date) return v.toISOString().slice(0, 19).replace('T', ' ');
    if (typeof v === 'boolean') return v ? 1 : 0;
    return v;
  };
  const toRow = (row) => {
    for (const key of Object.keys(row)) {
      if (TS_COLUMNS.has(key) && typeof row[key] === 'string' && SQL_TS.test(row[key])) {
        row[key] = new Date(`${row[key].replace(' ', 'T')}Z`).toISOString();
      }
    }
    return row;
  };

  const cache = new Map();
  // "$1 … $1 … $2" -> "? … ? … ?" with the argument list expanded to match.
  function compile(text) {
    let entry = cache.get(text);
    if (!entry) {
      const order = [];
      const sql = text.replace(/\$(\d+)/g, (_, n) => {
        order.push(Number(n) - 1);
        return '?';
      });
      entry = { stmt: db.prepare(sql), order };
      cache.set(text, entry);
    }
    return entry;
  }

  const query = async (text, params = []) => {
    const { stmt, order } = compile(text);
    const args = order.map((i) => toParam(params[i]));
    if (stmt.reader) {
      const rows = stmt.all(...args).map(toRow);
      return { rows, rowCount: rows.length };
    }
    const info = stmt.run(...args);
    return { rows: [], rowCount: info.changes };
  };

  // better-sqlite3 is synchronous, so every query in the callback resolves in the same tick chain;
  // no other request can interleave with an open transaction as long as the callback only awaits
  // database calls (which is all the routes do inside transactions).
  const transaction = async (fn) => {
    db.exec('BEGIN');
    try {
      const result = await fn(query);
      db.exec('COMMIT');
      return result;
    } catch (err) {
      if (db.inTransaction) db.exec('ROLLBACK');
      throw err;
    }
  };

  pool = { query, transaction, end: async () => db.close(), sqlite: db };
}

pool.dialect = dialect;

// Small dialect-specific SQL fragments for the JSON stored in activity_log.details (TEXT).
export const sql = {
  jsonText: (col, key) =>
    dialect === 'postgres' ? `(${col}::jsonb ->> '${key}')` : `json_extract(${col}, '$.${key}')`,
  // Merges {key: $a, key2: $b …} into a JSON text column; pairs are [key, placeholder].
  jsonMerge: (col, pairs) =>
    dialect === 'postgres'
      ? `(COALESCE(${col}, '{}')::jsonb || jsonb_build_object(${pairs.map(([k, p]) => `'${k}', ${p}::text`).join(', ')}))::text`
      : `json_set(COALESCE(${col}, '{}'), ${pairs.map(([k, p]) => `'$.${k}', ${p}`).join(', ')})`,
};

export { pool };
export default pool;
