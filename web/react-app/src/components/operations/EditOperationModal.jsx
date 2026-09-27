import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Pencil, Plus, Trash2 } from 'lucide-react';
import { updateOperation } from '../../services/operationsService';
import { STAGE_DISPLAY_LABELS } from '../../domain/presentationContract';
import { SUGARCANE_VARIETIES } from '../../domain/sugarcaneVarieties';
import { meaningfulAmendmentChanges } from '../../domain/amendmentPresentation';
import { Button, FormField, Input, Modal, Select, Textarea } from '../ui';
import { createClientRecordId } from '../../utils/secureId';
import { OPERATION_UNITS } from '../../domain/operationUnits';
import { formatCurrency } from '../../utils/formatters';

const createLineItem = () => ({
  lineItemId: createClientRecordId('SI'),
  itemType: 'EXPENSE',
  description: '',
  quantity: 1,
  unit: 'ha',
  unitCost: 0,
  subtotal: 0
});

const normalizedLineItem = item => ({
  lineItemId: item.lineItemId || item.id || createClientRecordId('SI'),
  itemType: item.itemType || 'EXPENSE',
  description: String(item.description || ''),
  quantity: Number(item.quantity ?? item.qty ?? 0),
  unit: item.unit || 'ha',
  unitCost: Number(item.unitCost || 0),
  subtotal: Number(item.subtotal ?? item.subTotal ?? 0)
});

