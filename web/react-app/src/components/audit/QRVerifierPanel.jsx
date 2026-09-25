import React, { useState, useRef } from 'react';
import { QrCode, Upload, ShieldCheck, AlertCircle, Search, Inbox } from 'lucide-react';
import Button from '../ui/Button';
import {
  decodeQRCodeFromImage, verifyAuditQr, importAuditQr, createAuditQrPayload,
  decodeAuditQrPayload, decodeAuditQrPart, assembleAuditQrParts
} from '../../services/auditService';

export default function QRVerifierPanel({
  reports = [],
  onSelectReport,
  className = ''
}) {
  const [inputCode, setInputCode] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [feedback, setFeedback] = useState(null); // { type: 'success'|'error'|'info', message: string }
  const [decodedReport, setDecodedReport] = useState(null);
  const [pendingPayload, setPendingPayload] = useState('');
  const fileInputRef = useRef(null);
  const transferPartsRef = useRef(new Map());

  const readAuditPackage = async (rawInput) => {
    setIsProcessing(true);
    setFeedback({ type: 'info', message: 'Reading the complete audit package...' });
    try {
      const values = String(rawInput || '').split(/\r?\n/).map(value => value.trim()).filter(Boolean);
      let report;
      let payload;
      try {
        const parts = values.map(decodeAuditQrPart);
        const transferId = parts[0].transferId;
        if (!transferPartsRef.current.has(transferId)) transferPartsRef.current.set(transferId, new Map());
        const collected = transferPartsRef.current.get(transferId);
        parts.forEach((part, index) => collected.set(part.partNumber, values[index]));
        if (collected.size < parts[0].partCount) {
          setFeedback({ type: 'info', message: `QR part ${parts[0].partNumber} captured. ${collected.size} of ${parts[0].partCount} parts are ready.` });
          return;
        }
        report = assembleAuditQrParts(Array.from(collected.values()));
        payload = createAuditQrPayload(report);
        transferPartsRef.current.delete(transferId);
      } catch (partError) {
        try {
          report = decodeAuditQrPayload(values[0] || rawInput);
          if (report.legacyLookupOnly) throw partError;
          payload = createAuditQrPayload(report);
        } catch {
          const verified = await verifyAuditQr(rawInput);
          report = verified.data.report;
          payload = rawInput;
        }
      }
      setDecodedReport(report);
      setPendingPayload(payload);
      setFeedback({ type: 'success', message: 'Complete report decoded. Review its contents, then confirm import to the SRA Audit Inbox.' });
    } catch (error) {
      setFeedback({ type: 'error', message: error.message || 'The QR audit could not be verified.' });
    } finally {
      setIsProcessing(false);
    }
  };

  const confirmImport = async () => {
    if (!pendingPayload || !decodedReport) return;
    setIsProcessing(true);
    setFeedback({ type: 'info', message: 'Verifying against the authoritative report and importing...' });
    try {
      const verified = await verifyAuditQr(pendingPayload);
      const imported = verified.data.alreadyImported ? verified : await importAuditQr(pendingPayload);
      setDecodedReport(imported.data.report);
      setFeedback({ type: 'success', message: imported.data.alreadyImported ? 'This audit was already imported; its existing record is open.' : 'Audit imported into the SRA Audit Inbox.' });
      onSelectReport?.(imported.data.report);
    } catch (error) {
      setFeedback({ type: 'error', message: error.message || 'The complete report could not be imported.' });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleManualSubmit = (e) => {
    if (e) e.preventDefault();
    if (!inputCode.trim()) {
      setFeedback({ type: 'error', message: 'Please enter an audit hash code.' });
      return;
    }
    readAuditPackage(inputCode.trim());
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFeedback({ type: 'info', message: 'Processing uploaded QR photo...' });
    setIsProcessing(true);

    try {
      const rawText = await decodeQRCodeFromImage(file);
      setInputCode(rawText);
      setFeedback({ type: 'info', message: 'QR decoded. Reading transfer contents...' });
      await readAuditPackage(rawText);
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err.message || 'Could not decode QR code from this photo. Please enter the hash code manually.'
      });
    } finally {
      setIsProcessing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className={`bg-white dark:bg-surface rounded-2xl border border-border p-5 sm:p-6 shadow-xs flex flex-col gap-4 ${className}`}>
      <div>
        <div className="flex items-center gap-2 mb-1">
          <div className="w-8 h-8 rounded-lg bg-primary-bg dark:bg-primary/20 text-primary flex items-center justify-center shrink-0">
            <QrCode className="w-4 h-4" />
          </div>
          <h3 className="text-base font-bold text-hug-text tracking-tight">
            SRA QR Audit Verifier
          </h3>
        </div>
        <p className="text-xs text-hug-muted leading-relaxed">
          Scan or upload a compiled HUGPONG audit package. Decoding, integrity verification, SRA review, and certification remain separate states.
        </p>
      </div>

      {/* Upload button */}
      <div>
        <label
          htmlFor="qr-file-input"
          className="w-full border border-farm-blue/30 bg-farm-blue-bg/40 hover:bg-farm-blue/10 dark:bg-farm-blue/10 text-farm-blue dark:text-blue-400 text-xs font-bold py-2.5 px-3 rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer text-center shadow-2xs group"
        >
          <Upload className="w-4 h-4 transition-transform group-hover:-translate-y-0.5" />
          <span>Upload QR Photo / Screenshot</span>
          <input
            id="qr-file-input"
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileUpload}
            disabled={isProcessing}
          />
        </label>
      </div>

      {/* Divider */}
      <div className="relative flex items-center py-0.5">
        <div className="flex-grow border-t border-border"></div>
        <span className="shrink-0 mx-3 text-[10px] uppercase font-bold text-hug-muted tracking-wider">
          or enter manually
        </span>
        <div className="flex-grow border-t border-border"></div>
      </div>

      {/* Manual Input Form */}
      <form onSubmit={handleManualSubmit} className="flex flex-col gap-3">
        <div>
          <label htmlFor="manual-qr-input" className="block text-xs font-semibold text-hug-text mb-1.5">
            Audit QR Package
          </label>
          <textarea
            id="manual-qr-input"
            value={inputCode}
            onChange={(e) => setInputCode(e.target.value)}
            placeholder="Paste one QR part, all parts on separate lines, or an audit report code"
            className="w-full min-h-24 rounded-xl border border-border bg-bg px-3 py-2 font-mono text-xs text-hug-text"
            disabled={isProcessing}
          />
        </div>

        <Button
          type="submit"
          variant="primary"
          size="md"
          className="w-full justify-center"
          isLoading={isProcessing}
          loadingText="Reading report..."
          icon={Search}
        >
          Read Audit Report
        </Button>
      </form>

      {decodedReport && (
        <div className="rounded-xl border border-border bg-bg p-3 text-xs">
          <div className="flex justify-between gap-3"><strong>{decodedReport.blockFarmName || decodedReport.blockFarmId}</strong><span>{decodedReport.periodKey}</span></div>
          <p className="mt-2 text-hug-muted">Manager: {decodedReport.compiledByName || decodedReport.compiledByUserId}</p>
          <p className="text-hug-muted">{decodedReport.fieldCount} fields · {decodedReport.memberCount} members · {decodedReport.operationCount} operations · PHP {Number(decodedReport.totalCost || 0).toLocaleString()}</p>
          <div className="mt-3 max-h-28 overflow-y-auto rounded-lg border border-border bg-white dark:bg-surface divide-y divide-border">
            {(decodedReport.fieldSnapshots || []).map(field => (
              <div key={field.fieldId} className="p-2 flex items-start justify-between gap-3">
                <div className="min-w-0"><strong className="block truncate">{field.fieldId}</strong><span className="text-[10px] text-hug-muted">{field.memberName || field.memberId || 'Vacant / Unallocated'} · {field.cropYearCycle || 'No crop cycle'}</span></div>
                <span className="text-[10px] font-semibold whitespace-nowrap">{Number(field.areaHa || 0).toLocaleString()} Ha · {field.operationCount} logs</span>
              </div>
            ))}
          </div>
          <div className="mt-3 max-h-36 overflow-y-auto rounded-lg border border-border bg-white dark:bg-surface divide-y divide-border">
            {(decodedReport.operationSnapshots || []).map(operation => (
              <div key={operation.operationLogId} className="p-2 flex items-start justify-between gap-3">
                <div className="min-w-0"><strong className="block truncate">{operation.operationName || operation.operationDefinitionId}</strong><span className="text-[10px] text-hug-muted">{operation.fieldId} · {operation.performedOn}</span></div>
                <span className="font-semibold whitespace-nowrap">PHP {Number(operation.totalCost || 0).toLocaleString()}</span>
              </div>
            ))}
          </div>
          <Button variant="primary" size="md" className="w-full justify-center mt-3" icon={Inbox} onClick={confirmImport} disabled={isProcessing} isLoading={isProcessing} loadingText="Importing report...">
            Import to Audit Inbox
          </Button>
        </div>
      )}

      {/* Status Feedback Banner */}
      {feedback && (
        <div
          role="status"
          aria-live="polite"
          className={`p-3 rounded-xl text-xs flex items-start gap-2.5 transition-all ${
            feedback.type === 'success'
              ? 'bg-success-bg text-success border border-success/30'
              : feedback.type === 'error'
              ? 'bg-danger-bg dark:bg-danger/20 text-danger border border-danger/30'
              : 'bg-primary-bg dark:bg-primary/20 text-primary dark:text-primary-light border border-primary/20'
          }`}
        >
          {feedback.type === 'success' ? (
            <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5 text-success" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          )}
          <span className="flex-1 leading-relaxed">{feedback.message}</span>
        </div>
      )}
    </div>
  );
}
