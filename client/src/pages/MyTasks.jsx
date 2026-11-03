import { useCallback, useEffect, useState } from 'react';
import { CalendarClock, Check, ChevronDown, ChevronRight, Play, RefreshCw, UserRound, X } from 'lucide-react';
import toast from 'react-hot-toast';
import api, { errorMessage } from '../api.js';
import { fmtDateTime, fmtRelative, isOverdue, statusLabel } from '../constants.js';
import uz, { rich, t } from '../lib/uz.js';
import { EmptyState, Field, Modal, PriorityBadge, Skeleton } from '../components/ui.jsx';

const COLUMNS = [
  { status: 'kutilmoqda', color: '#f59e0b' },
  { status: 'jarayonda', color: '#3b82f6' },
  { status: 'bajarildi', color: '#22c55e' },
];

const PRIORITY_ORDER = { shoshilinch: 0, yuqori: 1, orta: 2, past: 3 };

const STATUS_TOAST = {
  jarayonda: uz.task_started,
  bajarildi: uz.task_completed,
  rad_etildi: uz.task_rejected,
};

function TaskCard({ task, busy, onStart, onComplete, onReject }) {
  const overdue = isOverdue(task);
  return (
    <article className={`task-card p-${task.priority}`}>
      <div className="flex items-center gap-8" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
        <PriorityBadge priority={task.priority} />
        <span className="dim" style={{ fontSize: 12 }}>
          #{task.id}
        </span>
      </div>
      <h4>{task.title}</h4>
      {task.description && <p className="desc">{task.description}</p>}
      {task.status === 'rad_etildi' && task.rejectionReason && <div className="callout">{task.rejectionReason}</div>}
      <div className="meta">
        <span className={overdue ? 'overdue' : undefined}>
          <CalendarClock size={14} /> {fmtDateTime(task.deadline)}
          {overdue && uz.overdue_suffix}
        </span>
        <span>
          <UserRound size={14} /> {t('assigned_by_name', { name: task.assignedByName })}
        </span>
        {task.completedAt && (
          <span>
            <Check size={14} /> {t('completed_when', { time: fmtRelative(task.completedAt) })}
          </span>
        )}
      </div>
      {['kutilmoqda', 'jarayonda'].includes(task.status) && (
        <div className="actions">
          {task.status === 'kutilmoqda' && (
            <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => onStart(task)}>
              <Play size={14} /> {uz.start}
            </button>
          )}
          <button className="btn btn-success btn-sm" disabled={busy} onClick={() => onComplete(task)}>
            <Check size={14} /> {uz.complete}
          </button>
          <button className="btn btn-outline-danger btn-sm" disabled={busy} onClick={() => onReject(task)}>
            <X size={14} /> {uz.reject}
          </button>
        </div>
      )}
    </article>
  );
}

export default function MyTasks() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [rejecting, setRejecting] = useState(null);
  const [reason, setReason] = useState('');
  const [showRejected, setShowRejected] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setTasks(await api.get('/tasks'));
    } catch (err) {
      toast.error(errorMessage(err, uz.error_load));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const changeStatus = async (task, status, rejectionReason) => {
    setBusyId(task.id);
    try {
      const updated = await api.put(`/tasks/${task.id}/status`, { status, rejectionReason });
      setTasks((list) => list.map((x) => (x.id === task.id ? { ...x, ...updated } : x)));
      toast.success(STATUS_TOAST[status]);
      return true;
    } catch (err) {
      toast.error(errorMessage(err));
      return false;
    } finally {
      setBusyId(null);
    }
  };

  const openReject = (task) => {
    setReason('');
    setRejecting(task);
  };
  const closeReject = useCallback(() => setRejecting(null), []);

  const submitReject = async (e) => {
    e.preventDefault();
    if (!reason.trim()) return toast.error(uz.v_reason_required);
    if (await changeStatus(rejecting, 'rad_etildi', reason.trim())) setRejecting(null);
  };

  const byStatus = (status) =>
    tasks
      .filter((x) => x.status === status)
      .sort((a, b) =>
        status === 'bajarildi'
          ? (b.completedAt || '').localeCompare(a.completedAt || '')
          : PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || (a.deadline || '').localeCompare(b.deadline || '')
      );
  const rejected = byStatus('rad_etildi');

  return (
    <>
      <div className="page-header">
        <div>
          <h1>{uz.my_tasks_title}</h1>
          <p>{uz.my_tasks_subtitle}</p>
        </div>
        <button className="btn btn-secondary" onClick={load} disabled={loading}>
          <RefreshCw size={16} /> {uz.refresh}
        </button>
      </div>

      {loading && !tasks.length ? (
        <div className="board">
          {COLUMNS.map((c) => (
            <div key={c.status} className="board-col">
              <Skeleton width={100} height={16} style={{ margin: '4px 6px 14px' }} />
              <div className="board-cards">
                {[0, 1].map((i) => (
                  <div key={i} className="task-card" style={{ display: 'grid', gap: 10 }}>
                    <Skeleton width={60} height={18} radius={999} />
                    <Skeleton width="80%" />
                    <Skeleton width="55%" height={11} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : !tasks.length ? (
        <div className="card">
          <EmptyState variant="tasks" title={uz.my_tasks_empty_title} message={uz.my_tasks_empty_text} />
        </div>
      ) : (
        <>
          <div className="board">
            {COLUMNS.map((col) => {
              const list = byStatus(col.status);
              return (
                <section key={col.status} className="board-col" aria-label={statusLabel(col.status)}>
                  <div className="board-col-header">
                    <h3>
                      <i style={{ width: 8, height: 8, borderRadius: '50%', background: col.color, display: 'inline-block' }} />
                      {statusLabel(col.status)}
                    </h3>
                    <span className="count-pill">{list.length}</span>
                  </div>
                  <div className="board-cards">
                    {list.length ? (
                      list.map((task) => (
                        <TaskCard
                          key={task.id}
                          task={task}
                          busy={busyId === task.id}
                          onStart={(x) => changeStatus(x, 'jarayonda')}
                          onComplete={(x) => changeStatus(x, 'bajarildi')}
                          onReject={openReject}
                        />
                      ))
                    ) : (
                      <div className="col-empty">{uz.column_empty}</div>
                    )}
                  </div>
                </section>
              );
            })}
          </div>

          {rejected.length > 0 && (
            <div className="mt-24">
              <button className="btn btn-ghost" onClick={() => setShowRejected((s) => !s)}>
                {showRejected ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                {t('rejected_tasks', { n: rejected.length })}
              </button>
              {showRejected && (
                <div className="board mt-16">
                  {rejected.map((task) => (
                    <TaskCard key={task.id} task={task} />
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      <Modal
        open={Boolean(rejecting)}
        onClose={closeReject}
        title={uz.reject_modal_title}
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={closeReject}>
              {uz.cancel}
            </button>
            <button type="submit" form="reject-form" className="btn btn-danger" disabled={busyId === rejecting?.id || !reason.trim()}>
              {uz.reject}
            </button>
          </>
        }
      >
        <form id="reject-form" className="modal-body form-grid" onSubmit={submitReject}>
          <p className="muted" style={{ margin: 0 }}>
            {rich('reject_modal_text', { title: <b style={{ color: 'var(--text)' }}>{rejecting?.title}</b> })}
          </p>
          <Field label={uz.field_reason} htmlFor="reject-reason">
            <textarea
              id="reject-reason"
              className="textarea"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={uz.reason_ph}
              autoFocus
              required
            />
          </Field>
        </form>
      </Modal>
    </>
  );
}
