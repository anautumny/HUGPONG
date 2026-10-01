import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, Camera, ImageUp, Inbox, Keyboard, QrCode, ShieldCheck, X } from 'lucide-react';
import Button from '../ui/Button';
import {
  verifyAuditQr,
  importAuditQr,
  verifyAuditReportIntegrity,
  createLegacyAuditQrPayload,
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
  const videoRef = useRef(null);
  const scannerControlsRef = useRef(null);
  const cameraScanLockedRef = useRef(false);
  const transferPartsRef = useRef(new Map());

  const resetReceiver = useCallback(() => {
    scannerControlsRef.current?.stop();
    scannerControlsRef.current = null;
    cameraScanLockedRef.current = false;
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
        payload = createLegacyAuditQrPayload(report);
        transferPartsRef.current.delete(part.transferId);
      } catch {
        let decoded = null;
        try { decoded = decodeAuditQrPayload(raw); } catch { /* Resolve non-payload report codes through the server. */ }
        if (decoded && !decoded.referenceOnly && !decoded.legacyLookupOnly) {
          report = decoded;
        } else {
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
    } catch (error) {
      const status = Number(error?.status || 0);
      const message = status === 404
        ? 'The QR was read, but its audit report is not available on the server yet. Ask the Farm Manager to sync it, then try again.'
        : status === 422
          ? 'The QR was read, but the audit report failed integrity verification. Generate a new QR from the synchronized report.'
          : (error?.message || 'This QR code is not a valid HUGPONG audit report.');
      setFeedback({ type: 'error', message });
      return { continueScanning: true, message };
    } finally {
      setIsProcessing(false);
    }
  }, [showPreview]);

  useEffect(() => {
    if (mode !== 'camera' || !videoRef.current) return undefined;
    let active = true;
    let localControls = null;
    cameraScanLockedRef.current = false;
    setFeedback({ type: 'info', message: 'Camera ready. Align the complete QR square inside the frame.' });

    import('@zxing/browser')
      .then(async ({ BrowserQRCodeReader }) => {
        const reader = new BrowserQRCodeReader();
        localControls = await reader.decodeFromVideoDevice(undefined, videoRef.current, async result => {
          if (!active || !result || cameraScanLockedRef.current) return;
          cameraScanLockedRef.current = true;
          const outcome = await readQrPayload(result.getText());
          if (active && outcome?.continueScanning) cameraScanLockedRef.current = false;
        });
        if (!active) {
          localControls.stop();
          return;
        }
        scannerControlsRef.current = localControls;
      })
      .catch(error => {
        if (!active) return;
        setFeedback({
          type: 'error',
          message: /permission|notallowed/i.test(String(error?.name || error?.message || ''))
            ? 'Camera permission was denied. Allow camera access in the browser, or upload a QR image.'
            : 'The HUGPONG camera scanner could not start. Upload a QR image instead.'
        });
        setMode('choice');
      });

    return () => {
      active = false;
      localControls?.stop();
      if (scannerControlsRef.current && scannerControlsRef.current !== localControls) {
        scannerControlsRef.current.stop();
      }
      scannerControlsRef.current = null;
      cameraScanLockedRef.current = false;
    };
  }, [mode, readQrPayload]);

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
      const { BrowserQRCodeReader } = await import('@zxing/browser');
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
          Receive a Farm Manager report with the HUGPONG camera scanner, a QR image, or its report code.
        </p>
      </div>

      {mode === 'choice' && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
          <Button variant="primary" size="md" className="w-full" icon={Camera} onClick={() => { setFeedback(null); setMode('camera'); }} disabled={isProcessing}>
            Scan QR
          </Button>
          <Button variant="secondary" size="md" className="w-full" icon={ImageUp} onClick={() => fileInputRef.current?.click()} disabled={isProcessing} isLoading={isProcessing} loadingText="Reading QR...">
            Upload QR
          </Button>
          <Button variant="secondary" size="md" className="w-full" icon={Keyboard} onClick={() => { setFeedback(null); setMode('manual'); }}>
            Input Code
          </Button>
        </div>
      )}

      {mode === 'camera' && (
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#0D1E14] text-white shadow-lg">
          <div className="flex items-center justify-between border-b border-white/10 bg-[#10291A] px-4 py-3">
            <div>
              <p className="text-[9px] font-black tracking-[0.2em] text-[#9EE493]">HUGPONG</p>
              <p className="text-sm font-extrabold">Secure QR Scanner</p>
            </div>
            <button type="button" onClick={resetReceiver} className="rounded-full bg-white/10 p-2 text-white transition hover:bg-white/20" aria-label="Close scanner">
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="px-4 pb-5 pt-4 text-center">
            <div className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-[#9EE493]/30 bg-[#9EE493]/10 px-3 py-1 text-[9px] font-black tracking-wider text-[#9EE493]">
              <ShieldCheck className="h-3.5 w-3.5" /> HUGPONG SECURE SCANNER
            </div>
            <p className="mb-4 text-xs text-white/65">Place the complete audit QR inside the frame. Scanning happens automatically.</p>
            <div className="relative mx-auto aspect-square w-full max-w-[360px] overflow-hidden rounded-[28px] border border-white/20 bg-black">
              <video ref={videoRef} muted playsInline className="h-full w-full object-cover" />
              <div className="pointer-events-none absolute inset-8">
                <span className="absolute left-0 top-0 h-10 w-10 rounded-tl-xl border-l-4 border-t-4 border-[#9EE493]" />
                <span className="absolute right-0 top-0 h-10 w-10 rounded-tr-xl border-r-4 border-t-4 border-[#9EE493]" />
                <span className="absolute bottom-0 left-0 h-10 w-10 rounded-bl-xl border-b-4 border-l-4 border-[#9EE493]" />
                <span className="absolute bottom-0 right-0 h-10 w-10 rounded-br-xl border-b-4 border-r-4 border-[#9EE493]" />
                <span className="absolute left-4 right-4 top-1/2 h-0.5 rounded bg-[#9EE493]/80" />
              </div>
              {isProcessing && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/45">
                  <span className="rounded-full bg-[#EAF6E7] px-4 py-2 text-xs font-black text-[#173D24]">Validating audit report...</span>
                </div>
              )}
            </div>
          </div>
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
