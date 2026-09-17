import { useMemo, useState } from 'react';
import { useAction } from '../hooks/useAction';
import { farmsApi, fieldsApi, usersApi } from '../services/domainApi';
import { buttonClass, Card, Empty, Field, inputClass, Notice, secondaryButtonClass, Section, Status, Table } from '../components/Ui';
import { normalizeRole } from '../services/roleRouting';

const userId = user => user?.id || user?.employeeId || '';
const roleName = role => String(role || '').replaceAll('_', ' ');

function scopedUsers(replica, session) {
  const users = replica.users || [];
  if (session.roleKey === 'superadmin') return users;
  if (session.roleKey === 'admin') return users.filter(user => normalizeRole(user.role) === 'manager');
  const actorId = userId(session.user);
  const farmIds = new Set((replica.blockFarms || []).filter(farm => farm.managerUserId === actorId).map(farm => farm.id));
  const memberIds = new Set((replica.fields || []).filter(field => farmIds.has(field.blockFarmId)).map(field => field.memberUserId));
  return users.filter(user => userId(user) === actorId || memberIds.has(userId(user)) || (user.status === 'PENDING' && farmIds.has(user.requestedBlockFarmId)));
}

export function UsersSection({ replica, session }) {
  const action = useAction();
  const users = useMemo(() => scopedUsers(replica, session), [replica, session]);
  const roles = session.roleKey === 'superadmin' ? ['SUPER_ADMIN', 'SRA_ADMIN', 'FARM_MANAGER', 'MEMBER_FARMER'] : session.roleKey === 'admin' ? ['FARM_MANAGER'] : ['MEMBER_FARMER'];
  const [form, setForm] = useState({ displayName: '', phone: '', role: roles[0], password: '', blockFarmId: '' });
  const [editing, setEditing] = useState(null);
  const [otp, setOtp] = useState({ sent: false, code: '', verified: false });

  async function create(event) {
    event.preventDefault();
    await action.run(() => usersApi.create({ ...form, requiresPasswordChange: true, phoneVerified: false }), 'Account created. The user must verify their phone and change the temporary password on first login.').catch(() => undefined);
  }
  async function requestEditOtp() {
    try { await action.run(() => usersApi.requestPhoneOtp(editing.phone, editing.displayName), 'Verification code sent to the proposed phone number.'); setOtp({ sent: true, code: '', verified: false }); } catch (error) { /* useAction displays the failure */ }
  }
  async function verifyEditOtp() {
    try { await action.run(() => usersApi.verifyPhoneOtp(editing.phone, otp.code), 'Phone number verified for this update.'); setOtp(current => ({ ...current, verified: true })); } catch (error) { /* useAction displays the failure */ }
  }
  async function saveEdit(event) {
    event.preventDefault();
    const phoneChanged = editing.phone !== (editing.originalPhone || '');
    if (phoneChanged && !otp.verified) { action.setError('Verify the changed phone number before saving.'); return; }
    try { await action.run(() => usersApi.update(editing, { displayName: editing.displayName, phone: editing.phone, role: editing.role, status: editing.status, phoneVerified: phoneChanged && otp.verified }), 'Account updated.'); setEditing(null); setOtp({ sent: false, code: '', verified: false }); } catch (error) { /* useAction displays the failure */ }
  }

  return <Section title={session.roleKey === 'manager' ? 'Member Farmers' : 'User Administration'} description="Accounts are created and updated through the authoritative Express API. Password hashes never enter this client.">
    <Notice {...action} />
    {editing && <Card><form onSubmit={saveEdit} className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"><div className="md:col-span-2 xl:col-span-3"><h3 className="font-extrabold">Edit account {userId(editing)}</h3><p className="text-xs text-hug-muted">Changing a phone number requires the server OTP flow before save.</p></div>
      <Field label="Display name"><input required className={inputClass} value={editing.displayName} onChange={e => setEditing({ ...editing, displayName: e.target.value })} /></Field>
      <Field label="Phone"><input required pattern="09[0-9]{9}" className={inputClass} value={editing.phone} onChange={e => { setEditing({ ...editing, phone: e.target.value.replace(/\D/g, '').slice(0, 11) }); setOtp({ sent: false, code: '', verified: false }); }} /></Field>
      <Field label="Role"><select className={inputClass} value={editing.role} onChange={e => setEditing({ ...editing, role: e.target.value })}>{roles.map(role => <option key={role}>{role}</option>)}</select></Field>
      {editing.phone !== editing.originalPhone && <div className="md:col-span-2 xl:col-span-3 flex flex-wrap items-end gap-3"><button type="button" className={secondaryButtonClass} disabled={action.busy} onClick={requestEditOtp}>{otp.sent ? 'Resend phone code' : 'Send phone code'}</button>{otp.sent && <><input aria-label="Phone verification code" inputMode="numeric" maxLength={6} className={`${inputClass} max-w-48`} value={otp.code} onChange={e => setOtp({ ...otp, code: e.target.value.replace(/\D/g, '') })} /><button type="button" className={secondaryButtonClass} disabled={otp.code.length !== 6 || action.busy} onClick={verifyEditOtp}>Verify code</button></>}{otp.verified && <span className="text-sm font-bold text-green-700">Verified</span>}</div>}
      <div className="flex items-end gap-2"><button className={buttonClass} disabled={action.busy}>Save account</button><button type="button" className={secondaryButtonClass} onClick={() => setEditing(null)}>Cancel</button></div>
    </form></Card>}
    <Card><details><summary className="cursor-pointer font-extrabold text-hug-primary">Create account</summary>
      <form onSubmit={create} className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Field label="Display name"><input required className={inputClass} value={form.displayName} onChange={e => setForm({ ...form, displayName: e.target.value })} /></Field>
        <Field label="Philippine mobile"><input required pattern="09[0-9]{9}" className={inputClass} value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value.replace(/\D/g, '').slice(0, 11) })} /></Field>
        <Field label="Role"><select className={inputClass} value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>{roles.map(role => <option key={role}>{role}</option>)}</select></Field>
        <Field label="Temporary password"><input required minLength={8} type="password" className={inputClass} value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} /></Field>
        {session.roleKey === 'manager' && <Field label="Assigned block farm"><select required className={inputClass} value={form.blockFarmId} onChange={e => setForm({ ...form, blockFarmId: e.target.value })}><option value="">Select</option>{(replica.blockFarms || []).filter(f => f.managerUserId === userId(session.user)).map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select></Field>}
        <div className="flex items-end"><button disabled={action.busy} className={buttonClass}>Create secure account</button></div>
      </form>
    </details></Card>
    <Table rows={users} columns={[
      { key: 'id', label: 'User ID', render: user => userId(user) },
      { key: 'displayName', label: 'Name', render: user => user.displayName || user.name },
      { key: 'role', label: 'Role', render: user => roleName(user.role) },
      { key: 'phone', label: 'Phone', render: user => user.phone || user.contact },
      { key: 'status', label: 'Status', render: user => <Status value={user.status} /> },
      { key: 'actions', label: 'Actions', render: user => <div className="flex gap-2">
        {user.status !== 'PENDING' && <button className={secondaryButtonClass} onClick={() => { const role = String(user.role || '').toUpperCase().replace(/[ -]+/g, '_'); setEditing({ ...user, id: userId(user), displayName: user.displayName || user.name || '', phone: user.phone || user.contact || '', originalPhone: user.phone || user.contact || '', role, status: user.status }); setOtp({ sent: false, code: '', verified: false }); }}>Edit</button>}
        {user.status === 'PENDING' && <button className={secondaryButtonClass} disabled={action.busy} onClick={() => action.run(() => usersApi.approve({ ...user, id: userId(user) }), 'Registration approved.').catch(() => undefined)}>Approve</button>}
        {user.status === 'ACTIVE' && userId(user) !== userId(session.user) && <button className={secondaryButtonClass} disabled={action.busy} onClick={() => action.run(() => usersApi.update({ ...user, id: userId(user) }, { status: 'DISABLED' }), 'Account disabled.').catch(() => undefined)}>Disable</button>}
        {user.status === 'DISABLED' && <button className={secondaryButtonClass} disabled={action.busy} onClick={() => action.run(() => usersApi.update({ ...user, id: userId(user) }, { status: 'ACTIVE' }), 'Account reactivated.').catch(() => undefined)}>Reactivate</button>}
      </div> }
    ]} />
  </Section>;
}

