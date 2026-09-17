import { useMemo, useState } from 'react';
import { accountApi, ticketsApi } from '../services/domainApi';
import { clearReplicaCache } from '../services/replicaStore';
import { useAction } from '../hooks/useAction';
import { buttonClass, Card, Empty, Field, inputClass, Notice, secondaryButtonClass, Section, Status, Table } from '../components/Ui';

const actorId = session => String(session?.user?.employeeId || session?.user?.id || '');
const formatDate = value => value ? new Date(value).toLocaleString() : '—';

function downloadJson(filename, value) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function HistorySection({ replica }) {
  const records = replica.systemHistory || [];
  return <Section title="Governance History" description="Immutable audit events recorded by the authoritative backend.">
    <Table rows={records} columns={[
      { key: 'createdAt', label: 'Date', render: row => formatDate(row.createdAt) },
      { key: 'eventType', label: 'Event', render: row => String(row.eventType || '').replaceAll('_', ' ') },
      { key: 'actorUserId', label: 'Actor' },
      { key: 'entityType', label: 'Entity', render: row => `${row.entityType || '—'} · ${row.entityId || '—'}` },
      { key: 'outcome', label: 'Outcome', render: row => <Status value={row.outcome} /> },
      { key: 'details', label: 'Details' }
    ]} />
  </Section>;
}

export function DiagnosticsSection({ replica, session }) {
  const id = actorId(session);
  const records = useMemo(() => session.roleKey === 'superadmin'
    ? (replica.terminalDiagnostics || [])
    : (replica.terminalDiagnostics || []).filter(item => item.userId === id), [replica, session.roleKey, id]);
  return <Section title={session.roleKey === 'superadmin' ? 'System Monitoring' : 'Sync Monitoring'} description="Read-only device health reported through the authenticated telemetry API. This view never triggers a broad database upload.">
    {records.length ? <Table rows={records} columns={[
      { key: 'deviceId', label: 'Device' }, { key: 'userId', label: 'User' }, { key: 'model', label: 'Model' },
      { key: 'os', label: 'OS' }, { key: 'appVersion', label: 'App version' }, { key: 'cachedLogs', label: 'Cached logs' },
      { key: 'status', label: 'Status', render: row => <Status value={row.status} /> }, { key: 'updatedAt', label: 'Last report', render: row => formatDate(row.updatedAt) }
    ]} /> : <Empty>No mobile terminal has reported diagnostics in this authorized scope.</Empty>}
  </Section>;
}

export function SupportSection({ replica, session }) {
  const action = useAction();
  const [form, setForm] = useState({ title: '', category: 'TECHNICAL', priority: 'NORMAL', fieldId: '', details: '' });
  const [updates, setUpdates] = useState({});
  const id = actorId(session);
  const tickets = session.roleKey === 'superadmin' ? (replica.supportTickets || []) : (replica.supportTickets || []).filter(ticket => ticket.createdByUserId === id);

  async function submit(event) {
    event.preventDefault();
    try {
      await action.run(() => ticketsApi.create({ ...form, fieldId: form.fieldId || null }), 'Support ticket submitted.');
      setForm({ title: '', category: 'TECHNICAL', priority: 'NORMAL', fieldId: '', details: '' });
    } catch (error) { /* useAction exposes the request failure */ }
  }

  return <Section title="Support" description="Support requests and Super Admin resolutions are persisted through the scoped ticket API.">
    <Notice {...action} />
    <Card><form onSubmit={submit} className="grid gap-4 md:grid-cols-2">
      <Field label="Title"><input required maxLength={300} className={inputClass} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} /></Field>
      <Field label="Category"><select className={inputClass} value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}><option>TECHNICAL</option><option>ACCOUNT</option><option>FIELD_DATA</option><option>OTHER</option></select></Field>
      <Field label="Priority"><select className={inputClass} value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })}><option>NORMAL</option><option>HIGH</option><option>URGENT</option></select></Field>
      <Field label="Field (optional)"><select className={inputClass} value={form.fieldId} onChange={e => setForm({ ...form, fieldId: e.target.value })}><option value="">No field</option>{(replica.fields || []).map(field => <option key={field.id} value={field.id}>{field.name || field.id}</option>)}</select></Field>
      <div className="md:col-span-2"><Field label="Details"><textarea required maxLength={5000} rows={4} className={inputClass} value={form.details} onChange={e => setForm({ ...form, details: e.target.value })} /></Field></div>
      <div><button disabled={action.busy} className={buttonClass}>Submit ticket</button></div>
    </form></Card>
    {tickets.length ? <div className="grid gap-4">{tickets.map(ticket => {
      const edit = updates[ticket.id] || { status: ticket.status, priority: ticket.priority, resolutionNotes: ticket.resolutionNotes || '' };
      return <Card key={ticket.id}><div className="flex flex-wrap justify-between gap-3"><div><h3 className="font-extrabold text-slate-900">{ticket.title}</h3><p className="mt-1 text-xs text-hug-muted">{ticket.id} · {ticket.category} · {formatDate(ticket.createdAt)}</p></div><Status value={ticket.status} /></div>
        <p className="mt-4 whitespace-pre-wrap text-sm text-slate-700">{ticket.details}</p>
        {ticket.resolutionNotes && <p className="mt-3 rounded-xl bg-green-50 p-3 text-sm"><strong>Resolution:</strong> {ticket.resolutionNotes}</p>}
        {session.roleKey === 'superadmin' && <div className="mt-4 grid gap-3 md:grid-cols-3">
          <select className={inputClass} value={edit.status} onChange={e => setUpdates({ ...updates, [ticket.id]: { ...edit, status: e.target.value } })}><option>OPEN</option><option>IN_PROGRESS</option><option>RESOLVED</option><option>CLOSED</option></select>
          <select className={inputClass} value={edit.priority} onChange={e => setUpdates({ ...updates, [ticket.id]: { ...edit, priority: e.target.value } })}><option>NORMAL</option><option>HIGH</option><option>URGENT</option></select>
          <input className={inputClass} placeholder="Resolution notes" value={edit.resolutionNotes} onChange={e => setUpdates({ ...updates, [ticket.id]: { ...edit, resolutionNotes: e.target.value } })} />
          <button className={secondaryButtonClass} disabled={action.busy} onClick={() => action.run(() => ticketsApi.update(ticket, edit), 'Ticket updated.').catch(() => undefined)}>Save resolution</button>
        </div>}
      </Card>;
    })}</div> : <Empty>No support tickets are available in this account scope.</Empty>}
  </Section>;
}

