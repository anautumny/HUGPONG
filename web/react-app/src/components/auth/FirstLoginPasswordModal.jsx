import React, { useState, useRef, useEffect } from 'react';
import { Lock, Eye, EyeOff, Check, Circle, AlertCircle, RefreshCw } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export default function FirstLoginPasswordModal({
  isOpen,
  pendingUser,
  pendingToken,
  onPasswordChangeSuccess,
  onCancel
}) {
  const { changePassword } = useAuth();

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setNewPassword('');
      setConfirmPassword('');
      setError('');
      setTimeout(() => {
        if (inputRef.current) inputRef.current.focus();
      }, 150);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Real-time validation checks matching Stage 7
  const isLengthValid = newPassword.length >= 8;
  const isCaseValid = /[a-z]/.test(newPassword) && /[A-Z]/.test(newPassword);
  const isNumberValid = /[0-9]/.test(newPassword);
  const lower = newPassword.toLowerCase();
  const isNotDefault =
    newPassword.length > 0 &&
    lower !== 'hugpong' &&
    lower !== 'hugpong2026' &&
    lower !== 'password123' &&
    lower !== 'admin@hugpong';

  const isFormValid = isLengthValid && isCaseValid && isNumberValid && isNotDefault && newPassword === confirmPassword;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!isLengthValid) {
      setError('Password must be at least 8 characters long.');
      return;
    }
    if (!isCaseValid) {
      setError('Password must contain both uppercase (A-Z) and lowercase (a-z) letters.');
      return;
    }
    if (!isNumberValid) {
      setError('Password must contain at least one number (0-9).');
      return;
    }
    if (!isNotDefault) {
      setError('Please choose a unique password different from default temporary passwords.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match. Please re-enter your password to confirm.');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await changePassword(newPassword, pendingToken);
      onPasswordChangeSuccess(result);
    } catch (err) {
      setError(err.message || 'Failed to update password. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const userName = pendingUser?.name || 'Personnel';
  const userMeta = `${pendingUser?.employeeId || 'User'} (${pendingUser?.role || 'Operator'})`;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Set Your New Secure Password"
      className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-xs animate-in fade-in duration-150"
    >
      <div className="bg-white dark:bg-surface border border-border rounded-2xl p-6 sm:p-7 max-w-md w-full shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 flex items-center justify-center shrink-0 border border-amber-200 dark:border-amber-800/40">
            <Lock className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <h3 className="text-base font-extrabold text-hug-text">Set Your New Secure Password</h3>
            <p className="text-xs text-hug-muted mt-0.5">
              Welcome to HUGPONG! Since this is your first time logging in, please create a new secure password to protect your account and farm records.
            </p>
          </div>
        </div>

        {/* User Identity Box */}
        <div className="p-3 bg-bg dark:bg-[#0C1015] rounded-xl border border-border text-xs text-hug-text2 flex flex-col gap-1.5">
          <div className="flex justify-between items-center">
            <span className="text-[10px] uppercase font-bold text-hug-muted">Account Holder</span>
            <span className="font-bold text-hug-text text-xs">{userName}</span>
          </div>
          <div className="flex justify-between items-center pt-1 border-t border-border/60">
            <span className="text-[10px] uppercase font-bold text-hug-muted">User ID / Role</span>
            <span className="font-mono font-semibold text-primary dark:text-primary-light text-xs">{userMeta}</span>
          </div>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-danger-bg text-danger text-xs font-medium flex items-center gap-2 border border-danger/20">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Password Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {/* New Password Input */}
          <div className="flex flex-col gap-1">
            <label htmlFor="new-password-input" className="text-xs font-semibold text-hug-text2">
              New Password <span className="text-danger">*</span>
            </label>
            <div className="relative">
              <input
                ref={inputRef}
                id="new-password-input"
                type={showNewPassword ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Minimum 8 characters"
                className="w-full text-xs font-semibold px-3 py-2.5 pr-9 border border-border rounded-xl bg-white dark:bg-[#0C1015] text-hug-text focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                autoComplete="new-password"
                disabled={isSubmitting}
                required
              />
              <button
                type="button"
                onClick={() => setShowNewPassword((prev) => !prev)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-hug-muted hover:text-hug-text cursor-pointer p-1"
                aria-label={showNewPassword ? 'Hide password' : 'Show password'}
              >
                {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Confirm Password Input */}
          <div className="flex flex-col gap-1">
            <label htmlFor="confirm-password-input" className="text-xs font-semibold text-hug-text2">
              Confirm New Password <span className="text-danger">*</span>
            </label>
            <div className="relative">
              <input
                id="confirm-password-input"
                type={showConfirmPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter new password"
                className="w-full text-xs font-semibold px-3 py-2.5 pr-9 border border-border rounded-xl bg-white dark:bg-[#0C1015] text-hug-text focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                autoComplete="new-password"
                disabled={isSubmitting}
                required
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword((prev) => !prev)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-hug-muted hover:text-hug-text cursor-pointer p-1"
                aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
              >
                {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Security Requirements Checklist */}
          <div className="bg-primary-bg/40 dark:bg-primary/10 p-2.5 rounded-xl border border-primary/20 text-[11px] text-hug-text2 flex flex-col gap-1.5 mt-1">
            <span className="font-bold text-primary dark:text-primary-light">Security Requirements:</span>
            <div className="grid grid-cols-1 gap-1 text-[10.5px]">
              <div
                className={`flex items-center gap-1.5 font-medium transition-colors ${
                  isLengthValid ? 'text-primary dark:text-primary-light font-bold' : 'text-hug-muted'
                }`}
              >
                {isLengthValid ? (
                  <span className="w-3.5 h-3.5 rounded-full bg-primary text-white flex items-center justify-center text-[9px] font-black shrink-0">
                    <Check className="w-2.5 h-2.5 stroke-[3]" />
                  </span>
                ) : (
                  <Circle className="w-3.5 h-3.5 text-hug-muted shrink-0" />
                )}
                <span>At least 8 characters long</span>
              </div>

              <div
                className={`flex items-center gap-1.5 font-medium transition-colors ${
                  isCaseValid ? 'text-primary dark:text-primary-light font-bold' : 'text-hug-muted'
                }`}
              >
                {isCaseValid ? (
                  <span className="w-3.5 h-3.5 rounded-full bg-primary text-white flex items-center justify-center text-[9px] font-black shrink-0">
                    <Check className="w-2.5 h-2.5 stroke-[3]" />
                  </span>
                ) : (
                  <Circle className="w-3.5 h-3.5 text-hug-muted shrink-0" />
                )}
                <span>Contains both UPPERCASE &amp; lowercase letters (A-Z, a-z)</span>
              </div>

              <div
                className={`flex items-center gap-1.5 font-medium transition-colors ${
                  isNumberValid ? 'text-primary dark:text-primary-light font-bold' : 'text-hug-muted'
                }`}
              >
                {isNumberValid ? (
                  <span className="w-3.5 h-3.5 rounded-full bg-primary text-white flex items-center justify-center text-[9px] font-black shrink-0">
                    <Check className="w-2.5 h-2.5 stroke-[3]" />
                  </span>
                ) : (
                  <Circle className="w-3.5 h-3.5 text-hug-muted shrink-0" />
                )}
                <span>Contains at least one number (0-9)</span>
              </div>

              <div
                className={`flex items-center gap-1.5 font-medium transition-colors ${
                  isNotDefault ? 'text-primary dark:text-primary-light font-bold' : 'text-hug-muted'
                }`}
              >
                {isNotDefault ? (
                  <span className="w-3.5 h-3.5 rounded-full bg-primary text-white flex items-center justify-center text-[9px] font-black shrink-0">
                    <Check className="w-2.5 h-2.5 stroke-[3]" />
                  </span>
                ) : (
                  <Circle className="w-3.5 h-3.5 text-hug-muted shrink-0" />
                )}
                <span>Cannot be default password ("hugpong" / "hugpong2026")</span>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end gap-2 pt-2 border-t border-border mt-1">
            <button
              type="button"
              onClick={onCancel}
              disabled={isSubmitting}
              className="px-4 py-2.5 border border-border text-hug-text2 text-xs font-bold rounded-xl hover:bg-bg dark:hover:bg-[#0C1015] transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Sign Out
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !isFormValid}
              className="px-4 py-2.5 bg-primary hover:bg-primary-dark text-white text-xs font-bold rounded-xl transition-all cursor-pointer shadow-sm flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
              <span>{isSubmitting ? 'Saving password...' : 'Save Password & Open Workspace'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
