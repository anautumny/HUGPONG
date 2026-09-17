import { useMemo, useState } from 'react';
import { buttonClass, Card, Field, inputClass, Notice, secondaryButtonClass, Section, Status, Table } from '../components/Ui';
import { selectDashboardScope } from '../domain/dashboardSelectors';
import { useAction } from '../hooks/useAction';
import { accountApi, cyclesApi, fieldsApi, operationsApi } from '../services/domainApi';

const today = () => new Date().toISOString().slice(0, 10);

export function OperationsSection({ replica, session }) {
  const action = useAction();
  const scope = useMemo(() => selectDashboardScope(replica, session), [replica, session]);
  const activeFields = scope.fields.filter(field => field.status === 'ACTIVE');
  const [form, setForm] = useState({ fieldId: '', operationDefinitionId: '', operationName: '', category: 'FIELD_OPERATION', stageNumber: 1, performedOn: today(), areaHa: '', peopleCount: 0, totalCost: '', isSupplemental: false, authorizationPassword: '', lineItems: [] });
  const [edit, setEdit] = useState(null);
  const [reason, setReason] = useState('');
  const selectedField = activeFields.find(field => field.id === form.fieldId);

  async function create(event) {
    event.preventDefault();
    if (!selectedField?.currentCycleId) return;
    const lineItems = form.lineItems.map((item, index) => ({
      lineItemId: item.lineItemId || `ITEM-${index + 1}`, description: item.description,
      quantity: Number(item.quantity), unit: item.unit, unitCost: Number(item.unitCost),
      subtotal: Number(item.quantity) * Number(item.unitCost)
    }));
    const totalCost = lineItems.length ? lineItems.reduce((sum, item) => sum + item.subtotal, 0) : Number(form.totalCost);
    await action.run(async () => {
      await accountApi.verifyPassword(form.authorizationPassword);
      const { authorizationPassword, ...values } = form;
      return operationsApi.create({ ...values, lineItems, totalCost, cycleId: selectedField.currentCycleId, stageNumber: Number(form.stageNumber), areaHa: Number(form.areaHa), peopleCount: Number(form.peopleCount), quantity: null });
    }, 'Take Over operation submitted through the canonical API.').catch(() => undefined);
  }

  async function amend(event) {
    event.preventDefault();
    const totalCost = edit.lineItems?.length ? edit.lineItems.reduce((sum, item) => sum + Number(item.subtotal), 0) : Number(edit.totalCost);
    await action.run(() => operationsApi.amend(edit, { performedOn: edit.performedOn, totalCost, lineItems: edit.lineItems || [] }, reason), 'Operation amendment saved with its audit reason.').catch(() => undefined);
    setEdit(null); setReason('');
  }

  return <Section title="Operations / Take Over Mode" description="Farm Manager Take Over Mode submits canonical operation records on behalf of the managed field. It does not approve member operations.">
    <Notice {...action} />
    <Card><details><summary className="cursor-pointer font-extrabold text-hug-primary">Record operation in Take Over Mode</summary>
      <form onSubmit={create} className="mt-5 grid gap-4 md:grid-cols-3">
        <Field label="Field"><select required className={inputClass} value={form.fieldId} onChange={e => setForm({ ...form, fieldId: e.target.value })}><option value="">Select</option>{activeFields.map(f => <option key={f.id}>{f.id}</option>)}</select></Field>
        <Field label="Operation definition ID"><input required className={inputClass} value={form.operationDefinitionId} onChange={e => setForm({ ...form, operationDefinitionId: e.target.value })} /></Field>
        <Field label="Operation name"><input required className={inputClass} value={form.operationName} onChange={e => setForm({ ...form, operationName: e.target.value })} /></Field>
        <Field label="Category"><input required className={inputClass} value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} /></Field>
        <Field label="Stage (1–6)"><input required type="number" min="1" max="6" className={inputClass} value={form.stageNumber} onChange={e => setForm({ ...form, stageNumber: e.target.value })} /></Field>
        <Field label="Performed on"><input required type="date" className={inputClass} value={form.performedOn} onChange={e => setForm({ ...form, performedOn: e.target.value })} /></Field>
        <Field label="Area (ha)"><input required type="number" min="0.01" step="0.01" className={inputClass} value={form.areaHa} onChange={e => setForm({ ...form, areaHa: e.target.value })} /></Field>
        <Field label="People"><input required type="number" min="0" className={inputClass} value={form.peopleCount} onChange={e => setForm({ ...form, peopleCount: e.target.value })} /></Field>
        <Field label="Total cost"><input required type="number" min="0" step="0.01" className={inputClass} value={form.totalCost} onChange={e => setForm({ ...form, totalCost: e.target.value })} /></Field>
        <Field label="Manager password authorization"><input required type="password" autoComplete="current-password" className={inputClass} value={form.authorizationPassword} onChange={e => setForm({ ...form, authorizationPassword: e.target.value })} /></Field>
        <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={form.isSupplemental} onChange={e => setForm({ ...form, isSupplemental: e.target.checked })} /> Supplemental operation</label>
        <div className="md:col-span-3 rounded-xl border border-hug-border p-4"><div className="flex items-center justify-between"><p className="text-sm font-extrabold">Itemized inputs or labor (optional)</p><button type="button" className={secondaryButtonClass} onClick={() => setForm({ ...form, lineItems: [...form.lineItems, { lineItemId: `ITEM-${form.lineItems.length + 1}`, description: '', quantity: 1, unit: '', unitCost: '' }] })}>Add item</button></div>
          <div className="mt-3 grid gap-3">{form.lineItems.map((item, index) => <div key={`${item.lineItemId}-${index}`} className="grid gap-2 md:grid-cols-[1.5fr_.6fr_.6fr_.8fr_auto]">
            <input required className={inputClass} placeholder="Description" value={item.description} onChange={e => setForm({ ...form, lineItems: form.lineItems.map((value, itemIndex) => itemIndex === index ? { ...value, description: e.target.value } : value) })} />
            <input required type="number" step="0.01" className={inputClass} placeholder="Qty" value={item.quantity} onChange={e => setForm({ ...form, lineItems: form.lineItems.map((value, itemIndex) => itemIndex === index ? { ...value, quantity: e.target.value } : value) })} />
            <input required className={inputClass} placeholder="Unit" value={item.unit} onChange={e => setForm({ ...form, lineItems: form.lineItems.map((value, itemIndex) => itemIndex === index ? { ...value, unit: e.target.value } : value) })} />
            <input required type="number" min="0" step="0.01" className={inputClass} placeholder="Unit cost" value={item.unitCost} onChange={e => setForm({ ...form, lineItems: form.lineItems.map((value, itemIndex) => itemIndex === index ? { ...value, unitCost: e.target.value } : value) })} />
            <button type="button" className={secondaryButtonClass} onClick={() => setForm({ ...form, lineItems: form.lineItems.filter((_, itemIndex) => itemIndex !== index) })}>Remove</button>
          </div>)}</div>
          {form.lineItems.length > 0 && <p className="mt-3 text-sm font-bold text-hug-primary">Calculated total: ₱{form.lineItems.reduce((sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.unitCost) || 0), 0).toLocaleString()}</p>}
        </div>
        <div className="flex items-end"><button className={buttonClass} disabled={action.busy || !selectedField}>Submit operation</button></div>
      </form>
    </details></Card>
    {edit && <Card><form onSubmit={amend} className="grid gap-4 md:grid-cols-3">
      <div className="md:col-span-3"><h3 className="font-extrabold">Amend {edit.id}</h3><p className="text-xs text-hug-muted">Field and crop-cycle identity remain immutable.</p></div>
      <Field label="Performed on"><input type="date" required className={inputClass} value={edit.performedOn} onChange={e => setEdit({ ...edit, performedOn: e.target.value })} /></Field>
      <Field label={edit.lineItems?.length ? 'Total cost (calculated from items)' : 'Total cost'}><input type="number" min="0" step="0.01" required disabled={Boolean(edit.lineItems?.length)} className={inputClass} value={edit.lineItems?.length ? edit.lineItems.reduce((sum, item) => sum + Number(item.subtotal), 0) : edit.totalCost} onChange={e => setEdit({ ...edit, totalCost: e.target.value })} /></Field>
      <Field label="Required amendment reason"><input required className={inputClass} value={reason} onChange={e => setReason(e.target.value)} /></Field>
      <div className="flex gap-2"><button className={buttonClass} disabled={action.busy}>Save amendment</button><button type="button" className={secondaryButtonClass} onClick={() => setEdit(null)}>Cancel</button></div>
    </form></Card>}
    <Table rows={[...scope.logs].sort((a, b) => String(b.performedOn).localeCompare(String(a.performedOn)))} columns={[
      { key: 'id', label: 'Log ID' }, { key: 'fieldId', label: 'Field' }, { key: 'cycleId', label: 'Cycle' },
      { key: 'operationName', label: 'Operation' }, { key: 'performedOn', label: 'Date' }, { key: 'totalCost', label: 'Cost', render: row => `₱${Number(row.totalCost || 0).toLocaleString()}` },
      { key: 'submissionSource', label: 'Source' }, { key: 'status', label: 'Lifecycle', render: row => <Status value={row.status} /> },
      { key: 'amendments', label: 'Revision history', render: row => row.amendments?.length ? <details><summary className="cursor-pointer font-bold text-hug-primary">{row.amendments.length} amendment(s)</summary><ul className="mt-2 space-y-1 text-xs">{row.amendments.map(item => <li key={item.amendmentId}>{item.reason} · {item.amendedByUserId || 'authorized user'}</li>)}</ul></details> : 'None' },
      { key: 'actions', label: 'Actions', render: row => row.status === 'ACTIVE' ? <button className={secondaryButtonClass} onClick={() => setEdit({ ...row })}>Amend</button> : <span className="text-xs text-hug-muted">Historical record</span> }
    ]} />
  </Section>;
}

