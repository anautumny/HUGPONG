import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { ROLE_KEYS } from '../../utils/authRouting';
import { subscribeToFieldsData } from '../../services/fieldsService';
import {
  createOperation
} from '../../services/operationsService';
import { CROP_STAGE_MAX, SUGARCANE_STAGES } from '../../constants/cropStages';
import { getOperationDefinition, getOperationsForStage } from '../../domain/operationCatalogue';
import { OPERATION_UNITS } from '../../domain/operationUnits';
import { SUGARCANE_VARIETIES } from '../../domain/sugarcaneVarieties';
import { authenticatedRequest } from '../../services/apiClient';
import { createClientRecordId } from '../../utils/secureId';
import CompactDashboardHeader from '../../components/dashboard/CompactDashboardHeader';
import {
  FormField,
  Input,
  Select,
  Button,
  StatusBadge,
  Badge,
  ConfirmDialog
} from '../../components/ui';
import TakeOverAuthModal from '../../components/operations/TakeOverAuthModal';
import { formatCurrency, formatHectares } from '../../utils/formatters';
import {
  ShieldAlert,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  Plus,
  Trash2,
  Sprout,
  UserCheck,
  Calendar,
  Layers,
  Lock
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';

export default function TakeOverView() {
  const { user, roleKey } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialFieldId = searchParams.get('fieldId') || '';

  const isManager = roleKey === ROLE_KEYS.FARM_MANAGER;

  // Fields data
  const [fieldsData, setFieldsData] = useState({
    fields: [],
    isLoading: true
  });

  // Selected field and authorization state
  const [selectedFieldId, setSelectedFieldId] = useState(initialFieldId);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [takeoverGrant, setTakeoverGrant] = useState(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);

  // Manager Takeover form state
  const [selectedStageNumber, setSelectedStageNumber] = useState(null);
  const [selectedOpId, setSelectedOpId] = useState('');
  const [selectedChildOpId, setSelectedChildOpId] = useState('');
  const [customChildName, setCustomChildName] = useState('');
  const [inputMode, setInputMode] = useState('group'); // 'group' or 'direct'
  const [performedOn, setPerformedOn] = useState(new Date().toISOString().slice(0, 10));
  const [activityName, setActivityName] = useState('');
  const [areaHa, setAreaHa] = useState('');
  const [workersCount, setWorkersCount] = useState('');
  const [laborEntries, setLaborEntries] = useState([]);
  const [newWorker, setNewWorker] = useState({ workerCount: '1', days: '1', rate: '' });
  const [advanceStage] = useState(false);
  const [variety, setVariety] = useState('');

  // Group Mode sub-items
  const [subItems, setSubItems] = useState([]);
  const [showNewExpense, setShowNewExpense] = useState(false);
  const [newExpense, setNewExpense] = useState({ description: '', quantity: '1', unit: 'bag', unitCost: '' });

  // Direct Mode inputs
  const [directQty, setDirectQty] = useState('');
  const [directUnit, setDirectUnit] = useState('ha');
  const [directRate, setDirectRate] = useState('');

  // Form submission
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [serverError, setServerError] = useState(null);

  // Exit confirmation
  const [exitConfirmOpen, setExitConfirmOpen] = useState(false);

  // Subscribe to fields
  useEffect(() => {
    let active = true;

    const unsub = subscribeToFieldsData({
      user,
      onUpdate: (data) => {
        if (!active) return;
        setFieldsData(data);
      }
    });

    return () => {
      active = false;
      if (typeof unsub === 'function') unsub();
    };
  }, [user?.id, user?.employeeId]);

  // Synchronize initial field
  useEffect(() => {
    if (initialFieldId) {
      setSelectedFieldId(initialFieldId);
    } else if (fieldsData.fields.length > 0 && !selectedFieldId) {
      setSelectedFieldId(fieldsData.fields[0].id);
    }
  }, [initialFieldId, fieldsData.fields]);

  // Find active field
  const currentField = useMemo(() => {
    return fieldsData.fields.find(f => f.id === selectedFieldId) || fieldsData.fields[0] || null;
  }, [fieldsData.fields, selectedFieldId]);

  // Synchronize stage and area from currentField when field changes
  useEffect(() => {
    if (currentField) {
      setSelectedStageNumber(null);
      setSelectedOpId('');
      setSelectedChildOpId('');
      setCustomChildName('');
      setActivityName('');
      setVariety(String(currentField.cropCycle?.variety || ''));
      setAreaHa(currentField.areaHa ? String(currentField.areaHa) : (currentField.ha ? String(currentField.ha) : ''));
    }
  }, [currentField?.id]);

  // Handle stage change
  const handleStageSelect = (stageNum) => {
    setSelectedStageNumber(stageNum);
    setSelectedOpId('');
    setSelectedChildOpId('');
    setCustomChildName('');
    setActivityName('');
    setSubItems([]);
  };

  // Handle template selection
  const handleTemplateSelect = (opId) => {
    setSelectedOpId(opId);
    setSelectedChildOpId('');
    setCustomChildName('');
    if (opId === 'CUSTOM') {
      setActivityName('');
      setInputMode('direct');
      setSubItems([]);
      setDirectQty(areaHa || '1');
      setDirectUnit('ha');
      setDirectRate('0');
      return;
    }
    const tmpl = getOperationDefinition(opId);
    if (!tmpl) return;
    const firstChild = tmpl.childOperations?.[0] || null;
    setSelectedChildOpId(firstChild?.id || '');

    setActivityName(tmpl.name);
    setSelectedStageNumber(tmpl.stageNumber);
    setInputMode(tmpl.childOperations?.length ? 'direct' : (tmpl.inputType || (tmpl.isGroup ? 'group' : 'direct')));

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
      })));
    } else {
      setDirectQty(String(tmpl.perHa || tmpl.quantity || '1'));
      setDirectUnit(tmpl.unit || 'ha');
      setDirectRate(String(tmpl.rate || tmpl.costPerHa || '0'));
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

  const handleAddSubItem = () => setShowNewExpense(true);
  const confirmAddSubItem = () => {
    const quantity = Number(newExpense.quantity);
    const unitCost = Number(newExpense.unitCost);
    if (!newExpense.description.trim() || quantity <= 0 || !Number.isFinite(unitCost)) {
      setServerError('Enter the material or expense details before confirming it.');
      return;
    }
    setSubItems(prev => [...prev, { lineItemId: createClientRecordId('SI'), itemType: 'EXPENSE', description: newExpense.description.trim(), quantity, unit: newExpense.unit, unitCost, subtotal: quantity * unitCost }]);
    setNewExpense({ description: '', quantity: '1', unit: 'bag', unitCost: '' });
    setShowNewExpense(false);
  };

  const handleChildSelect = (childId) => {
    setSelectedChildOpId(childId);
    setCustomChildName('');
    const child = childId === 'CUSTOM' ? null : getOperationDefinition(childId);
    setDirectQty(String(child?.perHa || areaHa || '1'));
    setDirectUnit(child?.unit || 'ha');
    setDirectRate(String(child?.rate || '0'));
  };

  const handleRemoveSubItem = (index) => {
    setSubItems(prev => prev.filter((_, idx) => idx !== index));
  };

  // Calculations
  const operationCost = useMemo(() => {
    if (inputMode === 'group') {
      return subItems.reduce((sum, item) => sum + Number(item.subtotal || 0), 0);
    } else {
      const q = Number(directQty || 0);
      const r = Number(directRate || 0);
      return q * r;
    }
  }, [inputMode, subItems, directQty, directRate]);
  const laborCost = Number(workersCount || 0) * Number(newWorker.days || 0) * Number(newWorker.rate || 0);
  const totalCost = operationCost + laborCost;

  const costPerHa = useMemo(() => {
    const ha = Number(areaHa || 1);
    return ha > 0 ? totalCost / ha : 0;
  }, [totalCost, areaHa]);

  // Submit Manager Takeover log
  const handleSubmit = async (e, submissionTarget = null) => {
    e?.preventDefault?.();
    if (isSubmitting) return;
    const singleLineItem = submissionTarget?.type === 'lineItem' ? subItems[submissionTarget.index] : null;
    const isSingleItemSubmission = Boolean(singleLineItem);
    const submittedLineItems = singleLineItem ? [singleLineItem] : (isSingleItemSubmission ? [] : (inputMode === 'group' ? subItems : []));
    const laborWorkerCount = Number(workersCount || 0);
    const laborDays = Number(newWorker.days || 0);
    const laborRate = Number(newWorker.rate || 0);
    if (!Number.isInteger(laborWorkerCount) || laborWorkerCount < 0
      || (laborWorkerCount > 0 && (!Number.isFinite(laborDays) || laborDays <= 0 || !Number.isFinite(laborRate) || laborRate < 0))) {
      setServerError('Enter a valid worker count, work days, and daily rate. These details will be attached to the selected item.');
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

    // If supervisor is not authorized yet, prompt auth modal first!
    if (!isAuthorized) {
      setAuthModalOpen(true);
      return;
    }

    if (!selectedFieldId || !selectedStageNumber || !selectedOpId || !activityName.trim()) {
      setServerError('Select a stage and its operation, then provide an activity title.');
      return;
    }
    if (selectedStageNumber === 2 && !variety.trim()) {
      setServerError('Sugarcane variety is required for a Planting-stage operation.');
      return;
    }

    setIsSubmitting(true);
    try {
      const cycleId = currentField?.currentCycleId || currentField?.cropCycle?.id;
      if (!cycleId) {
        setServerError('No active Crop Year Cycle found for this field plot. An active Crop Year Cycle is required to record operations.');
        setIsSubmitting(false);
        return;
      }

      const numArea = Number(areaHa);
      if (!areaHa || isNaN(numArea) || numArea <= 0) {
        setServerError('Please provide a valid area in hectares (> 0).');
        setIsSubmitting(false);
        return;
      }

      const submittedComponentCost = submittedLineItems.reduce((sum, item) => sum + Number(item.subtotal || 0), 0)
        + submittedLaborEntries.reduce((sum, item) => sum + Number(item.subtotal || 0), 0);
      const submittedBaseCost = inputMode === 'direct' ? operationCost : 0;
      const payload = {
        fieldId: selectedFieldId,
        cycleId,
        operationDefinitionId: selectedOpId || 'CUSTOM',
        parentOperationDefinitionId: null,
        childOperationDefinitionId: singleLineItem?.lineItemId || null,
        childOperationName: singleLineItem?.description || '',
        operationName: activityName.trim(),
        category: getOperationDefinition(selectedOpId)?.category || 'General Care',
        stageNumber: Number(selectedStageNumber) || 1,
        variety: selectedStageNumber === 2 ? variety.trim() : '',
        performedOn,
        areaHa: numArea,
        peopleCount: submittedLaborEntries.length
          ? submittedLaborEntries.reduce((sum, item) => sum + Number(item.workerCount || 0), 0)
          : (isSingleItemSubmission ? 0 : Number(workersCount) || 0),
        baseCost: submittedBaseCost,
        totalCost: inputMode === 'direct' ? submittedBaseCost + submittedComponentCost : submittedComponentCost,
        laborEntries: submittedLaborEntries,
        submissionSource: 'MANAGER_TAKEOVER',
        isSupplemental: false,
        lineItems: submittedLineItems.map(item => ({
          lineItemId: item.lineItemId,
          itemType: item.itemType || 'EXPENSE',
          description: item.description,
          quantity: Number(item.quantity || 0),
          unit: item.unit || 'unit',
          unitCost: Number(item.unitCost || 0),
          subtotal: Number(item.subtotal || 0)
        })),
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
          console.warn('[TakeOver] Crop Year Cycle stage advancement was not completed.');
        }
      }

      setIsSubmitting(false);
      setSubmitSuccess(true);
      if (singleLineItem) setSubItems(previous => previous.filter((_, index) => index !== submissionTarget.index));
      if (isSingleItemSubmission) {
        setLaborEntries([]);
        setWorkersCount('');
        setNewWorker({ workerCount: '', days: '1', rate: '' });
      }
      if (!isSingleItemSubmission) navigate('/operations');
    } catch (err) {
      console.warn('[TakeOver] Submission failed; see the displayed reference ID.');
      setServerError(err.message || 'Unable to record Manager Takeover operation.');
      setIsSubmitting(false);
    }
  };

  // Safe Exit
  const handleExit = () => {
    setExitConfirmOpen(true);
  };

  const confirmExit = () => {
    setExitConfirmOpen(false);
    navigate('/fields');
  };

  // Access control check: Farm Manager only
  if (!isManager) {
    return (
      <div className="p-8 max-w-md mx-auto text-center space-y-4">
        <div className="w-12 h-12 rounded-2xl bg-danger-bg dark:bg-danger/20 text-danger flex items-center justify-center mx-auto">
          <ShieldAlert className="w-6 h-6" />
        </div>
        <h2 className="text-lg font-black text-hug-text">
          Access Restricted
        </h2>
        <p className="text-xs text-hug-muted">
          Manager Takeover is authorized exclusively for Farm Managers managing an assigned Block Farm.
        </p>
        <Button variant="secondary" onClick={() => navigate('/dashboard')}>
          Return to Dashboard
        </Button>
      </div>
    );
  }

  const currentStageObj = SUGARCANE_STAGES.find(s => s.stageNumber === selectedStageNumber) || null;

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* 1. Header */}
      <CompactDashboardHeader
        category="Supervisory Intervention"
        badge="Manager Override"
        title="Manager Takeover Mode"
        subtitle="Record supervisory operations and stage completions for member parcels in the authoritative SRA audit ledger."
        actions={[
          {
            label: 'Exit Manager Takeover',
            icon: ArrowLeft,
            onClick: handleExit
          }
        ]}
      />

      {/* 2. Clear Context Banner (Rule 27) */}
      <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center font-bold shrink-0 shadow-2xs">
            <UserCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs sm:text-sm font-black text-amber-950 dark:text-amber-200">
                Manager Takeover Active
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-white dark:bg-surface border border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-300">
                {currentField?.id || 'No Parcel Selected'}
              </span>
            </div>
            <p className="text-xs text-amber-800 dark:text-amber-300 mt-0.5 font-medium">
              Recording for: <strong>{currentField?.memberName || 'Farm Member'}</strong> · {currentField?.blockFarmName || 'Managed Block Farm'} ({formatHectares(currentField?.areaHa || currentField?.ha)})
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {!isAuthorized ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setAuthModalOpen(true)}
              icon={Lock}
              className="border-amber-300 text-amber-800 dark:text-amber-300"
            >
              Confirm Password
            </Button>
          ) : (
            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-xl text-xs font-bold bg-success-bg dark:bg-success/20 text-success border border-success/30">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Supervisor Authorized</span>
            </span>
          )}
        </div>
      </div>

      {/* Field selector for Manager Takeover */}
      <div className="bg-white dark:bg-surface p-4 rounded-2xl border border-border shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex-1 max-w-lg">
          <label htmlFor="takeover-field-selector" className="text-xs font-bold text-hug-text mb-1.5 block">
            Target Field Plot
          </label>
          <Select
            id="takeover-field-selector"
            value={selectedFieldId}
            onChange={(e) => {
              setSelectedFieldId(e.target.value);
              setIsAuthorized(false);
              setTakeoverGrant(null);
            }}
            options={fieldsData.fields.map(f => {
              const isPersonal = f.memberUserId && (f.memberUserId === user?.id || f.memberUserId === user?.employeeId);
              return {
                value: f.id,
                label: `${f.id} — ${f.memberName || 'Unassigned'} (${formatHectares(f.areaHa || f.ha)})${isPersonal ? ' [Personal Plot]' : ''}`
              };
            })}
          />
        </div>
        {currentField && (
          <div className="text-xs text-hug-muted flex items-center gap-2 self-end sm:self-center">
            <span>Cycle Stage:</span>
            <span className="font-bold text-primary dark:text-primary-light px-2 py-0.5 rounded bg-primary-bg dark:bg-primary/20">
              Stage {currentField.stageNumber || 1}
            </span>
          </div>
        )}
      </div>

      {submitSuccess && (
        <div className="p-4 rounded-xl bg-success-bg dark:bg-success/20 border border-success/30 flex items-center gap-2.5 text-xs font-bold text-success animate-in fade-in">
          <CheckCircle2 className="w-5 h-5 shrink-0" />
          <span>Manager Takeover operation recorded successfully and stamped with your manager signature. Redirecting to ledger...</span>
        </div>
      )}

      {serverError && (
        <div className="p-4 rounded-xl bg-danger-bg dark:bg-danger/20 border border-danger/30 flex items-center gap-2.5 text-xs font-bold text-danger">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{serverError}</span>
        </div>
      )}

      {/* Main Manager Takeover layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Crop Cycle Stages (5 cols) */}
        <div className="lg:col-span-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-hug-text uppercase tracking-wider flex items-center gap-1.5">
              <Sprout className="w-4 h-4 text-primary" />
              <span>Crop Year Cycle Stages</span>
            </h3>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary-bg text-primary dark:text-primary-light">
              Sequential Cycle
            </span>
          </div>
          <p className="text-xs text-hug-muted">
            Select a stage below to log operations for this parcel:
          </p>

          <div className="space-y-2">
            {SUGARCANE_STAGES.map((st) => {
              const isSelected = st.stageNumber === selectedStageNumber;
              const isCurrentFieldStage = st.stageNumber === Number(currentField?.stageNumber || 1);

              return (
                <div
                  key={st.stageNumber}
                  onClick={() => handleStageSelect(st.stageNumber)}
                  className={`p-3.5 rounded-xl border transition-all cursor-pointer flex flex-col gap-1 ${
                    isSelected
                      ? 'bg-primary-bg/70 dark:bg-primary/20 border-primary shadow-xs'
                      : 'bg-white dark:bg-surface border-border hover:border-primary/50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`text-xs font-bold ${isSelected ? 'text-primary dark:text-primary-light' : 'text-hug-text'}`}>
                      {st.name}
                    </span>
                    {isCurrentFieldStage && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-primary text-white">
                        Active Stage
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-hug-muted leading-relaxed">
                    {st.description} · <span className="font-mono">{st.months}</span>
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column: Operation Log Form (7 cols) */}
        <div className="lg:col-span-7 bg-white dark:bg-surface rounded-2xl p-5 sm:p-6 border border-border shadow-xs space-y-5">
          {/* Target Operation & Stage Pill */}
          <div className="p-4 rounded-xl bg-primary-bg/40 dark:bg-primary/10 border border-primary/20 flex items-start justify-between gap-3">
            <div>
              <span className="text-[10px] font-black uppercase tracking-wider text-primary dark:text-primary-light block">
                Target Operation Template
              </span>
              <h4 className="text-sm font-black text-hug-text mt-0.5">
                {currentStageObj?.name || 'Select a crop stage'}
              </h4>
              <p className="text-xs text-hug-muted mt-0.5">
                {currentStageObj?.description || 'The operation list will be filtered to the chosen stage.'}
              </p>
            </div>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary text-white">
              {selectedStageNumber ? `Stage ${selectedStageNumber}` : 'No stage'}
            </span>
          </div>

          {/* SRA Operation Selector */}
          <FormField
            id="takeover-op-select"
            label="Operation"
            badge="Stage-matched templates + custom"
          >
            <Select
              id="takeover-op-select"
              value={selectedOpId}
              onChange={(e) => handleTemplateSelect(e.target.value)}
              disabled={!selectedStageNumber}
              placeholder="Select an operation..."
              options={[
                { value: 'CUSTOM', label: 'CUSTOM: Enter a Custom Operation' },
                ...getOperationsForStage(selectedStageNumber).map(o => ({
                  value: o.id,
                  label: `${o.id}: ${o.name}`
                }))
              ]}
            />
          </FormField>

          {selectedStageNumber === 2 && (
            <FormField
              id="takeover-variety"
              label="Sugarcane Variety"
              required
              helperText={currentField?.cropCycle?.variety ? 'Stored on this Crop Year Cycle. Correct it through an amendment.' : 'Captured with the Planting operation.'}
            >
              <Select
                id="takeover-variety"
                value={variety}
                onChange={(event) => setVariety(event.target.value)}
                disabled={Boolean(currentField?.cropCycle?.variety)}
                placeholder="Select sugarcane variety..."
                options={SUGARCANE_VARIETIES.map(value => ({ value, label: value }))}
              />
            </FormField>
          )}

          {!selectedOpId && (
            <p className="text-xs text-hug-muted rounded-xl border border-dashed border-border p-4 text-center">
              Select an operation to continue with details, costs, and submission.
            </p>
          )}

          <fieldset disabled={!selectedOpId} className={!selectedOpId ? 'hidden' : 'contents'}>

          {/* Input Mode Selector */}
          <div className="p-3 bg-bg dark:bg-[#0C1015] rounded-xl border border-border flex items-center justify-between">
            <span className="text-xs font-bold text-hug-text uppercase tracking-wider">
              Input Mode
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
                Direct Input
              </button>
            </div>
          </div>

          {/* Activity Name & Date */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            <FormField
              id="takeover-act-input"
              label="Activity Name"
              required
              className="sm:col-span-2"
            >
              <Input
                id="takeover-act-input"
                value={activityName}
                onChange={(e) => setActivityName(e.target.value)}
                readOnly={selectedOpId !== 'CUSTOM'}
              />
            </FormField>

            <FormField
              id="takeover-date-input"
              label="Date Completed"
              required
            >
              <Input
                id="takeover-date-input"
                type="date"
                value={performedOn}
                onChange={(e) => setPerformedOn(e.target.value)}
              />
            </FormField>
          </div>

          {/* Hectares & Workers */}
          <div className="grid grid-cols-2 gap-3.5">
            <FormField id="takeover-ha-input" label="Hectares Covered" required>
              <Input
                id="takeover-ha-input"
                type="number"
                step="0.1"
                suffix="ha"
                value={areaHa}
                onChange={(e) => setAreaHa(e.target.value)}
              />
            </FormField>
            <FormField id="takeover-workers-input" label="Workers Count">
              <Input
                id="takeover-workers-input"
                type="number"
                min="0"
                suffix="workers"
                value={workersCount}
                onChange={(event) => setWorkersCount(event.target.value)}
              />
            </FormField>
          </div>

          <div className="space-y-2 rounded-xl border border-border p-3">
            <div className="flex items-center justify-between text-xs font-bold"><span>Crew costs</span><span className="text-primary">{formatCurrency(laborCost)}</span></div>
            {laborEntries.map((worker, index) => (
              <div key={worker.laborEntryId} className="flex justify-between rounded-lg bg-bg px-3 py-2 text-xs">
                <span>{worker.workerCount} workers · {worker.days} day × {formatCurrency(worker.rate)}</span>
                <div className="flex items-center gap-2">
                  <button type="button" className="text-danger" onClick={() => setLaborEntries(previous => previous.filter((_, itemIndex) => itemIndex !== index))}>Delete</button>
                </div>
              </div>
            ))}
            <p className="text-xs text-hug-muted">These labor details are attached to the item you submit.</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Input type="number" min="0.1" step="0.5" value={newWorker.days} onChange={event => setNewWorker(previous => ({ ...previous, days: event.target.value }))} placeholder="Days" />
              <Input type="number" min="0" value={newWorker.rate} onChange={event => setNewWorker(previous => ({ ...previous, rate: event.target.value }))} placeholder="Rate / day" />
            </div>
          </div>

          {/* Cost breakdown */}
          {inputMode === 'group' ? (
            <div className="space-y-3 pt-2 border-t border-border/70">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-hug-text">
                  Materials &amp; Expense Breakdown
                </span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary-bg dark:bg-primary/20 text-primary">
                  {subItems.length} items
                </span>
              </div>

              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {subItems.map((item, idx) => (
                  <div
                    key={item.lineItemId || idx}
                    className="grid grid-cols-1 sm:grid-cols-12 gap-2 p-2.5 rounded-xl border border-border bg-bg/50 dark:bg-[#0C1015]/40 items-center"
                  >
                    <div className="sm:col-span-4">
                      <input
                        type="text"
                        placeholder="Description..."
                        value={item.description}
                        onChange={(e) => handleSubItemChange(idx, 'description', e.target.value)}
                        className="w-full text-xs font-semibold px-2 py-1.5 border border-border rounded-lg bg-white dark:bg-surface text-hug-text outline-none focus:border-primary"
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
                        placeholder="Rate"
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
                    <div className="sm:col-span-2 text-right flex items-center justify-end gap-1">
                      <Button type="button" size="sm" variant="primary" onClick={event => handleSubmit(event, { type: 'lineItem', index: idx })}>Submit</Button>
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
              </div>

              {showNewExpense && (
                <div className="space-y-2 rounded-xl border border-primary/30 bg-primary-bg/40 p-3">
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
                    <Input value={newExpense.description} onChange={event => setNewExpense(previous => ({ ...previous, description: event.target.value }))} placeholder="Material or expense" />
                    <Input type="number" min="0.01" step="0.1" value={newExpense.quantity} onChange={event => setNewExpense(previous => ({ ...previous, quantity: event.target.value }))} placeholder="Quantity" />
                    <Select value={newExpense.unit} onChange={event => setNewExpense(previous => ({ ...previous, unit: event.target.value }))} options={OPERATION_UNITS.map(unit => ({ value: unit, label: unit }))} />
                    <Input type="number" min="0" value={newExpense.unitCost} onChange={event => setNewExpense(previous => ({ ...previous, unitCost: event.target.value }))} placeholder="Unit cost" />
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button type="button" size="sm" variant="secondary" onClick={() => setShowNewExpense(false)}>Cancel</Button>
                    <Button type="button" size="sm" variant="primary" onClick={confirmAddSubItem}>Confirm item</Button>
                  </div>
                </div>
              )}

              <Button
                variant="secondary"
                size="sm"
                onClick={handleAddSubItem}
                icon={Plus}
                className="w-full border-dashed"
                disabled={showNewExpense}
              >
                Add Material / Expense
              </Button>
            </div>
          ) : (
            <div className="p-4 rounded-xl bg-bg/50 dark:bg-[#0C1015] border border-border space-y-3 pt-2">
              <span className="text-xs font-bold text-hug-text block">
                Direct Cost Entry (Quantity × Rate)
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
                    options={OPERATION_UNITS.map(unit => ({ value: unit, label: unit }))}
                  />
                </FormField>
                <FormField label="Rate (₱)">
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

          {/* High-Visibility Cost Summary Card */}
          <div className="bg-[#1E4D2B] rounded-2xl p-4 text-white shadow-xs flex items-center justify-between gap-4">
            <div>
              <span className="text-[10px] font-bold text-[#D4EAD6] uppercase tracking-wider block">
                Total Operation Cost
              </span>
              <span className="text-2xl font-black text-white block mt-0.5">
                {formatCurrency(totalCost)}
              </span>
              {laborCost > 0 && <span className="block text-[10px] text-[#D4EAD6]">Includes {formatCurrency(laborCost)} crew cost</span>}
            </div>
            <div className="text-right bg-white/15 px-3 py-1 rounded-xl border border-white/20">
              <span className="text-[10px] font-bold text-[#D4EAD6] block">
                Per Hectare
              </span>
              <span className="text-xs font-black text-white block mt-0.5">
                {formatCurrency(costPerHa)} / ha
              </span>
            </div>
          </div>

          {/* Submit Action */}
          {inputMode === 'direct' && <div className="pt-2">
            <Button
              type="button"
              variant="primary"
              size="lg"
              className="w-full"
              onClick={handleSubmit}
              isLoading={isSubmitting}
              loadingText="Recording Supervisory Operation..."
            >
              Record Supervisory Operation &amp; Save Progress
            </Button>
          </div>}
          </fieldset>
        </div>
      </div>

      {/* Security Auth Modal */}
      <TakeOverAuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        field={currentField}
        user={user}
        onAuthorized={(_field, grant) => {
          setTakeoverGrant(grant);
          setIsAuthorized(true);
          setAuthModalOpen(false);
        }}
      />

      {/* Exit Confirmation Dialog */}
      <ConfirmDialog
        isOpen={exitConfirmOpen}
        onCancel={() => setExitConfirmOpen(false)}
        onConfirm={confirmExit}
        title="Exit Manager Takeover Mode?"
        message="Any unsaved operation inputs will be discarded. The member field will be unselected."
        confirmText="Exit Manager Takeover"
        cancelText="Stay Here"
        type="warning"
      />
    </div>
  );
}
