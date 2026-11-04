import pool from '../db/pool.js';

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const ok = (res, data, status = 200) => res.status(status).json({ success: true, data, error: null });


export const ROLES = ['admin', 'owner', 'worker'];
export const DEPARTMENTS = ['haydovchilar', 'dispetcherlar', 'mexaniklar', 'moliya'];
export const PRIORITIES = ['past', 'orta', 'yuqori', 'shoshilinch'];
export const TASK_STATUSES = ['kutilmoqda', 'jarayonda', 'bajarildi', 'rad_etildi'];
export const STATUS_LABELS = {
  kutilmoqda: 'Kutilmoqda',
  jarayonda: 'Jarayonda',
  bajarildi: 'Bajarildi',
  rad_etildi: 'Rad etildi',
};

export const str = (v) => (typeof v === 'string' ? v.trim() : '');

// Phones are stored as "+998" followed by exactly 9 digits. Spaces, dashes and brackets are ignored.
export function toPhone(v) {
  const digits = str(v).replace(/[\s()-]/g, '');
  const m = /^(?:\+?998)?(\d{9})$/.exec(digits);
  if (!m) throw new ApiError(400, "Telefon raqam +998 dan keyin 9 ta raqamdan iborat bo'lishi kerak");
  return `+998${m[1]}`;
}

export function toId(v) {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw new ApiError(400, "Noto'g'ri ID");
  return n;
}

// Accepts any date/datetime string, returns a Date or null for empty input.
export function toTs(v) {
  if (v === undefined || v === null || v === '') return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) throw new ApiError(400, "Noto'g'ri sana");
  return d;
}

// Date-range filters: a plain "YYYY-MM-DD" covers the whole day in the server's local time.
export function toRangeStart(v) {
  if (!v) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return new Date(`${v}T00:00:00`);
  return toTs(v);
}

export function toRangeEnd(v) {
  if (!v) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const d = new Date(`${v}T00:00:00`);
    d.setDate(d.getDate() + 1);
    return d;
  }
  return toTs(v);
}

// Collects positional parameters while building dynamic SQL: `WHERE x = ${p(value)}`.
export function paramList() {
  const params = [];
  const p = (v) => {
    params.push(v);
    return `$${params.length}`;
  };
  return { params, p };
}

// Pass the transaction's query function when logging inside a transaction.
export async function logActivity(action, userId, targetId = null, details = null, query = pool.query.bind(pool)) {
  await query('INSERT INTO activity_log (action, "userId", "targetId", details) VALUES ($1, $2, $3, $4)', [
    action,
    userId ?? null,
    targetId ?? null,
    details ? JSON.stringify(details) : null,
  ]);
}

export const publicUser = (u) => {
  if (!u) return u;
  const { password, ...rest } = u;
  return rest;
};
