import React, { useState } from 'react';
import {
  FileText,
  Printer,
  ShieldCheck,
  Calendar,
  Building,
  User,
  Hash,
  CheckCircle2,
  Clock,
  QrCode
} from 'lucide-react';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import ConfirmDialog from '../ui/ConfirmDialog';
import Textarea from '../ui/Textarea';
import { AUDIT_STATUS, auditStatusLabel, canonicalAuditStatus } from '../../domain/auditWorkflow';

export default function AuditDossierCard({
  report = null,
  blockFarms = [],
  currentUser = null,
  onCertify,
  onReturn,
  onSubmit,
  onPrint,
  isCertifying = false,
  isReturning = false,
  isSubmitting = false,
  className = ''
}) {
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [certificationNotes, setCertificationNotes] = useState('');
  const [returnReason, setReturnReason] = useState('');

  // Check role authorization: ONLY SRA_ADMIN has certification authority
  const userRole = (currentUser?.canonicalRole || currentUser?.role || '').toUpperCase().replace(/[\s-]+/g, '_');
  const isSraAdmin = userRole === 'SRA_ADMIN';

  if (!report) {
    return (
      <div
        className={`bg-white dark:bg-surface rounded-2xl border-2 border-dashed border-border p-10 sm:p-14 flex flex-col items-center justify-center text-center min-h-[440px] shadow-xs ${className}`}
      >
        <div className="w-16 h-16 rounded-2xl bg-bg dark:bg-[#0C1015] border border-border flex items-center justify-center text-hug-muted mb-4">
          <FileText className="w-8 h-8" />
        </div>
        <h4 className="text-base font-bold text-hug-text mb-1.5">
          Awaiting Audit Validation
        </h4>
        <p className="text-xs sm:text-sm text-hug-muted max-w-sm leading-relaxed">
          Select an Audit Inbox item, a compiled report, or a certified History item to review its immutable snapshot.
        </p>
      </div>
    );
  }

  const status = canonicalAuditStatus(report.status);
  const isCertified = status === AUDIT_STATUS.CERTIFIED;
  const isPendingReview = status === AUDIT_STATUS.PENDING_REVIEW;
  const isCompiled = status === AUDIT_STATUS.COMPILED || status === AUDIT_STATUS.PENDING_SUBMISSION;
  const farm = blockFarms.find(f => f.id === report.blockFarmId);
  const farmName = farm?.name || report.blockFarmName || report.blockFarmId || 'District Block Farm';

  // Operation snapshots from canonical schema
  const operationLogs = Array.isArray(report.operationSnapshots)
    ? report.operationSnapshots
    : (Array.isArray(report.operations) ? report.operations : []);

  // Compute metrics from actual snapshots
  const totalLogs = operationLogs.length;
  const totalCost = operationLogs.reduce((sum, item) => sum + Number(item.totalCost || item.cost || 0), 0);

  // Compute audited hectares by distinct field plot
  const fieldAreas = new Map();
  operationLogs.forEach(log => {
    if (log.fieldId) {
      fieldAreas.set(log.fieldId, Math.max(fieldAreas.get(log.fieldId) || 0, Number(log.areaHa || 0)));
    }
  });
  const totalAreaHa = Array.from(fieldAreas.values()).reduce((sum, ha) => sum + ha, 0);

  const formatCurrency = (amount) => `₱${Number(amount || 0).toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;

  const formatDate = (isoString) => {
    if (!isoString) return '—';
    try {
      const d = new Date(isoString);
      return isNaN(d.getTime()) ? isoString : d.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });
    } catch {
      return isoString;
    }
  };

  const handleConfirmCertify = async () => {
    if (!onCertify) return;
    try {
      await onCertify(report.id || report.reportId, certificationNotes);
      setShowConfirmModal(false);
      setCertificationNotes('');
    } catch (err) {
      console.error('[AuditDossier] Certification error:', err);
    }
  };

  return (
    <div className={`bg-surface rounded-2xl border border-border p-6 sm:p-8 shadow-xs flex flex-col gap-6 text-left ${className}`}>
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b-2 border-primary pb-5">
        <div className="flex items-start gap-3.5">
          <div className="w-[72px] h-[72px] shrink-0 hidden sm:flex items-center justify-center rounded-xl border border-border bg-bg text-primary" title="Use Generate QR Transfer to display every report part">
            <QrCode className="w-8 h-8" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg sm:text-xl font-black text-primary dark:text-primary-light uppercase tracking-wide">
                {isCertified ? 'SRA Audit Certificate' : isPendingReview ? 'Audit Review' : 'Monthly Regulatory Audit'}
              </h3>
            </div>
            <p className="text-xs font-semibold text-hug-muted uppercase tracking-wider mt-0.5">
              Sugar Regulatory Administration · Silay Block Farm Auditor
            </p>
            <p className="text-xs text-hug-muted mt-1">
              Monthly Agronomic Compliance & Verification Dossier
            </p>
          </div>
        </div>

        <div className="shrink-0">
          <Badge
            variant={isCertified ? 'success' : 'warning'}
            size="md"
            className="font-bold uppercase tracking-wider px-3.5 py-1.5"
          >
            {isCertified ? (
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-success" />
                Fully Certified
              </span>
            ) : (
              <span className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                {auditStatusLabel(status)}
              </span>
            )}
          </Badge>
        </div>
      </div>

      {/* Metadata Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-bg border border-border rounded-xl p-4">
        <div>
          <span className="text-[10px] text-hug-muted uppercase font-bold tracking-wider block mb-1 flex items-center gap-1">
            <Hash className="w-3 h-3" /> Verification ID
          </span>
          <p className="text-xs sm:text-sm font-black text-hug-text font-mono truncate" title={report.qrHash || report.id}>
            {report.qrHash || report.id}
          </p>
        </div>

        <div>
          <span className="text-[10px] text-hug-muted uppercase font-bold tracking-wider block mb-1 flex items-center gap-1">
            <Building className="w-3 h-3" /> Block Farm
          </span>
          <p className="text-xs sm:text-sm font-bold text-hug-text truncate" title={farmName}>
            {farmName}
          </p>
        </div>

        <div>
          <span className="text-[10px] text-hug-muted uppercase font-bold tracking-wider block mb-1 flex items-center gap-1">
            <User className="w-3 h-3" /> Compiled By
          </span>
          <p className="text-xs sm:text-sm font-bold text-hug-text truncate" title={report.compiledByUserId}>
            {report.compiledByName || report.compiledByUserId || 'Farm Manager'}
          </p>
        </div>

        <div>
          <span className="text-[10px] text-hug-muted uppercase font-bold tracking-wider block mb-1 flex items-center gap-1">
            <Calendar className="w-3 h-3" /> {isCertified ? 'Certified On' : 'Compiled On'}
          </span>
          <p className="text-xs sm:text-sm font-bold text-hug-text">
            {formatDate(isCertified ? report.certifiedAt : report.compiledAt)}
          </p>
        </div>
      </div>

      {/* KPI Metrics Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-surface border border-border rounded-xl p-3.5 shadow-2xs">
          <span className="text-[10px] text-hug-muted uppercase font-semibold block mb-1">
            Compiled Logs
          </span>
          <strong className="text-lg sm:text-xl font-black text-hug-text">
            {totalLogs} Records
          </strong>
        </div>

        <div className="bg-surface border border-border rounded-xl p-3.5 shadow-2xs">
          <span className="text-[10px] text-hug-muted uppercase font-semibold block mb-1">
            Certification
          </span>
          <strong className={`text-lg sm:text-xl font-black ${isCertified ? 'text-primary dark:text-primary-light' : 'text-amber-600 dark:text-amber-400'}`}>
            {isCertified ? 'Certified' : isPendingReview ? 'Awaiting Review' : auditStatusLabel(status)}
          </strong>
        </div>

        <div className="bg-surface border border-border rounded-xl p-3.5 shadow-2xs">
          <span className="text-[10px] text-hug-muted uppercase font-semibold block mb-1">
            Hectares Audited
          </span>
          <strong className="text-lg sm:text-xl font-black text-hug-text">
            {totalAreaHa.toFixed(2)} Ha
          </strong>
        </div>

        <div className="bg-surface border border-border rounded-xl p-3.5 shadow-2xs">
          <span className="text-[10px] text-hug-muted uppercase font-semibold block mb-1">
            Certified Cost
          </span>
          <strong className="text-lg sm:text-xl font-black text-primary dark:text-primary-light">
            ₱{totalCost.toLocaleString()}
          </strong>
        </div>
      </div>

      {/* Operations Ledger Table */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h4 className="text-xs font-bold text-hug-text uppercase tracking-wider">
            SRA Monthly Operations Schedule ({report.period || report.month})
          </h4>
          <span className="text-[11px] text-hug-muted font-mono">
            {operationLogs.length} verified items
          </span>
        </div>

        <div className="border border-border rounded-xl overflow-hidden overflow-x-auto max-h-[380px] overflow-y-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead className="bg-bg dark:bg-[#0C1015] sticky top-0 border-b border-border text-hug-muted font-bold uppercase text-[10px] tracking-wider z-10">
              <tr>
                <th className="px-3 py-2.5 text-center w-10">No.</th>
                <th className="px-3 py-2.5">Operation</th>
                <th className="px-3 py-2.5 text-right">Plot Area</th>
                <th className="px-3 py-2.5 text-right">Qty</th>
                <th className="px-3 py-2.5 text-center">Unit</th>
                <th className="px-3 py-2.5 text-right">Unit Cost</th>
                <th className="px-3 py-2.5 text-right">Total Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60 text-hug-text">
              {operationLogs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-hug-muted text-xs font-semibold">
                    No recorded operations in this compiled batch.
                  </td>
                </tr>
              ) : (
                operationLogs.map((log, idx) => {
                  const logCost = Number(log.totalCost != null ? log.totalCost : (log.cost || 0));
                  const opName = log.operationName || `Operation ${idx + 1}`;
                  const itemHa = log.areaHa ? `${Number(log.areaHa).toFixed(2)} ha` : `${totalAreaHa.toFixed(2)} ha`;
                  const hasChildren = Array.isArray(log.lineItems) && log.lineItems.length > 0;

                  if (hasChildren) {
                    return (
                      <React.Fragment key={log.operationLogId || log.id || idx}>
                        <tr className="bg-bg font-bold border-b border-border">
                          <td className="px-3 py-2.5 text-center text-primary font-black">{idx + 1}</td>
                          <td className="px-3 py-2.5 uppercase tracking-wide">
                            <span>{opName}</span>
                            <span className="text-[10px] font-bold px-1.5 py-0.5 bg-primary/10 text-primary dark:text-primary-light rounded ml-2">
                              Group ({log.lineItems.length} items)
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono text-hug-muted">{itemHa}</td>
                          <td className="px-3 py-2.5 text-right font-mono text-hug-muted">—</td>
                          <td className="px-3 py-2.5 text-center text-hug-muted font-semibold">—</td>
                          <td className="px-3 py-2.5 text-right font-mono text-hug-muted font-semibold">—</td>
                          <td className="px-3 py-2.5 text-right font-mono text-primary font-black">
                            {formatCurrency(logCost)}
                          </td>
                        </tr>
                        {log.lineItems.map((si, cIdx) => {
                          const childQty = si.quantity != null ? si.quantity : '1';
                          const childUnit = si.unit || 'ha';
                          const childUnitCost = Number(si.unitCost || (Number(si.subtotal || 0) / Math.max(parseFloat(childQty) || 1, 0.1)) || 0);
                          const childSubTotal = Number(si.subtotal != null ? si.subtotal : (Number(childQty) * childUnitCost));
                          return (
                            <tr key={`${log.id || idx}-sub-${cIdx}`} className="bg-surface border-b border-border/40 hover:bg-bg/40">
                              <td className="px-3 py-2 text-center text-[11px] font-mono text-hug-muted">
                                {idx + 1}.{cIdx + 1}
                              </td>
                              <td className="px-3 py-2 text-xs text-hug-muted pl-6 font-medium">
                                ↳ {si.description || si.name || `Item ${cIdx + 1}`}
                              </td>
                              <td className="px-3 py-2 text-right font-mono text-xs text-hug-muted">{itemHa}</td>
                              <td className="px-3 py-2 text-right font-mono text-xs text-hug-text font-semibold">{childQty}</td>
                              <td className="px-3 py-2 text-center text-xs text-hug-muted font-medium">{childUnit}</td>
                              <td className="px-3 py-2 text-right font-mono text-xs text-hug-text font-medium">
                                {formatCurrency(childUnitCost)}
                              </td>
                              <td className="px-3 py-2 text-right font-mono text-xs text-hug-text font-bold">
                                {formatCurrency(childSubTotal)}
                              </td>
                            </tr>
                          );
                        })}
                      </React.Fragment>
                    );
                  }

                  // Direct operation row
                  const logQty = log.quantity?.value || '1';
                  const logUnit = log.quantity?.unit || 'ha';
                  const logUnitCost = Number(log.unitCost || (logCost / Math.max(parseFloat(logQty) || 1, 0.1)));

                  return (
                    <tr key={log.operationLogId || log.id || idx} className="bg-surface border-b border-border/60 hover:bg-bg/40">
                      <td className="px-3 py-2.5 text-center font-bold text-primary">{idx + 1}</td>
                      <td className="px-3 py-2.5 font-bold">{opName}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-hug-muted">{itemHa}</td>
                      <td className="px-3 py-2.5 text-right font-mono font-semibold">{logQty}</td>
                      <td className="px-3 py-2.5 text-center text-hug-muted font-medium">{logUnit}</td>
                      <td className="px-3 py-2.5 text-right font-mono font-medium">
                        {formatCurrency(logUnitCost)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono font-black text-hug-text">
                        {formatCurrency(logCost)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {operationLogs.length > 0 && (
              <tfoot>
                <tr className="bg-primary-bg/20 dark:bg-primary/10 font-black border-t-2 border-primary">
                  <td colSpan={6} className="px-3 py-3 text-right text-xs uppercase tracking-wider text-primary dark:text-primary-light">
                    Total Verified Cost ({report.period || report.month}):
                  </td>
                  <td className="px-3 py-3 text-right font-mono text-sm text-primary dark:text-primary-light font-black">
                    {formatCurrency(totalCost)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Footer & Actions */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-t border-border pt-5">
        <div className="flex items-center gap-2 text-xs text-hug-muted">
          <ShieldCheck className="w-4 h-4 text-primary shrink-0" />
          <span>
            {isCertified
              ? `Officially certified by SRA Admin on ${formatDate(report.certifiedAt)}.`
              : isPendingReview ? 'Integrity-protected snapshot awaiting authorized SRA review.' : 'Compiled snapshot saved and ready for Farm Manager submission.'}
          </span>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {/* SRA Admin Digital Seal Action */}
          {isSraAdmin && (
            isCertified ? (
              <div className="flex items-center gap-1.5 bg-primary-bg text-primary dark:text-primary-light border border-primary/30 px-3.5 py-2 rounded-xl text-xs font-bold shadow-2xs">
                <CheckCircle2 className="w-4 h-4 text-primary dark:text-primary-light" />
                <span>✓ SRA Digital Seal Applied</span>
              </div>
            ) : isPendingReview ? (
              <Button
                variant="primary"
                size="md"
                onClick={() => setShowConfirmModal(true)}
                isLoading={isCertifying}
                loadingText="Certifying..."
                icon={ShieldCheck}
              >
                Issue SRA Digital Seal
              </Button>
            ) : null
          )}

          {!isSraAdmin && isCompiled && (
            <Button variant="primary" size="md" onClick={() => onSubmit?.(report.id || report.reportId)} isLoading={isSubmitting} loadingText="Submitting..." icon={ShieldCheck}>
              Submit to SRA
            </Button>
          )}

          {/* Printable Report View Button */}
          {isCertified && <Button
            variant="secondary"
            size="md"
            onClick={() => onPrint && onPrint(report)}
            icon={Printer}
          >
            Print Audit Document
          </Button>}
        </div>
      </div>

      {status === AUDIT_STATUS.RETURNED && report.returnReason && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <strong className="block mb-1">Returned for Correction</strong>
          {report.returnReason}
        </div>
      )}

      {isSraAdmin && isPendingReview && (
        <div className="rounded-xl border border-border bg-bg p-4 flex flex-col gap-2">
          <label className="text-xs font-bold text-hug-text" htmlFor="audit-return-reason">Return for correction</label>
          <Textarea id="audit-return-reason" value={returnReason} onChange={event => setReturnReason(event.target.value)} placeholder="Explain what the Farm Manager must correct." rows={3} />
          <Button variant="secondary" size="md" disabled={!returnReason.trim() || isReturning} isLoading={isReturning} loadingText="Returning..." onClick={() => onReturn?.(report.id || report.reportId, returnReason.trim(), report.updatedAt)}>
            Return Audit
          </Button>
        </div>
      )}

      {/* Standardized Batch 5 Certification ConfirmDialog */}
      <ConfirmDialog
        isOpen={showConfirmModal}
        title="Certify this audit report?"
        message={`This will apply the official SRA certification and digital seal to report ${report.reportId || report.id} (${report.period}).\n\nThis authoritative action will be logged in the SRA system audit ledger.`}
        confirmText="Issue SRA Certification"
        cancelText="Cancel"
        type="primary"
        isLoading={isCertifying}
        loadingText="Certifying..."
        onConfirm={handleConfirmCertify}
        onCancel={() => setShowConfirmModal(false)}
      />
    </div>
  );
}
