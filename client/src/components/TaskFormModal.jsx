import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { addDays, setHours, setMinutes } from 'date-fns';
import api, { errorMessage } from '../api.js';
import { deptLabel, fmtPhone, PRIORITIES, priorityLabel, toLocalInput } from '../constants.js';
import uz from '../lib/uz.js';
import { Field, Modal } from './ui.jsx';

const blank = () => ({
  title: '',
  description: '',
  priority: 'orta',
  assignedTo: '',
  deadline: toLocalInput(setMinutes(setHours(addDays(new Date(), 1), 18), 0)),
});

export default function TaskFormModal({ open, onClose, onSaved, workers }) {
  const [form, setForm] = useState(blank);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setForm(blank());
  }, [open]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) return toast.error(uz.v_title_required);
    if (!form.assignedTo) return toast.error(uz.v_worker_required);
    if (!form.deadline) return toast.error(uz.v_deadline_required);
    setSaving(true);
    try {
      const task = await api.post('/tasks', {
        ...form,
        assignedTo: Number(form.assignedTo),
        deadline: new Date(form.deadline).toISOString(),
      });
      toast.success(uz.task_created);
      onSaved?.(task);
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  // Group workers by department for an easier dropdown.
  const groups = workers.reduce((acc, w) => {
    (acc[w.department || ''] ||= []).push(w);
    return acc;
  }, {});

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={uz.new_task}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            {uz.cancel}
          </button>
          <button type="submit" form="task-form" className="btn btn-primary" disabled={saving}>
            {saving ? uz.creating : uz.create_task}
          </button>
        </>
      }
    >
      <form id="task-form" className="modal-body form-grid" onSubmit={submit}>
        <Field label={uz.field_title} htmlFor="t-title">
          <input id="t-title" className="input" value={form.title} onChange={set('title')} maxLength={200} autoFocus />
        </Field>
        <Field label={uz.field_description} htmlFor="t-desc">
          <textarea
            id="t-desc"
            className="textarea"
            value={form.description}
            onChange={set('description')}
            placeholder={uz.description_ph}
          />
        </Field>
        <div className="form-row">
          <Field label={uz.field_priority} htmlFor="t-priority">
            <select id="t-priority" className="select" value={form.priority} onChange={set('priority')}>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {priorityLabel(p)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={uz.field_deadline} htmlFor="t-deadline">
            <input id="t-deadline" type="datetime-local" className="input" value={form.deadline} onChange={set('deadline')} />
          </Field>
        </div>
        <Field label={uz.field_assignee} htmlFor="t-worker" hint={workers.length ? null : uz.no_workers_hint}>
          <select id="t-worker" className="select" value={form.assignedTo} onChange={set('assignedTo')}>
            <option value="">{uz.select_worker}</option>
            {Object.entries(groups).map(([dep, list]) => (
              <optgroup key={dep} label={deptLabel(dep) || uz.not_set}>
                {list.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.fullName} ({fmtPhone(w.phone)})
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </Field>
      </form>
    </Modal>
  );
}
