import { useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import toast from 'react-hot-toast';
import api, { errorMessage } from '../api.js';
import { fmtDate, fmtPattern, professionLabel } from '../constants.js';
import uz, { t } from '../lib/uz.js';
import { Modal, PriorityBadge, Skeleton, StatusBadge } from './ui.jsx';

// Chart dates arrive as local "YYYY-MM-DD" keys; parse them as local midnight.
const localDay = (key) => new Date(`${key}T00:00:00`);

function fmtDuration(ms) {
  if (ms == null) return uz.stats_no_data;
  const minutes = ms / 60_000;
  if (minutes < 60) return t('stats_minutes', { n: Math.max(1, Math.round(minutes)) });
  const hours = minutes / 60;
  if (hours < 24) return t('stats_hours', { n: Math.round(hours) });
  return t('stats_days', { n: Math.round(hours / 24) });
}

function StatTile({ label, value, loading }) {
  return (
    <div className="card stat-card">
      <div>
        <div className="stat-label">{label}</div>
        {loading ? <Skeleton width={56} height={26} style={{ margin: '4px 0' }} /> : <div className="stat-value">{value}</div>}
      </div>
    </div>
  );
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="card" style={{ padding: '10px 12px', fontSize: 13, boxShadow: 'var(--shadow)' }}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{fmtPattern(localDay(label), 'd MMMM')}</div>
      <div className="flex items-center gap-8">
        <span className="muted">{uz.stats_completed}</span>
        <b style={{ marginLeft: 'auto', paddingLeft: 12 }}>{payload[0].value}</b>
      </div>
    </div>
  );
}

export default function WorkerStatsModal({ worker, onClose }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!worker) return;
    setLoading(true);
    setStats(null);
    api
      .get(`/users/${worker.id}/stats`)
      .then(setStats)
      .catch((err) => toast.error(errorMessage(err, uz.error_load)))
      .finally(() => setLoading(false));
  }, [worker]);

  return (
    <Modal open={Boolean(worker)} onClose={onClose} title={worker ? t('stats_title', { name: worker.fullName }) : ''} size="lg">
      <div className="modal-body form-grid">
        {worker && (
          <div className="list-meta" style={{ fontSize: 13 }}>
            <span>{professionLabel(worker) || uz.not_set}</span>
          </div>
        )}

        <div className="grid stats-grid">
          <StatTile label={uz.stats_total_tasks} value={stats?.totalTasks ?? 0} loading={loading} />
          <StatTile
            label={uz.stats_completed}
            value={loading ? 0 : `${stats.byStatus.bajarildi} (${stats.byStatusPercent.bajarildi}%)`}
            loading={loading}
          />
          <StatTile
            label={uz.stats_in_progress}
            value={loading ? 0 : `${stats.byStatus.jarayonda} (${stats.byStatusPercent.jarayonda}%)`}
            loading={loading}
          />
          <StatTile
            label={uz.stats_pending}
            value={loading ? 0 : `${stats.byStatus.kutilmoqda} (${stats.byStatusPercent.kutilmoqda}%)`}
            loading={loading}
          />
          <StatTile
            label={uz.stats_rejected}
            value={loading ? 0 : `${stats.byStatus.rad_etildi} (${stats.byStatusPercent.rad_etildi}%)`}
            loading={loading}
          />
          <StatTile label={uz.stats_completion_rate} value={loading ? 0 : `${stats.completionRate}%`} loading={loading} />
          <StatTile label={uz.stats_avg_completion_time} value={loading ? '—' : fmtDuration(stats.avgCompletionMs)} loading={loading} />
          <StatTile label={uz.stats_completed_week} value={stats?.completedThisWeek ?? 0} loading={loading} />
          <StatTile label={uz.stats_completed_month} value={stats?.completedThisMonth ?? 0} loading={loading} />
          <StatTile label={uz.stats_reports_week} value={stats?.reportsThisWeek ?? 0} loading={loading} />
          <StatTile label={uz.stats_reports_month} value={stats?.reportsThisMonth ?? 0} loading={loading} />
        </div>

        <div className="card">
          <div className="card-header">
            <h3>{uz.stats_chart_title}</h3>
          </div>
          {loading ? (
            <div style={{ padding: 20 }}>
              <Skeleton height={200} />
            </div>
          ) : (
            <div className="chart-box" style={{ height: 220 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.chart} barGap={3} margin={{ left: 0, right: 8 }}>
                  <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(d) => fmtPattern(localDay(d), 'd MMM')}
                    stroke="#64748b"
                    tickLine={false}
                    axisLine={false}
                    fontSize={12}
                    interval={4}
                  />
                  <YAxis allowDecimals={false} stroke="#64748b" tickLine={false} axisLine={false} fontSize={12} width={28} />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(148,163,184,0.12)' }} />
                  <Bar dataKey="completed" name={uz.stats_completed} fill="#22c55e" radius={[4, 4, 0, 0]} maxBarSize={14} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-header">
            <h3>{uz.stats_recent_tasks}</h3>
          </div>
          {loading ? (
            <div style={{ padding: 16, display: 'grid', gap: 10 }}>
              <Skeleton height={16} />
              <Skeleton height={16} />
              <Skeleton height={16} />
            </div>
          ) : !stats.recentTasks.length ? (
            <div style={{ padding: 16 }} className="muted">
              {uz.stats_no_tasks}
            </div>
          ) : (
            <ul className="list">
              {stats.recentTasks.map((task) => (
                <li key={task.id} className="list-item">
                  <div className="list-body">
                    <div className="list-title">{task.title}</div>
                    <div className="list-meta">
                      <PriorityBadge priority={task.priority} />
                      <StatusBadge status={task.status} />
                      <span className="dot-sep">{fmtDate(task.deadline)}</span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Modal>
  );
}
