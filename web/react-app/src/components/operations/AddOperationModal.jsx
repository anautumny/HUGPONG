import React, { useState, useEffect, useMemo, useRef } from 'react';
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
import { SRA_OPERATIONS_CATALOGUE, getOperationDefinition, getSelectableOperationsForStage } from '../../domain/operationCatalogue';
import { OPERATION_UNITS } from '../../domain/operationUnits';
import { SUGARCANE_VARIETIES } from '../../domain/sugarcaneVarieties';
import { authenticatedRequest } from '../../services/apiClient';
import { formatCurrency, formatHectares } from '../../utils/formatters';
import { createClientRecordId } from '../../utils/secureId';
import {
  Plus,
  Trash2,
  AlertCircle,
  CheckCircle2,
  Sprout,
  ShieldCheck
} from 'lucide-react';

const canonicalLineItemId = value => String(value || '')
  .trim()
  .toUpperCase()
  .replace(/^SI-SRA-(\d+)-(\d+)$/, 'SI-$1-$2');

export default function AddOperationModal({
  field,
  isOpen,
  onClose,
  onSuccess,
  isTakeOver = false,
  takeoverGrant = null,
  canSaveDraft = false,
  initialDraft = null,
  onSaveDraft = null,
  validateBeforeSubmit = null,
  submittedOperations = []
}) {
  const [selectedStageNumber, setSelectedStageNumber] = useState(1);
  const [selectedOpId, setSelectedOpId] = useState('SRA-02');
  const [selectedChildOpId, setSelectedChildOpId] = useState('');
  const [customChildName, setCustomChildName] = useState('');
  const [inputMode, setInputMode] = useState('group'); // 'group' or 'direct'

  // Details
  const [activityName, setActivityName] = useState('Land Preparation (Disc Plowing & Furrowing)');
  const [performedOn, setPerformedOn] = useState(new Date().toISOString().slice(0, 10));
  const [areaHa, setAreaHa] = useState('');
  const [workersCount, setWorkersCount] = useState('');
  const [laborEntries, setLaborEntries] = useState([]);
  const [newWorker, setNewWorker] = useState({ workerCount: '1', days: '1', rate: '' });
  const [advanceStage, setAdvanceStage] = useState(false);
  const [variety, setVariety] = useState('');

  // Group Mode sub-items
  const [subItems, setSubItems] = useState([]);
  const [showNewExpense, setShowNewExpense] = useState(false);
  const [newExpense, setNewExpense] = useState({ description: '', quantity: '1', unit: 'bag', unitCost: '', itemType: 'MATERIAL' });

  // Direct Mode inputs
  const [directQty, setDirectQty] = useState('');
  const [directUnit, setDirectUnit] = useState('ha');
  const [directRate, setDirectRate] = useState('');

  // Submission state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittingLineItemId, setSubmittingLineItemId] = useState(null);
  const [serverError, setServerError] = useState(null);
  const [validationErrors, setValidationErrors] = useState({});
  const submissionLockRef = useRef(false);

  const isLineItemSubmitted = (operationId, lineItemId) => {
    const cycleId = String(field?.currentCycleId || field?.cropCycle?.id || '').trim().toUpperCase();
    return submittedOperations.some(operation => (
      operation.status === 'ACTIVE'
      && String(operation.fieldId || '').trim().toUpperCase() === String(field?.id || '').trim().toUpperCase()
      && (!cycleId || String(operation.cycleId || '').trim().toUpperCase() === cycleId)
      && String(operation.operationDefinitionId || operation.sraOperationId || '').trim().toUpperCase() === String(operationId || '').trim().toUpperCase()
      && canonicalLineItemId(operation.childOperationDefinitionId) === canonicalLineItemId(lineItemId)
    ));
  };

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
    setVariety(String(field.cropCycle?.variety || ''));
    setServerError(null);
    setValidationErrors({});

    if (initialDraft?.form) {
      const draft = initialDraft.form;
      setSelectedStageNumber(Number(draft.selectedStageNumber || currentStage));
      const draftDefinition = getOperationDefinition(draft.selectedOpId);
      setSelectedOpId(draftDefinition?.parentOperationDefinitionId || draft.selectedOpId || 'CUSTOM');
      setSelectedChildOpId(draft.selectedChildOpId || draft.childOperationDefinitionId || (draftDefinition?.parentOperationDefinitionId ? draftDefinition.id : ''));
      setCustomChildName(draft.customChildName || draft.childOperationName || '');
      setInputMode(draft.inputMode || 'direct');
      setActivityName(draft.activityName || '');
      setPerformedOn(draft.performedOn || new Date().toISOString().slice(0, 10));
      setAreaHa(String(draft.areaHa || defaultHa));
      setWorkersCount(String(draft.workersCount || ''));
      setLaborEntries(Array.isArray(draft.laborEntries) ? draft.laborEntries : []);
      const draftWorker = Array.isArray(draft.laborEntries) ? draft.laborEntries[0] : null;
      setNewWorker({
        workerCount: String(draftWorker?.workerCount ?? draft.workersCount ?? ''),
        days: String(draftWorker?.days ?? 1),
        rate: draftWorker?.rate == null ? '' : String(draftWorker.rate)
      });
      setAdvanceStage(Boolean(draft.advanceStage));
      setVariety(draft.variety || '');
      setSubItems(Array.isArray(draft.subItems) ? draft.subItems : []);
      setDirectQty(String(draft.directQty || ''));
      setDirectUnit(draft.directUnit || 'ha');
      setDirectRate(String(draft.directRate || ''));
      setShowNewExpense(false);
      return;
    }

    // Find default template for this stage or fallback to first template
    const stageTemplate = SRA_OPERATIONS_CATALOGUE.find(o => o.stageNumber === currentStage) || SRA_OPERATIONS_CATALOGUE[0];
    if (stageTemplate) {
      applyTemplate(stageTemplate);
    }
  }, [isOpen, field?.id, initialDraft?.id]);

  const applyTemplate = (tmpl) => {
    if (!tmpl) return;
    setSelectedOpId(tmpl.id);
    const firstChild = tmpl.childOperations?.[0] || null;
    setSelectedChildOpId(firstChild?.id || '');
    setCustomChildName('');
    setActivityName(tmpl.name);
    setSelectedStageNumber(tmpl.stageNumber);
    setInputMode(tmpl.childOperations?.length ? 'direct' : (tmpl.inputType || (tmpl.isGroup ? 'group' : 'direct')));
    setLaborEntries([]);
    setNewWorker({ workerCount: '', days: '1', rate: '' });

    if (tmpl.childOperations?.length) {
      setSubItems([]);
      setDirectQty(String(firstChild?.perHa || '1'));
      setDirectUnit(firstChild?.unit || 'ha');
      setDirectRate(String(firstChild?.rate || '0'));
    } else if (tmpl.isGroup && tmpl.subItems) {
      setSubItems(tmpl.subItems.map((item, idx) => ({
        lineItemId: item.lineItemId || `SI-${idx + 1}`,
        description: item.description,
        quantity: item.quantity ?? 1,
        unit: item.unit || 'ha',
        unitCost: item.unitCost || 0,
        subtotal: item.subtotal || 0
      })).filter(item => !isLineItemSubmitted(tmpl.id, item.lineItemId)));
    } else {
      setDirectQty(String(tmpl.perHa || tmpl.quantity || '1'));
      setDirectUnit(tmpl.unit || 'ha');
      setDirectRate(String(tmpl.rate || tmpl.costPerHa || '0'));
    }
  };

  const handleStageChange = (newStageNum) => {
    const num = Number(newStageNum);
    setSelectedStageNumber(num);
    setSelectedOpId('');
    setSelectedChildOpId('');
    setCustomChildName('');
    setActivityName('');
    setSubItems([]);
  };

  const handleTemplateChange = (opId) => {
    if (opId === 'CUSTOM') {
      setSelectedOpId('CUSTOM');
      setSelectedChildOpId('');
      setCustomChildName('');
      setActivityName('');
      setInputMode('direct');
      setSubItems([]);
      setDirectQty(areaHa || '1');
      setDirectUnit('ha');
      setDirectRate('0');
      return;
    }
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
    setShowNewExpense(true);
  };

  const handleChildOperationChange = (childId) => {
    setSelectedChildOpId(childId);
    setCustomChildName('');
    if (childId === 'CUSTOM') {
      setDirectQty(areaHa || '1');
      setDirectUnit('ha');
      setDirectRate('0');
      return;
    }
    const child = getOperationDefinition(childId);
    if (child) {
      setDirectQty(String(child.perHa || '1'));
      setDirectUnit(child.unit || 'ha');
      setDirectRate(String(child.rate || '0'));
    }
  };

  const confirmAddSubItem = () => {
    const quantity = Number(newExpense.quantity);
    const unitCost = Number(newExpense.unitCost);
    if (!newExpense.description.trim() || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unitCost) || unitCost < 0) {
      setValidationErrors(previous => ({ ...previous, newExpense: 'Enter a description, positive quantity, and valid unit cost.' }));
      return;
    }
    setSubItems(previous => [...previous, {
      lineItemId: createClientRecordId('SI'),
      itemType: newExpense.itemType,
      description: newExpense.description.trim(),
      quantity,
      unit: newExpense.unit,
      unitCost,
      subtotal: quantity * unitCost
    }]);
    setNewExpense({ description: '', quantity: '1', unit: 'bag', unitCost: '', itemType: 'MATERIAL' });
    setShowNewExpense(false);
    setValidationErrors(previous => ({ ...previous, newExpense: null }));
  };

  const handleRemoveSubItem = (index) => {
    setSubItems(prev => prev.filter((_, idx) => idx !== index));
  };

  // Calculations
  const expenseCost = useMemo(() => {
    if (inputMode === 'group') {
      return subItems.reduce((sum, item) => sum + Number(item.subtotal || 0), 0);
    }
    return 0;
  }, [inputMode, subItems, directQty, directRate]);
  const baseCost = inputMode === 'direct' ? Number(directQty || 0) * Number(directRate || 0) : 0;
  const laborCost = Number(workersCount || 0) * Number(newWorker.days || 0) * Number(newWorker.rate || 0);
  const totalCost = baseCost + expenseCost + laborCost;

  const costPerHa = useMemo(() => {
    const ha = Number(areaHa || 1);
    return ha > 0 ? totalCost / ha : 0;
  }, [totalCost, areaHa]);

  if (!isOpen || !field) return null;

  const handleSubmit = async (e, submissionTarget = null) => {
    e?.preventDefault?.();
    if (submissionLockRef.current) return;
    const singleLineItem = submissionTarget?.type === 'lineItem' ? subItems[submissionTarget.index] : null;
    const isSingleItemSubmission = Boolean(singleLineItem);
    const submittedLineItems = singleLineItem ? [singleLineItem] : (inputMode === 'group' && !isSingleItemSubmission ? subItems : []);
    const laborWorkerCount = Number(workersCount || 0);
    const laborDays = Number(newWorker.days || 0);
    const laborRate = Number(newWorker.rate || 0);
    if (!String(workersCount ?? '').trim()
      || !Number.isInteger(laborWorkerCount)
      || laborWorkerCount < 0
      || (laborWorkerCount > 0 && (
        !String(newWorker.days ?? '').trim()
        || !String(newWorker.rate ?? '').trim()
        || !Number.isFinite(laborDays)
        || laborDays <= 0
        || !Number.isFinite(laborRate)
        || laborRate < 0
      ))) {
      setValidationErrors(previous => ({ ...previous, workersCount: 'Enter a valid worker count, work days, and daily rate.' }));
      return;
    }
    const submittedLaborEntries = laborWorkerCount > 0 ? [{
      laborEntryId: createClientRecordId('LAB'),
      workerCount: laborWorkerCount,
      days: laborDays,
      unit: 'day',
      rate: laborRate,
      subtotal: laborWorkerCount * laborDays * laborRate
    }] : [];
    setServerError(null);
    if (typeof validateBeforeSubmit === 'function') {
      const preflight = validateBeforeSubmit();
      if (preflight && preflight.valid === false) {
        setServerError(preflight.error || 'This operation is no longer authorized for submission.');
        return;
      }
    }
    const errors = {};

    if (!activityName.trim()) {
      errors.activityName = 'Activity name is required.';
    }
    if (!selectedOpId) errors.operation = 'Select an operation for this stage.';
    if (selectedStageNumber === 2 && !variety.trim()) errors.variety = 'Sugarcane variety is required for Planting.';

    if (!performedOn) {
      errors.performedOn = 'Completion date is required.';
    } else if (Number.isNaN(Date.parse(`${performedOn}T00:00:00`))) {
      errors.performedOn = 'Enter a valid completion date.';
    }

    const numArea = Number(areaHa);
    if (!areaHa || isNaN(numArea) || numArea <= 0) {
      errors.areaHa = 'Enter a valid field area (> 0 ha).';
    }

    const numWorkers = submittedLaborEntries.length
      ? submittedLaborEntries.reduce((sum, item) => sum + Number(item.workerCount || 0), 0)
      : (isSingleItemSubmission ? 0 : (workersCount === '' ? 0 : Number(workersCount)));
    if (isNaN(numWorkers) || numWorkers < 0) {
      errors.workersCount = 'Workers count must be 0 or greater.';
    }

    if (inputMode === 'group') {
      if (submittedLineItems.length === 0 && submittedLaborEntries.length === 0) {
        errors.subItems = 'Add at least one line item.';
      } else if (submittedLineItems.some(item => (
        !item.description.trim()
        || !String(item.unit || '').trim()
        || !Number.isFinite(Number(item.quantity))
        || Number(item.quantity) <= 0
        || !Number.isFinite(Number(item.unitCost))
        || Number(item.unitCost) < 0
      ))) {
        errors.subItems = 'Every line item needs a description, quantity, unit, and valid unit cost.';
      }
    } else if (!String(directQty ?? '').trim() || !Number.isFinite(Number(directQty)) || Number(directQty) <= 0) {
      errors.directQty = 'Enter a quantity greater than zero.';
    } else if (!String(directUnit || '').trim()) {
      errors.directQty = 'Select a unit.';
    } else if (!String(directRate ?? '').trim() || !Number.isFinite(Number(directRate)) || Number(directRate) < 0) {
      errors.directRate = 'Enter a valid unit rate or cost.';
    }

    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      return;
    }

    const currentStageNumber = Number(field.cropCycle?.currentStageNumber ?? field.stageNumber);
    const submittingSupplemental = Number(selectedStageNumber) < currentStageNumber
      || (Number(selectedStageNumber) === currentStageNumber && Boolean(field.cropCycle?.completedAt || field.isCompleted));
    if (submittingSupplemental && !window.confirm('This stage is already completed. Continue and record this operation as a Supplemental Entry?')) {
      return;
    }

    setValidationErrors({});
    submissionLockRef.current = true;
    setIsSubmitting(true);
    setSubmittingLineItemId(singleLineItem?.lineItemId || null);

    try {
      const cycleId = field.currentCycleId || field.cropCycle?.id;
      if (!cycleId) {
        throw new Error('No active Crop Year Cycle found for this field plot. An active Crop Year Cycle is required to record operations.');
      }
      const stageAtRecord = Number(field.cropCycle?.currentStageNumber ?? field.stageNumber);
      if (!Number.isInteger(stageAtRecord) || stageAtRecord < 1 || stageAtRecord > 6) {
        throw new Error('The field Current Stage is unavailable. Refresh the Crop Year Cycle before recording an operation.');
      }

      const submittedBaseCost = inputMode === 'direct' ? baseCost : 0;
      const submittedComponentCost = submittedLineItems.reduce((sum, item) => sum + Number(item.subtotal || 0), 0)
        + submittedLaborEntries.reduce((sum, item) => sum + Number(item.subtotal || 0), 0);
      const submittedTotalCost = inputMode === 'direct' ? baseCost + submittedComponentCost : submittedComponentCost;
      const submittedChildId = singleLineItem?.lineItemId || null;
      const submittedChildName = singleLineItem?.description || '';
      const remainingSubItems = singleLineItem
        ? subItems.filter((_, index) => index !== submissionTarget.index)
        : subItems;
      const remainingLaborEntries = [];
      const payload = {
        ...(initialDraft?.submittedOperationId && !isSingleItemSubmission ? { id: initialDraft.submittedOperationId } : {}),
        fieldId: field.id,
        cycleId,
        blockFarmId: field.blockFarmId,
        cropYearCycle: field.cropCycle?.cropYear || field.cropYear,
        stageNumberAtRecord: stageAtRecord,
        operationDefinitionId: selectedOpId || 'CUSTOM',
        operationName: activityName.trim(),
        parentOperationDefinitionId: null,
        childOperationDefinitionId: submittedChildId,
        childOperationName: submittedChildName,
        category: getOperationDefinition(selectedOpId)?.category || 'General Care',
        stageNumber: Number(selectedStageNumber) || 1,
        variety: selectedStageNumber === 2 ? variety.trim() : '',
        performedOn,
        areaHa: numArea,
        peopleCount: numWorkers,
        baseCost: submittedBaseCost,
        totalCost: submittedTotalCost,
        submissionSource: isTakeOver ? 'MANAGER_TAKEOVER' : 'FIELD_OWNER',
        isSupplemental: submittingSupplemental,
        lineItems: submittedLineItems.map(item => ({
          lineItemId: item.lineItemId,
          itemType: item.itemType || 'EXPENSE',
          description: item.description.trim(),
          quantity: Number(item.quantity || 0),
          unit: item.unit || 'unit',
          unitCost: Number(item.unitCost || 0),
          subtotal: Number(item.subtotal || 0)
        })),
        laborEntries: submittedLaborEntries,
        quantity: inputMode === 'direct' ? {
          value: Number(directQty || 0),
          unit: directUnit || 'unit',
          inputName: activityName.trim()
        } : null
      };

      await createOperation(payload, takeoverGrant);

      // Advance crop cycle stage if checked
      if (advanceStage && !isSingleItemSubmission) {
        try {
          const nextStage = Math.min(CROP_STAGE_MAX, Number(selectedStageNumber) + 1);
          await authenticatedRequest(`/api/crop-cycles/${encodeURIComponent(cycleId)}/stage`, {
            method: 'PATCH',
            body: { currentStageNumber: nextStage },
            headers: takeoverGrant ? { 'X-Hugpong-Takeover-Grant': takeoverGrant } : {}
          });
        } catch (stageErr) {
          console.warn('[AddOperationModal] Crop Year Cycle stage advancement was not completed.');
        }
      }

      setIsSubmitting(false);
      setSubmittingLineItemId(null);
      submissionLockRef.current = false;
      if (typeof onSuccess === 'function') {
        onSuccess(payload, {
          keepOpen: isSingleItemSubmission,
          remainingDraftForm: isSingleItemSubmission && initialDraft?.id ? {
            selectedStageNumber,
            selectedOpId,
            selectedChildOpId,
            customChildName,
            inputMode,
            activityName,
            performedOn,
            areaHa,
            workersCount: '',
            laborEntries: remainingLaborEntries,
            advanceStage,
            variety,
            subItems: remainingSubItems,
            directQty,
            directUnit,
            directRate,
            plannedOperationId: initialDraft?.form?.plannedOperationId || null,
            plannedDate: initialDraft?.form?.plannedDate || null,
            estimatedCost: initialDraft?.form?.estimatedCost || null
          } : null
        });
      }
      if (isSingleItemSubmission) {
        if (singleLineItem) setSubItems(remainingSubItems);
        setLaborEntries([]);
        setWorkersCount('');
        setNewWorker({ workerCount: '', days: '1', rate: '' });
      } else {
        onClose();
      }
    } catch (err) {
      console.warn('[AddOperationModal] Submission failed; see the displayed reference ID.');
      setServerError(err.message || 'Unable to record operation.');
      setIsSubmitting(false);
      setSubmittingLineItemId(null);
      submissionLockRef.current = false;
    }
  };

  const currentStageObj = SUGARCANE_STAGES.find(s => s.stageNumber === selectedStageNumber) || SUGARCANE_STAGES[0];

  const handleSaveDraft = () => {
    if (!canSaveDraft || typeof onSaveDraft !== 'function') return;
    const workerCount = Number(workersCount || 0);
    const days = Number(newWorker.days || 0);
    const rate = Number(newWorker.rate || 0);
    const attachedLabor = workerCount > 0 ? [{
      laborEntryId: createClientRecordId('LAB'), workerCount, days, unit: 'day', rate, subtotal: workerCount * days * rate
    }] : [];
    onSaveDraft({
      selectedStageNumber, selectedOpId, selectedChildOpId, customChildName, inputMode, activityName, performedOn,
      areaHa, workersCount, laborEntries: attachedLabor, advanceStage, variety, subItems,
      directQty, directUnit, directRate,
      plannedOperationId: initialDraft?.form?.plannedOperationId || null,
      plannedDate: initialDraft?.form?.plannedDate || null,
      estimatedCost: initialDraft?.form?.estimatedCost || null
    }, initialDraft?.id || null);
  };

  const handleSaveItemDraft = (index) => {
    if (!canSaveDraft || typeof onSaveDraft !== 'function') return;
    const item = subItems[index];
    if (!item?.description?.trim()) {
      setValidationErrors(previous => ({ ...previous, subItems: 'Enter the item description before saving it.' }));
      return;
    }
    const workerCount = Number(workersCount || 0);
    const days = Number(newWorker.days || 0);
    const rate = Number(newWorker.rate || 0);
    if (!Number.isInteger(workerCount) || workerCount < 0
      || (workerCount > 0 && (!Number.isFinite(days) || days <= 0 || !Number.isFinite(rate) || rate < 0))) {
      setValidationErrors(previous => ({ ...previous, workersCount: 'Enter a valid worker count, work days, and daily rate.' }));
      return;
    }
    const attachedLabor = workerCount > 0 ? [{
      laborEntryId: createClientRecordId('LAB'), workerCount, days, unit: 'day', rate, subtotal: workerCount * days * rate
    }] : [];
    const savedDraft = onSaveDraft({
      selectedStageNumber, selectedOpId, selectedChildOpId: item.lineItemId, customChildName: item.description,
      inputMode, activityName, performedOn, areaHa, workersCount, laborEntries: attachedLabor,
      advanceStage, variety, subItems: [item], directQty, directUnit, directRate,
      plannedOperationId: initialDraft?.form?.plannedOperationId || null,
      plannedDate: initialDraft?.form?.plannedDate || null,
      estimatedCost: initialDraft?.form?.estimatedCost || null
    }, null, { keepOpen: true, itemLabel: item.description });
    if (!savedDraft) return;
    setSubItems(previous => previous.filter((_, itemIndex) => itemIndex !== index));
    setWorkersCount('');
    setNewWorker({ workerCount: '', days: '1', rate: '' });
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="lg"
      title="Add Field Operation"
      subtitle={`${field.id} · ${field.memberName || 'Assigned Farm Member'} (${formatHectares(field.areaHa || field.ha)})`}
      badge={isTakeOver ? 'Manager Takeover' : 'Field Operation'}
      icon={Plus}
      isLoading={isSubmitting}
      preventBackdropClose={isSubmitting}
      preventEscapeClose={isSubmitting}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          {canSaveDraft && inputMode === 'direct' && (
            <Button variant="outline" onClick={handleSaveDraft} disabled={isSubmitting}>
              Save Draft
            </Button>
          )}
          {inputMode === 'direct' && (
            <Button
              variant="primary"
              onClick={handleSubmit}
              isLoading={isSubmitting}
              loadingText="Recording Operation..."
              icon={Plus}
            >
              Record Operation
            </Button>
          )}
        </>
      }
    >
      <form onSubmit={inputMode === 'direct' ? handleSubmit : event => event.preventDefault()} className="space-y-4">
        {/* Supervisor Context Indicator */}
        {isTakeOver && (
          <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-200 dark:border-amber-800/50 flex items-center gap-2.5 text-xs text-amber-900 dark:text-amber-300">
            <ShieldCheck className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <p className="font-medium">
              Manager Takeover Active: This operation will be stamped with your manager signature in the authoritative SRA audit ledger.
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
              disabled={!isTakeOver}
              options={SUGARCANE_STAGES.map(s => ({
                value: s.stageNumber,
                label: `Stage ${s.stageNumber}: ${s.shortName}`
              }))}
            />
          </FormField>

          <FormField
            id="add-op-template-select"
            label="Operation"
            badge="Stage-matched templates + custom"
            error={validationErrors.operation}
          >
            <Select
              id="add-op-template-select"
              value={selectedOpId}
              onChange={(e) => handleTemplateChange(e.target.value)}
              disabled={!selectedStageNumber}
              placeholder="Select an operation..."
              options={[
                { value: 'CUSTOM', label: 'CUSTOM: Enter a Custom Operation' },
                ...getSelectableOperationsForStage(selectedStageNumber).map(o => ({
                  value: o.id,
                  label: `${o.id}: ${o.name}`
                }))
              ]}
            />
          </FormField>
        </div>

        {selectedStageNumber === 2 && (
          <FormField
            id="add-op-variety"
            label="Sugarcane Variety"
            required
            helperText={field.cropCycle?.variety ? 'Stored on this Crop Year Cycle. Use an amendment to correct it.' : 'Captured when the Planting operation is recorded.'}
            error={validationErrors.variety}
          >
            <Select
              id="add-op-variety"
              value={variety}
              onChange={(event) => setVariety(event.target.value)}
              disabled={Boolean(field.cropCycle?.variety)}
              placeholder="Select sugarcane variety..."
              options={SUGARCANE_VARIETIES.map(value => ({ value, label: value }))}
            />
          </FormField>
        )}

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
              readOnly={selectedOpId !== 'CUSTOM'}
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
            label="Workers / Crew"
            error={validationErrors.workersCount}
            helperText="Worker totals are calculated from workers × days × daily rate."
          >
            <Input
              id="add-op-workers"
              type="number"
              min="0"
              placeholder="0"
              suffix="workers"
              value={workersCount}
              onChange={(event) => setWorkersCount(event.target.value)}
            />
          </FormField>
        </div>

        <div className="space-y-2 rounded-xl border border-border p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-hug-text">Crew costs</span>
            <span className="text-xs font-semibold text-primary">{formatCurrency(laborCost)}</span>
          </div>
          {laborEntries.map((worker, index) => (
            <div key={worker.laborEntryId} className="flex items-center justify-between gap-3 rounded-lg bg-bg px-3 py-2 text-xs">
              <span className="font-semibold text-hug-text">{worker.workerCount} workers · {worker.days} day × {formatCurrency(worker.rate)}</span>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setLaborEntries(previous => previous.filter((_, itemIndex) => itemIndex !== index))} className="text-danger">Delete</button>
              </div>
            </div>
          ))}
          <p className="text-xs text-hug-muted">These labor details are attached to the item you submit or save as a draft.</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Input type="number" min="0.1" step="0.5" value={newWorker.days} onChange={event => setNewWorker(previous => ({ ...previous, days: event.target.value }))} placeholder="Days" />
            <Input type="number" min="0" value={newWorker.rate} onChange={event => setNewWorker(previous => ({ ...previous, rate: event.target.value }))} placeholder="Rate / day" />
          </div>
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
              Itemized Costs
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
                  <div className="sm:col-span-3">
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
                  <div className="sm:col-span-3 text-right flex flex-wrap items-center justify-end gap-1">
                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      disabled={isSubmitting}
                      isLoading={isSubmitting && canonicalLineItemId(submittingLineItemId) === canonicalLineItemId(item.lineItemId)}
                      loadingText="Submitting..."
                      onClick={event => handleSubmit(event, { type: 'lineItem', index: idx })}
                    >
                      Submit
                    </Button>
                    {canSaveDraft && (
                      <Button type="button" variant="outline" size="sm" onClick={() => handleSaveItemDraft(idx)}>
                        Draft
                      </Button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleRemoveSubItem(idx)}
                      className="p-1 rounded text-hug-muted hover:text-danger cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
              {subItems.length === 0 && (
                <div className="rounded-xl border border-primary/20 bg-primary-bg/60 px-3 py-4 text-center text-xs font-semibold text-primary">
                  All child items for this operation have been submitted.
                </div>
              )}
            </div>

            {showNewExpense && (
              <div className="space-y-2 rounded-xl border border-primary/30 bg-primary-bg/40 p-3">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-5">
                  <Input className="sm:col-span-2" value={newExpense.description} onChange={event => setNewExpense(previous => ({ ...previous, description: event.target.value }))} placeholder="Material or expense" />
                  <Input type="number" min="0.01" step="0.1" value={newExpense.quantity} onChange={event => setNewExpense(previous => ({ ...previous, quantity: event.target.value }))} placeholder="Quantity" />
                  <Select value={newExpense.unit} onChange={event => setNewExpense(previous => ({ ...previous, unit: event.target.value }))} options={OPERATION_UNITS.map(unit => ({ value: unit, label: unit }))} />
                  <Input type="number" min="0" value={newExpense.unitCost} onChange={event => setNewExpense(previous => ({ ...previous, unitCost: event.target.value }))} placeholder="Unit cost" />
                </div>
                {validationErrors.newExpense && <p className="text-xs font-semibold text-danger">{validationErrors.newExpense}</p>}
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="secondary" size="sm" onClick={() => setShowNewExpense(false)}>Cancel</Button>
                  <Button type="button" variant="primary" size="sm" onClick={confirmAddSubItem}>Confirm item</Button>
                </div>
              </div>
            )}

            <Button
              variant="secondary"
              size="sm"
              onClick={handleAddSubItem}
              icon={Plus}
              type="button"
              disabled={showNewExpense}
            >
              Add Material / Expense
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 bg-bg/50 dark:bg-[#0C1015]/40 rounded-xl border border-border">
            <FormField id="direct-qty" label="Quantity" error={validationErrors.directQty}>
              <Input
                id="direct-qty"
                type="number"
                step="0.1"
                value={directQty}
                onChange={(e) => {
                  setDirectQty(e.target.value);
                  if (validationErrors.directQty) setValidationErrors(previous => ({ ...previous, directQty: null }));
                }}
              />
            </FormField>
            <FormField id="direct-unit" label="Unit">
              <Select
                id="direct-unit"
                value={directUnit}
                onChange={(e) => setDirectUnit(e.target.value)}
                options={OPERATION_UNITS.map(unit => ({ value: unit, label: unit }))}
              />
            </FormField>
            <FormField id="direct-rate" label="Rate / Unit (₱)" error={validationErrors.directRate}>
              <Input
                id="direct-rate"
                type="number"
                value={directRate}
                onChange={(e) => {
                  setDirectRate(e.target.value);
                  if (validationErrors.directRate) setValidationErrors(previous => ({ ...previous, directRate: null }));
                }}
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
              {laborCost > 0 && <span className="block text-[10px] text-hug-muted">Includes {formatCurrency(laborCost)} crew cost</span>}
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
