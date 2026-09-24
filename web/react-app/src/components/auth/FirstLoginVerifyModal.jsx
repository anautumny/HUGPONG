import React, { useState, useEffect, useRef } from 'react';
import { Smartphone, RefreshCw, AlertCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export default function FirstLoginVerifyModal({
  isOpen,
  pendingUser,
  pendingToken,
  onVerificationSuccess,
  onCancel
}) {
  const { requestPhoneVerification, verifyPhone } = useAuth();

  const [otpCode, setOtpCode] = useState('');
  const [timeLeft, setTimeLeft] = useState(300); // 5 minutes
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(60);
  const [error, setError] = useState('');
  const inputRef = useRef(null);

  // Focus input and trigger initial SMS OTP dispatch on modal open
  useEffect(() => {
    if (isOpen) {
      setOtpCode('');
      setError('');
      setTimeLeft(300);
      setResendCooldown(60);

      // Request server to send OTP code to registered phone
      if (pendingToken) {
        requestPhoneVerification(pendingToken).catch((err) => {
          console.warn('[FirstLoginVerify] SMS dispatch note:', err.message);
          setError(err.message || 'Unable to dispatch verification SMS.');
        });
      }

      setTimeout(() => {
        if (inputRef.current) inputRef.current.focus();
      }, 150);
    }
  }, [isOpen, pendingToken]);

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
      await requestPhoneVerification(pendingToken);
      setTimeLeft(300);
      setResendCooldown(60);
    } catch (err) {
      setError(err.message || 'Failed to resend verification code. Please try again later.');
    } finally {
      setIsResending(false);
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
            <h3 className="text-base font-bold text-hug-text">One-Time Mobile SIM Verification</h3>
            <p className="text-xs text-hug-muted mt-0.5">
              Please verify ownership of your registered mobile number before accessing your HUGPONG portal.
            </p>
          </div>
        </div>

        {/* Registered Contact Info Card */}
        <div className="p-3 bg-bg dark:bg-[#0C1015] rounded-xl border border-border text-xs text-hug-text2 flex flex-col gap-1">
          <span className="text-[10px] uppercase font-bold text-hug-muted">Registered Phone Number</span>
          <span className="font-mono font-bold text-primary dark:text-primary-light text-sm">
            {maskedPhone}
          </span>
          <span className="text-[11px] text-hug-muted mt-0.5">
            A 6-digit SMS verification code was dispatched to this device.
          </span>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-danger-bg text-danger text-xs font-medium flex items-center gap-2 border border-danger/20">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* OTP Input Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
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
                ? `Resend in ${resendCooldown}s`
                : 'Resend SMS Code'}
            </button>
          </div>

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
        </form>
      </div>
    </div>
  );
}
