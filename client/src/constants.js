import { format, formatDistanceToNow, isPast } from 'date-fns';
import { uz as uzLocale } from 'date-fns/locale';
import uz from './lib/uz.js';

export const DEPARTMENTS = ['haydovchilar', 'dispetcherlar', 'mexaniklar', 'moliya'];
export const ROLES = ['admin', 'owner', 'worker'];
export const PRIORITIES = ['past', 'orta', 'yuqori', 'shoshilinch'];
export const STATUSES = ['kutilmoqda', 'jarayonda', 'bajarildi', 'rad_etildi'];

export const STATUS_TONE = { kutilmoqda: 'amber', jarayonda: 'blue', bajarildi: 'green', rad_etildi: 'red' };
export const PRIORITY_TONE = { past: 'slate', orta: 'blue', yuqori: 'amber', shoshilinch: 'red' };
export const ROLE_TONE = { admin: 'purple', owner: 'blue', worker: 'slate' };

export const statusLabel = (s) => uz[`status_${s}`] ?? s;
export const priorityLabel = (p) => uz[`priority_${p}`] ?? p;
export const roleLabel = (r) => uz[`role_${r}`] ?? r;
export const deptLabel = (d) => (d ? uz[`dept_${d}`] ?? d : '');

// The server stores SQLite CURRENT_TIMESTAMP values ("YYYY-MM-DD HH:MM:SS", UTC, no zone suffix).
export const toDate = (v) => {
  if (v instanceof Date) return v;
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(v)) return new Date(`${v.replace(' ', 'T')}Z`);
  return new Date(v);
};

const opts = { locale: uzLocale };
export const fmtDate = (v) => (v ? format(toDate(v), 'd MMM yyyy', opts) : '—');
export const fmtDateTime = (v) => (v ? format(toDate(v), 'd MMM yyyy, HH:mm', opts) : '—');
export const fmtTime = (v) => (v ? format(toDate(v), 'HH:mm', opts) : '');
export const fmtPattern = (v, pattern) => format(toDate(v), pattern, opts);
export const fmtRelative = (v) => (v ? formatDistanceToNow(toDate(v), { addSuffix: true, ...opts }) : '');
export const isOverdue = (task) =>
  task.deadline && ['kutilmoqda', 'jarayonda'].includes(task.status) && isPast(toDate(task.deadline));

// Value for <input type="datetime-local"> in the browser's local time.
export const toLocalInput = (d) => format(d, "yyyy-MM-dd'T'HH:mm");

// Phones are stored as "+998" + 9 digits; forms edit only the 9 digits.
export const PHONE_PREFIX = '+998';
export const phoneDigits = (v = '') => {
  const d = String(v).replace(/\D/g, '');
  return (d.length === 12 && d.startsWith('998') ? d.slice(3) : d).slice(0, 9);
};
export const fullPhone = (digits) => `${PHONE_PREFIX}${digits}`;
export const isValidPhoneDigits = (digits) => /^\d{9}$/.test(digits);
export const fmtPhone = (v) => {
  const m = /^\+998(\d{2})(\d{3})(\d{2})(\d{2})$/.exec(v || '');
  return m ? `+998 ${m[1]} ${m[2]} ${m[3]} ${m[4]}` : v;
};

export const initials = (name = '') =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('') || '?';
