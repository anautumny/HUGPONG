import React, { useState } from 'react';
import { User, Phone, MapPin, Shield, CheckCircle2, AlertCircle } from 'lucide-react';
import FormField from '../ui/FormField';
import Input from '../ui/Input';
import PasswordInput from '../ui/PasswordInput';
import Button from '../ui/Button';
import { authenticatedRequest } from '../../services/apiClient';

export default function ProfileSettings({
  user = null,
  onUserUpdated,
  className = ''
}) {
  const [isEditingPhone, setIsEditingPhone] = useState(false);
  const [newPhone, setNewPhone] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  const handlePhoneSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    const cleanPhone = newPhone.replace(/\D/g, '');
    if (!/^09\d{9}$/.test(cleanPhone)) {
      setError('Please enter a valid 11-digit Philippine mobile number starting with 09.');
      return;
    }
    if (!currentPassword) {
      setError('Current password is required to change registered mobile number.');
      return;
    }

    setIsSubmitting(true);

    try {
      const res = await authenticatedRequest('/auth/change-phone', {
        method: 'POST',
        body: { phone: cleanPhone, currentPassword }
      });

      if (res.success) {
        setSuccessMsg('Mobile phone number updated successfully.');
        setIsEditingPhone(false);
        setNewPhone('');
        setCurrentPassword('');
        if (onUserUpdated && res.user) {
          onUserUpdated(res.user);
        }
      } else {
        setError(res.error || 'Failed to update phone number.');
      }
    } catch (err) {
      setError(err.message || 'Error updating phone number.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={`space-y-4 ${className}`}>
      <div>
        <h3 className="text-base font-bold text-hug-text">
          Personnel Profile & Contact
        </h3>
        <p className="text-xs text-hug-muted mt-0.5">
          Your official HUGPONG registration identity and verified mobile contact.
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

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
        {/* Full Name */}
        <div className="p-3.5 bg-bg/40 dark:bg-gray-800/30 rounded-xl border border-border">
          <span className="text-[10px] text-hug-muted uppercase font-bold tracking-wider block mb-1">
            Display Name
          </span>
          <span className="text-sm font-bold text-hug-text">
            {user?.displayName || user?.name || 'Authorized User'}
          </span>
        </div>

        {/* User ID */}
        <div className="p-3.5 bg-bg/40 dark:bg-gray-800/30 rounded-xl border border-border">
          <span className="text-[10px] text-hug-muted uppercase font-bold tracking-wider block mb-1">
            System ID (Immutable)
          </span>
          <span className="font-mono text-sm font-bold text-primary dark:text-primary-light">
            {user?.id || user?.employeeId || '—'}
          </span>
        </div>

        {/* Role Clearance */}
        <div className="p-3.5 bg-bg/40 dark:bg-gray-800/30 rounded-xl border border-border">
          <span className="text-[10px] text-hug-muted uppercase font-bold tracking-wider block mb-1">
            Assigned Role
          </span>
          <span className="text-xs font-extrabold text-hug-text">
            {user?.role || user?.roleKey || 'User'}
          </span>
        </div>

        {/* Registered Phone */}
        <div className="p-3.5 bg-bg/40 dark:bg-gray-800/30 rounded-xl border border-border flex items-center justify-between">
          <div>
            <span className="text-[10px] text-hug-muted uppercase font-bold tracking-wider block mb-1">
              Registered Mobile
            </span>
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-bold text-hug-text font-mono">
                {user?.phone || user?.contact || '—'}
              </span>
              {user?.phoneVerified && (
                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded text-[9px] font-bold bg-success-bg text-success border border-success/30">
                  <CheckCircle2 className="w-2.5 h-2.5" /> Verified
                </span>
              )}
            </div>
          </div>

          {!isEditingPhone && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setIsEditingPhone(true);
                setNewPhone(user?.phone || user?.contact || '');
              }}
              className="text-xs"
            >
              Change Phone
            </Button>
          )}
        </div>
      </div>

      {/* Edit Phone Drawer / Form */}
      {isEditingPhone && (
        <form onSubmit={handlePhoneSubmit} className="p-4 bg-bg/60 dark:bg-gray-800/40 rounded-xl border border-border space-y-3 mt-3">
          <h4 className="text-xs font-bold uppercase tracking-wider text-hug-text">
            Update Registered Mobile Number
          </h4>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField
              id="settings-new-phone"
              label="New 11-digit Philippine Mobile"
              required
            >
              <Input
                type="tel"
                id="settings-new-phone"
                placeholder="0917XXXXXXX"
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                disabled={isSubmitting}
                required
              />
            </FormField>

            <FormField
              id="settings-phone-password"
              label="Current Account Password"
              required
              helperText="Required to confirm ownership"
            >
              <PasswordInput
                id="settings-phone-password"
                placeholder="••••••••"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                disabled={isSubmitting}
                required
              />
            </FormField>
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setIsEditingPhone(false);
                setError(null);
              }}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              isLoading={isSubmitting}
            >
              Save New Phone
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
