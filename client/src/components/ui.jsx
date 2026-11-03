import { useEffect, useId } from 'react';
import { Activity, ClipboardList, FileText, SearchX, Users, X } from 'lucide-react';
import {
  initials,
  PHONE_PREFIX,
  phoneDigits,
  PRIORITY_TONE,
  priorityLabel,
  ROLE_TONE,
  roleLabel,
  STATUS_TONE,
  statusLabel,
} from '../constants.js';
import uz from '../lib/uz.js';

export function Badge({ tone = 'slate', dot = false, children }) {
  return <span className={`badge badge-${tone}${dot ? ' badge-dot' : ''}`}>{children}</span>;
}

export const StatusBadge = ({ status }) => (
  <Badge tone={STATUS_TONE[status]} dot>
    {statusLabel(status)}
  </Badge>
);

export const PriorityBadge = ({ priority }) => (
  <Badge tone={PRIORITY_TONE[priority]}>{priorityLabel(priority)}</Badge>
);

export const RoleBadge = ({ role }) => <Badge tone={ROLE_TONE[role]}>{roleLabel(role)}</Badge>;

export const Avatar = ({ name, size }) => (
  <div className="avatar" style={size ? { width: size, height: size, fontSize: size * 0.36 } : undefined} aria-hidden>
    {initials(name)}
  </div>
);

export function Modal({ open, title, onClose, children, footer, size }) {
  const titleId = useId();
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={`modal${size === 'lg' ? ' modal-lg' : ''}`} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="modal-header">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="btn btn-ghost btn-icon" onClick={onClose} aria-label={uz.close}>
            <X size={18} />
          </button>
        </div>
        {children}
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}

export const Skeleton = ({ width = '100%', height = 14, style, radius }) => (
  <div className="skeleton" style={{ width, height, borderRadius: radius, ...style }} />
);

export function TableSkeleton({ rows = 6, cols = 5 }) {
  return (
    <div style={{ padding: '8px 16px' }} aria-busy="true" aria-label={uz.loading}>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} style={{ display: 'flex', gap: 16, padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} height={14} width={c === 0 ? '28%' : `${12 + ((r + c) % 3) * 4}%`} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function ListSkeleton({ rows = 5 }) {
  return (
    <div aria-busy="true" aria-label={uz.loading}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="list-item">
          <Skeleton width={34} height={34} radius={9} />
          <div style={{ flex: 1, display: 'grid', gap: 8 }}>
            <Skeleton width={`${55 + (i % 3) * 12}%`} />
            <Skeleton width="35%" height={11} />
          </div>
        </div>
      ))}
    </div>
  );
}

const EMPTY_ICONS = { tasks: ClipboardList, reports: FileText, users: Users, activity: Activity, notfound: SearchX };

export function EmptyState({ variant = 'tasks', title, message, action }) {
  const Icon = EMPTY_ICONS[variant] ?? ClipboardList;
  return (
    <div className="empty">
      <div className="empty-icon">
        <Icon size={26} />
      </div>
      <h4>{title}</h4>
      {message && <p>{message}</p>}
      {action}
    </div>
  );
}

export const Spinner = () => <div className="spinner" role="status" aria-label={uz.loading} />;

export const Field = ({ label, htmlFor, hint, children }) => (
  <div className="field">
    {label && <label htmlFor={htmlFor}>{label}</label>}
    {children}
    {hint && <span className="hint">{hint}</span>}
  </div>
);

// "+998" is a fixed prefix; the input holds only the remaining 9 digits.
export function PhoneInput({ id, value, onChange, autoFocus, autoComplete }) {
  return (
    <div className="phone-input">
      <span className="phone-prefix" aria-hidden="true">
        {PHONE_PREFIX}
      </span>
      <input
        id={id}
        className="input"
        type="tel"
        inputMode="numeric"
        autoComplete={autoComplete}
        placeholder={uz.phone_placeholder}
        value={value}
        onChange={(e) => onChange(phoneDigits(e.target.value))}
        autoFocus={autoFocus}
        aria-describedby={id ? `${id}-prefix` : undefined}
      />
      {id && (
        <span id={`${id}-prefix`} className="sr-only">
          {uz.phone_hint}
        </span>
      )}
    </div>
  );
}
