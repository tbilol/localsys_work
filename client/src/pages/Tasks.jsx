import { Fragment, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CheckCheck, ChevronDown, ChevronRight, Plus, X } from 'lucide-react';
import toast from 'react-hot-toast';
import api, { errorMessage } from '../api.js';
import {
  deptLabel,
  fmtDateTime,
  isOverdue,
  PRIORITIES,
  priorityLabel,
  STATUS_TONE,
  statusLabel,
  STATUSES,
} from '../constants.js';
import uz, { rich, t } from '../lib/uz.js';
import TaskFormModal from '../components/TaskFormModal.jsx';
import { EmptyState, Field, PriorityBadge, Skeleton, StatusBadge, TableSkeleton } from '../components/ui.jsx';

const EMPTY_FILTERS = { status: '', priority: '', assignedTo: '', from: '', to: '', search: '' };
const DOT = { amber: '#f59e0b', blue: '#3b82f6', green: '#22c55e', red: '#ef4444' };

function TaskDetail({ id }) {
  const [task, setTask] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .get(`/tasks/${id}`)
      .then(setTask)
      .catch((err) => setError(errorMessage(err)));
  }, [id]);

  if (error) return <div className="detail text-danger">{error}</div>;
  if (!task) {
    return (
      <div className="detail">
        <div style={{ display: 'grid', gap: 8 }}>
          <Skeleton width="80%" />
          <Skeleton width="60%" />
        </div>
        <div style={{ display: 'grid', gap: 8 }}>
          <Skeleton width="70%" />
          <Skeleton width="50%" />
        </div>
      </div>
    );
  }

  return (
    <div className="detail">
      <div>
        <h5>{uz.detail_description}</h5>
        <p className="desc">{task.description || <span className="dim">{uz.no_description}</span>}</p>
        {task.rejectionReason && (
          <div className="callout">
            <b>{uz.rejection_reason}:</b> {task.rejectionReason}
          </div>
        )}
        <dl className="kv">
          <dt>{uz.assigned_by}</dt>
          <dd>{task.assignedByName || '—'}</dd>
          <dt>{uz.department}</dt>
          <dd>{deptLabel(task.assignedToDepartment) || '—'}</dd>
          <dt>{uz.created_at}</dt>
          <dd>{fmtDateTime(task.createdAt)}</dd>
          <dt>{uz.completed_at}</dt>
          <dd>{fmtDateTime(task.completedAt)}</dd>
        </dl>
      </div>
      <div>
        <h5>{uz.status_history}</h5>
        <ul className="timeline">
          {task.history.map((h) => (
            <li key={h.id}>
              <span className="tl-dot" style={{ background: DOT[STATUS_TONE[h.toStatus]] }} />
              <div>
                {h.fromStatus
                  ? rich('history_moved', { name: <b>{h.changedByName || uz.system}</b>, status: <b>{statusLabel(h.toStatus)}</b> })
                  : rich('history_created', { name: <b>{h.changedByName || uz.system}</b> })}
              </div>
              {h.note && <div className="muted">“{h.note}”</div>}
              <div className="tl-time">{fmtDateTime(h.createdAt)}</div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default function Tasks() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [tasks, setTasks] = useState([]);
  const [workers, setWorkers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [expanded, setExpanded] = useState(null);
  const [selected, setSelected] = useState(() => new Set());
  const [modalOpen, setModalOpen] = useState(searchParams.get('new') === '1');
  const [bulkBusy, setBulkBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v));
      setTasks(await api.get('/tasks', { params }));
    } catch (err) {
      toast.error(errorMessage(err, uz.error_load));
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    const timer = setTimeout(load, filters.search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [load, filters.search]);

  useEffect(() => {
    api
      .get('/users/workers', { params: { all: 'true' } })
      .then(setWorkers)
      .catch(() => {});
  }, []);

  // Keep the selection limited to rows that are still visible.
  useEffect(() => {
    setSelected((prev) => new Set([...prev].filter((id) => tasks.some((task) => task.id === id))));
  }, [tasks]);

  const setFilter = (k) => (e) => setFilters((f) => ({ ...f, [k]: e.target.value }));
  const hasFilters = Object.values(filters).some(Boolean);

  const closeModal = useCallback(() => {
    setModalOpen(false);
    if (searchParams.has('new')) setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams]);

  const selectable = tasks.filter((task) => task.status !== 'bajarildi');
  const allSelected = selectable.length > 0 && selectable.every((task) => selected.has(task.id));

  const toggle = (id) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(selectable.map((task) => task.id)));

  const bulkComplete = async () => {
    setBulkBusy(true);
    try {
      const { updated } = await api.put('/tasks/bulk/status', { ids: [...selected], status: 'bajarildi' });
      toast.success(t('bulk_done', { n: updated }));
      setSelected(new Set());
      setExpanded(null);
      load();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBulkBusy(false);
    }
  };

  const openNew = () => setModalOpen(true);

  return (
    <>
      <div className="page-header">
        <div>
          <h1>{uz.tasks_title}</h1>
          <p>{uz.tasks_subtitle}</p>
        </div>
        <button className="btn btn-primary" onClick={openNew}>
          <Plus size={18} /> {uz.new_task}
        </button>
      </div>

      <div className="card">
        <div className="filters">
          <Field label={uz.filter_search} htmlFor="f-search">
            <input id="f-search" className="input" placeholder={uz.search_tasks_ph} value={filters.search} onChange={setFilter('search')} />
          </Field>
          <Field label={uz.filter_status} htmlFor="f-status">
            <select id="f-status" className="select" value={filters.status} onChange={setFilter('status')}>
              <option value="">{uz.all_statuses}</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {statusLabel(s)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={uz.filter_priority} htmlFor="f-priority">
            <select id="f-priority" className="select" value={filters.priority} onChange={setFilter('priority')}>
              <option value="">{uz.all_priorities}</option>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {priorityLabel(p)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={uz.filter_worker} htmlFor="f-worker">
            <select id="f-worker" className="select" value={filters.assignedTo} onChange={setFilter('assignedTo')}>
              <option value="">{uz.all_workers}</option>
              {workers.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.fullName}
                  {w.status === 'inactive' ? ` ${uz.inactive_suffix}` : ''}
                </option>
              ))}
            </select>
          </Field>
          <Field label={uz.filter_from} htmlFor="f-from">
            <input id="f-from" type="date" className="input" value={filters.from} onChange={setFilter('from')} />
          </Field>
          <Field label={uz.filter_to} htmlFor="f-to">
            <input id="f-to" type="date" className="input" value={filters.to} onChange={setFilter('to')} />
          </Field>
          {hasFilters && (
            <button className="btn btn-ghost" onClick={() => setFilters(EMPTY_FILTERS)}>
              <X size={16} /> {uz.clear}
            </button>
          )}
        </div>

        {selected.size > 0 && (
          <div className="bulk-bar">
            <span>{t('selected_count', { n: selected.size })}</span>
            <div className="flex gap-8">
              <button className="btn btn-ghost btn-sm" onClick={() => setSelected(new Set())}>
                {uz.clear_selection}
              </button>
              <button className="btn btn-success btn-sm" onClick={bulkComplete} disabled={bulkBusy}>
                <CheckCheck size={16} /> {bulkBusy ? uz.updating : uz.bulk_complete}
              </button>
            </div>
          </div>
        )}

        {loading && !tasks.length ? (
          <TableSkeleton rows={7} cols={6} />
        ) : !tasks.length ? (
          hasFilters ? (
            <EmptyState variant="tasks" title={uz.no_match_title} message={uz.no_match_text} />
          ) : (
            <EmptyState
              variant="tasks"
              title={uz.no_tasks_title}
              message={uz.no_tasks_text}
              action={
                <button className="btn btn-primary" onClick={openNew}>
                  <Plus size={18} /> {uz.new_task}
                </button>
              }
            />
          )
        ) : (
          <div className="table-wrap" style={{ opacity: loading ? 0.6 : 1, transition: 'opacity .15s' }}>
            <table className="table">
              <thead>
                <tr>
                  <th className="col-check">
                    <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label={uz.select_all} disabled={!selectable.length} />
                  </th>
                  <th>{uz.col_task}</th>
                  <th>{uz.col_assignee}</th>
                  <th>{uz.col_priority}</th>
                  <th>{uz.col_status}</th>
                  <th>{uz.col_deadline}</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((task) => {
                  const open = expanded === task.id;
                  const overdue = isOverdue(task);
                  return (
                    <Fragment key={task.id}>
                      <tr className={`clickable${open ? ' expanded' : ''}`} onClick={() => setExpanded(open ? null : task.id)}>
                        <td className="col-check" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selected.has(task.id)}
                            onChange={() => toggle(task.id)}
                            disabled={task.status === 'bajarildi'}
                            aria-label={t('select_row', { title: task.title })}
                          />
                        </td>
                        <td className="cell-main">
                          <div className="flex items-center gap-8">
                            {open ? <ChevronDown size={16} className="dim" /> : <ChevronRight size={16} className="dim" />}
                            <div>
                              <div className="cell-title">{task.title}</div>
                              <div className="cell-sub">
                                #{task.id}
                                {task.assignedByName && ` · ${t('created_by', { name: task.assignedByName })}`}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td data-label={uz.col_assignee}>
                          <div className="nowrap">{task.assignedToName}</div>
                          <div className="cell-sub">{deptLabel(task.assignedToDepartment)}</div>
                        </td>
                        <td data-label={uz.col_priority}>
                          <PriorityBadge priority={task.priority} />
                        </td>
                        <td data-label={uz.col_status}>
                          <StatusBadge status={task.status} />
                        </td>
                        <td className={`nowrap ${overdue ? 'overdue' : 'muted'}`} data-label={uz.col_deadline}>
                          {fmtDateTime(task.deadline)}
                          {overdue && <div className="cell-sub overdue">{uz.overdue}</div>}
                        </td>
                      </tr>
                      {open && (
                        <tr className="detail-row">
                          <td colSpan={6}>
                            <TaskDetail id={task.id} key={`${task.id}-${task.status}`} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <TaskFormModal
        open={modalOpen}
        onClose={closeModal}
        onSaved={load}
        workers={workers.filter((w) => w.status === 'active')}
      />
    </>
  );
}
