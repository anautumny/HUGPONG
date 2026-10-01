import React, { useState, useMemo, useEffect } from 'react';
import {
  FileCheck2,
  AlertTriangle,
  CheckCircle2,
  CloudUpload,
  QrCode,
  Download,
  Copy,
  Loader2
} from 'lucide-react';
import QRCode from 'qrcode';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import QRCodeView from './QRCodeView';
import { compileAuditReport, fetchNextAuditPeriod, selectAuditDeliveryMethod, submitAuditReport, createAuditQrPayload } from '../../services/auditService';
import { AUDIT_STATUS, canonicalAuditStatus, auditReportsForFarmPeriod, reportedOperationIds } from '../../domain/auditWorkflow';

export default function AuditCompilationModal({
  isOpen = false,
  onClose,
  blockFarm = null,
  fields = [],
  operations = [],
  existingReports = [],
  initialReport = null,
  onSuccess
}) {
  const [step, setStep] = useState(1); // 1 = compile, 2 = choose delivery, 3 = QR transfer
  const [selectedPeriod, setSelectedPeriod] = useState(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  });
  const [isCompiling, setIsCompiling] = useState(false);
  const [compileError, setCompileError] = useState(null);
  const [compiledResult, setCompiledResult] = useState(null);
  const [periodInfo, setPeriodInfo] = useState(null);
  const [isLoadingPeriod, setIsLoadingPeriod] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPreparingQr, setIsPreparingQr] = useState(false);
  const [isSavingQr, setIsSavingQr] = useState(false);
  const [deliveryMessage, setDeliveryMessage] = useState('');
  const [qrPayload, setQrPayload] = useState('');
  const [qrActionMessage, setQrActionMessage] = useState('');
  const initialReportKey = initialReport
    ? `${initialReport.id || initialReport.reportId}:${initialReport.status || ''}:${initialReport.updatedAt || ''}`
    : '';
  const isBusy = isCompiling || isSubmitting || isPreparingQr || isSavingQr;

  useEffect(() => {
    if (!isOpen || !blockFarm?.id) return;
    const initialStatus = initialReport ? canonicalAuditStatus(initialReport.status) : null;
    if (initialReport && [AUDIT_STATUS.COMPILED, AUDIT_STATUS.PENDING_SUBMISSION].includes(initialStatus)) {
      const periodKey = initialReport.periodKey || initialReport.period;
      setSelectedPeriod(periodKey);
      setPeriodInfo({ periodKey, blockFarmId: initialReport.blockFarmId });
      setCompiledResult(initialReport);
      setCompileError(null);
      setDeliveryMessage('');
      if (String(initialReport.deliveryMethod || '').toLowerCase() === 'qr') {
        try {
          setQrPayload(createAuditQrPayload(initialReport));
          setQrActionMessage('QR Transfer is selected. Show this code to SRA, copy the report ID, or switch to Cloud delivery.');
          setStep(3);
        } catch (error) {
          setCompileError(error.message || 'Unable to reopen the saved QR transfer.');
          setStep(2);
        }
      } else {
        setStep(2);
      }
      setIsLoadingPeriod(false);
      return;
    }
    let active = true;
    setIsLoadingPeriod(true);
    fetchNextAuditPeriod(blockFarm.id)
      .then(response => {
        if (!active || !response.data) return;
        setSelectedPeriod(response.data.periodKey);
        setPeriodInfo(response.data);
      })
      .catch(error => active && setCompileError(error.message || 'Unable to determine the reporting period.'))
      .finally(() => active && setIsLoadingPeriod(false));
    return () => { active = false; };
  }, [isOpen, blockFarm?.id, initialReportKey]);

  // Pre-flight calculation for eligible logs
  const farmFieldIds = useMemo(() => {
    if (!blockFarm?.id) return new Set();
    return new Set(fields.filter(f => f.blockFarmId === blockFarm.id).map(f => f.id));
  }, [blockFarm, fields]);

  // Submitted logs remain audit-eligible after their production cycle is archived.
  const matchingMonthLogs = useMemo(() => {
    return operations.filter(log => {
      if (!farmFieldIds.has(log.fieldId)) return false;
      if (!['ACTIVE', 'ARCHIVED'].includes(String(log.status || '').toUpperCase())) return false;
      const performed = String(log.performedOn || log.isoDate || log.date || '');
      return performed.startsWith(`${selectedPeriod}-`);
    });
  }, [operations, farmFieldIds, selectedPeriod]);

  const periodReports = useMemo(
    () => auditReportsForFarmPeriod(existingReports, blockFarm?.id, selectedPeriod),
    [existingReports, blockFarm?.id, selectedPeriod]
  );
  const latestReport = periodReports[0] || null;
  const latestStatus = latestReport ? canonicalAuditStatus(latestReport.status) : null;
  const coveredOperationIds = useMemo(() => reportedOperationIds(periodReports), [periodReports]);
  const eligibleLogs = useMemo(
    () => matchingMonthLogs.filter(log => !coveredOperationIds.has(String(log.id))),
    [matchingMonthLogs, coveredOperationIds]
  );
  const compilationBlockedByActiveReport = [
    AUDIT_STATUS.COMPILED,
    AUDIT_STATUS.PENDING_SUBMISSION,
    AUDIT_STATUS.PENDING_REVIEW
  ].includes(latestStatus);
  const incompleteFields = Array.isArray(periodInfo?.incompleteFields) ? periodInfo.incompleteFields : [];
  const compilationBlockedByIncompleteFields = incompleteFields.length > 0;

  useEffect(() => {
    const periodReady = periodInfo?.periodKey === selectedPeriod
      && periodInfo?.blockFarmId === blockFarm?.id;
    if (!isOpen || isLoadingPeriod || !periodReady || !latestReport) return;
    if ([AUDIT_STATUS.COMPILED, AUDIT_STATUS.PENDING_SUBMISSION].includes(latestStatus)) {
      setCompiledResult(latestReport);
      setCompileError(null);
      setDeliveryMessage('');
      if (String(latestReport.deliveryMethod || '').toLowerCase() === 'qr') {
        try {
          setQrPayload(createAuditQrPayload(latestReport));
          setQrActionMessage('QR Transfer is selected. Show this code to SRA, copy the report ID, or switch to Cloud delivery.');
          setStep(3);
        } catch (error) {
          setCompileError(error.message || 'Unable to reopen the saved QR transfer.');
          setStep(2);
        }
      } else {
        setStep(2);
      }
    }
  }, [isOpen, isLoadingPeriod, periodInfo, selectedPeriod, blockFarm?.id, latestReport, latestStatus]);

  // Compute pre-flight metrics
  const totalExpenditure = useMemo(() => {
    return eligibleLogs.reduce((sum, log) => sum + Number(log.totalCost != null ? log.totalCost : (log.cost || 0)), 0);
  }, [eligibleLogs]);

  const auditedPlotsCount = useMemo(() => {
    const plotSet = new Set(eligibleLogs.map(l => l.fieldId));
    return plotSet.size;
  }, [eligibleLogs]);

  const totalAreaHa = useMemo(() => {
    const areaMap = new Map();
    eligibleLogs.forEach(log => {
      areaMap.set(log.fieldId, Math.max(areaMap.get(log.fieldId) || 0, Number(log.areaHa || 0)));
    });
    return Array.from(areaMap.values()).reduce((sum, ha) => sum + ha, 0);
  }, [eligibleLogs]);

  // Stage breakdown
  const stageBreakdown = useMemo(() => {
    const stages = {};
    eligibleLogs.forEach(l => {
      const st = l.stageNumber || 1;
      if (!stages[st]) stages[st] = { count: 0, cost: 0 };
      stages[st].count += 1;
      stages[st].cost += Number(l.totalCost != null ? l.totalCost : (l.cost || 0));
    });
    return stages;
  }, [eligibleLogs]);

  const handleCompile = async () => {
    if (isCompiling) return;
    if (!blockFarm?.id) {
      setCompileError('No assigned Block Farm identified for your account.');
      return;
    }
    if (compilationBlockedByActiveReport) {
      setCompileError(latestStatus === AUDIT_STATUS.PENDING_REVIEW
        ? 'This monthly report is already awaiting SRA review.'
        : 'Submit the existing compiled report before creating another version.');
      return;
    }
    if (compilationBlockedByIncompleteFields) {
      setCompileError(`Cannot compile: ${incompleteFields.length} active field${incompleteFields.length === 1 ? '' : 's'} still need a submitted operation. Contact the listed members first.`);
      return;
    }
    if (eligibleLogs.length === 0) {
      setCompileError(`Cannot compile: No uncompiled submitted operations found for ${selectedPeriod}.`);
      return;
    }

    setIsCompiling(true);
    setCompileError(null);

    try {
      const response = await compileAuditReport({
        blockFarmId: blockFarm.id,
        periodKey: selectedPeriod,
        operationLogIds: eligibleLogs.map(l => l.id)
      });

      if (response.success && response.data) {
        setCompiledResult(response.data);
        setStep(2);
        if (onSuccess) onSuccess(response.data);
      } else {
        throw new Error(response.error || 'Server rejected audit report compilation.');
      }
    } catch (err) {
      console.warn('[AuditCompilation] Compilation failed; see the displayed reference ID.');
      if (Array.isArray(err.data?.incompleteFields)) {
        setPeriodInfo(current => ({ ...(current || {}), ...err.data }));
      }
      setCompileError(err.message || 'Failed to compile audit report. Please try again.');
    } finally {
      setIsCompiling(false);
    }
  };

  const handleClose = () => {
    if (isBusy) return;
    setStep(1);
    setCompileError(null);
    setCompiledResult(null);
    setPeriodInfo(null);
    setDeliveryMessage('');
    setIsPreparingQr(false);
    setQrPayload('');
    setQrActionMessage('');
    onClose();
  };

  const handleCloudSubmission = async () => {
    const reportId = compiledResult?.id || compiledResult?.reportId;
    if (!reportId || isSubmitting) return;
    setIsSubmitting(true);
    setCompileError(null);
    try {
      const response = await submitAuditReport(reportId);
      if (!response.success || !response.data) throw new Error(response.error || 'Cloud submission failed.');
      setCompiledResult(response.data);
      setDeliveryMessage('Submitted through Cloud. The report is now visible in the SRA Audit Inbox.');
      setQrActionMessage('Sent through Cloud instead. The report is now awaiting SRA review.');
      if (onSuccess) onSuccess(response.data);
    } catch (error) {
      setCompileError(error.message || 'Unable to submit the compiled report through Cloud.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGenerateQr = async () => {
    if (isPreparingQr) return;
    setIsPreparingQr(true);
    setCompileError(null);
    try {
      const reportId = compiledResult?.id || compiledResult?.reportId;
      if (!reportId) throw new Error('The compiled report has no canonical report ID.');
      const response = await selectAuditDeliveryMethod(reportId, 'QR', compiledResult?.updatedAt || null);
      if (!response.success || !response.data) throw new Error(response.error || 'QR Transfer could not be selected.');
      setCompiledResult(response.data);
      setQrPayload(createAuditQrPayload(response.data));
      setQrActionMessage('QR Transfer selected. If scanning is unavailable, copy the report ID or send through Cloud instead.');
      setStep(3);
      if (onSuccess) onSuccess(response.data);
    } catch (error) {
      setCompileError(error.message || 'Unable to build the QR transfer.');
    } finally {
      setIsPreparingQr(false);
    }
  };

  const downloadCurrentQr = async () => {
    const value = qrPayload;
    if (!value || isSavingQr) return;
    setIsSavingQr(true);
    setCompileError(null);
    try {
      const qrDataUrl = await QRCode.toDataURL(value, {
        width: 820,
        margin: 4,
        errorCorrectionLevel: 'M',
        color: { dark: '#000000', light: '#FFFFFF' }
      });
      const qrImage = new Image();
      await new Promise((resolve, reject) => {
        qrImage.onload = resolve;
        qrImage.onerror = reject;
        qrImage.src = qrDataUrl;
      });
      const canvas = document.createElement('canvas');
      canvas.width = 1200;
      canvas.height = 1580;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('The browser could not prepare the QR card.');

      context.fillStyle = '#F7FBF5';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = '#173D24';
      context.fillRect(0, 0, canvas.width, 230);
      context.fillStyle = '#9EE493';
      context.beginPath();
      context.arc(112, 115, 48, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#173D24';
      context.font = '900 52px sans-serif';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText('H', 112, 118);
      context.textAlign = 'left';
      context.fillStyle = '#FFFFFF';
      context.font = '900 58px sans-serif';
      context.fillText('HUGPONG', 190, 100);
      context.fillStyle = '#BFE5B9';
      context.font = '800 22px sans-serif';
      context.fillText('OFFICIAL AUDIT TRANSFER', 193, 150);

      const managerName = compiledResult?.compiledByName || compiledResult?.compiledByUserId || 'Farm Manager';
      const farmName = compiledResult?.blockFarmName || blockFarm?.name || compiledResult?.blockFarmId || 'Not specified';
      const reportPeriod = compiledResult?.periodKey || selectedPeriod || 'Not specified';
      const cropYear = compiledResult?.cropYearCycle || compiledResult?.cropYearCycles?.join(', ') || 'Not specified';
      const drawField = (label, fieldValue, x, y, maxWidth) => {
        context.fillStyle = '#718076';
        context.font = '900 18px sans-serif';
        context.fillText(label, x, y);
        context.fillStyle = '#173D24';
        context.font = '800 29px sans-serif';
        context.fillText(String(fieldValue), x, y + 39, maxWidth);
      };
      drawField('FARM MANAGER', managerName, 90, 290, 1020);
      drawField('BLOCK FARM', farmName, 90, 390, 1020);
      drawField('REPORTING MONTH', reportPeriod, 90, 490, 470);
      drawField('CROP YEAR CYCLE', cropYear, 640, 490, 470);

      context.fillStyle = '#FFFFFF';
      context.fillRect(160, 570, 880, 880);
      context.drawImage(qrImage, 190, 600, 820, 820);
      context.fillStyle = '#2F6B3B';
      context.textAlign = 'center';
      context.font = '900 18px sans-serif';
      context.fillText('SECURE SERVER-VERIFIED REFERENCE', 600, 1490);
      context.fillStyle = '#526158';
      context.font = '700 18px monospace';
      context.fillText(String(compiledResult?.reportId || compiledResult?.id || ''), 600, 1530, 1020);

      const dataUrl = canvas.toDataURL('image/png');
      const reportId = String(compiledResult?.reportId || compiledResult?.id || 'audit').replace(/[^A-Za-z0-9_-]/g, '-');
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = `${reportId}-QR.png`;
      link.click();
      setQrActionMessage('Saved the audit report QR image.');
    } catch (error) {
      setCompileError(error.message || 'Unable to save the QR image.');
    } finally {
      setIsSavingQr(false);
    }
  };

  const copyReportReference = async () => {
    const reportId = compiledResult?.reportId || compiledResult?.id;
    if (!reportId) return;
    try {
      await navigator.clipboard.writeText(reportId);
      setQrActionMessage('Report ID copied. This short reference requires an online SRA lookup.');
    } catch {
      setCompileError('The browser could not copy the report ID.');
    }
  };

  const footer = step === 1 ? (
    <>
      <Button variant="secondary" size="md" onClick={handleClose} disabled={isCompiling}>
        Cancel
      </Button>
      <Button
        variant="primary"
        size="md"
        onClick={handleCompile}
        disabled={isCompiling || isLoadingPeriod || eligibleLogs.length === 0 || compilationBlockedByActiveReport || compilationBlockedByIncompleteFields}
        isLoading={isCompiling}
        loadingText="Compiling report..."
        icon={FileCheck2}
      >
        Compile Report
      </Button>
    </>
  ) : step === 2 && !deliveryMessage ? (
    <div className="grid w-full grid-cols-1 sm:grid-cols-3 gap-2">
      <Button variant="secondary" size="md" onClick={handleClose} disabled={isBusy} icon={FileCheck2}>
        View Report
      </Button>
      <Button variant="primary" size="md" onClick={handleCloudSubmission} disabled={isCompiling || isSubmitting || isPreparingQr} isLoading={isSubmitting} loadingText="Submitting report..." icon={CloudUpload}>
        Send Through Cloud
      </Button>
      <Button variant="primary" size="md" onClick={handleGenerateQr} disabled={isCompiling || isSubmitting || isPreparingQr} isLoading={isPreparingQr} loadingText="Preparing QR transfer..." icon={QrCode}>
        Generate QR Transfer
      </Button>
    </div>
  ) : (
    <Button variant="primary" size="md" className="w-full justify-center" onClick={handleClose} disabled={isBusy}>Done</Button>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={step === 1 ? 'Compile Monthly SRA Audit Dossier' : step === 2 ? 'Choose Report Delivery' : 'QR Audit Transfer'}
      size="lg"
      footer={footer}
      preventBackdropClose={isCompiling || isSubmitting || isPreparingQr}
      preventEscapeClose={isCompiling || isSubmitting || isPreparingQr}
      isLoading={isBusy}
    >
      {isBusy && (
        <div
          role="status"
          aria-live="polite"
          className="flex items-center gap-3 rounded-xl border border-primary/25 bg-primary-bg/50 px-3.5 py-3 text-primary dark:text-primary-light"
        >
          <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />
          <div>
            <p className="text-xs font-black">
              {isCompiling
                ? `Compiling ${eligibleLogs.length} operation record(s)...`
                : isSubmitting
                  ? 'Submitting the report to the SRA Audit Inbox...'
                  : isPreparingQr
                    ? 'Preparing the complete QR transfer package...'
                    : 'Generating and saving the QR image...'}
            </p>
            <p className="mt-0.5 text-[10px] font-semibold text-hug-muted">Keep this dialog open until the action is confirmed.</p>
          </div>
        </div>
      )}
      {step === 1 ? (
        <div className="flex flex-col gap-4 text-xs">
          {/* Header Context Banner */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-bg p-3.5 rounded-xl border border-border">
            <div>
              <span className="block font-bold text-hug-text text-sm">
                Active Crop Year Cycle Audit Batch
              </span>
              <p className="text-[11px] text-hug-muted mt-0.5">
                Automatically prepares the oldest unresolved monthly Block Farm audit.
              </p>
            </div>

            <div className="w-full sm:w-56 shrink-0 rounded-xl border border-border bg-white dark:bg-surface px-3 py-2">
              <span className="block text-[10px] uppercase font-bold text-hug-muted">Reporting Period</span>
              <span className="block text-sm font-bold text-hug-text">
                {isLoadingPeriod ? 'Detecting...' : new Date(`${selectedPeriod}-01T00:00:00`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
              </span>
              {periodInfo?.isCarryover && <span className="text-[10px] font-semibold text-amber-700">Oldest unresolved month</span>}
            </div>
          </div>

          {/* Error Banner */}
          {compileError && (
            <div className="p-3 bg-danger-bg dark:bg-danger/20 text-danger border border-danger/30 rounded-xl flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span className="flex-1 font-semibold">{compileError}</span>
            </div>
          )}

          {/* Status Message */}
          <div className="px-3 py-2 rounded-xl bg-primary-bg/30 dark:bg-primary/10 border border-primary/20 text-hug-text flex items-center justify-between">
            <span className="font-semibold text-[11px]">
              {compilationBlockedByActiveReport
                ? (latestStatus === AUDIT_STATUS.PENDING_REVIEW
                  ? `The ${selectedPeriod} report is awaiting SRA review.`
                  : `The ${selectedPeriod} report is compiled and ready to submit.`)
                : eligibleLogs.length > 0
                ? `${eligibleLogs.length} synchronized operation record(s) ready for the ${selectedPeriod} audit report.`
                : matchingMonthLogs.length > 0
                ? `All operations for ${selectedPeriod} are already included in an audit report.`
                : `No ACTIVE operations are recorded for ${selectedPeriod}.`}
            </span>
            <span className="text-[10px] font-mono text-primary dark:text-primary-light font-bold">
              {blockFarm?.name || blockFarm?.id || 'Assigned Farm'}
            </span>
          </div>

          {compilationBlockedByIncompleteFields && (
            <div className="rounded-xl border border-amber-500/35 bg-amber-500/10 p-3">
              <div className="mb-2 flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-400" />
                <div>
                  <p className="font-black text-hug-text">Member submissions still needed</p>
                  <p className="mt-0.5 text-[11px] text-hug-muted">
                    Contact these members and ask them to submit and synchronize their {selectedPeriod} operation before compiling.
                  </p>
                </div>
              </div>
              <div className="space-y-2">
                {incompleteFields.map(item => (
                  <div key={item.fieldId} className="flex flex-col gap-2 rounded-lg border border-border bg-surface px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-black text-hug-text">{item.memberName || 'Unassigned member'}</p>
                      <p className="text-[11px] text-hug-muted">Field {item.fieldId} · {item.contactNumber || 'No contact number available'}</p>
                    </div>
                    {item.contactNumber ? (
                      <a
                        href={`tel:${String(item.contactNumber).replace(/[^+\d]/g, '')}`}
                        className="inline-flex shrink-0 items-center justify-center rounded-lg border border-primary/30 bg-primary-bg px-3 py-2 text-[11px] font-black text-primary hover:bg-primary/15 dark:text-primary-light"
                      >
                        Contact Member
                      </a>
                    ) : (
                      <span className="shrink-0 text-[10px] font-bold text-amber-700 dark:text-amber-400">Update member contact</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Summary Metric Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="p-3 bg-bg rounded-xl border border-border">
              <span className="text-[10px] uppercase font-bold text-hug-muted block">Block Farm</span>
              <span className="text-xs font-bold text-hug-text block mt-0.5 truncate" title={blockFarm?.name}>
                {blockFarm?.name || 'Unassigned'}
              </span>
              <span className="text-[10px] text-hug-muted font-mono">{blockFarm?.id || '—'}</span>
            </div>

            <div className="p-3 bg-bg rounded-xl border border-border">
              <span className="text-[10px] uppercase font-bold text-hug-muted block">Area Audited</span>
              <span className="text-xs font-black text-hug-text block mt-0.5">
                {totalAreaHa.toFixed(2)} Ha
              </span>
              <span className="text-[10px] text-hug-muted">{auditedPlotsCount} Farm Member Fields</span>
            </div>

            <div className="p-3 bg-bg rounded-xl border border-border">
              <span className="text-[10px] uppercase font-bold text-hug-muted block">Operation Logs</span>
              <span className="text-xs font-black text-hug-text block mt-0.5">
                {eligibleLogs.length} Records
              </span>
              <span className="text-[10px] text-primary dark:text-primary-light font-semibold">100% Active</span>
            </div>

            <div className="p-3 bg-primary-bg/30 dark:bg-primary/10 rounded-xl border border-primary/20">
              <span className="text-[10px] uppercase font-bold text-primary dark:text-primary-light block">
                Total Expenditure
              </span>
              <span className="text-xs font-black text-primary dark:text-primary-light block mt-0.5">
                ₱{Number(compiledResult?.totalCost ?? totalExpenditure).toLocaleString()}
              </span>
              <span className="text-[10px] text-hug-muted font-mono">PHP Direct</span>
            </div>
          </div>

          {/* Stage Expenditure Breakdown Table */}
          {eligibleLogs.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <span className="font-bold text-hug-text text-xs uppercase tracking-wider">
                  Agronomic Stage Expenditure Breakdown
                </span>
                <span className="text-[10px] text-hug-muted">SRA S1–S6 Standard Schedule</span>
              </div>

              <div className="border border-border rounded-xl overflow-hidden max-h-40 overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-bg text-hug-muted uppercase text-[10px] font-bold border-b border-border">
                    <tr>
                      <th className="px-3 py-1.5">Stage</th>
                      <th className="px-3 py-1.5 text-center">Logs</th>
                      <th className="px-3 py-1.5 text-right">Cost</th>
                      <th className="px-3 py-1.5 text-right">% of Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60 text-hug-text">
                    {[1, 2, 3, 4, 5, 6].map(st => {
                      const data = stageBreakdown[st] || { count: 0, cost: 0 };
                      if (data.count === 0) return null;
                      const pct = totalExpenditure > 0 ? ((data.cost / totalExpenditure) * 100).toFixed(1) : '0.0';
                      return (
                        <tr key={st} className="hover:bg-bg/40">
                          <td className="px-3 py-1.5 font-semibold">Stage {st}</td>
                          <td className="px-3 py-1.5 text-center font-mono">{data.count}</td>
                          <td className="px-3 py-1.5 text-right font-mono">₱{data.cost.toLocaleString()}</td>
                          <td className="px-3 py-1.5 text-right font-mono text-hug-muted">{pct}%</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Compliance Notice Banner */}
          <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="text-[11px] text-hug-text leading-relaxed">
              <strong className="font-bold block mb-0.5">
                Official Regulatory Submission Notice:
              </strong>
              Compiling creates an immutable monthly snapshot for review. It is <strong>not delivered</strong> until you choose Cloud Submission or QR Transfer.
            </div>
          </div>
        </div>
      ) : step === 2 ? (
        <div className="flex flex-col items-center text-center gap-4 py-2">
          <div className="w-14 h-14 rounded-full bg-primary/10 text-primary dark:text-primary-light border border-primary/20 flex items-center justify-center shadow-xs">
            <CheckCircle2 className="w-7 h-7" />
          </div>

          <div>
            <h4 className="text-base font-bold text-hug-text">
              Compiled Report Ready
            </h4>
            <p className="text-xs text-hug-muted mt-0.5 max-w-sm">
              The canonical report is saved. Choose Cloud Submission or QR Transfer to deliver this same report to SRA.
            </p>
          </div>

          {/* Result Statistics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 w-full text-center text-xs">
            <div className="p-2 rounded-xl bg-bg border border-border">
              <span className="text-[10px] text-hug-muted block">Period</span>
              <span className="font-bold text-hug-text">{compiledResult?.periodKey || selectedPeriod}</span>
            </div>
            <div className="p-2 rounded-xl bg-bg border border-border">
              <span className="text-[10px] text-hug-muted block">Fields</span>
              <span className="font-bold text-hug-text">{compiledResult?.fieldCount || 0}</span>
            </div>
            <div className="p-2 rounded-xl bg-bg border border-border">
              <span className="text-[10px] text-hug-muted block">Operations</span>
              <span className="font-bold text-hug-text">
                {compiledResult?.operationCount || compiledResult?.operationSnapshots?.length || 0} Logs
              </span>
            </div>
            <div className="p-2 rounded-xl bg-bg border border-border">
              <span className="text-[10px] text-hug-muted block">Total Cost</span>
              <span className="font-bold text-primary dark:text-primary-light">
                ₱{Number(compiledResult?.totalCost ?? totalExpenditure).toLocaleString()}
              </span>
            </div>
          </div>
          {compileError && <div className="w-full p-3 bg-danger-bg text-danger border border-danger/30 rounded-xl text-xs font-semibold">{compileError}</div>}
          {deliveryMessage && <div className="w-full p-3 bg-primary-bg text-primary border border-primary/30 rounded-xl text-xs font-semibold">{deliveryMessage}</div>}
        </div>
      ) : (
        <div className="flex flex-col items-center text-center gap-4 py-2">
          <div>
            <h4 className="text-base font-bold text-hug-text">
              Audit Report QR
            </h4>
            <p className="text-xs text-hug-muted mt-1 max-w-md">
              Scan this code once on the SRA device. The authoritative report will be securely retrieved from the server.
            </p>
          </div>
          <div className="bg-bg p-4 rounded-2xl border border-border flex flex-col items-center gap-3 w-full max-w-sm">
            <div className="w-full overflow-hidden rounded-2xl border border-[#BCD5C0] bg-[#F8FBF6] shadow-sm">
              <div className="flex items-center gap-3 bg-[#173D24] px-4 py-3 text-left">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#9EE493] text-lg font-black text-[#173D24]">H</div>
                <div className="min-w-0 flex-1">
                  <p className="text-lg font-black tracking-[0.18em] text-white">HUGPONG</p>
                  <p className="text-[9px] font-extrabold tracking-[0.14em] text-[#BFE5B9]">OFFICIAL AUDIT TRANSFER</p>
                </div>
                <FileCheck2 className="h-6 w-6 text-[#9EE493]" aria-hidden="true" />
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-2 px-4 pt-3 text-left">
                <div className="col-span-2">
                  <p className="text-[8px] font-black tracking-wider text-hug-muted">FARM MANAGER</p>
                  <p className="truncate text-xs font-extrabold text-hug-text">{compiledResult?.compiledByName || compiledResult?.compiledByUserId || 'Farm Manager'}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-[8px] font-black tracking-wider text-hug-muted">BLOCK FARM</p>
                  <p className="truncate text-xs font-extrabold text-hug-text">{compiledResult?.blockFarmName || blockFarm?.name || compiledResult?.blockFarmId || 'Not specified'}</p>
                </div>
                <div>
                  <p className="text-[8px] font-black tracking-wider text-hug-muted">REPORTING MONTH</p>
                  <p className="truncate text-[11px] font-bold text-hug-text">{compiledResult?.periodKey || selectedPeriod}</p>
                </div>
                <div>
                  <p className="text-[8px] font-black tracking-wider text-hug-muted">CROP YEAR CYCLE</p>
                  <p className="truncate text-[11px] font-bold text-hug-text">{compiledResult?.cropYearCycle || compiledResult?.cropYearCycles?.join(', ') || 'Not specified'}</p>
                </div>
              </div>
              <div className="mx-auto mt-3 w-fit rounded-2xl border border-[#DCE7DA] bg-white p-1">
                <QRCodeView value={qrPayload} size={238} color="#000000" bgColor="#FFFFFF" className="border-0 p-0 shadow-none" />
              </div>
              <div className="px-4 pb-3 pt-2 text-center">
                <strong className="inline-flex rounded-full bg-[#EAF5E7] px-3 py-1 text-[8px] font-black tracking-wider text-[#2F6B3B]">SECURE SERVER-VERIFIED REFERENCE</strong>
                <p className="mt-1.5 break-all font-mono text-[9px] font-bold text-hug-muted">{compiledResult?.reportId || compiledResult?.id}</p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full">
              <Button variant="secondary" size="sm" icon={Download} onClick={downloadCurrentQr} isLoading={isSavingQr} loadingText="Saving QR image...">Save QR Image</Button>
              <Button variant="secondary" size="sm" icon={Copy} onClick={copyReportReference} disabled={isSavingQr}>Copy Report ID</Button>
              {canonicalAuditStatus(compiledResult?.status) === AUDIT_STATUS.COMPILED && (
                <Button className="sm:col-span-2" variant="primary" size="sm" icon={CloudUpload} onClick={handleCloudSubmission} isLoading={isSubmitting} loadingText="Sending through Cloud..." disabled={isPreparingQr || isSavingQr}>
                  Send Through Cloud Instead
                </Button>
              )}
            </div>
            {qrActionMessage && <p className="text-[10px] text-success">{qrActionMessage}</p>}
            {compileError && <p className="text-[10px] text-danger">{compileError}</p>}
          </div>
        </div>
      )}
    </Modal>
  );
}
