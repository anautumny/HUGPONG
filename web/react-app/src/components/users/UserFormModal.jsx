import React, { useState, useEffect } from 'react';
import { User, Phone, AlertCircle, ShieldCheck } from 'lucide-react';
import Modal from '../ui/Modal';
import FormField from '../ui/FormField';
import Input from '../ui/Input';
import PasswordInput from '../ui/PasswordInput';
import Select from '../ui/Select';
import Button from '../ui/Button';
import { approveOrProvisionUser, updateUser } from '../../services/usersService';
import { PASSWORD_POLICY_HINT, passwordPolicyError } from '../../domain/passwordPolicy';

export default function UserFormModal({
  isOpen = false,
  onClose,
  initialUser = null,
  currentUser = null,
  blockFarms = [],
  onSaved,
  onCreated
}) {
  const isEditing = Boolean(initialUser);

  const actorRole = String(currentUser?.role || currentUser?.roleKey || '').toUpperCase().replace(/ /g, '_');
  const isSuperAdmin = actorRole === 'SUPER_ADMIN';
  const isSraAdmin = actorRole === 'SRA_ADMIN';
  const isFarmManager = actorRole === 'FARM_MANAGER';

  // Form State
  const [firstName, setFirstName] = useState('');
  const [middleName, setMiddleName] = useState('');
  const [lastName, setLastName] = useState('');
  const [suffix, setSuffix] = useState('');
  const [phone, setPhone] = useState('');
  const [selectedRole, setSelectedRole] = useState('MEMBER_FARMER');
  const [blockFarmId, setBlockFarmId] = useState('');
  const [password, setPassword] = useState('');
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);

  // Available roles for creation with platform scope indicators
  const roleOptions = [
    { value: 'MEMBER_FARMER', label: 'Farm Member (Mobile Only)' },
    ...(!isFarmManager ? [{ value: 'FARM_MANAGER', label: 'Farm Manager (Web & Mobile)' }] : []),
    ...(isSuperAdmin ? [
      { value: 'SRA_ADMIN', label: 'SRA Admin (Web & Mobile)' },
      { value: 'SUPER_ADMIN', label: 'Super Admin (Web Console Only)' }
    ] : [])
  ];

  const farmOptions = [
    { value: '', label: 'Not assigned yet' },
    ...(Array.isArray(blockFarms) ? blockFarms : [])
      .filter(farm => farm && typeof farm === 'object' && farm.id && String(farm.status || 'ACTIVE').toUpperCase() === 'ACTIVE')
      .map(farm => {
        const assignedManagerId = String(farm.managerUserId || '').trim();
        const isAssignedToAnotherManager = selectedRole === 'FARM_MANAGER'
          && assignedManagerId
          && assignedManagerId !== String(initialUser?.id || '').trim();
        return {
          value: String(farm.id),
          label: `${String(farm.name || farm.id)}${isAssignedToAnotherManager ? ' (already assigned)' : ''}`,
          disabled: Boolean(isAssignedToAnotherManager)
        };
      })
  ];

  useEffect(() => {
    if (isOpen) {
      if (initialUser) {
        setFirstName(initialUser.firstName || (!initialUser.lastName ? (initialUser.displayName || initialUser.name || '') : ''));
        setMiddleName(initialUser.middleName || '');
        setLastName(initialUser.lastName || '');
        setSuffix(initialUser.suffix || '');
        setPhone(initialUser.phone || initialUser.contact || '');
        setSelectedRole(initialUser.canonicalRole || 'MEMBER_FARMER');
        setBlockFarmId(initialUser.assignment?.blockFarmId || '');
        setPassword('');
      } else {
        setFirstName('');
        setMiddleName('');
        setLastName('');
        setSuffix('');
        setPhone('');
        setSelectedRole(isFarmManager ? 'MEMBER_FARMER' : 'FARM_MANAGER');
        setBlockFarmId(currentUser?.blockFarmId || '');
        setPassword('');
      }
      setFormError(null);
      setIsSubmitting(false);
    }
  }, [isOpen, initialUser, currentUser, blockFarms, isFarmManager]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError(null);

    const cleanFirstName = firstName.trim();
    const cleanMiddleName = middleName.trim();
    const cleanLastName = lastName.trim();
    const cleanSuffix = suffix.trim();
    const cleanPhone = phone.replace(/\D/g, '');

    if (!cleanFirstName || !cleanLastName) {
      setFormError('First name and last name are required.');
      return;
    }
    if (!/^09\d{9}$/.test(cleanPhone)) {
      setFormError('A valid 11-digit mobile number starting with 09 is required.');
      return;
    }
    if ((selectedRole === 'FARM_MANAGER' || isFarmManager) && !blockFarmId) {
      setFormError('Select a Block Farm before creating this account.');
      return;
    }

    if (!isEditing) {
      const policyError = passwordPolicyError(password);
      if (policyError) {
        setFormError(`Initial temporary password: ${policyError}`);
        return;
      }
    }

    setIsSubmitting(true);

    try {
      if (isEditing) {
        const payload = {
          firstName: cleanFirstName,
          middleName: cleanMiddleName,
          lastName: cleanLastName,
          suffix: cleanSuffix,
          phone: cleanPhone,
          role: selectedRole,
          ...(selectedRole === 'FARM_MANAGER' ? { blockFarmId } : {})
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
          firstName: cleanFirstName,
          middleName: cleanMiddleName,
          lastName: cleanLastName,
          suffix: cleanSuffix,
          phone: cleanPhone,
          role: selectedRole,
          password,
          blockFarmId: blockFarmId || undefined,
          requiresPasswordChange: true
        };
        const res = await approveOrProvisionUser(payload);
        if (res.success) {
          if (onSaved) onSaved(res.data);
          if (onCreated) onCreated({ ...res.data, accountId: res.accountId || res.data?.id });
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
      subtitle={isEditing ? 'Update authorized credentials and assignment.' : 'Create authorized personnel or Farm Member credentials.'}
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

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FormField id="user-form-first-name" label="First Name" required>
            <Input
              type="text"
              id="user-form-first-name"
              placeholder="e.g. Juan"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              disabled={isSubmitting}
              required
            />
          </FormField>
          <FormField id="user-form-middle-name" label="Middle Name" helperText="Optional">
            <Input
              type="text"
              id="user-form-middle-name"
              placeholder="e.g. Mendoza"
              value={middleName}
              onChange={(e) => setMiddleName(e.target.value)}
              disabled={isSubmitting}
            />
          </FormField>
          <FormField id="user-form-last-name" label="Last Name" required>
            <Input
              type="text"
              id="user-form-last-name"
              placeholder="e.g. Dela Cruz"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              disabled={isSubmitting}
              required
            />
          </FormField>
          <FormField id="user-form-suffix" label="Suffix" helperText="Optional, such as Jr. or III">
            <Input
              type="text"
              id="user-form-suffix"
              placeholder="e.g. Jr."
              value={suffix}
              onChange={(e) => setSuffix(e.target.value)}
              disabled={isSubmitting}
            />
          </FormField>
        </div>

        {isEditing && !initialUser?.lastName && (
          <div className="rounded-xl border border-amber-300/60 bg-amber-50 p-3 text-xs text-amber-800">
            This legacy account has a combined name. Place it into the correct name fields before saving.
          </div>
        )}

        {/* Mobile Phone */}
        <div className="space-y-2">
          <FormField
            id="user-form-phone"
            label="Philippine Mobile Number"
            required
            helperText="11-digit mobile number used for login and account-owner verification"
          >
            <Input
              type="tel"
              id="user-form-phone"
              placeholder="0917XXXXXXX"
              icon={Phone}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              disabled={isSubmitting}
              required
            />
          </FormField>

          {!isEditing && (
            <div className="flex items-start gap-2 rounded-xl border border-primary/20 bg-primary-bg/50 p-3 text-xs leading-relaxed text-hug-text2">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span>The account owner will receive and enter the verification code on first login. Administrators cannot verify a phone on another user&apos;s behalf.</span>
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
              required={selectedRole === 'FARM_MANAGER' || isFarmManager}
              helperText={selectedRole === 'MEMBER_FARMER' && !isFarmManager
                ? 'Optional. An SRA Admin can assign an unassigned member later.'
                : 'Affiliated cooperative sugarcane cluster'}
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
            helperText={`${PASSWORD_POLICY_HINT} On first login, the user verifies the registered phone and then replaces this password.`}
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
