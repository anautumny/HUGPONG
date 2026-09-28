import React, { useState } from 'react';
import { User, Phone, ShieldCheck, CheckCircle2, AlertCircle } from 'lucide-react';
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
  const [pendingPhone, setPendingPhone] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  
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

      setPendingPhone(cleanPhone);
      setVerificationCode('');
      setSuccessMsg(`A verification code was sent to ${cleanPhone}. Your current number is still registered.`);
    } catch (err) {
      setError(err.message || 'The verification code could not be sent.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePhoneVerification = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    if (!/^\d{6}$/.test(verificationCode)) {
      setError('Enter the 6-digit code sent to the new mobile number.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await authenticatedRequest('/auth/change-phone/verify', {
        method: 'POST',
        body: { phone: pendingPhone, code: verificationCode }
      });
      setSuccessMsg('The new mobile number was verified and registered successfully.');
      setIsEditingPhone(false);
      setNewPhone('');
      setCurrentPassword('');
      setPendingPhone('');
      setVerificationCode('');
      if (onUserUpdated && res.user) await onUserUpdated(res.user);
    } catch (err) {
      setError(err.message || 'The new mobile number could not be verified.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetPhoneEditor = () => {
    setIsEditingPhone(false);
    setNewPhone('');
    setCurrentPassword('');
    setPendingPhone('');
    setVerificationCode('');
    setError(null);
  };

  const displayName = user?.displayName || user?.name || 'Authorized Personnel';
  const userInitial = displayName.charAt(0).toUpperCase() || 'U';

  return (
    <div className={`space-y-3.5 ${className}`}>
      {/* Section Header */}
      <div className="flex items-center justify-between pb-1 border-b border-border/60">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-primary/10 dark:bg-primary/20 text-primary dark:text-primary-light flex items-center justify-center shrink-0">
            <User className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-hug-text leading-tight">
              Personnel Profile & Contact
            </h3>
            <p className="text-[11px] text-hug-muted leading-tight">
              Official identity and verified mobile contact
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

      {/* Identity Summary Card */}
      <div className="p-3 bg-surface-subtle/50 dark:bg-surface-elevated/30 rounded-xl border border-border flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-primary/10 text-primary dark:bg-primary/20 dark:text-primary-light border border-primary/25 flex items-center justify-center font-black text-sm shrink-0 shadow-2xs">
          {userInitial}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="text-xs sm:text-sm font-black text-hug-text truncate">
              {displayName}
            </h4>
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-primary-bg dark:bg-primary/20 text-primary dark:text-primary-light border border-primary/25">
              <ShieldCheck className="w-3 h-3" />
              {user?.role || user?.roleKey || 'User'}
            </span>
          </div>
          <p className="text-[11px] text-hug-muted truncate mt-0.5 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-success shrink-0" />
            <span>Active Station Clearance</span>
          </p>
        </div>
      </div>

      {/* Attributes Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {/* System ID */}
        <div className="p-2.5 bg-surface-subtle/40 dark:bg-surface-elevated/20 rounded-xl border border-border/80">
          <span className="text-[10px] text-hug-muted uppercase font-bold tracking-wider block">
            System ID (Immutable)
          </span>
          <span className="font-mono text-xs font-bold text-primary dark:text-primary-light block mt-0.5 truncate">
            {user?.id || user?.employeeId || '—'}
          </span>
        </div>

        {/* Role Clearance */}
        <div className="p-2.5 bg-surface-subtle/40 dark:bg-surface-elevated/20 rounded-xl border border-border/80">
          <span className="text-[10px] text-hug-muted uppercase font-bold tracking-wider block">
            Assigned Role
          </span>
          <span className="text-xs font-extrabold text-hug-text block mt-0.5 truncate">
            {user?.role || user?.roleKey || 'User'}
          </span>
        </div>

        {/* Registered Phone */}
        <div className="sm:col-span-2 p-2.5 bg-surface-subtle/40 dark:bg-surface-elevated/20 rounded-xl border border-border/80 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <span className="text-[10px] text-hug-muted uppercase font-bold tracking-wider block">
              Registered Mobile
            </span>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <span className="text-xs font-bold text-hug-text font-mono">
                {user?.phone || user?.contact || '—'}
              </span>
              {user?.phoneVerified && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[9px] font-bold bg-success-bg text-success border border-success/30">
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
              className="text-xs py-1 px-2.5 shrink-0"
            >
              Change Phone
            </Button>
          )}
        </div>
      </div>

      {/* Edit Phone Form */}
      {isEditingPhone && !pendingPhone && (
        <form onSubmit={handlePhoneSubmit} className="p-3 bg-surface-subtle/80 dark:bg-surface-elevated/40 rounded-xl border border-border space-y-2.5 animate-in fade-in duration-150">
          <div className="flex items-center justify-between">
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-hug-text">
              Update Registered Mobile
            </h4>
            <span className="text-[10px] text-hug-muted">Verify before saving</span>
          </div>

          <p className="text-[11px] leading-relaxed text-hug-muted bg-primary-bg/60 dark:bg-primary/10 border border-primary/20 rounded-lg p-2.5">
            Your current number remains registered until the SMS code sent to the new number is verified.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <FormField
              id="settings-new-phone"
              label="New Mobile (09XX...)"
              required
            >
              <Input
                type="tel"
                id="settings-new-phone"
                placeholder="0917XXXXXXX"
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                disabled={isSubmitting}
                className="py-1.5 text-xs font-mono"
                required
              />
            </FormField>

            <FormField
              id="settings-phone-password"
              label="Account Password"
              required
              helperText="Confirm ownership"
            >
              <PasswordInput
                id="settings-phone-password"
                placeholder="••••••••"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                disabled={isSubmitting}
                className="py-1.5 text-xs"
                required
              />
            </FormField>
          </div>

          <div className="flex items-center justify-end gap-2 pt-1 border-t border-border/60">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                resetPhoneEditor();
              }}
              disabled={isSubmitting}
              className="text-xs py-1 px-2.5"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              isLoading={isSubmitting}
              className="text-xs py-1 px-3"
            >
              Send Verification Code
            </Button>
          </div>
        </form>
      )}

      {isEditingPhone && pendingPhone && (
        <form onSubmit={handlePhoneVerification} className="p-3 bg-surface-subtle/80 dark:bg-surface-elevated/40 rounded-xl border border-primary/30 space-y-3 animate-in fade-in duration-150">
          <div>
            <h4 className="text-xs font-bold text-hug-text">Confirm the new mobile number</h4>
            <p className="text-[11px] text-hug-muted mt-1">Enter the 6-digit SMS code sent to <span className="font-mono font-bold text-hug-text">{pendingPhone}</span>.</p>
          </div>
          <FormField id="settings-phone-code" label="Verification Code" required>
            <Input
              id="settings-phone-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="000000"
              value={verificationCode}
              onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              disabled={isSubmitting}
              className="py-2 text-center text-lg tracking-[0.35em] font-mono font-black"
              maxLength={6}
              autoFocus
              required
            />
          </FormField>
          <div className="flex items-center justify-between gap-2 pt-1 border-t border-border/60">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setPendingPhone('');
                setVerificationCode('');
                setSuccessMsg(null);
              }}
              disabled={isSubmitting}
              className="text-xs py-1 px-2.5"
            >
              Edit Number
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              isLoading={isSubmitting}
              disabled={verificationCode.length !== 6}
              className="text-xs py-1 px-3"
            >
              Verify &amp; Update
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