export function CyclesSection({ replica, session }) {
  const action = useAction();
  const scope = useMemo(() => selectDashboardScope(replica, session), [replica, session]);
  const fieldIds = new Set(scope.fields.map(field => field.id));
  const cycles = (replica.cropCycles || []).filter(cycle => fieldIds.has(cycle.fieldId));
  const [editing, setEditing] = useState(null);
  const [rollover, setRollover] = useState(null);
  const [plan, setPlan] = useState(null);

  async function saveStage(event) {
    event.preventDefault();
    await action.run(() => cyclesApi.updateStage(editing, Number(editing.currentStageNumber), Number(editing.elapsedMonths)), 'Crop stage updated.').catch(() => undefined);
    setEditing(null);
  }
  async function startCycle(event) {
    event.preventDefault();
    const field = scope.fields.find(item => item.id === rollover.fieldId);
    await action.run(() => cyclesApi.rollover(field, rollover, { cropType: rollover.nextCropType, cropYear: rollover.nextCropYear, batchNumber: Number(rollover.nextBatchNumber || 1) }), 'Previous-cycle operations archived and the new crop cycle started atomically.').catch(() => undefined);
    setRollover(null);
  }
  async function savePlan(event) {
    event.preventDefault();
    try {
      const customStages = JSON.parse(plan.customStages);
      const customOperations = JSON.parse(plan.customOperations);
      if (!Array.isArray(customStages) || !customOperations || Array.isArray(customOperations) || typeof customOperations !== 'object') throw new Error('Stages must be an array and operations must be an object keyed by stage.');
      await action.run(async () => {
        const stageResult = await fieldsApi.customStages(plan.field, customStages);
        await fieldsApi.customOperations({ ...plan.field, updatedAt: stageResult.data.updatedAt }, customOperations);
      }, 'Field stage and operation configuration saved.');
      setPlan(null);
    } catch (error) { if (!action.error) action.setError(error.message); }
  }

  return <Section title="Crop Cycles" description="Explicit lifecycle state is authoritative. Starting a new cycle archives the previous cycle and its ACTIVE operation records atomically.">
    <Notice {...action} />
    {editing && <Card><form onSubmit={saveStage} className="grid gap-4 md:grid-cols-3"><h3 className="md:col-span-3 font-extrabold">Update {editing.id}</h3>
      <Field label="Stage"><input required type="number" min="1" max="6" className={inputClass} value={editing.currentStageNumber} onChange={e => setEditing({ ...editing, currentStageNumber: e.target.value })} /></Field>
      <Field label="Elapsed months"><input required type="number" min="0" max="36" step="0.1" className={inputClass} value={editing.elapsedMonths} onChange={e => setEditing({ ...editing, elapsedMonths: e.target.value })} /></Field>
      <div className="flex items-end gap-2"><button className={buttonClass}>Save stage</button><button type="button" className={secondaryButtonClass} onClick={() => setEditing(null)}>Cancel</button></div>
    </form></Card>}
    {rollover && <Card><form onSubmit={startCycle} className="grid gap-4 md:grid-cols-3"><h3 className="md:col-span-3 font-extrabold">Start new cycle for {rollover.fieldId}</h3>
      <Field label="Crop type"><input required className={inputClass} value={rollover.nextCropType} onChange={e => setRollover({ ...rollover, nextCropType: e.target.value })} /></Field>
      <Field label="Crop year"><input required className={inputClass} value={rollover.nextCropYear} onChange={e => setRollover({ ...rollover, nextCropYear: e.target.value })} /></Field>
      <Field label="Batch number"><input required type="number" min="1" className={inputClass} value={rollover.nextBatchNumber} onChange={e => setRollover({ ...rollover, nextBatchNumber: e.target.value })} /></Field>
      <div className="md:col-span-3 flex gap-2"><button className={buttonClass}>Archive and start cycle</button><button type="button" className={secondaryButtonClass} onClick={() => setRollover(null)}>Cancel</button></div>
    </form></Card>}
    {plan && <Card><form onSubmit={savePlan} className="grid gap-4"><div><h3 className="font-extrabold">Field plan configuration: {plan.field.id}</h3><p className="mt-1 text-xs text-hug-muted">Edit the existing canonical arrays/objects without creating duplicate configuration fields.</p></div>
      <Field label="Custom stages (JSON array)"><textarea required rows={7} className={inputClass} value={plan.customStages} onChange={e => setPlan({ ...plan, customStages: e.target.value })} /></Field>
      <Field label="Custom operations (JSON object keyed by stage number)"><textarea required rows={8} className={inputClass} value={plan.customOperations} onChange={e => setPlan({ ...plan, customOperations: e.target.value })} /></Field>
      <div className="flex gap-2"><button className={buttonClass} disabled={action.busy}>Save field plan</button><button type="button" className={secondaryButtonClass} onClick={() => setPlan(null)}>Cancel</button></div>
    </form></Card>}
    <Table rows={cycles} columns={[
      { key: 'id', label: 'Cycle' }, { key: 'fieldId', label: 'Field' }, { key: 'sequenceNumber', label: 'Sequence' }, { key: 'cropType', label: 'Crop' },
      { key: 'cropYear', label: 'Year' }, { key: 'currentStageNumber', label: 'Stage' }, { key: 'status', label: 'Lifecycle', render: row => <Status value={row.status} /> },
      { key: 'actions', label: 'Actions', render: row => row.status === 'ACTIVE' ? <div className="flex flex-wrap gap-2"><button className={secondaryButtonClass} onClick={() => setEditing({ ...row })}>Stage</button><button className={secondaryButtonClass} onClick={() => setRollover({ ...row, nextCropType: row.cropType || 'Sugarcane', nextCropYear: String(new Date().getFullYear()), nextBatchNumber: 1 })}>New cycle</button><button className={secondaryButtonClass} onClick={() => { const field = scope.fields.find(item => item.id === row.fieldId); setPlan({ field, customStages: JSON.stringify(field.customStages || [], null, 2), customOperations: JSON.stringify(field.customOperations || {}, null, 2) }); }}>Field plan</button></div> : 'Archived' }
    ]} />
  </Section>;
}
