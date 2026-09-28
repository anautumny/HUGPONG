import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  MessageSquareText,
  RefreshCw,
  Shield,
  X
} from 'lucide-react';
import { PASSWORD_POLICY_HINT, passwordPolicyError } from '../../domain/passwordPolicy';
import { responseErrorFromPayload, webClientHeaders } from '../../services/apiClient';

async function recoveryRequest(path, body) {
  const response = await fetch(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...webClientHeaders()
    },
    body: JSON.stringify(body),
    credentials: 'include'
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.success) {
    throw responseErrorFromPayload(result, response.status, 'Account recovery could not be completed.');
  }
  return result;
}

export default function AccountRecoveryModal({ isOpen, onClose }) {
  const [step, setStep] = useState(1);
  const [identifier, setIdentifier] = useState('');
  const [recoveryId, setRecoveryId] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [resendSeconds, setResendSeconds] = useState(0);
  const [codeRequestsRemaining, setCodeRequestsRemaining] = useState(3);

  useEffect(() => {
    if (!isOpen) return;
    setStep(1);
    setIdentifier('');
    setRecoveryId('');
    setResetToken('');
    setCode('');
    setNewPassword('');
    setConfirmPassword('');
    setShowPassword(false);
    setIsSubmitting(false);
    setError('');
    setNotice('');
    setResendSeconds(0);
    setCodeRequestsRemaining(3);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || resendSeconds <= 0) return undefined;
    const timer = window.setInterval(() => {
      setResendSeconds(value => Math.max(0, value - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [isOpen, resendSeconds > 0]);

  if (!isOpen) return null;

  const requestCode = async () => {
    if (step === 2 && resendSeconds > 0) return;
    if (!identifier.trim()) {
      setError('Enter your 8-digit User ID or registered mobile number.');
      return;
    }
    setIsSubmitting(true);
    setError('');
    try {
      const result = await recoveryRequest('/auth/password-recovery/request', { identifier: identifier.trim() });
      setRecoveryId(result.recoveryId);
      setCode('');
      setNotice(result.message);
      setResendSeconds(Math.max(0, Number(result.resendAfterSeconds || 0)));
      setCodeRequestsRemaining(Math.max(0, Number(result.codeRequestsRemaining ?? 0)));
      setStep(2);
    } catch (requestError) {
      setError(requestError.message);
      if (requestError.data?.retryAfterSeconds) {
        setResendSeconds(Math.max(0, Number(requestError.data.retryAfterSeconds)));
        setCodeRequestsRemaining(Math.max(0, Number(requestError.data.remaining ?? 0)));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const verifyCode = async (event) => {
    event.preventDefault();
    if (!/^\d{6}$/.test(code.trim())) {
      setError('Enter the 6-digit code sent by SMS.');
      return;
    }
    setIsSubmitting(true);
    setError('');
    try {
      const result = await recoveryRequest('/auth/password-recovery/verify', {
        recoveryId,
        code: code.trim()
      });
      setResetToken(result.resetToken);
      setNotice('Your mobile number was verified. Choose a new password.');
      setStep(3);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetPassword = async (event) => {
    event.preventDefault();
    const policyError = passwordPolicyError(newPassword);
    if (policyError) {
      setError(policyError);
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('New passwords do not match.');
      return;
    }
    setIsSubmitting(true);
    setError('');
    try {
      await recoveryRequest('/auth/password-recovery/complete', {
        recoveryId,
        resetToken,
        newPassword
      });
      setNewPassword('');
      setConfirmPassword('');
      setResetToken('');
      setNotice('Your password was reset and all existing sessions were signed out.');
      setStep(4);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const goBack = () => {
    setError('');
    setNotice('');
    if (step === 3) {
      setResetToken('');
      setRecoveryId('');
      setCode('');
      setStep(1);
    } else if (step === 2) {
      setRecoveryId('');
      setStep(1);
    } else {
      onClose();
    }
  };

  const formatCountdown = value => {
    const minutes = Math.floor(value / 60);
    const seconds = value % 60;
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Reset password"
      className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={(event) => {
        if (event.target === event.currentTarget && !isSubmitting) onClose();
      }}
    >
      <div className="bg-white dark:bg-surface rounded-3xl max-w-md w-full max-h-[92vh] overflow-y-auto p-6 sm:p-7 shadow-2xl border border-border flex flex-col gap-4 relative animate-in zoom-in-95 duration-200">
        <button
          type="button"
          onClick={onClose}
          disabled={isSubmitting}
          className="absolute top-5 right-5 w-8 h-8 rounded-full bg-bg dark:bg-[#0C1015] hover:bg-border flex items-center justify-center text-hug-muted hover:text-hug-text cursor-pointer transition-colors disabled:opacity-50"
          aria-label="Close password recovery"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-3 pr-10">
          <div className="w-11 h-11 rounded-2xl bg-primary-bg dark:bg-primary/20 flex items-center justify-center text-primary dark:text-primary-light shrink-0">
            {step === 2 ? <MessageSquareText className="w-6 h-6" /> : step === 3 ? <KeyRound className="w-6 h-6" /> : step === 4 ? <CheckCircle2 className="w-6 h-6" /> : <Shield className="w-6 h-6" />}
          </div>
          <div>
            <h3 className="text-base font-extrabold text-hug-text">
              {step === 1 ? 'Reset Your Password' : step === 2 ? 'Enter Code If Received' : step === 3 ? 'Create New Password' : 'Password Reset Complete'}
            </h3>
            <p className="text-xs text-hug-muted">Step {Math.min(step, 3)} of 3 · Secure account recovery</p>
          </div>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-danger-bg/40 border border-danger/25 text-xs font-semibold text-danger flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}
        {notice && step < 4 && (
          <div className="p-3 rounded-xl bg-primary-bg/50 border border-primary/20 text-xs text-hug-text2 leading-relaxed">
            {notice}
          </div>
        )}

        {step === 1 && (
          <form onSubmit={(event) => { event.preventDefault(); requestCode(); }} className="space-y-4">
            <p className="text-xs text-hug-muted leading-relaxed">
              Enter your permanent User ID or registered mobile number. If it matches an active account, HUGPONG will send a 6-digit code to the registered mobile number.
            </p>
            <label className="block">
              <span className="block text-xs font-bold text-hug-text2 mb-1.5">User ID or Mobile Number</span>
              <input
                value={identifier}
                onChange={(event) => setIdentifier(event.target.value)}
                disabled={isSubmitting}
                autoComplete="username"
                placeholder="04000001 or 09171234567"
                className="w-full px-3 py-2.5 rounded-xl border border-border bg-bg dark:bg-[#0C1015] text-sm font-semibold text-hug-text outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </label>
            <button type="submit" disabled={isSubmitting} className="w-full py-2.5 bg-primary hover:bg-primary-dark text-white text-xs font-bold rounded-xl transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2">
              {isSubmitting && <RefreshCw className="w-4 h-4 animate-spin" />}
              {isSubmitting ? 'Requesting code...' : 'Send Password Reset Code'}
            </button>
            <div className="p-3 rounded-xl bg-bg dark:bg-[#0C1015] border border-border text-[11px] text-hug-muted leading-relaxed">
              <strong className="text-hug-text2">No access to your registered SIM?</strong> Visit your assigned Farm Manager or SRA District Regulatory Officer. After in-person identity verification, they can update your registered number; then restart this recovery flow.
            </div>
          </form>
        )}

        {step === 2 && (
          <form onSubmit={verifyCode} className="space-y-4">
            <label className="block">
              <span className="block text-xs font-bold text-hug-text2 mb-1.5">6-Digit SMS Code</span>
              <input
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                disabled={isSubmitting}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="123456"
                className="w-full px-3 py-3 rounded-xl border border-border bg-bg dark:bg-[#0C1015] text-center text-xl tracking-[0.35em] font-black text-hug-text outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </label>
            <button type="submit" disabled={isSubmitting} className="w-full py-2.5 bg-primary hover:bg-primary-dark text-white text-xs font-bold rounded-xl transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2">
              {isSubmitting && <RefreshCw className="w-4 h-4 animate-spin" />}
              {isSubmitting ? 'Verifying...' : 'Verify Code'}
            </button>
            <button type="button" onClick={requestCode} disabled={isSubmitting || resendSeconds > 0} className="w-full text-xs font-bold text-primary hover:text-primary-dark cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
              {isSubmitting
                ? 'Requesting...'
                : resendSeconds > 0
                  ? `${codeRequestsRemaining === 0 ? 'Hourly limit reached' : 'Resend available'} in ${formatCountdown(resendSeconds)}`
                  : `Request a new code (${codeRequestsRemaining} remaining)`}
            </button>
          </form>
        )}

        {step === 3 && (
          <form onSubmit={resetPassword} className="space-y-4">
            <p className="text-xs text-hug-muted leading-relaxed">{PASSWORD_POLICY_HINT}</p>
            <label className="block">
              <span className="block text-xs font-bold text-hug-text2 mb-1.5">New Password</span>
              <span className="relative block">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  disabled={isSubmitting}
                  autoComplete="new-password"
                  className="w-full px-3 py-2.5 pr-10 rounded-xl border border-border bg-bg dark:bg-[#0C1015] text-sm font-semibold text-hug-text outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                />
                <button type="button" onClick={() => setShowPassword(value => !value)} className="absolute right-3 top-1/2 -translate-y-1/2 text-hug-muted">
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </span>
            </label>
            <label className="block">
              <span className="block text-xs font-bold text-hug-text2 mb-1.5">Confirm New Password</span>
              <input
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                disabled={isSubmitting}
                autoComplete="new-password"
                className="w-full px-3 py-2.5 rounded-xl border border-border bg-bg dark:bg-[#0C1015] text-sm font-semibold text-hug-text outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </label>
            <button type="submit" disabled={isSubmitting} className="w-full py-2.5 bg-primary hover:bg-primary-dark text-white text-xs font-bold rounded-xl transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2">
              {isSubmitting && <RefreshCw className="w-4 h-4 animate-spin" />}
              {isSubmitting ? 'Resetting password...' : 'Reset Password & Sign Out All Devices'}
            </button>
          </form>
        )}

        {step === 4 && (
          <div className="space-y-4 text-center">
            <p className="text-sm text-hug-text2 leading-relaxed">{notice}</p>
            <p className="text-xs text-hug-muted">You can now sign in with your new password.</p>
            <button type="button" onClick={onClose} className="w-full py-2.5 bg-primary hover:bg-primary-dark text-white text-xs font-bold rounded-xl transition-all cursor-pointer">
              Return to Sign In
            </button>
          </div>
        )}

        {step > 1 && step < 4 && (
          <button type="button" onClick={goBack} disabled={isSubmitting} className="self-start inline-flex items-center gap-1.5 text-xs font-bold text-hug-muted hover:text-hug-text disabled:opacity-50">
            <ArrowLeft className="w-3.5 h-3.5" /> Back
          </button>
        )}
      </div>
    </div>
  );
}