export function FarmsSection({ replica, session, assignedOnly = false }) {
  const action = useAction();
  const actorId = userId(session.user);
  const farms = assignedOnly ? (replica.blockFarms || []).filter(f => f.managerUserId === actorId) : (replica.blockFarms || []);
  const managers = (replica.users || []).filter(user => normalizeRole(user.role) === 'manager' && user.status === 'ACTIVE');
  const canWrite = ['superadmin', 'admin'].includes(session.roleKey);
  const [form, setForm] = useState({ id: '', code: '', name: '', location: '', declaredAreaHa: '', managerUserId: '' });
  const [editing, setEditing] = useState(null);
  async function create(event) { event.preventDefault(); await action.run(() => farmsApi.create({ ...form, declaredAreaHa: Number(form.declaredAreaHa), managerUserId: form.managerUserId || null }), 'Block farm registered.').catch(() => undefined); }
  async function saveEdit(event) { event.preventDefault(); try { await action.run(() => farmsApi.update(editing, { code: editing.code, name: editing.name, location: editing.location, declaredAreaHa: Number(editing.declaredAreaHa), managerUserId: editing.managerUserId || null }), 'Block farm updated.'); setEditing(null); } catch (error) { /* useAction displays the failure */ } }
  return <Section title={assignedOnly ? 'Assigned Block Farm' : 'Block Farms'} description="Stable block-farm IDs define field and manager scope.">
    <Notice {...action} />
    {editing && <Card><form onSubmit={saveEdit} className="grid gap-4 md:grid-cols-3"><h3 className="md:col-span-3 font-extrabold">Edit {editing.id}</h3>
      <Field label="Code"><input required className={inputClass} value={editing.code} onChange={e => setEditing({ ...editing, code: e.target.value })} /></Field><Field label="Name"><input required className={inputClass} value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} /></Field><Field label="Location"><input required className={inputClass} value={editing.location} onChange={e => setEditing({ ...editing, location: e.target.value })} /></Field>
      <Field label="Declared area (ha)"><input required type="number" min="0" step="0.01" className={inputClass} value={editing.declaredAreaHa} onChange={e => setEditing({ ...editing, declaredAreaHa: e.target.value })} /></Field><Field label="Farm Manager"><select className={inputClass} value={editing.managerUserId || ''} onChange={e => setEditing({ ...editing, managerUserId: e.target.value })}><option value="">Unassigned</option>{managers.map(m => <option key={userId(m)} value={userId(m)}>{m.displayName || m.name}</option>)}</select></Field><div className="flex items-end gap-2"><button className={buttonClass}>Save</button><button type="button" className={secondaryButtonClass} onClick={() => setEditing(null)}>Cancel</button></div>
    </form></Card>}
    {canWrite && <Card><details><summary className="cursor-pointer font-extrabold text-hug-primary">Register block farm</summary><form onSubmit={create} className="mt-5 grid gap-4 md:grid-cols-3">
      {['id', 'code', 'name', 'location'].map(key => <Field key={key} label={key === 'declaredAreaHa' ? 'Area' : key[0].toUpperCase() + key.slice(1)}><input required className={inputClass} value={form[key]} onChange={e => setForm({ ...form, [key]: e.target.value })} /></Field>)}
      <Field label="Declared area (ha)"><input required type="number" min="0" step="0.01" className={inputClass} value={form.declaredAreaHa} onChange={e => setForm({ ...form, declaredAreaHa: e.target.value })} /></Field>
      <Field label="Farm Manager"><select className={inputClass} value={form.managerUserId} onChange={e => setForm({ ...form, managerUserId: e.target.value })}><option value="">Unassigned</option>{managers.map(m => <option key={userId(m)} value={userId(m)}>{m.displayName || m.name}</option>)}</select></Field>
      <div className="flex items-end"><button className={buttonClass} disabled={action.busy}>Register</button></div>
    </form></details></Card>}
    {farms.length ? <Table rows={farms} columns={[
      { key: 'id', label: 'ID' }, { key: 'name', label: 'Name' }, { key: 'location', label: 'Location' },
      { key: 'declaredAreaHa', label: 'Area (ha)' }, { key: 'managerUserId', label: 'Manager ID' }, { key: 'status', label: 'Status', render: row => <Status value={row.status} /> },
      ...(canWrite ? [{ key: 'actions', label: 'Actions', render: farm => <button className={secondaryButtonClass} onClick={() => setEditing({ ...farm })}>Edit</button> }] : [])
    ]} /> : <Empty>No block farms are available in this scope.</Empty>}
  </Section>;
}

