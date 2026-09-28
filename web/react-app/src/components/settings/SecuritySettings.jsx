import React, { useState } from 'react';
import { CheckCircle2, AlertCircle, KeyRound, LogOut, MonitorCheck } from 'lucide-react';
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
    <div className={`space-y-4 ${className}`}>
      <div>
        <h3 className="text-base font-bold text-hug-text">
          Security & Password
        </h3>
        <p className="text-xs text-hug-muted mt-0.5">
          Update your login password. Credential hashes are secured via salted scrypt cryptography.
        </p>
      </div>

      {successMsg && (
        <div className="p-3 bg-success-bg border border-success/30 rounded-xl flex items-center gap-2 text-xs font-semibold text-success">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {error && (
        <div className="p-3 bg-danger-bg/40 border border-danger/30 rounded-xl flex items-center gap-2 text-xs font-semibold text-danger">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-3.5 max-w-xl">
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
            required
          />
        </FormField>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FormField
            id="security-new-password"
            label="New Password"
            required
            helperText={PASSWORD_POLICY_HINT}
          >
            <PasswordInput
              id="security-new-password"
              placeholder="••••••••"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              disabled={isSubmitting}
              required
            />
          </FormField>

          <FormField
            id="security-confirm-password"
            label="Confirm New Password"
            required
            helperText="Must match new password"
          >
            <PasswordInput
              id="security-confirm-password"
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={isSubmitting}
              required
            />
          </FormField>
        </div>

        <fieldset className="space-y-2" disabled={isSubmitting}>
          <legend className="text-xs font-semibold text-hug-text2 mb-2">After changing your password</legend>
          <label className={`flex items-start gap-3 rounded-xl border p-3 cursor-pointer transition-colors ${sessionAction === 'KEEP_CURRENT' ? 'border-primary bg-primary-bg/40 dark:bg-primary/10' : 'border-border hover:bg-bg dark:hover:bg-[#0C1015]'}`}>
            <input
              type="radio"
              name="password-session-action"
              value="KEEP_CURRENT"
              checked={sessionAction === 'KEEP_CURRENT'}
              onChange={(event) => setSessionAction(event.target.value)}
              className="mt-0.5 accent-primary"
            />
            <MonitorCheck className="w-4 h-4 text-primary shrink-0 mt-0.5" />
            <span className="min-w-0">
              <span className="block text-xs font-bold text-hug-text">Stay signed in on this device</span>
              <span className="block text-[11px] text-hug-muted mt-0.5">Other devices will be signed out for security.</span>
            </span>
          </label>
          <label className={`flex items-start gap-3 rounded-xl border p-3 cursor-pointer transition-colors ${sessionAction === 'SIGN_OUT_ALL' ? 'border-danger bg-danger-bg/40' : 'border-border hover:bg-bg dark:hover:bg-[#0C1015]'}`}>
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
              <span className="block text-xs font-bold text-hug-text">Sign out all devices</span>
              <span className="block text-[11px] text-hug-muted mt-0.5">This device will also return to the sign-in screen.</span>
            </span>
          </label>
        </fieldset>

        <div className="pt-2">
          <Button
            type="submit"
            variant="primary"
            size="md"
            isLoading={isSubmitting}
            icon={KeyRound}
          >
            Update Password
          </Button>
        </div>
      </form>
    </div>
  );
}
