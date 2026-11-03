export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const ok = (res, data, status = 200) => res.status(status).json({ success: true, data, error: null });

export const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

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

// Same format SQLite's CURRENT_TIMESTAMP produces: "YYYY-MM-DD HH:MM:SS" in UTC.
export const toSqlTs = (d) => new Date(d).toISOString().slice(0, 19).replace('T', ' ');
export const fromSqlTs = (s) => new Date(`${s.replace(' ', 'T')}Z`);

// Accepts any date/datetime string, returns a SQL timestamp or null for empty input.
export function toTs(v) {
  if (v === undefined || v === null || v === '') return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) throw new ApiError(400, "Noto'g'ri sana");
  return toSqlTs(d);
}

// Date-range filters: a plain "YYYY-MM-DD" covers the whole local day.
export function toRangeStart(v) {
  if (!v) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return toSqlTs(new Date(`${v}T00:00:00`));
  return toTs(v);
}

export function toRangeEnd(v) {
  if (!v) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const d = new Date(`${v}T00:00:00`);
    d.setDate(d.getDate() + 1);
    return toSqlTs(d);
  }
  return toTs(v);
}

export const publicUser = (u) => {
  if (!u) return u;
  const { password, ...rest } = u;
  return rest;
};
