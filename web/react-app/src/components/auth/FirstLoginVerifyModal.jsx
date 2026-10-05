import React, { useState, useEffect, useRef } from 'react';
import { Smartphone, RefreshCw, AlertCircle, MessageSquareText } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export default function FirstLoginVerifyModal({
  isOpen,
  pendingUser,
  pendingToken,
  onVerificationSuccess,
  onCancel
}) {
  const { requestPhoneVerification, requestPhoneVerificationReview, verifyPhone } = useAuth();

  const [otpCode, setOtpCode] = useState('');
  const [timeLeft, setTimeLeft] = useState(300); // 5 minutes
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [isRequestingReview, setIsRequestingReview] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(60);
  const [codeRequestsRemaining, setCodeRequestsRemaining] = useState(3);
  const [error, setError] = useState('');
  const [verificationStep, setVerificationStep] = useState('choice');
  const inputRef = useRef(null);

  // The user must explicitly choose SMS or authorized review on first login.
  useEffect(() => {
    if (isOpen) {
      setOtpCode('');
      setError('');
      setTimeLeft(300);
      setResendCooldown(60);
      setCodeRequestsRemaining(3);
      const status = String(pendingUser?.phoneVerificationStatus || '').toUpperCase();
      setVerificationStep(status === 'PENDING_VERIFICATION'
        && pendingUser?.phoneVerificationRequestedAt
        && pendingUser?.phoneVerificationReviewRequestedByUser === true
        ? 'review'
        : (status === 'SMS_OTP_SENT' ? 'code' : 'choice'));

      setTimeout(() => {
        if (inputRef.current) inputRef.current.focus();
      }, 150);
    }
  }, [
    isOpen,
    pendingUser?.phoneVerificationRequestedAt,
    pendingUser?.phoneVerificationReviewRequestedByUser,
    pendingUser?.phoneVerificationStatus
  ]);

  // 5-minute expiry countdown
  useEffect(() => {
    if (!isOpen) return;
    const interval = setInterval(() => {
      setTimeLeft((prev) => (prev > 0 ? prev - 1 : 0));
      setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [isOpen]);

  if (!isOpen) return null;

  // Format phone number with masking
  const rawPhone = String(pendingUser?.contact || pendingUser?.mobile || pendingUser?.phone || '').replace(/\D/g, '');
  let maskedPhone = '+63 9XX XXX XXXX';
  if (rawPhone.length >= 10) {
    const clean = rawPhone.startsWith('639') ? '0' + rawPhone.slice(2) : rawPhone;
    if (clean.length === 11) {
      maskedPhone = `+63 ${clean.slice(1, 4)} ••• ••${clean.slice(9)}`;
    }
  }

  const formatTimer = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const handleResend = async () => {
    if (resendCooldown > 0 || isResending) return;
    setError('');
    setIsResending(true);
    try {
      const result = await requestPhoneVerification(pendingToken);
      setTimeLeft(300);
      setResendCooldown(Math.max(0, Number(result.resendAfterSeconds || 0)));
      setCodeRequestsRemaining(Math.max(0, Number(result.codeRequestsRemaining ?? 0)));
    } catch (err) {
      if (err.data?.retryAfterSeconds) {
        setResendCooldown(Math.max(0, Number(err.data.retryAfterSeconds)));
        setCodeRequestsRemaining(Math.max(0, Number(err.data.remaining ?? 0)));
      }
      setError(err.message || 'Failed to resend verification code. Please try again later.');
    } finally {
      setIsResending(false);
    }
  };

  const handleChooseSms = async () => {
    if (isResending || isRequestingReview) return;
    setError('');
    setIsResending(true);
    try {
      const result = await requestPhoneVerification(pendingToken);
      setTimeLeft(300);
      setResendCooldown(Math.max(0, Number(result.resendAfterSeconds || 0)));
      setCodeRequestsRemaining(Math.max(0, Number(result.codeRequestsRemaining ?? 0)));
      setVerificationStep('code');
      setTimeout(() => inputRef.current?.focus(), 100);
    } catch (err) {
      setError(err.message || 'Unable to dispatch verification SMS. You can request manual review instead.');
    } finally {
      setIsResending(false);
    }
  };

  const handleRequestReview = async () => {
    if (isRequestingReview || isResending || isVerifying) return;
    setError('');
    setIsRequestingReview(true);
    try {
      await requestPhoneVerificationReview(pendingToken);
      setVerificationStep('review');
    } catch (err) {
      setError(err.message || 'The verification review request could not be submitted.');
    } finally {
      setIsRequestingReview(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const cleanCode = otpCode.trim();
    if (!/^\d{6}$/.test(cleanCode)) {
      setError('Please enter the 6-digit verification code.');
      if (inputRef.current) inputRef.current.focus();
      return;
    }

    setError('');
    setIsVerifying(true);
    try {
      const result = await verifyPhone(cleanCode, pendingToken);
      onVerificationSuccess(result);
    } catch (err) {
      setError(err.message || 'Verification code is incorrect or expired.');
      if (inputRef.current) inputRef.current.focus();
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="One-Time Mobile SIM Verification"
      className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-xs animate-in fade-in duration-150"
    >
      <div className="bg-white dark:bg-surface border border-border rounded-2xl p-6 max-w-md w-full shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary-bg dark:bg-primary/20 text-primary dark:text-primary-light flex items-center justify-center shrink-0 border border-primary/20">
            <Smartphone className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <h3 className="text-base font-bold text-hug-text">
              {verificationStep === 'choice' ? 'Choose Phone Verification' : verificationStep === 'review' ? 'Verification Review Requested' : 'Verify Your Phone'}
            </h3>
            <p className="text-xs text-hug-muted mt-0.5">
              {verificationStep === 'choice'
                ? 'Choose how you want to verify your registered number before accessing HUGPONG.'
                : verificationStep === 'review'
                  ? 'An authorized reviewer must confirm your number before account setup can continue.'
                  : 'Enter the code sent to your registered mobile number.'}
            </p>
          </div>
        </div>

        {/* Registered Contact Info Card */}
        <div className="p-3 bg-bg dark:bg-[#0C1015] rounded-xl border border-border text-xs text-hug-text2 flex flex-col gap-1">
          <span className="text-[10px] uppercase font-bold text-hug-muted">Registered Phone Number</span>
          <span className="font-mono font-bold text-primary dark:text-primary-light text-sm">
            {maskedPhone}
          </span>
          {verificationStep === 'code' && <span className="text-[11px] text-hug-muted mt-0.5">A 6-digit SMS verification code was sent to this device.</span>}
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-danger-bg text-danger text-xs font-medium flex items-center gap-2 border border-danger/20">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {verificationStep === 'choice' && (
          <div className="flex flex-col gap-3">
            <div className="rounded-xl border border-amber-300/70 bg-amber-50/80 p-3 text-xs text-amber-900 dark:bg-amber-950/20 dark:text-amber-200">
              <strong>Smart or TNT SIM?</strong> SMS code verification is currently unavailable for Smart and TNT numbers. Request authorized review instead.
            </div>
            <button type="button" onClick={handleChooseSms} disabled={isResending || isRequestingReview} className="rounded-xl bg-primary px-4 py-3 text-left text-sm font-bold text-white disabled:opacity-50">
              {isResending ? 'Sending code...' : 'Verify using an SMS code'}
              <span className="mt-0.5 block text-[11px] font-normal opacity-90">For supported mobile networks.</span>
            </button>
            <button type="button" onClick={handleRequestReview} disabled={isResending || isRequestingReview} className="rounded-xl border border-border bg-surface px-4 py-3 text-left text-sm font-bold text-hug-text disabled:opacity-50">
              {isRequestingReview ? 'Requesting review...' : 'Request authorized verification review'}
              <span className="mt-0.5 block text-[11px] font-normal text-hug-muted">Use this for Smart/TNT or when SMS is unavailable.</span>
            </button>
            <button type="button" onClick={onCancel} disabled={isResending || isRequestingReview} className="self-end text-xs font-bold text-hug-muted hover:text-hug-text">Sign Out</button>
          </div>
        )}

        {verificationStep === 'review' && (
          <div className="flex flex-col gap-3">
            <div className="rounded-xl border border-amber-300/70 bg-amber-50/80 p-4 text-sm text-amber-900 dark:bg-amber-950/20 dark:text-amber-200">
              <div className="flex items-center gap-2 font-bold"><MessageSquareText className="h-4 w-4" />Request sent to Pending Users</div>
              <p className="mt-1 text-xs">You can sign in again after your Farm Manager or another authorized administrator verifies your number.</p>
            </div>
            <button type="button" onClick={onCancel} className="self-end rounded-xl border border-border px-4 py-2 text-xs font-bold text-hug-text2">Sign Out</button>
          </div>
        )}

        {/* OTP Input Form */}
        {verificationStep === 'code' && <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="otp-code-input" className="text-xs font-semibold text-hug-text2">
              Enter 6-Digit SMS Verification Code
            </label>
            <input
              ref={inputRef}
              id="otp-code-input"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              value={otpCode}
              onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
              placeholder="• • • • • •"
              className="w-full text-center text-xl font-mono font-bold tracking-[0.3em] px-3 py-2.5 border border-border rounded-xl bg-white dark:bg-[#0C1015] text-hug-text focus:border-primary focus:ring-1 focus:ring-primary outline-none"
              autoComplete="one-time-code"
              disabled={isVerifying}
            />
          </div>

          <div className="flex items-center justify-between text-xs text-hug-muted">
            <span className="font-mono">
              {timeLeft > 0 ? `Expires in ${formatTimer(timeLeft)}` : 'Code Expired'}
            </span>
            <button
              type="button"
              onClick={handleResend}
              disabled={resendCooldown > 0 || isResending}
              className="text-primary dark:text-primary-light font-bold hover:underline cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isResending
                ? 'Resending...'
                : resendCooldown > 0
                ? `${codeRequestsRemaining === 0 ? 'Hourly limit reached' : 'Resend in'} ${formatTimer(resendCooldown)}`
                : `Resend SMS Code (${codeRequestsRemaining} remaining)`}
            </button>
          </div>

          <button type="button" onClick={handleRequestReview} disabled={isRequestingReview || isVerifying || isResending} className="rounded-xl border border-amber-300/70 bg-amber-50/70 px-3 py-2 text-left text-xs font-semibold text-amber-900 disabled:opacity-50 dark:bg-amber-950/20 dark:text-amber-200">
            {isRequestingReview ? 'Requesting review...' : 'No SMS available or using Smart/TNT? Request authorized review'}
          </button>

          {/* Action Buttons */}
          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <button
              type="button"
              onClick={onCancel}
              disabled={isVerifying || isResending}
              className="px-4 py-2 border border-border text-hug-text2 text-xs font-bold rounded-xl hover:bg-bg dark:hover:bg-[#0C1015] transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Sign Out
            </button>
            <button
              type="submit"
              disabled={isVerifying || otpCode.length !== 6}
              className="px-4 py-2 bg-primary hover:bg-primary-dark text-white text-xs font-bold rounded-xl transition-all cursor-pointer shadow-sm flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isVerifying && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
              <span>{isVerifying ? 'Verifying...' : 'Verify & Continue'}</span>
            </button>
          </div>
        </form>}
      </div>
    </div>
  );
}
