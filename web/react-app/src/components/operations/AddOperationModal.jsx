import React, { useState, useEffect, useMemo } from 'react';
import {
  Modal,
  FormField,
  Input,
  Select,
  Button,
  Checkbox
} from '../ui';
import {
  createOperation
} from '../../services/operationsService';
import { CROP_STAGE_MAX, SUGARCANE_STAGES } from '../../constants/cropStages';
import { SRA_OPERATIONS_CATALOGUE } from '../../domain/operationCatalogue';
import { authenticatedRequest } from '../../services/apiClient';
import { formatCurrency, formatHectares } from '../../utils/formatters';
import {
  Plus,
  Trash2,
  AlertCircle,
  CheckCircle2,
  Sprout,
  ShieldCheck
} from 'lucide-react';

export default function AddOperationModal({
  field,
  isOpen,
  onClose,
  onSuccess,
  isTakeOver = true,
  takeoverGrant = null
}) {
  const [selectedStageNumber, setSelectedStageNumber] = useState(1);
  const [selectedOpId, setSelectedOpId] = useState('SRA-02');
  const [inputMode, setInputMode] = useState('group'); // 'group' or 'direct'

  // Details
  const [activityName, setActivityName] = useState('Land Preparation (Disc Plowing & Furrowing)');
  const [performedOn, setPerformedOn] = useState(new Date().toISOString().slice(0, 10));
  const [areaHa, setAreaHa] = useState('');
  const [workersCount, setWorkersCount] = useState('');
  const [advanceStage, setAdvanceStage] = useState(false);

  // Group Mode sub-items
  const [subItems, setSubItems] = useState([]);

  // Direct Mode inputs
  const [directQty, setDirectQty] = useState('');
  const [directUnit, setDirectUnit] = useState('ha');
  const [directRate, setDirectRate] = useState('');

  // Submission state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverError, setServerError] = useState(null);
  const [validationErrors, setValidationErrors] = useState({});

  // Reset and synchronize form when opened or field changes
  useEffect(() => {
    if (!isOpen || !field) return;

    const currentStage = Number(field.cropCycle?.currentStageNumber || field.stageNumber || 1);
    setSelectedStageNumber(currentStage);

    const defaultHa = field.areaHa ? String(field.areaHa) : (field.ha ? String(field.ha) : '');
    setAreaHa(defaultHa);
    setWorkersCount('');
    setPerformedOn(new Date().toISOString().slice(0, 10));
    setAdvanceStage(false);
    setServerError(null);
    setValidationErrors({});

    // Find default template for this stage or fallback to first template
    const stageTemplate = SRA_OPERATIONS_CATALOGUE.find(o => o.stageNumber === currentStage) || SRA_OPERATIONS_CATALOGUE[0];
    if (stageTemplate) {
      applyTemplate(stageTemplate);
    }
  }, [isOpen, field?.id]);

  const applyTemplate = (tmpl) => {
    if (!tmpl) return;
    setSelectedOpId(tmpl.id);
    setActivityName(tmpl.name);
    setSelectedStageNumber(tmpl.stageNumber);
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

  const handleStageChange = (newStageNum) => {
    const num = Number(newStageNum);
    setSelectedStageNumber(num);
    const tmpl = SRA_OPERATIONS_CATALOGUE.find(o => o.stageNumber === num);
    if (tmpl) {
      applyTemplate(tmpl);
    }
  };

  const handleTemplateChange = (opId) => {
    const tmpl = SRA_OPERATIONS_CATALOGUE.find(o => o.id === opId);
    if (tmpl) {
      applyTemplate(tmpl);
    }
  };

  // Subitem operations
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
        lineItemId: `SI-${Date.now().toString(36).toUpperCase()}`,
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

  // Calculations
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

  if (!isOpen || !field) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setServerError(null);
    const errors = {};

    if (!activityName.trim()) {
      errors.activityName = 'Activity name is required.';
    }

    if (!performedOn) {
      errors.performedOn = 'Completion date is required.';
    }

    const numArea = Number(areaHa);
    if (!areaHa || isNaN(numArea) || numArea <= 0) {
      errors.areaHa = 'Enter a valid field area (> 0 ha).';
    }

    const numWorkers = workersCount === '' ? 0 : Number(workersCount);
    if (isNaN(numWorkers) || numWorkers < 0) {
      errors.workersCount = 'Workers count must be 0 or greater.';
    }

    if (inputMode === 'group') {
      if (subItems.length === 0) {
        errors.subItems = 'Add at least one line item.';
      } else if (subItems.some(i => !i.description.trim())) {
        errors.subItems = 'All line items must have a description.';
      }
    }

    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      return;
    }

    setValidationErrors({});
    setIsSubmitting(true);

    try {
      const cycleId = field.currentCycleId || field.cropCycle?.id;
      if (!cycleId) {
        throw new Error('No active crop cycle found for this field plot. An active cycle is required to record operations.');
      }

      const payload = {
        fieldId: field.id,
        cycleId,
        operationDefinitionId: selectedOpId || 'CUSTOM',
        operationName: activityName.trim(),
        category: SRA_OPERATIONS_CATALOGUE.find(o => o.id === selectedOpId)?.category || 'General Care',
        stageNumber: Number(selectedStageNumber) || 1,
        performedOn,
        areaHa: numArea,
        peopleCount: numWorkers,
        totalCost,
        submissionSource: isTakeOver ? 'MANAGER_TAKEOVER' : 'MEMBER',
        isSupplemental: false,
        lineItems: inputMode === 'group' ? subItems.map(item => ({
          lineItemId: item.lineItemId,
          description: item.description.trim(),
          quantity: Number(item.quantity || 0),
          unit: item.unit || 'unit',
          unitCost: Number(item.unitCost || 0),
          subtotal: Number(item.subtotal || 0)
        })) : [],
        quantity: inputMode === 'direct' ? {
          value: Number(directQty || 0),
          unit: directUnit || 'unit',
          inputName: activityName.trim()
        } : null
      };

      await createOperation(payload, takeoverGrant);

      // Advance crop cycle stage if checked
      if (advanceStage) {
        try {
          const nextStage = Math.min(CROP_STAGE_MAX, Number(selectedStageNumber) + 1);
          await authenticatedRequest(`/api/crop-cycles/${encodeURIComponent(cycleId)}/stage`, {
            method: 'PATCH',
            body: { currentStageNumber: nextStage },
            headers: takeoverGrant ? { 'X-Hugpong-Takeover-Grant': takeoverGrant } : {}
          });
        } catch (stageErr) {
          console.warn('[AddOperationModal] Crop cycle stage advancement note:', stageErr.message);
        }
      }

      setIsSubmitting(false);
      if (typeof onSuccess === 'function') {
        onSuccess(payload);
      }
      onClose();
    } catch (err) {
      console.error('[AddOperationModal] Submit error:', err);
      setServerError(err.message || 'Unable to record operation.');
      setIsSubmitting(false);
    }
  };

  const currentStageObj = SUGARCANE_STAGES.find(s => s.stageNumber === selectedStageNumber) || SUGARCANE_STAGES[0];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="lg"
      title="Add Field Operation"
      subtitle={`${field.id} · ${field.memberName || 'Assigned Member'} (${formatHectares(field.areaHa || field.ha)})`}
      badge={isTakeOver ? 'Supervisor Takeover' : 'Field Operation'}
      icon={Plus}
      isLoading={isSubmitting}
      preventBackdropClose={isSubmitting}
      preventEscapeClose={isSubmitting}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            isLoading={isSubmitting}
            loadingText="Recording Operation..."
            icon={Plus}
          >
            Record Operation
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Supervisor Context Indicator */}
        {isTakeOver && (
          <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-200 dark:border-amber-800/50 flex items-center gap-2.5 text-xs text-amber-900 dark:text-amber-300">
            <ShieldCheck className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <p className="font-medium">
              Take Over Mode Active: This operation will be stamped with your supervisor signature in the authoritative SRA audit ledger.
            </p>
          </div>
        )}

        {serverError && (
          <div className="p-3 bg-danger-bg dark:bg-danger/20 rounded-xl border border-danger/30 text-danger text-xs font-semibold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{serverError}</span>
          </div>
        )}

        {/* Stage & Template Selection */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <FormField id="add-op-stage-select" label="Sugarcane Stage" badge="Phase">
            <Select
              id="add-op-stage-select"
              value={selectedStageNumber}
              onChange={(e) => handleStageChange(e.target.value)}
              options={SUGARCANE_STAGES.map(s => ({
                value: s.stageNumber,
                label: `Stage ${s.stageNumber}: ${s.shortName}`
              }))}
            />
          </FormField>

          <FormField
            id="add-op-template-select"
            label="SRA Template (14 Canonical)"
            badge="Auto-configures"
          >
            <Select
              id="add-op-template-select"
              value={selectedOpId}
              onChange={(e) => handleTemplateChange(e.target.value)}
              options={SRA_OPERATIONS_CATALOGUE.map(o => ({
                value: o.id,
                label: `${o.id}: ${o.name} (Stage ${o.stageNumber})`
              }))}
            />
          </FormField>
        </div>

        {/* Activity Name & Date Completed */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
          <FormField
            id="add-op-name"
            label="Activity Title"
            required
            className="sm:col-span-2"
            error={validationErrors.activityName}
          >
            <Input
              id="add-op-name"
              value={activityName}
              onChange={(e) => {
                setActivityName(e.target.value);
                if (validationErrors.activityName) setValidationErrors(prev => ({ ...prev, activityName: null }));
              }}
              placeholder="e.g. Land Preparation"
            />
          </FormField>

          <FormField
            id="add-op-date"
            label="Date Performed"
            required
            error={validationErrors.performedOn}
          >
            <Input
              id="add-op-date"
              type="date"
              value={performedOn}
              onChange={(e) => {
                setPerformedOn(e.target.value);
                if (validationErrors.performedOn) setValidationErrors(prev => ({ ...prev, performedOn: null }));
              }}
            />
          </FormField>
        </div>

        {/* Hectares & Workers Count */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <FormField
            id="add-op-area"
            label="Hectares Covered"
            required
            error={validationErrors.areaHa}
          >
            <Input
              id="add-op-area"
              type="number"
              step="0.01"
              min="0.01"
              suffix="ha"
              value={areaHa}
              onChange={(e) => {
                setAreaHa(e.target.value);
                if (validationErrors.areaHa) setValidationErrors(prev => ({ ...prev, areaHa: null }));
              }}
            />
          </FormField>

          <FormField
            id="add-op-workers"
            label="Labor / Workers Count"
            error={validationErrors.workersCount}
          >
            <Input
              id="add-op-workers"
              type="number"
              min="0"
              placeholder="0"
              suffix="workers"
              value={workersCount}
              onChange={(e) => {
                setWorkersCount(e.target.value);
                if (validationErrors.workersCount) setValidationErrors(prev => ({ ...prev, workersCount: null }));
              }}
            />
          </FormField>
        </div>

        {/* Cost Structure Input Mode */}
        <div className="p-3 bg-bg dark:bg-[#0C1015] rounded-xl border border-border flex items-center justify-between">
          <span className="text-xs font-bold text-hug-text uppercase tracking-wider">
            Cost Structure
          </span>
          <div className="flex items-center gap-1.5 p-1 bg-white dark:bg-surface rounded-xl border border-border">
            <button
              type="button"
              onClick={() => setInputMode('group')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                inputMode === 'group'
                  ? 'bg-primary text-white shadow-2xs'
                  : 'text-hug-muted hover:text-hug-text'
              }`}
            >
              Child Items
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
              Direct (Qty × Rate)
            </button>
          </div>
        </div>

        {/* Group Mode child items */}
        {inputMode === 'group' ? (
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-hug-muted">
                Line Items Breakdown
              </span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary-bg dark:bg-primary/20 text-primary dark:text-primary-light">
                {subItems.length} {subItems.length === 1 ? 'item' : 'items'}
              </span>
            </div>

            {validationErrors.subItems && (
              <p className="text-xs text-danger font-semibold">{validationErrors.subItems}</p>
            )}

            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {subItems.map((item, idx) => (
                <div
                  key={item.lineItemId || idx}
                  className="grid grid-cols-1 sm:grid-cols-12 gap-2 p-2.5 rounded-xl border border-border/80 bg-bg/50 dark:bg-[#0C1015]/40 items-center"
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
                      placeholder="Cost (₱)"
                      value={item.unitCost}
                      onChange={(e) => handleSubItemChange(idx, 'unitCost', e.target.value)}
                      className="w-full text-xs font-semibold px-2 py-1.5 border border-border rounded-lg bg-white dark:bg-surface text-hug-text outline-none focus:border-primary"
                    />
                  </div>
                  <div className="sm:col-span-2 text-right">
                    <span className="text-xs font-bold font-mono text-hug-text">
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
              type="button"
            >
              Add Line Item
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 bg-bg/50 dark:bg-[#0C1015]/40 rounded-xl border border-border">
            <FormField id="direct-qty" label="Quantity">
              <Input
                id="direct-qty"
                type="number"
                step="0.1"
                value={directQty}
                onChange={(e) => setDirectQty(e.target.value)}
              />
            </FormField>
            <FormField id="direct-unit" label="Unit">
              <Input
                id="direct-unit"
                value={directUnit}
                onChange={(e) => setDirectUnit(e.target.value)}
              />
            </FormField>
            <FormField id="direct-rate" label="Rate / Unit (₱)">
              <Input
                id="direct-rate"
                type="number"
                value={directRate}
                onChange={(e) => setDirectRate(e.target.value)}
              />
            </FormField>
          </div>
        )}

        {/* Cost summary & Stage advancement */}
        <div className="p-3.5 rounded-xl bg-surface-subtle border border-border/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-4">
            <div>
              <span className="text-[10px] uppercase font-bold text-hug-muted block">Total Cost</span>
              <span className="text-base font-mono font-black text-primary dark:text-primary-light">
                {formatCurrency(totalCost)}
              </span>
            </div>
            {Number(areaHa) > 0 && (
              <div className="border-l border-border pl-4">
                <span className="text-[10px] uppercase font-bold text-hug-muted block">Cost / Hectare</span>
                <span className="text-xs font-mono font-bold text-hug-text">
                  {formatCurrency(costPerHa)} / ha
                </span>
              </div>
            )}
          </div>

          <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-hug-text select-none">
            <input
              type="checkbox"
              checked={advanceStage}
              onChange={(e) => setAdvanceStage(e.target.checked)}
              className="rounded text-primary focus:ring-primary h-4 w-4"
            />
            <span>Advance to Stage {Math.min(CROP_STAGE_MAX, selectedStageNumber + 1)} upon completion</span>
          </label>
        </div>
      </form>
    </Modal>
  );
}