export function SettingsSection({ replica, session, onLogout }) {
  const passwordAction = useAction();
  const phoneAction = useAction();
  const [password, setPassword] = useState({ current: '', next: '', confirm: '' });
  const [phone, setPhone] = useState({ currentPassword: '', value: session.user.phone || session.user.contact || '' });

  async function changePassword(event) {
    event.preventDefault();
    if (password.next !== password.confirm) { passwordAction.setError('New passwords do not match.'); return; }
    await passwordAction.run(() => accountApi.changePassword(password.current, password.next), 'Password changed securely.').catch(() => undefined);
    setPassword({ current: '', next: '', confirm: '' });
  }

  async function changePhone(event) {
    event.preventDefault();
    await phoneAction.run(async () => {
      await accountApi.changePhone(phone.currentPassword, phone.value);
      await onLogout();
    }, 'Phone changed. Sign in again to complete OTP verification.').catch(() => undefined);
  }

  return <Section title="Settings" description="Security changes remain server-authoritative. Local tools affect only this browser's authenticated read replica.">
    <div className="grid gap-5 xl:grid-cols-2">
      <Card><h3 className="font-extrabold text-slate-900">Change password</h3><Notice {...passwordAction} /><form onSubmit={changePassword} className="mt-4 grid gap-3">
        <Field label="Current password"><input required type="password" className={inputClass} value={password.current} onChange={e => setPassword({ ...password, current: e.target.value })} /></Field>
        <Field label="New password"><input required minLength={8} type="password" className={inputClass} value={password.next} onChange={e => setPassword({ ...password, next: e.target.value })} /></Field>
        <Field label="Confirm new password"><input required minLength={8} type="password" className={inputClass} value={password.confirm} onChange={e => setPassword({ ...password, confirm: e.target.value })} /></Field>
        <button disabled={passwordAction.busy} className={buttonClass}>Change password</button>
      </form></Card>
      <Card><h3 className="font-extrabold text-slate-900">Change phone</h3><p className="mt-2 text-sm text-hug-muted">Changing the number signs you out. The next login requires OTP verification of the new number.</p><Notice {...phoneAction} /><form onSubmit={changePhone} className="mt-4 grid gap-3">
        <Field label="New Philippine mobile"><input required pattern="09[0-9]{9}" className={inputClass} value={phone.value} onChange={e => setPhone({ ...phone, value: e.target.value.replace(/\D/g, '').slice(0, 11) })} /></Field>
        <Field label="Current password"><input required type="password" className={inputClass} value={phone.currentPassword} onChange={e => setPhone({ ...phone, currentPassword: e.target.value })} /></Field>
        <button disabled={phoneAction.busy} className={buttonClass}>Change phone and sign out</button>
      </form></Card>
      <Card><h3 className="font-extrabold text-slate-900">Local data tools</h3><p className="mt-2 text-sm text-hug-muted">Export or clear only this browser's read replica. Canonical Firestore records and mobile mutation outboxes are not changed.</p><div className="mt-4 flex flex-wrap gap-3">
        <button className={secondaryButtonClass} onClick={() => downloadJson(`hugpong-replica-${actorId(session)}.json`, replica)}>Export local replica</button>
        <button className={secondaryButtonClass} onClick={() => clearReplicaCache(actorId(session))}>Clear local replica</button>
      </div></Card>
    </div>
  </Section>;
}
