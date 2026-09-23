import React, { useState, useEffect, useMemo } from 'react';
import { FormField, Input, Select, Button } from '../ui';
import { createOperation } from '../../services/operationsService';
import { SUGARCANE_STAGES } from '../../constants/cropStages';
import { SRA_OPERATIONS_CATALOGUE } from '../../domain/operationCatalogue';
import { formatCurrency } from '../../utils/formatters';
import { Plus, Trash2, CheckCircle2, AlertCircle } from 'lucide-react';

export default function OperationForm({
  fields = [],
  initialFieldId = '',
  isTakeOver = false,
  onSuccess
}) {
  const [selectedFieldId, setSelectedFieldId] = useState(initialFieldId);
  const [selectedOpId, setSelectedOpId] = useState('SRA-02');
  const [inputMode, setInputMode] = useState('group'); // 'group' or 'direct'

  // Operation header details
  const [performedOn, setPerformedOn] = useState(new Date().toISOString().slice(0, 10));
  const [operationName, setOperationName] = useState('Land Preparation');
  const [stageNumber, setStageNumber] = useState(1);
  const [areaHa, setAreaHa] = useState('');
  const [peopleCount, setPeopleCount] = useState('');

  // Direct Mode fields
  const [directQty, setDirectQty] = useState('');
  const [directUnit, setDirectUnit] = useState('ha');
  const [directRate, setDirectRate] = useState('');

  // Group Mode sub-items
  const [subItems, setSubItems] = useState([]);

  // Form states
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [serverError, setServerError] = useState(null);

  // Synchronize initialFieldId
  useEffect(() => {
    if (initialFieldId) {
      setSelectedFieldId(initialFieldId);
    } else if (fields.length > 0 && !selectedFieldId) {
      setSelectedFieldId(fields[0].id);
    }
  }, [initialFieldId, fields]);

  // Find active field
  const currentField = useMemo(() => {
    return fields.find(f => f.id === selectedFieldId) || fields[0] || null;
  }, [fields, selectedFieldId]);

  // Sync field area when currentField changes
  useEffect(() => {
    if (currentField) {
      setAreaHa(currentField.areaHa ? String(currentField.areaHa) : (currentField.ha ? String(currentField.ha) : ''));
    }
  }, [currentField]);

  // Initialize with standard template
  useEffect(() => {
    if (selectedOpId) {
      handleTemplateChange(selectedOpId);
    }
  }, []);

  // Handle template selection
  const handleTemplateChange = (opId) => {
    setSelectedOpId(opId);
    const tmpl = SRA_OPERATIONS_CATALOGUE.find(o => o.id === opId);
    if (!tmpl) return;

    setOperationName(tmpl.name);
    setStageNumber(tmpl.stageNumber);
    setInputMode(tmpl.inputType || (tmpl.isGroup ? 'group' : 'direct'));

    if (tmpl.isGroup && tmpl.subItems) {
      setSubItems(tmpl.subItems.map((item, idx) => ({
        lineItemId: item.lineItemId || `SI-${idx + 1}`,
        description: item.description,
        quantity: item.quantity ?? 1,
        unit: item.unit || 'ha',
        unitCost: item.unitCost || 0,
        subtotal: item.subtotal || 0
      })));
    } else {
      setDirectQty(String(tmpl.perHa || tmpl.quantity || '1'));
      setDirectUnit(tmpl.unit || 'ha');
      setDirectRate(String(tmpl.rate || tmpl.costPerHa || '0'));
    }
  };

  // Subitem calculations
  const handleSubItemChange = (index, fieldName, value) => {
    const updated = [...subItems];
    const item = { ...updated[index], [fieldName]: value };

    if (fieldName === 'quantity' || fieldName === 'unitCost') {
      const q = Number(item.quantity || 0);
      const c = Number(item.unitCost || 0);
      item.subtotal = q * c;
    }

    updated[index] = item;
    setSubItems(updated);
  };

  const handleAddSubItem = () => {
    setSubItems(prev => [
      ...prev,
      {
        lineItemId: `SI-${Date.now().toString(36)}`,
        description: '',
        quantity: 1,
        unit: 'ha',
        unitCost: 0,
        subtotal: 0
      }
    ]);
  };

  const handleRemoveSubItem = (index) => {
    setSubItems(prev => prev.filter((_, idx) => idx !== index));
  };

  // Calculated totals
  const totalCost = useMemo(() => {
    if (inputMode === 'group') {
      return subItems.reduce((sum, item) => sum + Number(item.subtotal || 0), 0);
    } else {
      const q = Number(directQty || 0);
      const r = Number(directRate || 0);
      return q * r;
    }
  }, [inputMode, subItems, directQty, directRate]);

  const costPerHa = useMemo(() => {
    const ha = Number(areaHa || 1);
    return ha > 0 ? totalCost / ha : 0;
  }, [totalCost, areaHa]);

  // Form submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    setServerError(null);
    setSubmitSuccess(false);

    const validation = {};
    if (!selectedFieldId) validation.fieldId = 'Please select a field plot.';
    if (!operationName.trim()) validation.operationName = 'Operation title is required.';
    if (!performedOn) validation.performedOn = 'Completion date is required.';

    const numArea = Number(areaHa);
    if (!areaHa || isNaN(numArea) || numArea <= 0) {
      validation.areaHa = 'Enter a valid area in hectares (> 0).';
    }

    const numPeople = Number(peopleCount);
    if (isNaN(numPeople) || numPeople < 0) {
      validation.peopleCount = 'Workers count must be 0 or greater.';
    }

    if (inputMode === 'group' && subItems.length === 0) {
      validation.subItems = 'Add at least one child item or material.';
    }

    if (Object.keys(validation).length > 0) {
      setErrors(validation);
      return;
    }

    setIsSubmitting(true);
    try {
      const cycleId = currentField?.currentCycleId || currentField?.cropCycle?.id;
      if (!cycleId) {
        setServerError('No active crop cycle found for this field plot. An active cycle is required to log operations.');
        setIsSubmitting(false);
        return;
      }

      const payload = {
        fieldId: selectedFieldId,
        cycleId,
        operationDefinitionId: selectedOpId || 'CUSTOM',
        operationName: operationName.trim(),
        category: SRA_OPERATIONS_CATALOGUE.find(o => o.id === selectedOpId)?.category || 'General Care',
        stageNumber: Number(stageNumber) || 1,
        performedOn,
        areaHa: numArea,
        peopleCount: numPeople || 0,
        totalCost,
        isSupplemental: false,
        lineItems: inputMode === 'group' ? subItems.map(item => ({
          lineItemId: item.lineItemId,
          description: item.description,
          quantity: Number(item.quantity || 0),
          unit: item.unit || 'unit',
          unitCost: Number(item.unitCost || 0),
          subtotal: Number(item.subtotal || 0)
        })) : [],
        quantity: inputMode === 'direct' ? {
          value: Number(directQty || 0),
          unit: directUnit || 'unit',
          inputName: operationName.trim()
        } : null
      };

      await createOperation(payload);
      setIsSubmitting(false);
      setSubmitSuccess(true);
      setTimeout(() => setSubmitSuccess(false), 3000);
      if (onSuccess) onSuccess();
    } catch (err) {
      console.error('[OperationForm] Submit error:', err);
      setServerError(err.message || 'Unable to record operation.');
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white dark:bg-surface rounded-2xl p-5 sm:p-6 border border-border shadow-xs space-y-5">
      {submitSuccess && (
        <div className="p-4 rounded-xl bg-success-bg dark:bg-success/20 border border-success/30 flex items-center gap-2.5 text-xs font-bold text-success animate-in fade-in">
          <CheckCircle2 className="w-5 h-5 shrink-0" />
          <span>Operation recorded successfully and synchronized with active crop cycle.</span>
        </div>
      )}

      {serverError && (
        <div className="p-4 rounded-xl bg-danger-bg dark:bg-danger/20 border border-danger/30 flex items-center gap-2.5 text-xs font-bold text-danger">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{serverError}</span>
        </div>
      )}

      {/* Section 1: Field & Template Selection */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pb-4 border-b border-border/70">
        <FormField
          id="op-field-select"
          label="Target Field Plot"
          required
          error={errors.fieldId}
        >
          <Select
            id="op-field-select"
            value={selectedFieldId}
            onChange={(e) => {
              setSelectedFieldId(e.target.value);
              if (errors.fieldId) setErrors(prev => ({ ...prev, fieldId: null }));
            }}
            options={fields.map(f => ({
              value: f.id,
              label: `${f.id} — ${f.memberName || 'Unassigned'} (${f.areaHa || f.ha} ha)`
            }))}
            disabled={isTakeOver && Boolean(initialFieldId)}
          />
        </FormField>

        <FormField
          id="op-template-select"
          label="SRA Operation Definition (14 Templates)"
          badge="Canonical"
        >
          <Select
            id="op-template-select"
            value={selectedOpId}
            onChange={(e) => handleTemplateChange(e.target.value)}
            options={SRA_OPERATIONS_CATALOGUE.map(o => ({
              value: o.id,
              label: `${o.id}: ${o.name} (Stage ${o.stageNumber})`
            }))}
          />
        </FormField>
      </div>

      {/* Section 2: Operation Details */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pb-4 border-b border-border/70">
        <FormField
          id="op-name-input"
          label="Operation / Activity Name"
          required
          className="sm:col-span-2"
          error={errors.operationName}
        >
          <Input
            id="op-name-input"
            value={operationName}
            onChange={(e) => setOperationName(e.target.value)}
            placeholder="e.g. Land Preparation (Disc Plowing & Furrowing)"
            error={Boolean(errors.operationName)}
          />
        </FormField>

        <FormField
          id="op-date-input"
          label="Date Completed"
          required
          error={errors.performedOn}
        >
          <Input
            id="op-date-input"
            type="date"
            value={performedOn}
            onChange={(e) => setPerformedOn(e.target.value)}
            error={Boolean(errors.performedOn)}
          />
        </FormField>
      </div>

      {/* Section 3: Resources & Labor */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pb-4 border-b border-border/70">
        <FormField
          id="op-area-input"
          label="Hectares Covered"
          required
          error={errors.areaHa}
        >
          <Input
            id="op-area-input"
            type="number"
            step="0.1"
            min="0.01"
            suffix="ha"
            value={areaHa}
            onChange={(e) => setAreaHa(e.target.value)}
            error={Boolean(errors.areaHa)}
          />
        </FormField>

        <FormField
          id="op-people-input"
          label="Workers / Labor Count"
          error={errors.peopleCount}
        >
          <Input
            id="op-people-input"
            type="number"
            min="0"
            suffix="workers"
            value={peopleCount}
            onChange={(e) => setPeopleCount(e.target.value)}
            error={Boolean(errors.peopleCount)}
          />
        </FormField>
      </div>

      {/* Section 4: Input Mode Toggle & Cost Entry */}
      <div className="space-y-4 pb-4 border-b border-border/70">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-hug-text uppercase tracking-wider">
            Cost Structure Mode
          </span>
          <div className="flex items-center gap-1.5 p-1 bg-bg dark:bg-[#0C1015] rounded-xl border border-border">
            <button
              type="button"
              onClick={() => setInputMode('group')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                inputMode === 'group'
                  ? 'bg-primary text-white shadow-2xs'
                  : 'text-hug-muted hover:text-hug-text'
              }`}
            >
              Group Mode (Child Items)
            </button>
            <button
              type="button"
              onClick={() => setInputMode('direct')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                inputMode === 'direct'
                  ? 'bg-primary text-white shadow-2xs'
                  : 'text-hug-muted hover:text-hug-text'
              }`}
            >
              Direct Mode (Qty × Rate)
            </button>
          </div>
        </div>

        {/* Group Mode: Child Items breakdown */}
        {inputMode === 'group' ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-hug-muted">
                Child Items &amp; Materials Breakdown
              </span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary-bg dark:bg-primary/20 text-primary dark:text-primary-light">
                {subItems.length} {subItems.length === 1 ? 'Item' : 'Items'}
              </span>
            </div>

            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {subItems.map((item, idx) => (
                <div
                  key={item.lineItemId || idx}
                  className="grid grid-cols-1 sm:grid-cols-12 gap-2 p-3 rounded-xl border border-border/80 bg-bg/40 dark:bg-[#0C1015]/40 items-center"
                >
                  <div className="sm:col-span-5">
                    <input
                      type="text"
                      placeholder="Item description..."
                      value={item.description}
                      onChange={(e) => handleSubItemChange(idx, 'description', e.target.value)}
                      className="w-full text-xs font-semibold px-2.5 py-1.5 border border-border rounded-lg bg-white dark:bg-surface text-hug-text outline-none focus:border-primary"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <input
                      type="number"
                      step="0.1"
                      placeholder="Qty"
                      value={item.quantity}
                      onChange={(e) => handleSubItemChange(idx, 'quantity', e.target.value)}
                      className="w-full text-xs font-semibold px-2 py-1.5 border border-border rounded-lg bg-white dark:bg-surface text-hug-text outline-none focus:border-primary"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <input
                      type="number"
                      placeholder="Unit Cost (₱)"
                      value={item.unitCost}
                      onChange={(e) => handleSubItemChange(idx, 'unitCost', e.target.value)}
                      className="w-full text-xs font-semibold px-2 py-1.5 border border-border rounded-lg bg-white dark:bg-surface text-hug-text outline-none focus:border-primary"
                    />
                  </div>
                  <div className="sm:col-span-2 text-right">
                    <span className="text-xs font-black text-hug-text font-mono">
                      {formatCurrency(item.subtotal)}
                    </span>
                  </div>
                  <div className="sm:col-span-1 text-right">
                    <button
                      type="button"
                      onClick={() => handleRemoveSubItem(idx)}
                      disabled={subItems.length <= 1}
                      className="p-1 rounded text-hug-muted hover:text-danger disabled:opacity-30 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <Button
              variant="secondary"
              size="sm"
              onClick={handleAddSubItem}
              icon={Plus}
              className="w-full border-dashed"
            >
              Add Child Item / Material
            </Button>
          </div>
        ) : (
          /* Direct Mode */
          <div className="p-4 rounded-xl bg-bg/50 dark:bg-[#0C1015] border border-border space-y-3">
            <span className="text-xs font-bold text-hug-text block">
              Direct Cost Calculation (Quantity × Rate)
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <FormField label="Quantity">
                <Input
                  type="number"
                  step="0.1"
                  value={directQty}
                  onChange={(e) => setDirectQty(e.target.value)}
                />
              </FormField>
              <FormField label="Unit">
                <Select
                  value={directUnit}
                  onChange={(e) => setDirectUnit(e.target.value)}
                  options={[
                    { value: 'ha', label: 'ha (Hectares)' },
                    { value: 'tons', label: 'tons (Metric Tons)' },
                    { value: 'bags', label: 'bags (Fertilizer)' },
                    { value: 'pass', label: 'pass (Plowing/Harrowing)' },
                    { value: 'lac', label: 'lac (Seedcane)' }
                  ]}
                />
              </FormField>
              <FormField label="Unit Rate (₱)">
                <Input
                  type="number"
                  prefix="₱"
                  value={directRate}
                  onChange={(e) => setDirectRate(e.target.value)}
                />
              </FormField>
            </div>
          </div>
        )}
      </div>

      {/* Section 5: High-Visibility Cost Summary Card */}
      <div className="bg-[#1E4D2B] rounded-2xl p-4 sm:p-5 text-white shadow-xs flex items-center justify-between gap-4">
        <div>
          <span className="text-[11px] font-bold text-[#D4EAD6] uppercase tracking-wider block">
            Total Operation Cost
          </span>
          <span className="text-2xl sm:text-3xl font-black text-white block mt-0.5">
            {formatCurrency(totalCost)}
          </span>
        </div>
        <div className="text-right bg-white/15 px-3.5 py-1.5 rounded-xl border border-white/20">
          <span className="text-[10px] font-bold text-[#D4EAD6] block uppercase tracking-wide">
            Per Hectare
          </span>
          <span className="text-sm font-black text-white block mt-0.5">
            {formatCurrency(costPerHa)} / ha
          </span>
        </div>
      </div>

      {/* Section 6: Action Button */}
      <div className="pt-2">
        <Button
          type="submit"
          variant="primary"
          size="lg"
          className="w-full"
          isLoading={isSubmitting}
          loadingText="Recording operation..."
        >
          Record Field Operation
        </Button>
      </div>
    </form>
  );
}
