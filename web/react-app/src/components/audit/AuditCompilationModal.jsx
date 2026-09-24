import React, { useState, useMemo } from 'react';
import {
  FileCheck2,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  Layers,
  ArrowRight,
  ShieldCheck
} from 'lucide-react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Select from '../ui/Select';
import QRCodeView from './QRCodeView';
import { compileAuditReport } from '../../services/auditService';

export default function AuditCompilationModal({
  isOpen = false,
  onClose,
  blockFarm = null,
  fields = [],
  operations = [],
  existingReports = [],
  onSuccess
}) {
  const [step, setStep] = useState(1); // 1 = setup/preview, 2 = success
  const [selectedPeriod, setSelectedPeriod] = useState(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  });
  const [isCompiling, setIsCompiling] = useState(false);
  const [compileError, setCompileError] = useState(null);
  const [compiledResult, setCompiledResult] = useState(null);

  // Generate period options (Current month + last 5 months)
  const periodOptions = useMemo(() => {
    const list = [];
    const now = new Date();
    for (let i = 0; i < 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      list.push({
        value: val,
        label: i === 0 ? `${label} (Current Month)` : label
      });
    }
    return list;
  }, []);

  // Pre-flight calculation for eligible logs
  const farmFieldIds = useMemo(() => {
    if (!blockFarm?.id) return new Set();
    return new Set(fields.filter(f => f.blockFarmId === blockFarm.id).map(f => f.id));
  }, [blockFarm, fields]);

  // Already compiled log IDs for this farm and period
  const alreadyCompiledIds = useMemo(() => {
    if (!blockFarm?.id) return new Set();
    const periodReports = existingReports.filter(
      r => r.blockFarmId === blockFarm.id && r.period === selectedPeriod
    );
    const ids = new Set();
    periodReports.forEach(r => {
      const logs = Array.isArray(r.operationSnapshots) ? r.operationSnapshots : [];
      logs.forEach(item => ids.add(item.operationLogId || item.id));
    });
    return ids;
  }, [blockFarm, existingReports, selectedPeriod]);

  // Active logs belonging to this block farm and matching the selected period
  const matchingMonthLogs = useMemo(() => {
    return operations.filter(log => {
      if (!farmFieldIds.has(log.fieldId)) return false;
      if (log.status !== 'ACTIVE') return false;
      const performed = String(log.performedOn || log.isoDate || log.date || '');
      return performed.startsWith(`${selectedPeriod}-`);
    });
  }, [operations, farmFieldIds, selectedPeriod]);

  // Filter out any logs that were already submitted in a previous audit report for this period
  const eligibleLogs = useMemo(() => {
    return matchingMonthLogs.filter(log => !alreadyCompiledIds.has(log.id));
  }, [matchingMonthLogs, alreadyCompiledIds]);

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
    if (!blockFarm?.id) {
      setCompileError('No assigned Block Farm identified for your account.');
      return;
    }
    if (eligibleLogs.length === 0) {
      setCompileError(`Cannot compile: No uncompiled ACTIVE operations found for ${selectedPeriod}.`);
      return;
    }

    setIsCompiling(true);
    setCompileError(null);

    try {
      const response = await compileAuditReport({
        blockFarmId: blockFarm.id,
        period: selectedPeriod,
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
      console.error('[AuditCompilation] Error:', err);
      setCompileError(err.message || 'Failed to compile audit report. Please try again.');
    } finally {
      setIsCompiling(false);
    }
  };

  const handleClose = () => {
    setStep(1);
    setCompileError(null);
    setCompiledResult(null);
    onClose();
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
        disabled={isCompiling || eligibleLogs.length === 0}
        isLoading={isCompiling}
        loadingText="Compiling report..."
        icon={FileCheck2}
      >
        Compile Report
      </Button>
    </>
  ) : (
    <Button
      variant="primary"
      size="md"
      className="w-full justify-center"
      onClick={handleClose}
      icon={ArrowRight}
    >
      Done / View in Audit Queue
    </Button>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={step === 1 ? 'Compile Monthly SRA Audit Dossier' : 'Audit Report Successfully Compiled'}
      size="lg"
      footer={footer}
      preventBackdropClose={isCompiling}
      preventEscapeClose={isCompiling}
    >
      {step === 1 ? (
        <div className="flex flex-col gap-4 text-xs">
          {/* Header Context Banner */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-bg p-3.5 rounded-xl border border-border">
            <div>
              <span className="block font-bold text-hug-text text-sm">
                Active Crop Year Cycle Audit Batch
              </span>
              <p className="text-[11px] text-hug-muted mt-0.5">
                Automatically bundles all uncompiled ACTIVE operations into an immutable SRA QR dossier.
              </p>
            </div>

            <div className="w-full sm:w-56 shrink-0">
              <label htmlFor="compile-period-select" className="sr-only">Report Month</label>
              <Select
                id="compile-period-select"
                value={selectedPeriod}
                onChange={(e) => setSelectedPeriod(e.target.value)}
                options={periodOptions}
                disabled={isCompiling}
              />
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
              {eligibleLogs.length > 0
                ? `${eligibleLogs.length} ACTIVE operation record(s) ready for the ${selectedPeriod} audit report.`
                : matchingMonthLogs.length > 0
                ? `All operations for ${selectedPeriod} are already included in an audit report.`
                : `No ACTIVE operations are recorded for ${selectedPeriod}.`}
            </span>
            <span className="text-[10px] font-mono text-primary dark:text-primary-light font-bold">
              {blockFarm?.name || blockFarm?.id || 'Assigned Farm'}
            </span>
          </div>

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
              <span className="text-[10px] text-hug-muted">{auditedPlotsCount} Member Plots</span>
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
                ₱{totalExpenditure.toLocaleString()}
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
              Compiling this monthly package produces a cryptographically sealed SRA QR envelope, generates an immutable audit hash, and sends the dossier directly to the <strong>SRA District Cloud Audit Queue</strong> for regulatory certification.
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center text-center gap-4 py-2">
          <div className="w-14 h-14 rounded-full bg-primary/10 text-primary dark:text-primary-light border border-primary/20 flex items-center justify-center shadow-xs">
            <CheckCircle2 className="w-7 h-7" />
          </div>

          <div>
            <h4 className="text-base font-bold text-hug-text">
              Monthly Operations Audit Compiled!
            </h4>
            <p className="text-xs text-hug-muted mt-0.5 max-w-sm">
              Package sealed with cryptographic signature and queued for SRA District review.
            </p>
          </div>

          {/* QR Code and Hash Envelope */}
          <div className="bg-bg p-4 rounded-2xl border border-border flex flex-col items-center gap-3 w-full max-w-xs shadow-2xs">
            <QRCodeView
              value={compiledResult?.qrHash || compiledResult?.id}
              size={150}
              className="p-2"
            />

            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-hug-muted font-bold uppercase">Audit Hash:</span>
              <code className="font-mono text-xs font-bold text-primary dark:text-primary-light bg-primary-bg dark:bg-primary/20 px-2 py-0.5 rounded">
                {compiledResult?.qrHash || compiledResult?.id}
              </code>
            </div>

            <span className="text-[10px] text-hug-muted">
              Scan with SRA Mobile App or Officer Tablet for zero-network validation
            </span>
          </div>

          {/* Result Statistics */}
          <div className="grid grid-cols-3 gap-2 w-full max-w-xs text-center text-xs">
            <div className="p-2 rounded-xl bg-bg border border-border">
              <span className="text-[10px] text-hug-muted block">Period</span>
              <span className="font-bold text-hug-text">{compiledResult?.period || selectedPeriod}</span>
            </div>
            <div className="p-2 rounded-xl bg-bg border border-border">
              <span className="text-[10px] text-hug-muted block">Operations</span>
              <span className="font-bold text-hug-text">
                {compiledResult?.operationSnapshots?.length || eligibleLogs.length} Logs
              </span>
            </div>
            <div className="p-2 rounded-xl bg-bg border border-border">
              <span className="text-[10px] text-hug-muted block">Total Cost</span>
              <span className="font-bold text-primary dark:text-primary-light">
                ₱{totalExpenditure.toLocaleString()}
              </span>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
