import React, { useCallback, useRef, useState } from 'react';
import { AlertCircle, ImageUp, Inbox, Keyboard, QrCode, ShieldCheck } from 'lucide-react';
import { BrowserQRCodeReader } from '@zxing/browser';
import Button from '../ui/Button';
import {
  verifyAuditQr,
  importAuditQr,
  verifyAuditReportIntegrity,
  createAuditQrPayload,
  decodeAuditQrPayload,
  decodeAuditQrPart,
  assembleAuditQrParts
} from '../../services/auditService';

const TRANSFER_CODE_PATTERN = /^(AUD|RPT|HUG)-[A-Z0-9-]+$/i;

function reportIdentity(report) {
  return report?.reportId || report?.id || '';
}

export default function QRVerifierPanel({ reports = [], onSelectReport, className = '' }) {
  const [mode, setMode] = useState('choice');
  const [inputCode, setInputCode] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [decodedReport, setDecodedReport] = useState(null);
  const [pendingPayload, setPendingPayload] = useState('');
  const [alreadyImported, setAlreadyImported] = useState(false);
  const fileInputRef = useRef(null);
  const transferPartsRef = useRef(new Map());

  const resetReceiver = useCallback(() => {
    setMode('choice');
    setInputCode('');
    setDecodedReport(null);
    setPendingPayload('');
    setAlreadyImported(false);
    setFeedback(null);
    transferPartsRef.current.clear();
  }, []);

  const showPreview = useCallback((report, payload, duplicate = false) => {
    setDecodedReport(report);
    setPendingPayload(payload);
    setAlreadyImported(duplicate);
    setMode('preview');
    setFeedback({
      type: duplicate ? 'info' : 'success',
      message: duplicate
        ? 'This audit report has already been imported.'
        : 'Audit report decoded. Review the details before importing it.'
    });
  }, []);

  const readQrPayload = useCallback(async rawInput => {
    const raw = String(rawInput || '').trim();
    if (!raw) return { continueScanning: true, message: 'This QR code is not a valid HUGPONG audit report.' };
    setIsProcessing(true);
    setFeedback({ type: 'info', message: 'Validating audit report...' });

    try {
      let report;
      let payload = raw;
      let duplicate = false;

      try {
        const part = decodeAuditQrPart(raw);
        if (!transferPartsRef.current.has(part.transferId)) {
          transferPartsRef.current.set(part.transferId, new Map());
        }
        const collected = transferPartsRef.current.get(part.transferId);
        collected.set(part.partNumber, raw);
        if (collected.size < part.partCount) {
          const message = `${collected.size} of ${part.partCount} QR parts captured. Keep scanning.`;
          setFeedback({ type: 'info', message });
          return { continueScanning: true, message };
        }
        report = assembleAuditQrParts(Array.from(collected.values()));
        payload = createAuditQrPayload(report);
        transferPartsRef.current.delete(part.transferId);
      } catch (partError) {
        try {
          report = decodeAuditQrPayload(raw);
          if (report.legacyLookupOnly) throw partError;
        } catch {
          const verified = await verifyAuditQr(raw);
          if (!verified.data?.integrityVerified || !verified.data?.report) {
            throw new Error('The server could not verify this audit report.');
          }
          report = verified.data.report;
          duplicate = Boolean(verified.data.alreadyImported);
        }
      }

      if (!await verifyAuditReportIntegrity(report)) {
        throw new Error('The audit QR integrity check failed.');
      }
      showPreview(report, payload, duplicate);
      return { continueScanning: false };
    } catch {
      const message = 'This QR code is not a valid HUGPONG audit report.';
      setFeedback({ type: 'error', message });
      return { continueScanning: true, message };
    } finally {
      setIsProcessing(false);
    }
  }, [showPreview]);

  const handleImageUpload = async event => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || isProcessing) return;
    if (!file.type.startsWith('image/')) {
      setFeedback({ type: 'error', message: 'Choose an image file containing a QR code.' });
      return;
    }

    setIsProcessing(true);
    setFeedback({ type: 'info', message: 'Reading uploaded QR image...' });
    const imageUrl = URL.createObjectURL(file);
    try {
      const result = await new BrowserQRCodeReader().decodeFromImageUrl(imageUrl);
      await readQrPayload(result.getText());
    } catch {
      setFeedback({ type: 'error', message: 'No readable QR code was found. Try a clear, uncropped image.' });
    } finally {
      URL.revokeObjectURL(imageUrl);
      setIsProcessing(false);
    }
  };

  const handleManualSubmit = async event => {
    event.preventDefault();
    const code = inputCode.trim().toUpperCase();
    if (!TRANSFER_CODE_PATTERN.test(code)) {
      setFeedback({ type: 'error', message: 'Enter a valid AUD-, RPT-, or HUG- code.' });
      return;
    }

    setIsProcessing(true);
    setFeedback({ type: 'info', message: 'Looking up the authoritative audit report...' });
    try {
      const verified = await verifyAuditQr(code);
      if (!verified.data?.integrityVerified || !verified.data?.report) {
        throw new Error('The server could not verify this audit report.');
      }
      showPreview(verified.data.report, code, Boolean(verified.data.alreadyImported));
    } catch (error) {
      setFeedback({
        type: 'error',
        message: error.status === 404
          ? 'No audit report was found for this code.'
          : (error.message || 'No audit report was found for this code.')
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const viewExistingReport = () => {
    const id = reportIdentity(decodedReport);
    const existing = reports.find(report => reportIdentity(report) === id) || decodedReport;
    onSelectReport?.(existing);
    setFeedback({ type: 'success', message: 'The existing audit report is open in the review panel.' });
  };

  const confirmImport = async () => {
    if (!pendingPayload || !decodedReport || alreadyImported) return;
    setIsProcessing(true);
    setFeedback({ type: 'info', message: 'Verifying and importing the report...' });
    try {
      const verified = await verifyAuditQr(pendingPayload);
      if (!verified.data?.integrityVerified) throw new Error('The server could not verify this audit report.');
      const result = verified.data.alreadyImported ? verified : await importAuditQr(pendingPayload);
      const report = result.data?.report;
      if (!report) throw new Error('The authoritative audit report was not returned.');
      setDecodedReport(report);
      setAlreadyImported(true);
      setFeedback({
        type: 'success',
        message: result.data.alreadyImported
          ? 'This audit report has already been imported.'
          : 'Audit imported to the SRA Audit Inbox. It is awaiting review and has not been certified.'
      });
      onSelectReport?.(report);
    } catch (error) {
      setFeedback({ type: 'error', message: error.message || 'The audit report could not be imported.' });
    } finally {
      setIsProcessing(false);
    }
  };

  const cancelPreview = () => {
    setDecodedReport(null);
    setPendingPayload('');
    setAlreadyImported(false);
    setFeedback(null);
    setMode('choice');
  };

  return (
    <div className={`bg-white dark:bg-surface rounded-2xl border border-border p-5 sm:p-6 shadow-xs flex flex-col gap-4 ${className}`}>
      <div>
        <div className="flex items-center gap-2 mb-1">
          <div className="w-8 h-8 rounded-lg bg-primary-bg dark:bg-primary/20 text-primary flex items-center justify-center shrink-0">
            <QrCode className="w-4 h-4" />
          </div>
          <h3 className="text-base font-bold text-hug-text tracking-tight">Receive Audit Report</h3>
        </div>
        <p className="text-xs text-hug-muted leading-relaxed">
          Receive a Farm Manager report by uploading its QR image or entering its code.
        </p>
      </div>

      {mode === 'choice' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
          <Button variant="primary" size="md" className="w-full" icon={ImageUp} onClick={() => fileInputRef.current?.click()} disabled={isProcessing} isLoading={isProcessing} loadingText="Reading QR...">
            Upload QR
          </Button>
          <Button variant="secondary" size="md" className="w-full" icon={Keyboard} onClick={() => { setFeedback(null); setMode('manual'); }}>
            Input Code
          </Button>
        </div>
      )}

      {mode === 'manual' && (
        <form onSubmit={handleManualSubmit} className="flex flex-col gap-3">
          <div>
            <label htmlFor="audit-transfer-code" className="block text-xs font-semibold text-hug-text mb-1.5">Code</label>
            <input
              id="audit-transfer-code"
              value={inputCode}
              onChange={event => setInputCode(event.target.value)}
              placeholder="AUD-... or HUG-..."
              autoCapitalize="characters"
              autoComplete="off"
              className="w-full rounded-xl border border-border bg-bg px-3 py-2.5 font-mono text-sm text-hug-text"
              disabled={isProcessing}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant="secondary" size="md" onClick={resetReceiver} disabled={isProcessing}>Cancel</Button>
            <Button type="submit" variant="primary" size="md" isLoading={isProcessing} loadingText="Looking up...">Submit</Button>
          </div>
        </form>
      )}

      {mode === 'preview' && decodedReport && (
        <div className="rounded-xl border border-border bg-bg p-3 text-xs">
          <h4 className="text-sm font-bold text-hug-text">Audit Report Found</h4>
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-hug-muted">
            <dt>Report ID</dt><dd className="text-right font-semibold text-hug-text break-all">{reportIdentity(decodedReport)}</dd>
            <dt>Block Farm</dt><dd className="text-right font-semibold text-hug-text">{decodedReport.blockFarmName || decodedReport.blockFarmId}</dd>
            <dt>Manager</dt><dd className="text-right font-semibold text-hug-text">{decodedReport.compiledByName || decodedReport.compiledByUserId}</dd>
            <dt>Period</dt><dd className="text-right font-semibold text-hug-text">{decodedReport.periodKey}</dd>
            <dt>Fields</dt><dd className="text-right font-semibold text-hug-text">{decodedReport.fieldCount ?? decodedReport.fieldSnapshots?.length ?? 0}</dd>
            <dt>Operations</dt><dd className="text-right font-semibold text-hug-text">{decodedReport.operationCount ?? decodedReport.operationSnapshots?.length ?? 0}</dd>
            <dt>Total Cost</dt><dd className="text-right font-semibold text-hug-text">PHP {Number(decodedReport.totalCost || 0).toLocaleString()}</dd>
            <dt>Generated</dt><dd className="text-right font-semibold text-hug-text">{decodedReport.compiledAt ? new Date(decodedReport.compiledAt).toLocaleString() : 'Unavailable'}</dd>
          </dl>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button variant="secondary" size="sm" onClick={cancelPreview} disabled={isProcessing}>Cancel</Button>
            {alreadyImported ? (
              <Button variant="primary" size="sm" icon={Inbox} onClick={viewExistingReport}>View Existing Report</Button>
            ) : (
              <Button variant="primary" size="sm" icon={Inbox} onClick={confirmImport} isLoading={isProcessing} loadingText="Importing...">Import Report</Button>
            )}
          </div>
        </div>
      )}

      {feedback && (
        <div role="status" aria-live="polite" className={`p-3 rounded-xl text-xs flex items-start gap-2.5 ${
          feedback.type === 'success'
            ? 'bg-success-bg text-success border border-success/30'
            : feedback.type === 'error'
              ? 'bg-danger-bg dark:bg-danger/20 text-danger border border-danger/30'
              : 'bg-primary-bg dark:bg-primary/20 text-primary dark:text-primary-light border border-primary/20'
        }`}>
          {feedback.type === 'success'
            ? <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" />
            : <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />}
          <span className="flex-1 leading-relaxed">{feedback.message}</span>
        </div>
      )}
    </div>
  );
}