export default function EditOperationModal({ operation, isOpen, onClose, onUpdated, takeoverGrant = null }) {
  const [form, setForm] = useState(null);
  const [reason, setReason] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showNewExpense, setShowNewExpense] = useState(false);
  const [pendingExpense, setPendingExpense] = useState(createLineItem());

  useEffect(() => {
    if (!isOpen || !operation) return;
    const lineItems = (operation.lineItems || operation.subItems || []).map(normalizedLineItem);
    const laborEntries = Array.isArray(operation.laborEntries) ? operation.laborEntries : [];
    const workersCount = laborEntries.length
      ? laborEntries.reduce((sum, item) => sum + Number(item.workerCount || 0), 0)
      : Number(operation.peopleCount ?? operation.people ?? 0);
    const laborTotal = laborEntries.reduce((sum, item) => sum + Number(item.subtotal || 0), 0);
    const firstLabor = laborEntries[0] || null;
    const workDays = Number(firstLabor?.days ?? firstLabor?.quantity ?? 1) || 1;
    const workerRate = workersCount > 0 && workDays > 0
      ? laborTotal / (workersCount * workDays)
      : Number(firstLabor?.rate || 0);
    const quantity = operation.quantity && typeof operation.quantity === 'object' ? operation.quantity : null;
    const expenseTotal = lineItems.reduce((sum, item) => sum + item.subtotal, 0);
    const baseCost = Number(operation.baseCost ?? Math.max(0, Number(operation.totalCost ?? operation.cost ?? 0) - laborTotal - expenseTotal));
    const directQty = Number(quantity?.value ?? operation.inputQty ?? operation.areaHa ?? operation.hectares ?? 1) || 1;

    setForm({
      operationName: operation.operationName || operation.activity || '',
      performedOn: operation.performedOn || operation.date || operation.period || '',
      stageNumber: Number(operation.stageNumberAtRecord || operation.stageNumber || 1),
      variety: operation.variety || '',
      areaHa: String(operation.areaHa ?? operation.hectares ?? ''),
      workersCount: String(workersCount || ''),
      workDays: String(workDays),
      workerRate: workerRate ? String(workerRate) : '',
      inputMode: lineItems.length > 0 ? 'group' : 'direct',
      directQty: String(directQty),
      directUnit: quantity?.unit || operation.inputUnit || 'ha',
      directRate: directQty > 0 ? String(baseCost / directQty) : '',
      lineItems
    });
    setReason('');
    setError('');
    setSuccess('');
    setIsSaving(false);
    setShowNewExpense(false);
    setPendingExpense(createLineItem());
  }, [isOpen, operation]);

  const costs = useMemo(() => {
    if (!form) return { base: 0, expenses: 0, labor: 0, total: 0, perHa: 0 };
    const expenses = form.inputMode === 'group'
      ? form.lineItems.reduce((sum, item) => sum + Number(item.subtotal || 0), 0)
      : 0;
    const base = form.inputMode === 'direct'
      ? Number(form.directQty || 0) * Number(form.directRate || 0)
      : 0;
    const labor = Number(form.workersCount || 0) * Number(form.workDays || 0) * Number(form.workerRate || 0);
    const total = base + expenses + labor;
    const area = Number(form.areaHa || 0);
    return { base, expenses, labor, total, perHa: area > 0 ? total / area : 0 };
  }, [form]);

  if (!form || !operation) return null;

  const isCustomOperation = String(operation.operationDefinitionId || operation.sraOperationId || '').toUpperCase() === 'CUSTOM';
  const controlsDisabled = isSaving || Boolean(success);

  const selectInputMode = mode => {
    if (controlsDisabled || mode === form.inputMode) return;
    setForm(current => {
      if (mode === 'group') {
        const quantity = Number(current.directQty || 1);
        const unitCost = Number(current.directRate || 0);
        return {
          ...current,
          inputMode: 'group',
          lineItems: current.lineItems.length ? current.lineItems : [{
            ...createLineItem(),
            description: `${current.operationName || 'Operation'} Material/Labor`,
            quantity,
            unit: current.directUnit || 'ha',
            unitCost,
            subtotal: quantity * unitCost
          }]
        };
      }
      const expenseTotal = current.lineItems.reduce((sum, item) => sum + Number(item.subtotal || 0), 0);
      const quantity = Number(current.areaHa || 1) || 1;
      return { ...current, inputMode: 'direct', directQty: String(quantity), directUnit: 'ha', directRate: String(expenseTotal / quantity) };
    });
  };

  const changeLineItem = (index, key, value) => {
    setForm(current => ({
      ...current,
      lineItems: current.lineItems.map((item, itemIndex) => {
        if (itemIndex !== index) return item;
        const changed = { ...item, [key]: value };
        if (key === 'quantity' || key === 'unitCost') changed.subtotal = Number(changed.quantity || 0) * Number(changed.unitCost || 0);
        return changed;
      })
    }));
  };

  const confirmExpense = () => {
    const quantity = Number(pendingExpense.quantity);
    const unitCost = Number(pendingExpense.unitCost);
    if (!pendingExpense.description.trim() || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unitCost) || unitCost < 0) {
      setError('Enter the material or expense details before confirming it.');
      return;
    }
    setForm(current => ({
      ...current,
      lineItems: [...current.lineItems, { ...pendingExpense, description: pendingExpense.description.trim(), quantity, unitCost, subtotal: quantity * unitCost }]
    }));
    setPendingExpense(createLineItem());
    setShowNewExpense(false);
    setError('');
  };

  const handleSubmit = async event => {
    event?.preventDefault?.();
    if (isSaving) return;
    setError('');
    setSuccess('');

    const areaHa = Number(form.areaHa);
    const workersCount = Number(form.workersCount || 0);
    const workDays = Number(form.workDays || 0);
    const workerRate = Number(form.workerRate || 0);
    if (!form.operationName.trim() || !form.performedOn) return setError('Operation and completion date are required.');
    if (!Number.isFinite(areaHa) || areaHa <= 0 || !Number.isInteger(workersCount) || workersCount < 0) return setError('Enter a valid field area and worker count.');
    if (workersCount > 0 && (!Number.isFinite(workDays) || workDays <= 0 || !Number.isFinite(workerRate) || workerRate < 0)) return setError('Enter valid work days and a daily rate for the crew.');
    if (reason.trim().length < 3) return setError('Enter a reason for this operation amendment.');
    if (form.stageNumber === 2 && !form.variety.trim()) return setError('Sugarcane variety is required for a Planting-stage operation.');

    const lineItems = form.inputMode === 'group' ? form.lineItems.map(item => ({
      lineItemId: item.lineItemId,
      itemType: item.itemType || 'EXPENSE',
      description: String(item.description || '').trim(),
      quantity: Number(item.quantity || 0),
      unit: item.unit || 'ha',
      unitCost: Number(item.unitCost || 0),
      subtotal: Number(item.quantity || 0) * Number(item.unitCost || 0)
    })) : [];
    if (form.inputMode === 'group' && (!lineItems.length || lineItems.some(item => !item.description || item.quantity <= 0))) return setError('Itemized Costs requires at least one complete material or expense.');

    const laborEntries = workersCount > 0 ? [{
      laborEntryId: operation.laborEntries?.[0]?.laborEntryId || createClientRecordId('LAB'),
      workerCount: workersCount,
      days: workDays,
      unit: 'day',
      rate: workerRate,
      subtotal: workersCount * workDays * workerRate
    }] : [];
    const quantity = form.inputMode === 'direct' ? { value: Number(form.directQty || 0), unit: form.directUnit || 'ha', inputName: form.operationName.trim() } : null;
    if (form.inputMode === 'direct' && (!Number.isFinite(quantity.value) || quantity.value <= 0 || !Number.isFinite(Number(form.directRate)) || Number(form.directRate) < 0)) return setError('Enter a valid quantity and unit rate for Direct Input.');

    const changes = {
      operationDefinitionId: operation.operationDefinitionId || operation.sraOperationId || 'CUSTOM',
      childOperationDefinitionId: operation.childOperationDefinitionId || null,
      childOperationName: operation.childOperationName || '',
      operationName: form.operationName.trim(),
      category: operation.category || 'General Care',
      stageNumber: Number(form.stageNumber),
      variety: form.stageNumber === 2 ? form.variety.trim() : '',
      performedOn: form.performedOn,
      areaHa,
      peopleCount: workersCount,
      baseCost: form.inputMode === 'direct' ? costs.base : 0,
      quantity,
      totalCost: costs.total,
      lineItems,
      laborEntries,
      isSupplemental: Boolean(operation.isSupplemental)
    };
    const amendmentChanges = meaningfulAmendmentChanges({
      operationName: { before: operation.operationName, after: changes.operationName },
      performedOn: { before: operation.performedOn, after: changes.performedOn },
      areaHa: { before: operation.areaHa, after: changes.areaHa },
      peopleCount: { before: operation.peopleCount, after: changes.peopleCount },
      quantity: { before: operation.quantity, after: changes.quantity },
      baseCost: { before: operation.baseCost, after: changes.baseCost },
      totalCost: { before: operation.totalCost, after: changes.totalCost },
      lineItems: { before: operation.lineItems || [], after: changes.lineItems },
      laborEntries: { before: operation.laborEntries || [], after: changes.laborEntries },
      variety: { before: operation.variety || '', after: changes.variety }
    });
    if (Object.keys(amendmentChanges).length === 0) return setError('No meaningful changes were detected. Nothing was submitted.');

    setIsSaving(true);
    try {
      const result = await updateOperation(operation.id, changes, {
        amendmentId: createClientRecordId('AMDWEB'),
        reason: reason.trim(),
        changes: amendmentChanges
      }, operation.updatedAt || null, takeoverGrant);
      setSuccess('Operation updated successfully.');
      if (typeof onUpdated === 'function') onUpdated(result.data);
    } catch (saveError) {
      setError(saveError.message || 'Unable to update this operation.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Edit Operation Record" subtitle={`Field ${operation.fieldId} (${form.areaHa || 0} Ha)`} icon={Pencil} size="lg" isLoading={isSaving} preventBackdropClose={isSaving} preventEscapeClose={isSaving} footer={<><Button variant="ghost" onClick={onClose} disabled={isSaving}>Cancel</Button><Button variant="primary" onClick={handleSubmit} isLoading={isSaving} loadingText="Saving changes..." disabled={Boolean(success)}>Save Changes</Button></>}>
      <form onSubmit={handleSubmit} className="space-y-6">
        {error && <div className="p-3 rounded-xl bg-danger-bg border border-danger/30 text-danger flex gap-2 font-semibold"><AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /> {error}</div>}
        {success && <div className="p-3 rounded-xl bg-success-bg border border-success/30 text-success flex gap-2 font-semibold"><CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" /> {success}</div>}

        <section className="space-y-3">
          <h3 className="text-xs font-black uppercase tracking-wider text-hug-muted">Field &amp; Operation</h3>
          <div className="rounded-2xl border border-primary/25 bg-primary-bg/55 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <span className="inline-flex rounded-md bg-primary px-2 py-1 text-[10px] font-black text-white">{operation.operationDefinitionId || operation.sraOperationId || 'CUSTOM'}</span>
                {isCustomOperation ? <Input className="mt-2" value={form.operationName} onChange={event => setForm({ ...form, operationName: event.target.value })} disabled={controlsDisabled} /> : <h4 className="mt-2 text-base font-black text-hug-text">{form.operationName}</h4>}
                {operation.childOperationName && <p className="mt-1 text-xs font-bold text-primary">Child item: {operation.childOperationName}</p>}
              </div>
              <div className="text-right"><p className="text-xs font-bold text-hug-muted">{STAGE_DISPLAY_LABELS[form.stageNumber]}</p><p className="mt-1 text-xs text-hug-muted">Operation ID: {operation.id}</p></div>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField label="Date of Operation" required><Input type="date" value={form.performedOn} onChange={event => setForm({ ...form, performedOn: event.target.value })} disabled={controlsDisabled} /></FormField>
            <FormField label="Stage at Recording"><Input value={STAGE_DISPLAY_LABELS[form.stageNumber] || `Stage ${form.stageNumber}`} readOnly disabled /></FormField>
          </div>
          {form.stageNumber === 2 && <FormField label="Sugarcane Variety" required helperText="Stored on the Crop Year Cycle and changed through this amendment."><Select value={form.variety} onChange={event => setForm({ ...form, variety: event.target.value })} placeholder="Select sugarcane variety..." options={SUGARCANE_VARIETIES.map(value => ({ value, label: value }))} disabled={controlsDisabled} /></FormField>}
        </section>

        <section className="space-y-3 border-t border-border pt-5">
          <h3 className="text-xs font-black uppercase tracking-wider text-hug-muted">Labor &amp; Resources</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField label="Hectares Covered" required><Input type="number" min="0.01" step="0.01" suffix="Ha" value={form.areaHa} onChange={event => setForm({ ...form, areaHa: event.target.value })} disabled={controlsDisabled} /></FormField>
            <FormField label="Workers / Crew" required><Input type="number" min="0" step="1" suffix="workers" value={form.workersCount} onChange={event => setForm({ ...form, workersCount: event.target.value })} disabled={controlsDisabled} /></FormField>
          </div>
          <div className="rounded-2xl border border-border bg-bg/60 p-3">
            <p className="mb-2 text-xs text-hug-muted">Labor details are attached to this operation.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <FormField label="Work Days"><Input type="number" min="0.1" step="0.1" value={form.workDays} onChange={event => setForm({ ...form, workDays: event.target.value })} disabled={controlsDisabled || Number(form.workersCount || 0) === 0} /></FormField>
              <FormField label="Rate / Day"><Input type="number" min="0" step="0.01" prefix="₱" value={form.workerRate} onChange={event => setForm({ ...form, workerRate: event.target.value })} disabled={controlsDisabled || Number(form.workersCount || 0) === 0} /></FormField>
            </div>
            <p className="mt-2 text-sm font-black text-primary">Labor cost: {formatCurrency(costs.labor)}</p>
          </div>
        </section>

        <section className="space-y-3 border-t border-border pt-5">
          <h3 className="text-xs font-black uppercase tracking-wider text-hug-muted">Cost Details</h3>
          <div className="grid grid-cols-2 rounded-xl bg-bg p-1">
            <button type="button" onClick={() => selectInputMode('group')} disabled={controlsDisabled} className={`rounded-lg px-3 py-2.5 text-sm font-bold transition ${form.inputMode === 'group' ? 'bg-white dark:bg-surface text-primary shadow-sm' : 'text-hug-muted'}`}>Itemized Costs</button>
            <button type="button" onClick={() => selectInputMode('direct')} disabled={controlsDisabled} className={`rounded-lg px-3 py-2.5 text-sm font-bold transition ${form.inputMode === 'direct' ? 'bg-white dark:bg-surface text-primary shadow-sm' : 'text-hug-muted'}`}>Direct Input</button>
          </div>

          {form.inputMode === 'group' ? (
            <div className="space-y-3 rounded-2xl border border-border p-3">
              <div className="flex items-center justify-between gap-3"><span className="text-sm font-black text-hug-text">Materials / Expenses</span><span className="text-xs text-hug-muted">{form.lineItems.length} {form.lineItems.length === 1 ? 'item' : 'items'}</span></div>
              {form.lineItems.map((item, index) => (
                <div key={item.lineItemId || index} className="space-y-2 rounded-xl border border-border bg-bg/40 p-3">
                  <div className="flex items-start gap-2"><Input className="flex-1" value={item.description} onChange={event => changeLineItem(index, 'description', event.target.value)} placeholder="Description / material name" disabled={controlsDisabled} /><button type="button" className="rounded-lg p-2 text-danger hover:bg-danger-bg disabled:opacity-40" onClick={() => setForm(current => ({ ...current, lineItems: current.lineItems.filter((_, itemIndex) => itemIndex !== index) }))} disabled={controlsDisabled} aria-label="Remove cost item"><Trash2 className="h-4 w-4" /></button></div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2"><Input type="number" min="0.01" step="0.01" value={item.quantity} onChange={event => changeLineItem(index, 'quantity', event.target.value)} placeholder="Quantity" disabled={controlsDisabled} /><Select value={item.unit} onChange={event => changeLineItem(index, 'unit', event.target.value)} options={OPERATION_UNITS.map(unit => ({ value: unit, label: unit }))} disabled={controlsDisabled} /><Input type="number" min="0" step="0.01" prefix="₱" value={item.unitCost} onChange={event => changeLineItem(index, 'unitCost', event.target.value)} placeholder="Unit cost" disabled={controlsDisabled} /></div>
                  <p className="text-right text-sm font-black text-primary">{formatCurrency(Number(item.quantity || 0) * Number(item.unitCost || 0))}</p>
                </div>
              ))}
              {showNewExpense && <div className="space-y-3 rounded-xl border border-primary/30 bg-primary-bg/40 p-3"><Input value={pendingExpense.description} onChange={event => setPendingExpense(current => ({ ...current, description: event.target.value }))} placeholder="Material or expense" /><div className="grid grid-cols-1 sm:grid-cols-3 gap-2"><Input type="number" min="0.01" step="0.01" value={pendingExpense.quantity} onChange={event => setPendingExpense(current => ({ ...current, quantity: event.target.value }))} placeholder="Quantity" /><Select value={pendingExpense.unit} onChange={event => setPendingExpense(current => ({ ...current, unit: event.target.value }))} options={OPERATION_UNITS.map(unit => ({ value: unit, label: unit }))} /><Input type="number" min="0" step="0.01" prefix="₱" value={pendingExpense.unitCost} onChange={event => setPendingExpense(current => ({ ...current, unitCost: event.target.value }))} placeholder="Unit cost" /></div><div className="flex justify-end gap-2"><Button type="button" variant="ghost" size="sm" onClick={() => { setShowNewExpense(false); setPendingExpense(createLineItem()); }}>Cancel</Button><Button type="button" variant="primary" size="sm" onClick={confirmExpense}>Confirm Item</Button></div></div>}
              <Button type="button" variant="outline" size="sm" icon={Plus} onClick={() => setShowNewExpense(true)} disabled={controlsDisabled || showNewExpense} className="w-full border-dashed">Add Expense / Material</Button>
            </div>
          ) : (
            <div className="space-y-3 rounded-2xl border border-border p-3"><div className="grid grid-cols-1 sm:grid-cols-2 gap-3"><FormField label="Quantity" required><Input type="number" min="0.01" step="0.01" value={form.directQty} onChange={event => setForm({ ...form, directQty: event.target.value })} disabled={controlsDisabled} /></FormField><FormField label="Unit Rate / Cost" required><Input type="number" min="0" step="0.01" prefix="₱" value={form.directRate} onChange={event => setForm({ ...form, directRate: event.target.value })} disabled={controlsDisabled} /></FormField></div><FormField label="Unit"><Select value={form.directUnit} onChange={event => setForm({ ...form, directUnit: event.target.value })} options={OPERATION_UNITS.map(unit => ({ value: unit, label: unit }))} disabled={controlsDisabled} /></FormField><div className="rounded-xl border border-primary/25 bg-primary-bg/55 p-3"><p className="text-xs font-bold text-hug-muted">Estimated direct cost</p><p className="mt-1 text-xl font-black text-primary">{formatCurrency(costs.base)}</p></div></div>
          )}

          <div className="rounded-2xl bg-[#1E4D2B] p-4 text-white"><div className="flex items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-wider text-white/70">Total Operation Cost</p><p className="mt-1 text-2xl font-black">{formatCurrency(costs.total)}</p></div><div className="rounded-xl bg-white/10 px-3 py-2 text-right"><p className="text-[11px] text-white/70">Per Hectare</p><p className="text-sm font-black">{formatCurrency(costs.perHa)} / ha</p></div></div></div>
        </section>

        <FormField label="Reason for Amendment" required helperText="This reason is stored with the operation's immutable amendment history."><Textarea value={reason} onChange={event => setReason(event.target.value)} rows={3} disabled={controlsDisabled} placeholder="Explain why this operation is being corrected." /></FormField>
      </form>
    </Modal>
  );
}
