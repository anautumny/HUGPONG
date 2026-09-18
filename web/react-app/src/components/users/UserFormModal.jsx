import React, { useState, useEffect } from 'react';
import { User, Phone, Lock, Shield, MapPin, AlertCircle, CheckCircle2, KeyRound, Send } from 'lucide-react';
import Modal from '../ui/Modal';
import FormField from '../ui/FormField';
import Input from '../ui/Input';
import PasswordInput from '../ui/PasswordInput';
import Select from '../ui/Select';
import Button from '../ui/Button';
import { approveOrProvisionUser, updateUser, requestPhoneVerification, verifyPhoneOtp } from '../../services/usersService';

export default function UserFormModal({
  isOpen = false,
  onClose,
  initialUser = null,
  currentUser = null,
  blockFarms = [],
  onSaved
}) {
  const isEditing = Boolean(initialUser);

  const actorRole = String(currentUser?.role || currentUser?.roleKey || '').toUpperCase().replace(/ /g, '_');
  const isSuperAdmin = actorRole === 'SUPER_ADMIN';
  const isSraAdmin = actorRole === 'SRA_ADMIN';
  const isFarmManager = actorRole === 'FARM_MANAGER';

  // Form State
  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [selectedRole, setSelectedRole] = useState('MEMBER_FARMER');
  const [blockFarmId, setBlockFarmId] = useState('');
  const [password, setPassword] = useState('');
  
  // Phone OTP Verification State
  const [otpCode, setOtpCode] = useState('');
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
  const [isPhoneVerified, setIsPhoneVerified] = useState(false);
  const [otpSentMessage, setOtpSentMessage] = useState(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);

  // Available roles for creation
  const roleOptions = [
    { value: 'MEMBER_FARMER', label: 'Member Farmer' },
    ...(!isFarmManager ? [{ value: 'FARM_MANAGER', label: 'Farm Manager' }] : []),
    ...(isSuperAdmin ? [
      { value: 'SRA_ADMIN', label: 'SRA Admin' },
      { value: 'SUPER_ADMIN', label: 'Super Admin' }
    ] : [])
  ];

  const farmOptions = [
    { value: '', label: 'Select Assigned Block Farm' },
    ...blockFarms.map(f => ({ value: f.id, label: f.name || f.id }))
  ];

  useEffect(() => {
    if (isOpen) {
      if (initialUser) {
        setDisplayName(initialUser.displayName || initialUser.name || '');
        setPhone(initialUser.phone || initialUser.contact || '');
        setSelectedRole(initialUser.canonicalRole || 'MEMBER_FARMER');
        setBlockFarmId(initialUser.blockFarmId || '');
        setPassword('');
        setIsPhoneVerified(Boolean(initialUser.phoneVerified));
      } else {
        setDisplayName('');
        setPhone('');
        setSelectedRole(isFarmManager ? 'MEMBER_FARMER' : 'FARM_MANAGER');
        setBlockFarmId(currentUser?.blockFarmId || (blockFarms[0]?.id || ''));
        setPassword('');
        setIsPhoneVerified(false);
      }
      setOtpCode('');
      setOtpSentMessage(null);
      setFormError(null);
      setIsSubmitting(false);
    }
  }, [isOpen, initialUser, currentUser, blockFarms, isFarmManager]);

  // Request SMS OTP
  const handleRequestOtp = async () => {
    const cleanPhone = phone.replace(/\D/g, '');
    if (!/^09\d{9}$/.test(cleanPhone)) {
      setFormError('Please enter a valid 11-digit Philippine mobile number starting with 09.');
      return;
    }

    setIsSendingOtp(true);
    setFormError(null);
    try {
      const res = await requestPhoneVerification(cleanPhone, displayName);
      if (res.success) {
        setOtpSentMessage(`Verification challenge sent to ${cleanPhone}.`);
      } else {
        setFormError(res.error || 'Failed to send SMS verification challenge.');
      }
    } catch (err) {
      setFormError(err.message || 'Error sending SMS OTP.');
    } finally {
      setIsSendingOtp(false);
    }
  };

  // Verify SMS OTP
  const handleVerifyOtp = async () => {
    const cleanPhone = phone.replace(/\D/g, '');
    const cleanCode = otpCode.trim();
    if (!/^\d{6}$/.test(cleanCode)) {
      setFormError('Verification code must be 6 digits.');
      return;
    }

    setIsVerifyingOtp(true);
    setFormError(null);
    try {
      const res = await verifyPhoneOtp(cleanPhone, cleanCode);
      if (res.success) {
        setIsPhoneVerified(true);
        setOtpSentMessage('Phone successfully verified.');
      } else {
        setFormError(res.error || 'Invalid verification code.');
      }
    } catch (err) {
      setFormError(err.message || 'Failed to verify code.');
    } finally {
      setIsVerifyingOtp(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError(null);

    const cleanName = displayName.trim();
    const cleanPhone = phone.replace(/\D/g, '');

    if (!cleanName) {
      setFormError('Full display name is required.');
      return;
    }
    if (!/^09\d{9}$/.test(cleanPhone)) {
      setFormError('A valid 11-digit mobile number starting with 09 is required.');
      return;
    }

    if (!isEditing) {
      if (!password || password.length < 8) {
        setFormError('Initial temporary password must be at least 8 characters.');
        return;
      }
    }

    setIsSubmitting(true);

    try {
      if (isEditing) {
        const payload = {
          displayName: cleanName,
          phone: cleanPhone,
          role: selectedRole
        };
        const res = await updateUser(initialUser.id, payload);
        if (res.success) {
          if (onSaved) onSaved(res.data);
          onClose();
        } else {
          setFormError(res.error || 'Failed to update account.');
        }
      } else {
        const payload = {
          displayName: cleanName,
          phone: cleanPhone,
          role: selectedRole,
          password,
          blockFarmId: blockFarmId || undefined,
          phoneVerified: isPhoneVerified,
          requiresPasswordChange: true
        };
        const res = await approveOrProvisionUser(payload);
        if (res.success) {
          if (onSaved) onSaved(res.data);
          onClose();
        } else {
          setFormError(res.error || 'Failed to provision account.');
        }
      }
    } catch (err) {
      setFormError(err.message || 'An error occurred during account saving.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? 'Edit Personnel Profile' : 'Provision Personnel Account'}
      subtitle={isEditing ? 'Update authorized credentials and assignment.' : 'Create authorized personnel or member farmer credentials.'}
      icon={User}
      badge={isEditing ? 'Update Profile' : 'New Personnel'}
      size="md"
      preventBackdropClose={isSubmitting}
      preventEscapeClose={isSubmitting}
      isLoading={isSubmitting}
      footer={
        <div className="flex items-center justify-end gap-2.5 w-full">
          <Button
            variant="ghost"
            size="md"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            size="md"
            onClick={handleSubmit}
            isLoading={isSubmitting}
          >
            {isEditing ? 'Save Changes' : 'Provision Account'}
          </Button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {formError && (
          <div className="p-3 bg-danger-bg/40 border border-danger/30 rounded-xl flex items-start gap-2 text-xs font-semibold text-danger">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{formError}</span>
          </div>
        )}

        {/* Display Name */}
        <FormField
          id="user-form-name"
          label="Full Display Name"
          required
          helperText="Official full legal name of the personnel or cooperative farmer"
        >
          <Input
            type="text"
            id="user-form-name"
            placeholder="e.g. Juan dela Cruz"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            disabled={isSubmitting}
            required
          />
        </FormField>

        {/* Mobile Phone & SMS Verification */}
        <div className="space-y-2">
          <FormField
            id="user-form-phone"
            label="Philippine Mobile Number"
            required
            helperText="11-digit mobile number used for official OTP verification and login"
          >
            <div className="flex gap-2">
              <Input
                type="tel"
                id="user-form-phone"
                placeholder="0917XXXXXXX"
                icon={Phone}
                value={phone}
                onChange={(e) => {
                  setPhone(e.target.value);
                  setIsPhoneVerified(false);
                }}
                disabled={isSubmitting}
                required
              />

              {!isEditing && !isPhoneVerified && (
                <Button
                  type="button"
                  variant="outline"
                  size="md"
                  onClick={handleRequestOtp}
                  isLoading={isSendingOtp}
                  disabled={isSubmitting || !/^09\d{9}$/.test(phone.replace(/\D/g, ''))}
                  icon={Send}
                  className="shrink-0 text-xs"
                >
                  Verify SIM
                </Button>
              )}
            </div>
          </FormField>

          {/* OTP Input row when OTP sent */}
          {otpSentMessage && !isPhoneVerified && (
            <div className="p-3 bg-bg dark:bg-gray-800/60 rounded-xl border border-border flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <span className="text-xs text-hug-text flex-1">
                {otpSentMessage} Enter 6-digit challenge code:
              </span>
              <div className="flex gap-1.5 shrink-0">
                <input
                  type="text"
                  maxLength="6"
                  placeholder="123456"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                  className="w-24 px-2 py-1 text-center font-mono text-xs font-bold rounded-lg border border-border bg-white dark:bg-surface text-hug-text"
                />
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={handleVerifyOtp}
                  isLoading={isVerifyingOtp}
                  disabled={otpCode.length !== 6}
                >
                  Confirm
                </Button>
              </div>
            </div>
          )}

          {isPhoneVerified && (
            <div className="flex items-center gap-1.5 text-xs font-bold text-success">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Mobile phone verified via server OTP.</span>
            </div>
          )}
        </div>

        {/* Role & Block Farm */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FormField
            id="user-form-role"
            label="System Role"
            required
            helperText="Clearance level and portal permissions"
          >
            <Select
              id="user-form-role"
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value)}
              options={roleOptions}
              disabled={isSubmitting}
            />
          </FormField>

          {(selectedRole === 'MEMBER_FARMER' || selectedRole === 'FARM_MANAGER') && (
            <FormField
              id="user-form-farm"
              label="Assigned Block Farm"
              required={selectedRole === 'FARM_MANAGER'}
              helperText="Affiliated cooperative sugarcane cluster"
            >
              <Select
                id="user-form-farm"
                value={blockFarmId}
                onChange={(e) => setBlockFarmId(e.target.value)}
                options={farmOptions}
                disabled={isSubmitting || isFarmManager}
              />
            </FormField>
          )}
        </div>

        {/* Initial Password (Creation only) */}
        {!isEditing && (
          <FormField
            id="user-form-password"
            label="Temporary Initial Password"
            required
            helperText="Minimum 8 characters. User will be prompted to change password on first login."
          >
            <PasswordInput
              id="user-form-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isSubmitting}
              required
            />
          </FormField>
        )}
      </form>
    </Modal>
  );
}