export function FieldsSection({ replica, session }) {
  const action = useAction();
  const actorId = userId(session.user);
  const managedFarmIds = new Set((replica.blockFarms || []).filter(f => f.managerUserId === actorId).map(f => f.id));
  const allFields = [...(replica.fields || []), ...(replica.archivedFields || [])];
  const fields = session.roleKey === 'manager' ? allFields.filter(f => managedFarmIds.has(f.blockFarmId)) : allFields;
  const farms = session.roleKey === 'manager' ? (replica.blockFarms || []).filter(f => managedFarmIds.has(f.id)) : (replica.blockFarms || []);
  const members = (replica.users || []).filter(u => normalizeRole(u.role) === 'member' && u.status === 'ACTIVE');
  const canWrite = ['manager', 'superadmin'].includes(session.roleKey);
  const [form, setForm] = useState({ id: '', blockFarmId: farms[0]?.id || '', memberUserId: '', areaHa: '', variety: '', soilType: '', cropType: 'Sugarcane', cropYear: String(new Date().getFullYear()) });
  const [editing, setEditing] = useState(null);
  async function create(event) { event.preventDefault(); await action.run(() => fieldsApi.create({ ...form, areaHa: Number(form.areaHa), currentStageNumber: 1 }), 'Field and first crop cycle created.').catch(() => undefined); }
  async function saveEdit(event) { event.preventDefault(); try { await action.run(() => fieldsApi.update(editing, { blockFarmId: editing.blockFarmId, memberUserId: editing.memberUserId || null, areaHa: Number(editing.areaHa), variety: editing.variety, soilType: editing.soilType }), 'Field allocation updated.'); setEditing(null); } catch (error) { /* useAction displays the failure */ } }
  return <Section title="Fields" description="Field records use stable Block Farm, Member Farmer, and crop-cycle IDs.">
    <Notice {...action} />
    {editing && <Card><form onSubmit={saveEdit} className="grid gap-4 md:grid-cols-3"><h3 className="md:col-span-3 font-extrabold">Edit {editing.id}</h3>
      <Field label="Block farm"><select required className={inputClass} value={editing.blockFarmId} onChange={e => setEditing({ ...editing, blockFarmId: e.target.value })}>{farms.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select></Field><Field label="Member Farmer"><select className={inputClass} value={editing.memberUserId || ''} onChange={e => setEditing({ ...editing, memberUserId: e.target.value })}><option value="">Unassigned</option>{members.map(m => <option key={userId(m)} value={userId(m)}>{m.displayName || m.name}</option>)}</select></Field><Field label="Area (ha)"><input required type="number" min="0.01" step="0.01" className={inputClass} value={editing.areaHa} onChange={e => setEditing({ ...editing, areaHa: e.target.value })} /></Field><Field label="Variety"><input className={inputClass} value={editing.variety || ''} onChange={e => setEditing({ ...editing, variety: e.target.value })} /></Field><Field label="Soil type"><input className={inputClass} value={editing.soilType || ''} onChange={e => setEditing({ ...editing, soilType: e.target.value })} /></Field><div className="flex items-end gap-2"><button className={buttonClass}>Save</button><button type="button" className={secondaryButtonClass} onClick={() => setEditing(null)}>Cancel</button></div>
    </form></Card>}
    {canWrite && <Card><details><summary className="cursor-pointer font-extrabold text-hug-primary">Register field</summary><form onSubmit={create} className="mt-5 grid gap-4 md:grid-cols-3">
      <Field label="Field ID"><input required className={inputClass} value={form.id} onChange={e => setForm({ ...form, id: e.target.value.toUpperCase() })} /></Field>
      <Field label="Block farm"><select required className={inputClass} value={form.blockFarmId} onChange={e => setForm({ ...form, blockFarmId: e.target.value })}><option value="">Select</option>{farms.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select></Field>
      <Field label="Member Farmer"><select className={inputClass} value={form.memberUserId} onChange={e => setForm({ ...form, memberUserId: e.target.value })}><option value="">Unassigned</option>{members.map(m => <option key={userId(m)} value={userId(m)}>{m.displayName || m.name}</option>)}</select></Field>
      <Field label="Area (ha)"><input required type="number" min="0.01" step="0.01" className={inputClass} value={form.areaHa} onChange={e => setForm({ ...form, areaHa: e.target.value })} /></Field>
      <Field label="Variety"><input className={inputClass} value={form.variety} onChange={e => setForm({ ...form, variety: e.target.value })} /></Field>
      <Field label="Soil type"><input className={inputClass} value={form.soilType} onChange={e => setForm({ ...form, soilType: e.target.value })} /></Field>
      <Field label="Crop type"><input required className={inputClass} value={form.cropType} onChange={e => setForm({ ...form, cropType: e.target.value })} /></Field>
      <Field label="Crop year"><input required className={inputClass} value={form.cropYear} onChange={e => setForm({ ...form, cropYear: e.target.value })} /></Field>
      <div className="flex items-end"><button className={buttonClass} disabled={action.busy}>Register field</button></div>
    </form></details></Card>}
    <Table rows={fields} columns={[
      { key: 'id', label: 'Field' }, { key: 'blockFarmId', label: 'Block Farm' }, { key: 'memberUserId', label: 'Member ID' },
      { key: 'areaHa', label: 'Area (ha)' }, { key: 'currentCycleId', label: 'Current Cycle' }, { key: 'status', label: 'Status', render: row => <Status value={row.status} /> },
      ...(canWrite ? [{ key: 'actions', label: 'Actions', render: field => field.status === 'ACTIVE' ? <div className="flex gap-2"><button className={secondaryButtonClass} onClick={() => setEditing({ ...field })}>Edit</button><button className={secondaryButtonClass} disabled={action.busy} onClick={() => action.run(() => fieldsApi.archive(field), 'Field, current cycle, and submitted operations archived.').catch(() => undefined)}>Archive</button></div> : <span className="text-xs text-hug-muted">Historical record</span> }] : [])
    ]} />
  </Section>;
}
