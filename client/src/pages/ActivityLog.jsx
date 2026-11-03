import { Fragment, useCallback, useEffect, useState } from 'react';
import { isToday, isYesterday } from 'date-fns';
import { ClipboardList, FileText, LogIn, RefreshCw, UserCog, UserX, X } from 'lucide-react';
import toast from 'react-hot-toast';
import api, { errorMessage } from '../api.js';
import { deptLabel, fmtPattern, fmtTime, priorityLabel, roleLabel, statusLabel, toDate } from '../constants.js';
import uz, { rich, t } from '../lib/uz.js';
import { EmptyState, Field, ListSkeleton } from '../components/ui.jsx';

const PAGE = 50;
const EMPTY_FILTERS = { action: '', userId: '', from: '', to: '' };

const ICONS = {
  auth: { icon: LogIn, tone: 'blue' },
  user: { icon: UserCog, tone: 'red' },
  task: { icon: ClipboardList, tone: 'amber' },
  report: { icon: FileText, tone: 'green' },
};
const DELETE_ICON = { icon: UserX, tone: 'red' };

// "task.status" -> uz.action_task_status / uz.feed_task_status
const actionKey = (action) => action.replace('.', '_');
const actionLabel = (action) => uz[`action_${actionKey(action)}`] ?? action;

function describe(item) {
  const d = item.details || {};
  const target = <b>{d.title ?? d.fullName}</b>;
  switch (item.action) {
    case 'auth.login':
      return uz.feed_login;
    case 'user.create':
      return (
        <>
          {rich('feed_user_create', { target, role: roleLabel(d.role) })}
          {d.department ? ` (${deptLabel(d.department)})` : ''}
        </>
      );
    case 'user.update': {
      const fields = Object.keys(d.changes || {}).map((k) => uz[`changed_${k}`] ?? k);
      return (
        <>
          {rich('feed_user_update', { target })}
          {fields.length > 0 && <span className="muted"> — {t('feed_changed', { fields: fields.join(', ') })}</span>}
        </>
      );
    }
    case 'user.delete':
      return (
        <>
          {rich('feed_user_delete', { target, role: roleLabel(d.role) })}
          {(d.tasks > 0 || d.reports > 0) && (
            <span className="muted"> — {t('feed_deleted_counts', { tasks: d.tasks, reports: d.reports })}</span>
          )}
        </>
      );
    case 'user.activate':
    case 'user.deactivate':
    case 'task.update':
      return rich(`feed_${actionKey(item.action)}`, { target });
    case 'task.create':
      return rich('feed_task_create', { target, priority: priorityLabel(d.priority) });
    case 'task.status':
      return (
        <>
          {rich('feed_task_status', { target, from: statusLabel(d.from), to: <b>{statusLabel(d.to)}</b> })}
          {d.reason && <span className="muted"> — “{d.reason}”</span>}
        </>
      );
    case 'report.create':
      return (
        <>
          {rich('feed_report_create', { target })}
          {d.department && <span className="muted"> ({deptLabel(d.department)})</span>}
        </>
      );
    default:
      return uz.feed_unknown;
  }
}

const dayLabel = (ts) => {
  const d = toDate(ts);
  if (isToday(d)) return uz.today;
  if (isYesterday(d)) return uz.yesterday;
  return fmtPattern(d, 'EEEE, d MMMM yyyy');
};

export default function ActivityLog() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [actions, setActions] = useState([]);
  const [users, setUsers] = useState([]);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const params = useCallback(
    (offset) => ({ ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)), limit: PAGE, offset }),
    [filters]
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/activity', { params: params(0) });
      setItems(res.items);
      setTotal(res.total);
      setActions(res.actions);
    } catch (err) {
      toast.error(errorMessage(err, uz.error_load));
    } finally {
      setLoading(false);
    }
  }, [params]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    api
      .get('/users')
      .then(setUsers)
      .catch(() => {});
  }, []);

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const res = await api.get('/activity', { params: params(items.length) });
      setItems((list) => [...list, ...res.items]);
      setTotal(res.total);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setLoadingMore(false);
    }
  };

  const setFilter = (k) => (e) => setFilters((f) => ({ ...f, [k]: e.target.value }));
  const hasFilters = Object.values(filters).some(Boolean);

  let lastDay = null;

  return (
    <>
      <div className="page-header">
        <div>
          <h1>{uz.activity_title}</h1>
          <p>{uz.activity_subtitle}</p>
        </div>
        <button className="btn btn-secondary" onClick={load} disabled={loading}>
          <RefreshCw size={16} /> {uz.refresh}
        </button>
      </div>

      <div className="card">
        <div className="filters">
          <Field label={uz.filter_action} htmlFor="af-action">
            <select id="af-action" className="select" value={filters.action} onChange={setFilter('action')}>
              <option value="">{uz.all_actions}</option>
              {actions.map((a) => (
                <option key={a} value={a}>
                  {actionLabel(a)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={uz.filter_user} htmlFor="af-user">
            <select id="af-user" className="select" value={filters.userId} onChange={setFilter('userId')}>
              <option value="">{uz.all_users}</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.fullName} ({roleLabel(u.role)})
                </option>
              ))}
            </select>
          </Field>
          <Field label={uz.filter_from} htmlFor="af-from">
            <input id="af-from" type="date" className="input" value={filters.from} onChange={setFilter('from')} />
          </Field>
          <Field label={uz.filter_to} htmlFor="af-to">
            <input id="af-to" type="date" className="input" value={filters.to} onChange={setFilter('to')} />
          </Field>
          {hasFilters && (
            <button className="btn btn-ghost" onClick={() => setFilters(EMPTY_FILTERS)}>
              <X size={16} /> {uz.clear}
            </button>
          )}
        </div>

        {loading && !items.length ? (
          <ListSkeleton rows={8} />
        ) : !items.length ? (
          <EmptyState
            variant="activity"
            title={hasFilters ? uz.no_match_title : uz.no_activity_title}
            message={hasFilters ? uz.no_match_text : uz.no_activity_text}
          />
        ) : (
          <div style={{ opacity: loading ? 0.6 : 1 }}>
            {items.map((item) => {
              const day = dayLabel(item.createdAt);
              const showDay = day !== lastDay;
              lastDay = day;
              const meta = item.action === 'user.delete' ? DELETE_ICON : ICONS[item.action.split('.')[0]] || ICONS.task;
              const Icon = meta.icon;
              return (
                <Fragment key={item.id}>
                  {showDay && <div className="feed-day">{day}</div>}
                  <div className="feed-item">
                    <div className={`list-icon tone-${meta.tone}`}>
                      <Icon size={16} />
                    </div>
                    <div className="feed-text">
                      <b>{item.userName || uz.system}</b>
                      {item.userRole && <span className="dim"> · {roleLabel(item.userRole)}</span>} {describe(item)}
                    </div>
                    <div className="feed-time">{fmtTime(item.createdAt)}</div>
                  </div>
                </Fragment>
              );
            })}
            {items.length < total && (
              <div style={{ padding: 16, textAlign: 'center', borderTop: '1px solid var(--border)' }}>
                <button className="btn btn-secondary" onClick={loadMore} disabled={loadingMore}>
                  {loadingMore ? uz.loading : t('load_more', { n: total - items.length })}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
