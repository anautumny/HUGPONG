import React, { useState } from 'react';
import { Lock, CheckCircle2, AlertCircle, KeyRound } from 'lucide-react';
import FormField from '../ui/FormField';
import PasswordInput from '../ui/PasswordInput';
import Button from '../ui/Button';
import { authenticatedRequest } from '../../services/apiClient';

export default function SecuritySettings({
  className = ''
}) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

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
    if (!newPassword || newPassword.length < 8) {
      setError('New password must be at least 8 characters in length.');
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
        body: { currentPassword, newPassword }
      });

      if (res.success) {
        setSuccessMsg('Account password updated successfully. Your new credentials are active.');
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
            helperText="Minimum 8 characters"
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
