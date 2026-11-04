import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FileText, Plus, X } from 'lucide-react';
import toast from 'react-hot-toast';
import api, { errorMessage } from '../api.js';
import { deptLabel, fmtDateTime, fmtRelative, professionLabel, PROFESSIONS } from '../constants.js';
import uz, { t } from '../lib/uz.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Badge, EmptyState, Field, ListSkeleton, Modal, TableSkeleton } from '../components/ui.jsx';

const EMPTY_FILTERS = { profession: '', userId: '', from: '', to: '', search: '' };
const reportProfession = (r) => r.profession || (r.department ? deptLabel(r.department) : '');

function ReportViewModal({ report, onClose }) {
  return (
    <Modal
      open={Boolean(report)}
      onClose={onClose}
      title={report?.title}
      size="lg"
      footer={
        <button className="btn btn-primary" onClick={onClose}>
          {uz.close}
        </button>
      }
    >
      {report && (
        <div className="modal-body form-grid">
          <div className="list-meta" style={{ fontSize: 13 }}>
            <span>{report.userName}</span>
            {reportProfession(report) && <span className="dot-sep">{reportProfession(report)}</span>}
            <span className="dot-sep">{fmtDateTime(report.createdAt)}</span>
          </div>
          <pre className="report-content" style={{ fontFamily: 'inherit' }}>
            {report.content}
          </pre>
        </div>
      )}
    </Modal>
  );
}

function NewReportModal({ open, onClose, onSaved, profession }) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setTitle('');
      setContent('');
    }
  }, [open]);

  const submit = async (e) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return toast.error(uz.v_report_required);
    setSaving(true);
    try {
      const report = await api.post('/reports', { title: title.trim(), content: content.trim() });
      toast.success(uz.report_submitted);
      onSaved(report);
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={uz.new_report}
      size="lg"
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            {uz.cancel}
          </button>
          <button type="submit" form="report-form" className="btn btn-primary" disabled={saving}>
            {saving ? uz.submitting : uz.submit_report}
          </button>
        </>
      }
    >
      <form id="report-form" className="modal-body form-grid" onSubmit={submit}>
        <div className="form-row">
          <Field label={uz.field_title} htmlFor="r-title">
            <input
              id="r-title"
              className="input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={uz.report_title_ph}
              maxLength={200}
              autoFocus
            />
          </Field>
          <Field label={uz.field_profession} htmlFor="r-dep">
            <input id="r-dep" className="input" value={profession || uz.not_set} disabled />
          </Field>
        </div>
        <Field label={uz.field_content} htmlFor="r-content">
          <textarea
            id="r-content"
            className="textarea"
            style={{ minHeight: 200 }}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={uz.content_ph}
          />
        </Field>
      </form>
    </Modal>
  );
}

function WorkerReports() {
  const { user } = useAuth();
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [viewing, setViewing] = useState(null);

  useEffect(() => {
    api
      .get('/reports')
      .then(setReports)
      .catch((err) => toast.error(errorMessage(err, uz.error_load)))
      .finally(() => setLoading(false));
  }, []);

  const closeCreate = useCallback(() => setCreating(false), []);
  const closeView = useCallback(() => setViewing(null), []);

  return (
    <>
      <div className="page-header">
        <div>
          <h1>{uz.my_reports_title}</h1>
          <p>
            {professionLabel(user)
              ? t('my_reports_subtitle', { profession: professionLabel(user) })
              : uz.my_reports_subtitle_nodept}
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setCreating(true)}>
          <Plus size={18} /> {uz.new_report}
        </button>
      </div>

      {loading ? (
        <div className="card">
          <ListSkeleton rows={4} />
        </div>
      ) : !reports.length ? (
        <div className="card">
          <EmptyState
            variant="reports"
            title={uz.no_my_reports_title}
            message={uz.no_my_reports_text}
            action={
              <button className="btn btn-primary" onClick={() => setCreating(true)}>
                <Plus size={18} /> {uz.first_report}
              </button>
            }
          />
        </div>
      ) : (
        <div className="report-cards">
          {reports.map((r) => (
            <div
              key={r.id}
              className="card report-card"
              role="button"
              tabIndex={0}
              onClick={() => setViewing(r)}
              onKeyDown={(e) => e.key === 'Enter' && setViewing(r)}
            >
              <div className="flex items-center gap-12" style={{ justifyContent: 'space-between' }}>
                <div className="cell-title">{r.title}</div>
                <span className="dim nowrap" style={{ fontSize: 12 }} title={fmtDateTime(r.createdAt)}>
                  {fmtRelative(r.createdAt)}
                </span>
              </div>
              <p>{r.content}</p>
            </div>
          ))}
        </div>
      )}

      <NewReportModal
        open={creating}
        onClose={closeCreate}
        profession={professionLabel(user)}
        onSaved={(r) => setReports((list) => [r, ...list])}
      />
      <ReportViewModal report={viewing} onClose={closeView} />
    </>
  );
}

