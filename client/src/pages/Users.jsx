import { useCallback, useEffect, useState } from 'react';
import { BarChart3, Pencil, Plus, Trash2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import api, { errorMessage } from '../api.js';
import {
  fmtDate,
  fmtPhone,
  fullPhone,
  isValidPhoneDigits,
  phoneDigits,
  professionLabel,
  PROFESSION_OTHER,
  PROFESSIONS,
  ROLES,
  roleLabel,
} from '../constants.js';
import uz, { t } from '../lib/uz.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Avatar, EmptyState, Field, Modal, PhoneInput, RoleBadge, TableSkeleton } from '../components/ui.jsx';
import WorkerStatsModal from '../components/WorkerStatsModal.jsx';

const blank = { fullName: '', phone: '', password: '', role: 'worker', profession: PROFESSIONS[0], professionOther: '', professionMessage: '' };
const EMPTY_FILTERS = { role: '', status: '', search: '' };

// Legacy workers (created before professions existed) get their old department mapped onto the
// new list where the label matches; otherwise their old value becomes a "Boshqa" custom entry.
function initialProfession(user) {
  const value = professionLabel(user);
  if (!value) return { profession: PROFESSIONS[0], professionOther: '' };
  return PROFESSIONS.includes(value) ? { profession: value, professionOther: '' } : { profession: PROFESSION_OTHER, professionOther: value };
}

function UserFormModal({ open, user, roles, onClose, onSaved }) {
  const isEdit = Boolean(user);
  const [form, setForm] = useState(blank);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(
      user
        ? {
            fullName: user.fullName,
            phone: phoneDigits(user.phone),
            password: '',
            role: user.role,
            professionMessage: '',
            ...initialProfession(user),
          }
        : blank
    );
  }, [open, user]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const setPhone = (phone) => setForm((f) => ({ ...f, phone }));
  const isCustomProfession = form.profession === PROFESSION_OTHER;

  const submit = async (e) => {
    e.preventDefault();
    if (!form.fullName.trim()) return toast.error(uz.v_name_required);
    if (!isValidPhoneDigits(form.phone)) return toast.error(uz.v_phone_invalid);
    if ((!isEdit || form.password) && form.password.length < 6) return toast.error(uz.v_password_min);
    const finalProfession = isCustomProfession ? form.professionOther.trim() : form.profession;
    if (form.role === 'worker' && isCustomProfession && !finalProfession) return toast.error(uz.v_profession_required);

    const body = {
      fullName: form.fullName.trim(),
      phone: fullPhone(form.phone),
      role: form.role,
      profession: form.role === 'worker' ? finalProfession : null,
    };
    if (form.password) body.password = form.password;

    setSaving(true);
    try {
      const saved = isEdit ? await api.put(`/users/${user.id}`, body) : await api.post('/users', body);
      toast.success(isEdit ? uz.user_updated : t('user_created', { role: roleLabel(saved.role) }));
      if (form.role === 'worker' && isCustomProfession) {
        api
          .post('/profession-requests', {
            profession: finalProfession,
            message: form.professionMessage.trim() || undefined,
            userId: saved.id,
          })
          .catch(() => {});
      }
      onSaved(saved, isEdit);
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
      title={isEdit ? t('edit_user', { name: user.fullName }) : uz.new_user}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            {uz.cancel}
          </button>
          <button type="submit" form="user-form" className="btn btn-primary" disabled={saving}>
            {saving ? uz.saving : isEdit ? uz.save : uz.create_user}
          </button>
        </>
      }
    >
      <form id="user-form" className="modal-body form-grid" onSubmit={submit} autoComplete="off">
        <Field label={uz.field_full_name} htmlFor="u-name">
          <input id="u-name" className="input" value={form.fullName} onChange={set('fullName')} autoFocus />
        </Field>
        <div className="form-row">
          <Field label={uz.field_phone_login} htmlFor="u-phone">
            <PhoneInput id="u-phone" value={form.phone} onChange={setPhone} autoComplete="off" />
          </Field>
          <Field
            label={isEdit ? uz.field_new_password : uz.password}
            htmlFor="u-pass"
            hint={isEdit ? uz.password_keep_hint : uz.password_min_hint}
          >
            <input id="u-pass" type="password" className="input" value={form.password} onChange={set('password')} autoComplete="new-password" />
          </Field>
        </div>
        <div className="form-row">
          <Field label={uz.field_role} htmlFor="u-role">
            <select id="u-role" className="select" value={form.role} onChange={set('role')} disabled={roles.length < 2}>
              {roles.map((r) => (
                <option key={r} value={r}>
                  {roleLabel(r)}
                </option>
              ))}
            </select>
          </Field>
          {form.role === 'worker' && (
            <Field label={uz.field_profession} htmlFor="u-dep">
              <select id="u-dep" className="select" value={form.profession} onChange={set('profession')}>
                {PROFESSIONS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
                <option value={PROFESSION_OTHER}>{PROFESSION_OTHER}</option>
              </select>
            </Field>
          )}
        </div>
        {form.role === 'worker' && isCustomProfession && (
          <div className="form-row">
            <Field label={uz.field_profession_other} htmlFor="u-prof-other">
              <input
                id="u-prof-other"
                className="input"
                value={form.professionOther}
                onChange={set('professionOther')}
                placeholder={uz.profession_other_ph}
                autoFocus
              />
            </Field>
            <Field label={uz.field_profession_message} htmlFor="u-prof-msg">
              <textarea
                id="u-prof-msg"
                className="textarea"
                value={form.professionMessage}
                onChange={set('professionMessage')}
                placeholder={uz.profession_message_ph}
              />
            </Field>
          </div>
        )}
      </form>
    </Modal>
  );
}

export default function Users() {
  const { user: me } = useAuth();
  const isAdmin = me.role === 'admin';
  const roles = isAdmin ? ROLES : ['worker'];
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [modal, setModal] = useState({ open: false, user: null });
  const [confirming, setConfirming] = useState(null);
  const [togglingId, setTogglingId] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [statsFor, setStatsFor] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v));
      setUsers(await api.get('/users', { params }));
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

  const setFilter = (k) => (e) => setFilters((f) => ({ ...f, [k]: e.target.value }));
  const hasFilters = Object.values(filters).some(Boolean);
  const closeModal = useCallback(() => setModal({ open: false, user: null }), []);
  const closeConfirm = useCallback(() => setConfirming(null), []);
  const closeDelete = useCallback(() => setDeleting(null), []);
  const closeStats = useCallback(() => setStatsFor(null), []);

  const deleteUser = async () => {
    setDeleteBusy(true);
    try {
      await api.delete(`/users/${deleting.id}`);
      setUsers((list) => list.filter((x) => x.id !== deleting.id));
      toast.success(t('user_deleted', { name: deleting.fullName }));
      setDeleting(null);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setDeleteBusy(false);
    }
  };

  const setStatus = async (u, status) => {
    setTogglingId(u.id);
    try {
      const saved = await api.put(`/users/${u.id}`, { status });
      setUsers((list) => list.map((x) => (x.id === u.id ? saved : x)));
      toast.success(t(status === 'active' ? 'user_activated' : 'user_deactivated', { name: u.fullName }));
      setConfirming(null);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setTogglingId(null);
    }
  };

  // Deactivation locks the person out, so it is confirmed first; reactivation is immediate.
  const onToggle = (u) => (u.status === 'active' ? setConfirming(u) : setStatus(u, 'active'));

  const onSaved = (saved, isEdit) =>
    isEdit ? setUsers((list) => list.map((x) => (x.id === saved.id ? saved : x))) : load();

  return (
    <>
      <div className="page-header">
        <div>
          <h1>{uz.users_title}</h1>
          <p>{isAdmin ? uz.users_subtitle : uz.users_subtitle_owner}</p>
        </div>
        <button className="btn btn-primary" onClick={() => setModal({ open: true, user: null })}>
          <Plus size={18} /> {uz.new_user}
        </button>
      </div>

      <div className="card">
        <div className="filters">
          <Field label={uz.filter_search} htmlFor="uf-search">
            <input id="uf-search" className="input" placeholder={uz.search_users_ph} value={filters.search} onChange={setFilter('search')} />
          </Field>
          {isAdmin && (
            <Field label={uz.filter_role} htmlFor="uf-role">
              <select id="uf-role" className="select" value={filters.role} onChange={setFilter('role')}>
                <option value="">{uz.all_roles}</option>
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {roleLabel(r)}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Field label={uz.filter_status} htmlFor="uf-status">
            <select id="uf-status" className="select" value={filters.status} onChange={setFilter('status')}>
              <option value="">{uz.all}</option>
              <option value="active">{uz.user_active}</option>
              <option value="inactive">{uz.user_inactive}</option>
            </select>
          </Field>
          {hasFilters && (
            <button className="btn btn-ghost" onClick={() => setFilters(EMPTY_FILTERS)}>
              <X size={16} /> {uz.clear}
            </button>
          )}
        </div>

        {loading && !users.length ? (
          <TableSkeleton rows={6} cols={5} />
        ) : !users.length ? (
          <EmptyState variant="users" title={uz.no_users_title} message={uz.no_users_text} />
        ) : (
          <div className="table-wrap" style={{ opacity: loading ? 0.6 : 1 }}>
            <table className="table">
              <thead>
                <tr>
                  <th>{uz.col_user}</th>
                  <th>{uz.col_role}</th>
                  <th>{uz.col_profession}</th>
                  <th>{uz.col_created}</th>
                  <th>{uz.col_active}</th>
                  <th>
                    <span className="sr-only">{uz.col_actions}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const isMe = u.id === me.id;
                  return (
                    <tr key={u.id} style={{ opacity: u.status === 'inactive' ? 0.6 : 1 }}>
                      <td className="cell-main">
                        <div className="flex items-center gap-12">
                          <Avatar name={u.fullName} size={34} />
                          <div>
                            <div className="cell-title">
                              {u.fullName} {isMe && <span className="dim">{uz.you}</span>}
                            </div>
                            <div className="cell-sub nowrap">{fmtPhone(u.phone)}</div>
                          </div>
                        </div>
                      </td>
                      <td data-label={uz.col_role}>
                        <RoleBadge role={u.role} />
                      </td>
                      <td data-label={uz.col_profession}>
                        {professionLabel(u) || <span className="dim">—</span>}
                      </td>
                      <td className="nowrap" data-label={uz.col_created}>
                        <div className="muted">{fmtDate(u.createdAt)}</div>
                        {u.createdByName && <div className="cell-sub">{t('created_by', { name: u.createdByName })}</div>}
                      </td>
                      <td data-label={uz.col_active}>
                        <button
                          type="button"
                          className={`switch${u.status === 'active' ? ' on' : ''}`}
                          role="switch"
                          aria-checked={u.status === 'active'}
                          aria-label={t(u.status === 'active' ? 'deactivate_user' : 'activate_user', { name: u.fullName })}
                          disabled={isMe || togglingId === u.id}
                          title={isMe ? uz.cannot_deactivate_self : undefined}
                          onClick={() => onToggle(u)}
                        />
                      </td>
                      <td className="cell-actions">
                        {u.role === 'worker' && (
                          <button className="btn btn-ghost btn-sm" onClick={() => setStatsFor(u)}>
                            <BarChart3 size={14} /> {uz.stats}
                          </button>
                        )}
                        <button className="btn btn-ghost btn-sm" onClick={() => setModal({ open: true, user: u })}>
                          <Pencil size={14} /> {uz.edit}
                        </button>
                        <button
                          className="btn btn-outline-danger btn-sm"
                          onClick={() => setDeleting(u)}
                          disabled={isMe}
                          title={isMe ? uz.cannot_delete_self : undefined}
                        >
                          <Trash2 size={14} /> {uz.delete_user}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <UserFormModal open={modal.open} user={modal.user} roles={roles} onClose={closeModal} onSaved={onSaved} />
      <WorkerStatsModal worker={statsFor} onClose={closeStats} />

      <Modal
        open={Boolean(confirming)}
        onClose={closeConfirm}
        title={uz.confirm_deactivate_title}
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={closeConfirm}>
              {uz.cancel}
            </button>
            <button
              type="button"
              className="btn btn-danger"
              disabled={togglingId === confirming?.id}
              onClick={() => setStatus(confirming, 'inactive')}
            >
              {uz.deactivate}
            </button>
          </>
        }
      >
        <div className="modal-body">
          <p className="muted" style={{ margin: 0 }}>
            {confirming && t('confirm_deactivate_text', { name: confirming.fullName })}
          </p>
        </div>
      </Modal>

      <Modal
        open={Boolean(deleting)}
        onClose={closeDelete}
        title={uz.confirm_delete_title}
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={closeDelete}>
              {uz.cancel}
            </button>
            <button type="button" className="btn btn-danger" disabled={deleteBusy} onClick={deleteUser}>
              <Trash2 size={16} /> {deleteBusy ? uz.deleting : uz.delete_user}
            </button>
          </>
        }
      >
        <div className="modal-body form-grid">
          <p style={{ margin: 0, fontWeight: 500 }}>{uz.confirm_delete_text}</p>
          <p className="muted" style={{ margin: 0 }}>
            {deleting && t('confirm_delete_detail', { name: deleting.fullName })}
          </p>
        </div>
      </Modal>
    </>
  );
}
