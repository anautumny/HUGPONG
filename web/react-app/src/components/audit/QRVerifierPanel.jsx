import React, { useState, useRef } from 'react';
import { QrCode, Upload, ShieldCheck, AlertCircle, Search } from 'lucide-react';
import Button from '../ui/Button';
import Input from '../ui/Input';
import { extractAuditHash, decodeQRCodeFromImage } from '../../services/auditService';

export default function QRVerifierPanel({
  reports = [],
  onSelectReport,
  className = ''
}) {
  const [inputCode, setInputCode] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [feedback, setFeedback] = useState(null); // { type: 'success'|'error'|'info', message: string }
  const fileInputRef = useRef(null);

  const performVerification = (rawInput) => {
    const code = extractAuditHash(rawInput);
    if (!code) {
      setFeedback({
        type: 'error',
        message: 'Invalid verification code. Please enter a valid audit hash (e.g. HUG-202609-...) or report ID.'
      });
      return;
    }

    setIsProcessing(true);
    setFeedback({ type: 'info', message: 'Verifying cryptographic audit hash signature...' });

    setTimeout(() => {
      setIsProcessing(false);
      const matched = reports.find(r =>
        (r.qrHash && r.qrHash.toUpperCase() === code) ||
        (r.qrSignature && r.qrSignature.toUpperCase() === code) ||
        (r.reportId && r.reportId.toUpperCase() === code) ||
        (r.id && r.id.toUpperCase() === code)
      );

      if (matched) {
        setFeedback({
          type: 'success',
          message: `Audit record verified: ${matched.period || matched.month} (${matched.status === 'CERTIFIED' ? 'Certified' : 'Pending Certification'}).`
        });
        if (onSelectReport) {
          onSelectReport(matched);
        }
      } else {
        setFeedback({
          type: 'error',
          message: `Audit record not found for code "${code}". No matching compiled report was found in the repository.`
        });
      }
    }, 350);
  };

  const handleManualSubmit = (e) => {
    if (e) e.preventDefault();
    if (!inputCode.trim()) {
      setFeedback({ type: 'error', message: 'Please enter an audit hash code.' });
      return;
    }
    performVerification(inputCode.trim());
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFeedback({ type: 'info', message: 'Processing uploaded QR photo...' });
    setIsProcessing(true);

    try {
      const rawText = await decodeQRCodeFromImage(file);
      const code = extractAuditHash(rawText) || rawText;
      setInputCode(code);
      setFeedback({ type: 'info', message: `QR Code decoded: ${code}` });
      performVerification(code);
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
          Farmers compile certified field operation logs into an encrypted QR dossier. Verify by uploading a photo / screenshot, or entering the audit hash code.
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
            Audit Hash Code
          </label>
          <Input
            id="manual-qr-input"
            type="text"
            value={inputCode}
            onChange={(e) => setInputCode(e.target.value.toUpperCase())}
            placeholder="e.g. HUG-202609-A3F9"
            className="font-mono uppercase tracking-wider text-sm"
            disabled={isProcessing}
          />
        </div>

        <Button
          type="submit"
          variant="primary"
          size="md"
          className="w-full justify-center"
          isLoading={isProcessing}
          loadingText="Verifying code..."
          icon={Search}
        >
          Verify Audit Code
        </Button>
      </form>

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
