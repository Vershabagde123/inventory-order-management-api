import { useEffect, useState } from 'react';
import { api } from '../api/endpoints.js';
import {
  Callout,
  EmptyState,
  ErrorBox,
  Field,
  PageHeader,
  RoleBadge,
  SkeletonRows,
} from '../components/Feedback.jsx';
import Icon from '../components/Icon.jsx';
import { Modal } from '../components/Modal.jsx';
import { useToast } from '../components/Toast.jsx';
import { fieldErrors, formatDate, initials } from '../utils/format.js';

const EMPTY = { name: '', email: '', password: '' };

function validate(v) {
  const e = {};
  if (v.name.trim().length < 2) e.name = 'Enter the full name (at least 2 characters).';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email.trim())) e.email = 'Enter a valid email address.';
  if (v.password.length < 8) e.password = 'Use at least 8 characters.';
  else if (!/[A-Za-z]/.test(v.password) || !/\d/.test(v.password))
    e.password = 'Include at least one letter and one number.';
  return e;
}

export default function StaffPage() {
  const toast = useToast();
  const [me, setMe] = useState(null);
  const [meError, setMeError] = useState(null);
  const [created, setCreated] = useState([]); // staff created in this browser session

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api
      .me()
      .then((res) => setMe(res.data))
      .catch(setMeError);
  }, []);

  function openForm() {
    setForm(EMPTY);
    setErrors({});
    setFormError(null);
    setOpen(true);
  }

  function setValue(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  }

  async function onSubmit(e) {
    e.preventDefault();
    const v = validate(form);
    setErrors(v);
    if (Object.keys(v).length) return;
    setSaving(true);
    setFormError(null);
    try {
      // POST /auth/register always creates a STAFF user. The token it returns belongs
      // to the new user and is intentionally NOT used - the admin stays signed in.
      const res = await api.registerStaff({
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
      });
      setCreated((list) => [res.data.user, ...list]);
      toast.success('Staff member added', `${res.data.user.name} can now sign in as STAFF.`);
      setOpen(false);
    } catch (err) {
      setErrors(fieldErrors(err));
      setFormError(err);
    } finally {
      setSaving(false);
    }
  }

  const rows = [...created, ...(me ? [{ ...me, isMe: true }] : [])];

  return (
    <>
      <PageHeader
        title="Staff Management"
        description="Create staff accounts that can browse products and place orders."
        actions={
          <button type="button" className="btn btn-primary" onClick={openForm}>
            <Icon name="userPlus" size={16} /> Add staff
          </button>
        }
      />

      <Callout tone="info">
        The API has no endpoint for listing, editing or deleting users, so this table shows your own
        account and staff created during this session. New accounts always get the{' '}
        <strong>STAFF</strong> role.
      </Callout>

      <section className="card card-flush">
        <div className="card-header card-header-pad">
          <div>
            <h2>Team members</h2>
            <p className="muted">{rows.length} account(s) shown</p>
          </div>
        </div>
        {meError && (
          <div className="card-inset">
            <ErrorBox error={meError} />
          </div>
        )}
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th className="hide-sm">Email</th>
                <th>Role</th>
                <th className="hide-sm">Added</th>
              </tr>
            </thead>
            <tbody>
              {!me && !meError && <SkeletonRows rows={2} cols={4} />}
              {rows.map((u) => (
                <tr key={u.id}>
                  <td>
                    <div className="cell-product">
                      <span
                        className={`avatar avatar-sm ${u.role === 'ADMIN' ? '' : 'avatar-green'}`}
                        aria-hidden="true"
                      >
                        {initials(u.name)}
                      </span>
                      <span>
                        <strong>
                          {u.name} {u.isMe && <span className="badge badge-neutral">You</span>}
                        </strong>
                        <small className="muted show-sm">{u.email}</small>
                      </span>
                    </div>
                  </td>
                  <td className="hide-sm">{u.email}</td>
                  <td>
                    <RoleBadge role={u.role} />
                  </td>
                  <td className="hide-sm muted">{formatDate(u.createdAt, false)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {me && created.length === 0 && (
          <EmptyState
            icon="users"
            title="No staff added in this session"
            message="Add a staff member to give them access to products and orders."
            action={
              <button type="button" className="btn" onClick={openForm}>
                <Icon name="userPlus" size={16} /> Add staff
              </button>
            }
          />
        )}
      </section>

      <Modal
        open={open}
        title="Add staff member"
        description="They will be able to sign in with this email and password."
        onClose={() => setOpen(false)}
        busy={saving}
        footer={
          <>
            <button type="button" className="btn" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </button>
            <button type="submit" form="staff-form" className="btn btn-primary" disabled={saving}>
              {saving && <span className="spinner spinner-light" aria-hidden="true" />}
              {saving ? 'Creating…' : 'Create account'}
            </button>
          </>
        }
      >
        <form id="staff-form" className="form-grid" onSubmit={onSubmit} noValidate>
          {formError && !Object.keys(fieldErrors(formError)).length && (
            <div className="span-2">
              <ErrorBox error={formError} />
            </div>
          )}
          <Field id="s-name" label="Full name" error={errors.name} className="span-2">
            <input
              id="s-name"
              value={form.name}
              onChange={(e) => setValue('name', e.target.value)}
              placeholder="e.g. Priya Sharma"
              autoComplete="off"
              aria-invalid={Boolean(errors.name)}
              aria-describedby={errors.name ? 's-name-error' : undefined}
            />
          </Field>
          <Field id="s-email" label="Email address" error={errors.email} className="span-2">
            <input
              id="s-email"
              type="email"
              value={form.email}
              onChange={(e) => setValue('email', e.target.value)}
              placeholder="priya@company.com"
              autoComplete="off"
              aria-invalid={Boolean(errors.email)}
              aria-describedby={errors.email ? 's-email-error' : undefined}
            />
          </Field>
          <Field
            id="s-password"
            label="Temporary password"
            error={errors.password}
            hint="At least 8 characters, including a letter and a number."
            className="span-2"
          >
            <input
              id="s-password"
              type="password"
              value={form.password}
              onChange={(e) => setValue('password', e.target.value)}
              placeholder="••••••••"
              autoComplete="new-password"
              aria-invalid={Boolean(errors.password)}
              aria-describedby={errors.password ? 's-password-error' : 's-password-hint'}
            />
          </Field>
        </form>
      </Modal>
    </>
  );
}
