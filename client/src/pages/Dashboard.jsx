import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CalendarClock, CheckCircle2, FileWarning, FileText, RefreshCw, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import api, { errorMessage } from '../api.js';
import { deptLabel, fmtDate, fmtPattern, fmtRelative } from '../constants.js';
import uz, { t } from '../lib/uz.js';
import { EmptyState, ListSkeleton, PriorityBadge, Skeleton, StatusBadge, TableSkeleton } from '../components/ui.jsx';
import { useAuth } from '../context/AuthContext.jsx';

const SERIES = [
  { key: 'created', label: uz.chart_created, color: '#3b82f6' },
  { key: 'completed', label: uz.chart_completed, color: '#22c55e' },
  { key: 'rejected', label: uz.chart_rejected, color: '#ef4444' },
];

// Chart dates arrive as local "YYYY-MM-DD" keys; parse them as local midnight.
const localDay = (key) => new Date(`${key}T00:00:00`);

function StatCard({ icon: Icon, tone, label, value, hint, loading }) {
  return (
    <div className="card stat-card">
      <div className={`stat-icon tone-${tone}`}>
        <Icon size={22} />
      </div>
      <div>
        <div className="stat-label">{label}</div>
        {loading ? <Skeleton width={56} height={30} style={{ margin: '4px 0' }} /> : <div className="stat-value">{value}</div>}
        {hint && <div className="stat-hint">{hint}</div>}
      </div>
    </div>
  );
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="card" style={{ padding: '10px 12px', fontSize: 13, boxShadow: 'var(--shadow)' }}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{fmtPattern(localDay(label), 'EEEE, d MMMM')}</div>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center gap-8">
          <i style={{ width: 8, height: 8, borderRadius: 2, background: p.color, display: 'inline-block' }} />
          <span className="muted">{p.name}</span>
          <b style={{ marginLeft: 'auto', paddingLeft: 12 }}>{p.value}</b>
        </div>
      ))}
    </div>
  );
}

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? uz.greeting_morning : h < 18 ? uz.greeting_afternoon : uz.greeting_evening;
};

export default function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [chart, setChart] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, c] = await Promise.all([api.get('/dashboard/stats'), api.get('/dashboard/chart-data')]);
      setStats(s);
      setChart(c);
    } catch (err) {
      toast.error(errorMessage(err, uz.error_load));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const chartEmpty = chart && chart.every((d) => !d.created && !d.completed && !d.rejected);

  return (
    <>
      <div className="page-header">
        <div>
          <h1>{uz.dashboard_title}</h1>
          <p>{t('dashboard_subtitle', { greeting: greeting(), name: user.fullName.split(' ')[0] })}</p>
        </div>
        <button className="btn btn-secondary" onClick={load} disabled={loading}>
          <RefreshCw size={16} /> {uz.refresh}
        </button>
      </div>

      <div className="grid stats-grid">
        <StatCard icon={Users} tone="blue" label={uz.stat_active_workers} value={stats?.totalWorkers} loading={loading} />
        <StatCard
          icon={CalendarClock}
          tone="amber"
          label={uz.stat_tasks_today}
          value={stats?.tasksToday}
          hint={stats ? t('stat_overdue_hint', { n: stats.overdue }) : null}
          loading={loading}
        />
        <StatCard icon={CheckCircle2} tone="green" label={uz.stat_completed_week} value={stats?.completedThisWeek} loading={loading} />
        <StatCard
          icon={FileWarning}
          tone="red"
          label={uz.stat_pending_reports}
          value={stats?.pendingReports}
          hint={uz.stat_pending_reports_hint}
          loading={loading}
        />
      </div>

      <div className="card mt-16">
        <div className="card-header">
          <div>
            <h3>{uz.chart_title}</h3>
            <div className="sub">{uz.chart_subtitle}</div>
          </div>
          <div className="legend">
            {SERIES.map((s) => (
              <span key={s.key}>
                <i style={{ background: s.color }} />
                {s.label}
              </span>
            ))}
          </div>
        </div>
        {loading && !chart ? (
          <div style={{ padding: 20 }}>
            <Skeleton height={260} />
          </div>
        ) : chartEmpty ? (
          <EmptyState variant="activity" title={uz.chart_empty_title} message={uz.chart_empty_text} />
        ) : (
          <div className="chart-box">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chart || []} barGap={3} margin={{ left: 0, right: 8 }}>
                <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={(d) => fmtPattern(localDay(d), 'EEE d')}
                  stroke="#64748b"
                  tickLine={false}
                  axisLine={false}
                  fontSize={12}
                />
                <YAxis allowDecimals={false} stroke="#64748b" tickLine={false} axisLine={false} fontSize={12} width={36} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(148,163,184,0.12)' }} />
                {SERIES.map((s) => (
                  <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color} radius={[4, 4, 0, 0]} maxBarSize={22} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="grid split-grid mt-16">
        <div className="card">
          <div className="card-header">
            <h3>{uz.recent_tasks}</h3>
            <Link to="/tasks" className="btn btn-ghost btn-sm">
              {uz.view_all}
            </Link>
          </div>
          {loading && !stats ? (
            <TableSkeleton rows={6} cols={4} />
          ) : !stats?.recentTasks.length ? (
            <EmptyState
              variant="tasks"
              title={uz.no_tasks_title}
              message={uz.no_tasks_text}
              action={
                <Link to="/tasks?new=1" className="btn btn-primary">
                  {uz.new_task}
                </Link>
              }
            />
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>{uz.col_task}</th>
                    <th>{uz.col_assignee}</th>
                    <th>{uz.col_priority}</th>
                    <th>{uz.col_status}</th>
                    <th>{uz.col_deadline}</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.recentTasks.map((task) => (
                    <tr key={task.id}>
                      <td className="cell-title cell-main">{task.title}</td>
                      <td className="nowrap" data-label={uz.col_assignee}>
                        {task.assignedToName}
                      </td>
                      <td data-label={uz.col_priority}>
                        <PriorityBadge priority={task.priority} />
                      </td>
                      <td data-label={uz.col_status}>
                        <StatusBadge status={task.status} />
                      </td>
                      <td className="nowrap muted" data-label={uz.col_deadline}>
                        {fmtDate(task.deadline)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-header">
            <h3>{uz.recent_reports}</h3>
            <Link to="/reports" className="btn btn-ghost btn-sm">
              {uz.view_all}
            </Link>
          </div>
          {loading && !stats ? (
            <ListSkeleton rows={5} />
          ) : !stats?.recentReports.length ? (
            <EmptyState variant="reports" title={uz.no_reports_title} message={uz.no_reports_text} />
          ) : (
            <ul className="list">
              {stats.recentReports.map((r) => (
                <li key={r.id}>
                  <Link to={`/reports?open=${r.id}`} className="list-item clickable" style={{ color: 'inherit' }}>
                    <div className="list-icon tone-amber">
                      <FileText size={17} />
                    </div>
                    <div className="list-body">
                      <div className="list-title">{r.title}</div>
                      <div className="list-meta">
                        <span>{r.userName}</span>
                        {(r.profession || r.department) && (
                          <span className="dot-sep">{r.profession || deptLabel(r.department)}</span>
                        )}
                        <span className="dot-sep">{fmtRelative(r.createdAt)}</span>
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}
