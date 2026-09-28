import React, { useState } from 'react';
import { CheckCircle2, AlertCircle, KeyRound, LogOut, MonitorCheck, ShieldCheck } from 'lucide-react';
import FormField from '../ui/FormField';
import PasswordInput from '../ui/PasswordInput';
import Button from '../ui/Button';
import { authenticatedRequest } from '../../services/apiClient';
import { useAuth } from '../../context/AuthContext';
import { PASSWORD_POLICY_HINT, passwordPolicyError } from '../../domain/passwordPolicy';

export default function SecuritySettings({
  className = ''
}) {
  const { clearSession, roleKey, saveSession } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [sessionAction, setSessionAction] = useState('KEEP_CURRENT');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    if (!currentPassword) {
      setError('Current password is required.');
      return;
    }
    const policyError = passwordPolicyError(newPassword);
    if (policyError) {
      setError(policyError);
      return;
    }
    if (newPassword === currentPassword) {
      setError('New password must be different from the current password.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('New passwords do not match. Please verify confirmation.');
      return;
    }

    setIsSubmitting(true);

    try {
      const res = await authenticatedRequest('/auth/change-password', {
        method: 'POST',
        body: { currentPassword, newPassword, sessionAction }
      });

      if (res.success) {
        if (res.signOutRequired) {
          clearSession('Your password was changed and all devices were signed out. Sign in with your new password.');
          return;
        }
        if (res.user) saveSession(res.user, roleKey);
        setSuccessMsg('Password updated. This device remains signed in; all other devices were signed out.');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        setError(res.error || 'Failed to update password.');
      }
    } catch (err) {
      setError(err.message || 'An error occurred during password update.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={`space-y-3.5 ${className}`}>
      {/* Section Header */}
      <div className="flex items-center justify-between pb-1 border-b border-border/60">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-primary/10 dark:bg-primary/20 text-primary dark:text-primary-light flex items-center justify-center shrink-0">
            <KeyRound className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-hug-text leading-tight">
              Security &amp; Password
            </h3>
            <p className="text-[11px] text-hug-muted leading-tight">
              Credential hashing secured via salted scrypt cryptography
            </p>
          </div>
        </div>
      </div>

      {successMsg && (
        <div className="p-2.5 bg-success-bg border border-success/30 rounded-xl flex items-center gap-2 text-xs font-semibold text-success animate-in fade-in duration-150">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {error && (
        <div className="p-2.5 bg-danger-bg/40 border border-danger/30 rounded-xl flex items-center gap-2 text-xs font-semibold text-danger animate-in fade-in duration-150">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-3 flex-1 flex flex-col">
        {/* Current Password */}
        <FormField
          id="security-current-password"
          label="Current Password"
          required
        >
          <PasswordInput
            id="security-current-password"
            placeholder="••••••••"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            disabled={isSubmitting}
            className="py-1.5 text-xs"
            required
          />
        </FormField>

        {/* New & Confirm Password Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <FormField
            id="security-new-password"
            label="New Password"
            required
          >
            <PasswordInput
              id="security-new-password"
              placeholder="••••••••"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              disabled={isSubmitting}
              className="py-1.5 text-xs"
              required
            />
          </FormField>

          <FormField
            id="security-confirm-password"
            label="Confirm New Password"
            required
          >
            <PasswordInput
              id="security-confirm-password"
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={isSubmitting}
              className="py-1.5 text-xs"
              required
            />
          </FormField>
        </div>

        {/* Password Policy Guidance */}
        <div className="p-2.5 rounded-xl border border-border/70 bg-surface-subtle/50 dark:bg-surface-elevated/30 text-[11px] text-hug-muted flex items-start gap-2">
          <ShieldCheck className="w-3.5 h-3.5 text-primary dark:text-primary-light shrink-0 mt-0.5" />
          <span className="leading-snug">{PASSWORD_POLICY_HINT}</span>
        </div>

        {/* Post-Change Session Choice */}
        <fieldset className="space-y-1.5 pt-1" disabled={isSubmitting}>
          <legend className="text-[11px] font-bold text-hug-muted uppercase tracking-wider mb-1.5">
            After changing your password
          </legend>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <label className={`flex items-start gap-2.5 rounded-xl border p-2.5 cursor-pointer transition-colors ${
              sessionAction === 'KEEP_CURRENT'
                ? 'border-primary/80 bg-primary-bg/50 dark:bg-primary/20 ring-1 ring-primary/30'
                : 'border-border bg-surface-subtle/30 dark:bg-surface-elevated/20 hover:bg-surface-subtle/80'
            }`}>
              <input
                type="radio"
                name="password-session-action"
                value="KEEP_CURRENT"
                checked={sessionAction === 'KEEP_CURRENT'}
                onChange={(event) => setSessionAction(event.target.value)}
                className="mt-0.5 accent-primary"
              />
              <MonitorCheck className="w-4 h-4 text-primary dark:text-primary-light shrink-0 mt-0.5" />
              <span className="min-w-0">
                <span className="block text-xs font-bold text-hug-text leading-tight">
                  Stay signed in on this device
                </span>
                <span className="block text-[10px] text-hug-muted mt-0.5 leading-snug">
                  Other devices will be signed out for security.
                </span>
              </span>
            </label>

            <label className={`flex items-start gap-2.5 rounded-xl border p-2.5 cursor-pointer transition-colors ${
              sessionAction === 'SIGN_OUT_ALL'
                ? 'border-danger/80 bg-danger-bg/50 dark:bg-danger/20 ring-1 ring-danger/30'
                : 'border-border bg-surface-subtle/30 dark:bg-surface-elevated/20 hover:bg-surface-subtle/80'
            }`}>
              <input
                type="radio"
                name="password-session-action"
                value="SIGN_OUT_ALL"
                checked={sessionAction === 'SIGN_OUT_ALL'}
                onChange={(event) => setSessionAction(event.target.value)}
                className="mt-0.5 accent-danger"
              />
              <LogOut className="w-4 h-4 text-danger shrink-0 mt-0.5" />
              <span className="min-w-0">
                <span className="block text-xs font-bold text-hug-text leading-tight">
                  Sign out all devices
                </span>
                <span className="block text-[10px] text-hug-muted mt-0.5 leading-snug">
                  This device will also return to the sign-in screen.
                </span>
              </span>
            </label>
          </div>
        </fieldset>

        {/* Action Button */}
        <div className="pt-2 flex items-center justify-between border-t border-border/60 mt-auto">
          <Button
            type="submit"
            variant="primary"
            size="sm"
            isLoading={isSubmitting}
            icon={KeyRound}
            className="text-xs py-1.5 px-4"
          >
            Update Password
          </Button>
          <span className="text-[10px] text-hug-muted hidden sm:inline font-medium">
            Requires current credentials verification
          </span>
        </div>
      </form>
    </div>
  );
}
