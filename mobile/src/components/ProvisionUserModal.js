import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Modal, ScrollView, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, RADIUS, SPACING } from '../theme';
import { canonicalRole } from '../data/firestoreSchema';
import { provisionUserAccount } from '../data/dataStore';
import { passwordPolicyError, PASSWORD_POLICY_HINT } from '../domain/passwordPolicy';
import {
  DEFAULT_PHONE_VERIFICATION_REASON,
  PHONE_VERIFICATION_REASONS,
  isOtherPhoneVerificationReason
} from '../domain/phoneVerification';
import { uniqueRecordsById } from '../utils/dataHelpers';
import { AppText as Text, AppTextInput as TextInput } from './Typography';

const emptyForm = {
  firstName: '', middleName: '', lastName: '', suffix: '', phone: '', password: '',
  role: 'MEMBER_FARMER', blockFarmId: '', phoneVerificationMode: 'REQUIRED',
  verificationReasonCode: DEFAULT_PHONE_VERIFICATION_REASON, verificationReasonDetails: ''
};

export default function ProvisionUserModal({ visible, onClose, session, blockFarms = [], onCreated }) {
  const actorRole = canonicalRole(session?.role || session?.roleKey);
  const actorId = String(session?.employeeId || session?.id || '').trim();
  const [form, setForm] = useState(emptyForm);
  const [fieldErrors, setFieldErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const closeRequestedRef = useRef(false);

  useEffect(() => {
    if (!visible) return;
    closeRequestedRef.current = false;
    const managerFarm = blockFarms.find(farm => String(farm.managerUserId || '').trim() === actorId);
    setForm({
      ...emptyForm,
      role: actorRole === 'SRA_ADMIN' ? 'FARM_MANAGER' : 'MEMBER_FARMER',
      blockFarmId: actorRole === 'FARM_MANAGER' ? String(managerFarm?.id || session?.blockFarmId || '') : ''
    });
    setFieldErrors({});
    setSaving(false);
  }, [visible, actorRole, actorId, blockFarms, session?.blockFarmId]);

  const closeOnce = useCallback(() => {
    if (closeRequestedRef.current) return;
    closeRequestedRef.current = true;
    setFieldErrors({});
    onClose?.();
  }, [onClose]);

  const availableFarms = useMemo(() => uniqueRecordsById(blockFarms).filter(farm => {
    if (String(farm.status || 'ACTIVE').toUpperCase() !== 'ACTIVE') return false;
    if (actorRole !== 'FARM_MANAGER') return true;
    return String(farm.managerUserId || '').trim() === actorId;
  }), [blockFarms, actorRole, actorId]);

  const set = (key, value) => {
    setForm(current => ({ ...current, [key]: value }));
    if (fieldErrors[key]) setFieldErrors(prev => ({ ...prev, [key]: null }));
  };
  const submit = async () => {
    const phone = form.phone.replace(/\D/g, '');
    const newErrors = {};
    if (!form.firstName.trim()) newErrors.firstName = 'First name is required.';
    if (!form.lastName.trim()) newErrors.lastName = 'Last name is required.';
    if (!phone) {
      newErrors.phone = 'Mobile number is required.';
    } else if (!/^09\d{9}$/.test(phone)) {
      newErrors.phone = 'Enter an 11-digit Philippine mobile number starting with 09.';
    }
    const passwordError = passwordPolicyError(form.password);
    if (passwordError) {
      newErrors.password = passwordError;
    }
    if ((form.role === 'FARM_MANAGER' || actorRole === 'FARM_MANAGER') && !form.blockFarmId) {
      newErrors.blockFarmId = 'Select an assigned Block Farm for this account.';
    }
    if (form.phoneVerificationMode === 'VERIFIED'
      && isOtherPhoneVerificationReason(form.verificationReasonCode)
      && form.verificationReasonDetails.trim().length < 10) {
      newErrors.verificationReasonDetails = 'Add a reviewer comment of at least 10 characters.';
    }
    if (Object.keys(newErrors).length > 0) {
      setFieldErrors(newErrors);
      return;
    }
    setFieldErrors({});
    setSaving(true);
    try {
      const response = await provisionUserAccount({
        firstName: form.firstName.trim(), middleName: form.middleName.trim(), lastName: form.lastName.trim(), suffix: form.suffix.trim(),
        phone, password: form.password, role: form.role, blockFarmId: form.blockFarmId || undefined,
        phoneVerificationMode: form.phoneVerificationMode,
        ...(form.phoneVerificationMode === 'VERIFIED' ? {
          verificationReasonCode: form.verificationReasonCode,
          verificationReasonDetails: form.verificationReasonDetails.trim() || undefined
        } : {})
      });
      const accountId = response?.accountId || response?.data?.id;
      onCreated?.(response?.data);
      closeOnce();
      Alert.alert('User Added', `Account ID: ${accountId}\nPhone verification: ${form.phoneVerificationMode === 'VERIFIED' ? 'Verified' : 'User will choose SMS or manual review at first login'}`);
    } catch (error) {
      Alert.alert('User Not Added', error.message || 'The account could not be created.');
    } finally {
      setSaving(false);
    }
  };

  const input = (label, key, options = {}) => {
    const hasError = Boolean(fieldErrors[key]);
    const isRequired = options.required || label.includes('*');
    const cleanLabel = label.replace(/\s*\*\s*$/, '');
    return (
      <View style={{ gap: 5 }}>
        <Text style={{ fontSize: 12, fontWeight: '800', color: COLORS.text }}>
          {cleanLabel}
          {isRequired && <Text style={{ color: COLORS.required, fontWeight: 'normal' }}> *</Text>}
        </Text>
        <TextInput
          value={form[key]}
          onChangeText={value => set(key, value)}
          editable={!saving}
          placeholder={options.placeholder}
          placeholderTextColor={COLORS.textMuted}
          secureTextEntry={options.secureTextEntry}
          keyboardType={options.keyboardType}
          maxLength={options.maxLength}
          style={{
            borderWidth: hasError ? 1.5 : 1,
            borderColor: hasError ? COLORS.danger : COLORS.border,
            borderRadius: RADIUS.md,
            paddingHorizontal: 12,
            paddingVertical: 11,
            color: COLORS.text,
            backgroundColor: hasError ? '#FFF5F5' : '#fff'
          }}
        />
        {hasError && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
            <Ionicons name="alert-circle" size={13} color={COLORS.danger} />
            <Text style={{ fontSize: 11, color: COLORS.danger, fontWeight: '600' }}>{fieldErrors[key]}</Text>
          </View>
        )}
      </View>
    );
  };

  return (
    <Modal visible={visible} animationType="none" presentationStyle="fullScreen" onRequestClose={saving ? undefined : closeOnce}>
      <View style={{ flex: 1, backgroundColor: COLORS.background }}>
        <View style={{ paddingTop: 52, paddingHorizontal: SPACING.lg, paddingBottom: 14, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: COLORS.border, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <TouchableOpacity disabled={saving} onPress={closeOnce} style={{ padding: 4 }}><Ionicons name="close" size={24} color={COLORS.text} /></TouchableOpacity>
          <View><Text style={{ fontSize: 18, fontWeight: '900', color: COLORS.text }}>Add User</Text><Text style={{ fontSize: 11, color: COLORS.textMuted }}>Create an account and choose its phone-verification state.</Text></View>
        </View>
        <ScrollView contentContainerStyle={{ padding: SPACING.lg, gap: 14, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          {input('First Name *', 'firstName')}
          {input('Middle Name', 'middleName')}
          {input('Last Name *', 'lastName')}
          {input('Suffix', 'suffix')}
          {input('Mobile Number *', 'phone', { keyboardType: 'phone-pad', maxLength: 11, placeholder: '09XXXXXXXXX' })}

          <View style={{ gap: 6 }}><Text style={{ fontSize: 12, fontWeight: '800', color: COLORS.text }}>Role <Text style={{ color: COLORS.required, fontWeight: 'normal' }}>*</Text></Text><View style={{ flexDirection: 'row', gap: 8 }}>
            {[
              { value: 'MEMBER_FARMER', label: 'Farm Member' },
              ...(actorRole === 'SRA_ADMIN' ? [{ value: 'FARM_MANAGER', label: 'Farm Manager' }] : [])
            ].map(role => <TouchableOpacity key={role.value} disabled={saving} onPress={() => set('role', role.value)} style={{ flex: 1, padding: 10, borderRadius: RADIUS.md, borderWidth: 1, borderColor: form.role === role.value ? COLORS.primary : COLORS.border, backgroundColor: form.role === role.value ? COLORS.primaryBg : '#fff' }}><Text style={{ textAlign: 'center', fontSize: 11, fontWeight: '800', color: form.role === role.value ? COLORS.primary : COLORS.textSecondary }}>{role.label}</Text></TouchableOpacity>)}
          </View></View>

          <View style={{ gap: 6 }}><Text style={{ fontSize: 12, fontWeight: '800', color: COLORS.text }}>Block Farm{(form.role === 'FARM_MANAGER' || actorRole === 'FARM_MANAGER') && <Text style={{ color: COLORS.required, fontWeight: 'normal' }}> *</Text>}</Text><View style={{ gap: 6 }}>
            {actorRole !== 'FARM_MANAGER' && form.role === 'MEMBER_FARMER' && <TouchableOpacity disabled={saving} onPress={() => set('blockFarmId', '')} style={{ padding: 9, borderRadius: RADIUS.md, borderWidth: 1, borderColor: !form.blockFarmId ? COLORS.primary : COLORS.border, backgroundColor: !form.blockFarmId ? COLORS.primaryBg : '#fff' }}><Text style={{ fontSize: 11, fontWeight: '700', color: !form.blockFarmId ? COLORS.primary : COLORS.textSecondary }}>Not assigned yet</Text></TouchableOpacity>}
            {availableFarms.map(farm => <TouchableOpacity key={farm.id} disabled={saving} onPress={() => set('blockFarmId', farm.id)} style={{ padding: 9, borderRadius: RADIUS.md, borderWidth: 1, borderColor: form.blockFarmId === farm.id ? COLORS.primary : COLORS.border, backgroundColor: form.blockFarmId === farm.id ? COLORS.primaryBg : '#fff' }}><Text style={{ fontSize: 11, fontWeight: '700', color: form.blockFarmId === farm.id ? COLORS.primary : COLORS.textSecondary }}>{farm.name || farm.id}</Text></TouchableOpacity>)}
          </View>
          {fieldErrors.blockFarmId && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
              <Ionicons name="alert-circle" size={13} color={COLORS.danger} />
              <Text style={{ fontSize: 11, color: COLORS.danger, fontWeight: '600' }}>{fieldErrors.blockFarmId}</Text>
            </View>
          )}
          </View>

          {input('Temporary Password *', 'password', { secureTextEntry: true })}
          <Text style={{ marginTop: -8, fontSize: 10.5, color: COLORS.textMuted }}>{PASSWORD_POLICY_HINT}</Text>

          <View style={{ gap: 6 }}><Text style={{ fontSize: 12, fontWeight: '800', color: COLORS.text }}>Phone Verification <Text style={{ color: COLORS.required, fontWeight: 'normal' }}>*</Text></Text>
            {[{ value: 'REQUIRED', label: 'Requires verification' }, { value: 'VERIFIED', label: 'Already verified by authorized reviewer' }].map(mode => <TouchableOpacity key={mode.value} disabled={saving} onPress={() => set('phoneVerificationMode', mode.value)} style={{ padding: 10, borderRadius: RADIUS.md, borderWidth: 1, borderColor: form.phoneVerificationMode === mode.value ? COLORS.primary : COLORS.border, backgroundColor: form.phoneVerificationMode === mode.value ? COLORS.primaryBg : '#fff' }}><Text style={{ fontSize: 11, fontWeight: '800', color: form.phoneVerificationMode === mode.value ? COLORS.primary : COLORS.textSecondary }}>{mode.label}</Text></TouchableOpacity>)}
            {form.phoneVerificationMode === 'REQUIRED' && <Text style={{ fontSize: 10.5, color: COLORS.textMuted }}>The user will choose SMS or manual review after signing in. They will appear in Pending Users only if they request manual review.</Text>}
          </View>

          {form.phoneVerificationMode === 'VERIFIED' && <View style={{ gap: 6 }}>
            <Text style={{ fontSize: 12, fontWeight: '800', color: COLORS.text }}>
              Reviewer Comment {isOtherPhoneVerificationReason(form.verificationReasonCode) ? <Text style={{ color: COLORS.required, fontWeight: 'normal' }}>*</Text> : '(Optional)'}
            </Text>
            <TextInput
              value={form.verificationReasonDetails}
              onChangeText={value => set('verificationReasonDetails', value)}
              editable={!saving}
              maxLength={500}
              multiline
              placeholder="Add a short note about how you confirmed this number."
              placeholderTextColor={COLORS.textMuted}
              style={{
                minHeight: 72,
                borderWidth: fieldErrors.verificationReasonDetails ? 1.5 : 1,
                borderColor: fieldErrors.verificationReasonDetails ? COLORS.danger : COLORS.border,
                borderRadius: RADIUS.md,
                paddingHorizontal: 12,
                paddingVertical: 11,
                color: COLORS.text,
                backgroundColor: fieldErrors.verificationReasonDetails ? '#FFF5F5' : '#fff',
                textAlignVertical: 'top'
              }}
            />
            {fieldErrors.verificationReasonDetails && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                <Ionicons name="alert-circle" size={13} color={COLORS.danger} />
                <Text style={{ fontSize: 11, color: COLORS.danger, fontWeight: '600' }}>{fieldErrors.verificationReasonDetails}</Text>
              </View>
            )}
            <Text style={{ fontSize: 12, fontWeight: '800', color: COLORS.text, marginTop: 4 }}>How did you verify the number? <Text style={{ color: COLORS.required, fontWeight: 'normal' }}>*</Text></Text>
            {PHONE_VERIFICATION_REASONS.map(reason => <TouchableOpacity key={reason.value} disabled={saving} onPress={() => set('verificationReasonCode', reason.value)} style={{ padding: 9, borderRadius: RADIUS.md, borderWidth: 1, borderColor: form.verificationReasonCode === reason.value ? COLORS.primary : COLORS.border, backgroundColor: form.verificationReasonCode === reason.value ? COLORS.primaryBg : '#fff' }}><Text style={{ fontSize: 10.5, fontWeight: '700', color: form.verificationReasonCode === reason.value ? COLORS.primary : COLORS.textSecondary }}>{reason.label}</Text></TouchableOpacity>)}
          </View>}

          <TouchableOpacity disabled={saving} onPress={submit} style={{ marginTop: 4, minHeight: 48, borderRadius: RADIUS.md, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, opacity: saving ? 0.7 : 1 }}>
            {saving ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="person-add-outline" size={18} color="#fff" />}
            <Text style={{ color: '#fff', fontSize: 14, fontWeight: '900' }}>{saving ? 'Adding User...' : 'Add User'}</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </Modal>
  );
}