function ManagerReports() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [reports, setReports] = useState([]);
  const [workers, setWorkers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [viewing, setViewing] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v));
      setReports(await api.get('/reports', { params }));
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

  // Deep link from the dashboard: /reports?open=<id>
  useEffect(() => {
    const id = searchParams.get('open');
    if (!id) return;
    api
      .get(`/reports/${id}`)
      .then(setViewing)
      .catch((err) => toast.error(errorMessage(err)));
  }, [searchParams]);

  const closeView = useCallback(() => {
    setViewing(null);
    if (searchParams.has('open')) setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams]);

  const setFilter = (k) => (e) => setFilters((f) => ({ ...f, [k]: e.target.value }));
  const hasFilters = Object.values(filters).some(Boolean);
  const visibleWorkers = filters.profession
    ? workers.filter((w) => professionLabel(w) === filters.profession)
    : workers;

  return (
    <>
      <div className="page-header">
        <div>
          <h1>{uz.reports_title}</h1>
          <p>{uz.reports_subtitle}</p>
        </div>
      </div>

      <div className="card">
        <div className="filters">
          <Field label={uz.filter_search} htmlFor="rf-search">
            <input id="rf-search" className="input" placeholder={uz.search_reports_ph} value={filters.search} onChange={setFilter('search')} />
          </Field>
          <Field label={uz.filter_profession} htmlFor="rf-dep">
            <select id="rf-dep" className="select" value={filters.profession} onChange={setFilter('profession')}>
              <option value="">{uz.all_professions}</option>
              {PROFESSIONS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </Field>
          <Field label={uz.filter_worker} htmlFor="rf-worker">
            <select id="rf-worker" className="select" value={filters.userId} onChange={setFilter('userId')}>
              <option value="">{uz.all_workers}</option>
              {visibleWorkers.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.fullName}
                </option>
              ))}
            </select>
          </Field>
          <Field label={uz.filter_from} htmlFor="rf-from">
            <input id="rf-from" type="date" className="input" value={filters.from} onChange={setFilter('from')} />
          </Field>
          <Field label={uz.filter_to} htmlFor="rf-to">
            <input id="rf-to" type="date" className="input" value={filters.to} onChange={setFilter('to')} />
          </Field>
          {hasFilters && (
            <button className="btn btn-ghost" onClick={() => setFilters(EMPTY_FILTERS)}>
              <X size={16} /> {uz.clear}
            </button>
          )}
        </div>

        {loading && !reports.length ? (
          <TableSkeleton rows={6} cols={4} />
        ) : !reports.length ? (
          <EmptyState
            variant="reports"
            title={hasFilters ? uz.no_match_title : uz.no_reports_title}
            message={hasFilters ? uz.no_match_text : uz.no_reports_text}
          />
        ) : (
          <div className="table-wrap" style={{ opacity: loading ? 0.6 : 1 }}>
            <table className="table">
              <thead>
                <tr>
                  <th>{uz.col_report}</th>
                  <th>{uz.col_worker}</th>
                  <th>{uz.col_profession}</th>
                  <th>{uz.col_submitted}</th>
                </tr>
              </thead>
              <tbody>
                {reports.map((r) => (
                  <tr key={r.id} className="clickable" onClick={() => setViewing(r)}>
                    <td className="cell-main">
                      <div className="flex items-center gap-12">
                        <div className="list-icon tone-amber">
                          <FileText size={16} />
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div className="cell-title">{r.title}</div>
                          <div className="cell-sub cell-clip">
                            {r.content}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="nowrap" data-label={uz.col_worker}>
                      {r.userName}
                    </td>
                    <td data-label={uz.col_profession}>
                      {reportProfession(r) ? <Badge tone="slate">{reportProfession(r)}</Badge> : '—'}
                    </td>
                    <td className="nowrap muted" data-label={uz.col_submitted}>
                      {fmtDateTime(r.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ReportViewModal report={viewing} onClose={closeView} />
    </>
  );
}

export default function Reports() {
  const { user } = useAuth();
  return user.role === 'worker' ? <WorkerReports /> : <ManagerReports />;
}
