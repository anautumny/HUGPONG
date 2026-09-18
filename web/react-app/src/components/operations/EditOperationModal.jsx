import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Pencil, Plus, Trash2 } from 'lucide-react';
import { updateOperation } from '../../services/operationsService';
import { Button, FormField, Input, Modal, Select, Textarea } from '../ui';

const newLineItem = () => ({
  lineItemId: `SI-${Date.now().toString(36).toUpperCase()}`,
  description: '',
  quantity: 1,
  unit: 'ha',
  unitCost: 0,
  subtotal: 0
});

export default function EditOperationModal({ operation, isOpen, onClose, onUpdated }) {
  const [form, setForm] = useState(null);
  const [reason, setReason] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (!isOpen || !operation) return;
    setForm({
      operationName: operation.operationName || operation.activity || '',
      performedOn: operation.performedOn || operation.date || '',
      stageNumber: Number(operation.stageNumber || 1),
      areaHa: String(operation.areaHa ?? operation.hectares ?? ''),
      peopleCount: String(operation.peopleCount ?? operation.people ?? 0),
      totalCost: String(operation.totalCost ?? operation.cost ?? 0),
      quantity: operation.quantity ? { ...operation.quantity } : null,
      lineItems: (operation.lineItems || []).map(item => ({ ...item }))
    });
    setReason('');
    setError('');
    setSuccess('');
    setIsSaving(false);
  }, [isOpen, operation]);

  const hasLineItems = Boolean(form?.lineItems?.length);
  const computedTotal = useMemo(() => {
    if (!form) return 0;
    if (!hasLineItems) return Number(form.totalCost || 0);
    return form.lineItems.reduce((sum, item) => sum + Number(item.subtotal || 0), 0);
  }, [form, hasLineItems]);

  const changeLineItem = (index, key, value) => {
    setForm(current => {
      const lineItems = current.lineItems.map((item, itemIndex) => {
        if (itemIndex !== index) return item;
        const changed = { ...item, [key]: value };
        if (key === 'quantity' || key === 'unitCost') {
          changed.subtotal = Number(changed.quantity || 0) * Number(changed.unitCost || 0);
        }
        return changed;
      });
      return { ...current, lineItems };
    });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!operation || !form || isSaving) return;
    setError('');
    setSuccess('');

    const areaHa = Number(form.areaHa);
    const peopleCount = Number(form.peopleCount);
    if (!form.operationName.trim() || !form.performedOn) {
      setError('Operation name and completion date are required.');
      return;
    }
    if (!Number.isFinite(areaHa) || areaHa <= 0 || !Number.isInteger(peopleCount) || peopleCount < 0) {
      setError('Enter a valid field area and worker count.');
      return;
    }
    if (reason.trim().length < 3) {
      setError('Enter a reason for this operation amendment.');
      return;
    }
    if (!Number.isFinite(computedTotal) || computedTotal < 0) {
      setError('Enter a valid operation cost.');
      return;
    }

    const lineItems = (form.lineItems || []).map(item => ({
      lineItemId: item.lineItemId,
      description: String(item.description || '').trim(),
      quantity: Number(item.quantity || 0),
      unit: String(item.unit || 'unit').trim(),
      unitCost: Number(item.unitCost || 0),
      subtotal: Number(item.subtotal || 0)
    }));
    if (lineItems.some(item => !item.description)) {
      setError('Every cost line item requires a description.');
      return;
    }

    const changes = {
      operationDefinitionId: operation.operationDefinitionId || operation.sraOperationId || 'CUSTOM',
      operationName: form.operationName.trim(),
      category: operation.category || 'General Care',
      stageNumber: Number(form.stageNumber),
      performedOn: form.performedOn,
      areaHa,
      peopleCount,
      quantity: lineItems.length ? null : (form.quantity || null),
      totalCost: computedTotal,
      lineItems,
      isSupplemental: Boolean(operation.isSupplemental)
    };
    const amendment = {
      amendmentId: `AMD-WEB-${Date.now().toString(36).toUpperCase()}`,
      reason: reason.trim(),
      changes: {
        operationName: { before: operation.operationName, after: changes.operationName },
        performedOn: { before: operation.performedOn, after: changes.performedOn },
        totalCost: { before: operation.totalCost, after: changes.totalCost }
      }
    };

    setIsSaving(true);
    try {
      const result = await updateOperation(operation.id, changes, amendment, operation.updatedAt || null);
      setSuccess('Operation updated successfully.');
      if (typeof onUpdated === 'function') onUpdated(result.data);
    } catch (saveError) {
      setError(saveError.message || 'Unable to update this operation.');
    } finally {
      setIsSaving(false);
    }
  };

  if (!form || !operation) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Edit Field Operation"
      subtitle={`${operation.id} · ${operation.fieldId}`}
      icon={Pencil}
      size="lg"
      isLoading={isSaving}
      preventBackdropClose={isSaving}
      preventEscapeClose={isSaving}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={isSaving}>Cancel</Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            isLoading={isSaving}
            loadingText="Saving changes..."
            disabled={Boolean(success)}
          >
            Save Changes
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-3 rounded-xl bg-danger-bg border border-danger/30 text-danger flex gap-2 font-semibold">
            <AlertCircle className="w-4 h-4 shrink-0" /> {error}
          </div>
        )}
        {success && (
          <div className="p-3 rounded-xl bg-success-bg border border-success/30 text-success flex gap-2 font-semibold">
            <CheckCircle2 className="w-4 h-4 shrink-0" /> {success}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FormField label="Operation / Activity" required>
            <Input value={form.operationName} onChange={event => setForm({ ...form, operationName: event.target.value })} disabled={isSaving || Boolean(success)} />
          </FormField>
          <FormField label="Date Completed" required>
            <Input type="date" value={form.performedOn} onChange={event => setForm({ ...form, performedOn: event.target.value })} disabled={isSaving || Boolean(success)} />
          </FormField>
          <FormField label="Crop Stage" required>
            <Select
              value={String(form.stageNumber)}
              onChange={event => setForm({ ...form, stageNumber: Number(event.target.value) })}
              options={[1, 2, 3, 4, 5, 6].map(stage => ({ value: String(stage), label: `Stage ${stage}` }))}
              disabled={isSaving || Boolean(success)}
            />
          </FormField>
          <FormField label="Field Area" required>
            <Input type="number" min="0.01" step="0.01" suffix="ha" value={form.areaHa} onChange={event => setForm({ ...form, areaHa: event.target.value })} disabled={isSaving || Boolean(success)} />
          </FormField>
          <FormField label="Workers" required>
            <Input type="number" min="0" step="1" value={form.peopleCount} onChange={event => setForm({ ...form, peopleCount: event.target.value })} disabled={isSaving || Boolean(success)} />
          </FormField>
          {!hasLineItems && (
            <FormField label="Total Cost" required>
              <Input type="number" min="0" step="0.01" prefix="₱" value={form.totalCost} onChange={event => setForm({ ...form, totalCost: event.target.value })} disabled={isSaving || Boolean(success)} />
            </FormField>
          )}
        </div>

        {hasLineItems && (
          <div className="space-y-2 border-t border-border pt-4">
            <div className="flex items-center justify-between">
              <span className="font-bold text-hug-text">Cost line items</span>
              <Button
                size="sm"
                variant="secondary"
                icon={Plus}
                onClick={() => setForm({ ...form, lineItems: [...form.lineItems, newLineItem()] })}
                disabled={isSaving || Boolean(success)}
              >
                Add Item
              </Button>
            </div>
            {form.lineItems.map((item, index) => (
              <div key={item.lineItemId || index} className="grid grid-cols-12 gap-2 items-center rounded-xl border border-border p-2">
                <div className="col-span-5">
                  <Input value={item.description} onChange={event => changeLineItem(index, 'description', event.target.value)} disabled={isSaving || Boolean(success)} />
                </div>
                <div className="col-span-2">
                  <Input type="number" min="0" step="0.01" value={item.quantity} onChange={event => changeLineItem(index, 'quantity', event.target.value)} disabled={isSaving || Boolean(success)} />
                </div>
                <div className="col-span-3">
                  <Input type="number" min="0" step="0.01" value={item.unitCost} onChange={event => changeLineItem(index, 'unitCost', event.target.value)} disabled={isSaving || Boolean(success)} />
                </div>
                <button
                  type="button"
                  className="col-span-2 p-2 text-danger disabled:opacity-40"
                  onClick={() => setForm({ ...form, lineItems: form.lineItems.filter((_, itemIndex) => itemIndex !== index) })}
                  disabled={form.lineItems.length === 1 || isSaving || Boolean(success)}
                  aria-label="Remove cost item"
                >
                  <Trash2 className="w-4 h-4 mx-auto" />
                </button>
              </div>
            ))}
            <p className="text-right font-black text-hug-text">Total: ₱{computedTotal.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</p>
          </div>
        )}

        <FormField label="Reason for amendment" required helperText="Stored with the existing operation's immutable amendment history.">
          <Textarea value={reason} onChange={event => setReason(event.target.value)} rows={3} disabled={isSaving || Boolean(success)} placeholder="Explain why this operation is being corrected." />
        </FormField>
      </form>
    </Modal>
  );
}
