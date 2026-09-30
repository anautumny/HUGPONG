import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Modal, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
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

const emptyForm = {
  firstName: '', middleName: '', lastName: '', suffix: '', phone: '', password: '',
  role: 'MEMBER_FARMER', blockFarmId: '', phoneVerificationMode: 'REQUIRED',
  verificationReasonCode: DEFAULT_PHONE_VERIFICATION_REASON, verificationReasonDetails: ''
};

export default function ProvisionUserModal({ visible, onClose, session, blockFarms = [], onCreated }) {
  const actorRole = canonicalRole(session?.role || session?.roleKey);
  const actorId = String(session?.employeeId || session?.id || '').trim();
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    const managerFarm = blockFarms.find(farm => String(farm.managerUserId || '').trim() === actorId);
    setForm({
      ...emptyForm,
      role: actorRole === 'SRA_ADMIN' ? 'FARM_MANAGER' : 'MEMBER_FARMER',
      blockFarmId: actorRole === 'FARM_MANAGER' ? String(managerFarm?.id || session?.blockFarmId || '') : ''
    });
    setSaving(false);
  }, [visible, actorRole, actorId, blockFarms, session?.blockFarmId]);

  const availableFarms = useMemo(() => blockFarms.filter(farm => {
    if (String(farm.status || 'ACTIVE').toUpperCase() !== 'ACTIVE') return false;
    if (actorRole !== 'FARM_MANAGER') return true;
    return String(farm.managerUserId || '').trim() === actorId;
  }), [blockFarms, actorRole, actorId]);

  const set = (key, value) => setForm(current => ({ ...current, [key]: value }));
  const submit = async () => {
    const phone = form.phone.replace(/\D/g, '');
    if (!form.firstName.trim() || !form.lastName.trim()) return Alert.alert('Missing Name', 'First name and last name are required.');
    if (!/^09\d{9}$/.test(phone)) return Alert.alert('Invalid Phone', 'Enter an 11-digit Philippine mobile number starting with 09.');
    const passwordError = passwordPolicyError(form.password);
    if (passwordError) return Alert.alert('Invalid Temporary Password', passwordError);
    if ((form.role === 'FARM_MANAGER' || actorRole === 'FARM_MANAGER') && !form.blockFarmId) {
      return Alert.alert('Block Farm Required', 'Select a Block Farm for this account.');
    }
    if (form.phoneVerificationMode === 'VERIFIED'
      && isOtherPhoneVerificationReason(form.verificationReasonCode)
      && form.verificationReasonDetails.trim().length < 10) {
      return Alert.alert('Verification Details Required', 'Describe the other documented check using at least 10 characters.');
    }
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
      onClose();
      Alert.alert('User Added', `Account ID: ${accountId}\nPhone verification: ${form.phoneVerificationMode === 'VERIFIED' ? 'Verified' : 'Pending review'}`);
    } catch (error) {
      Alert.alert('User Not Added', error.message || 'The account could not be created.');
    } finally {
      setSaving(false);
    }
  };

  const input = (label, key, options = {}) => (
    <View style={{ gap: 5 }}>
      <Text style={{ fontSize: 12, fontWeight: '800', color: COLORS.text }}>{label}</Text>
      <TextInput
        value={form[key]}
        onChangeText={value => set(key, value)}
        editable={!saving}
        placeholder={options.placeholder}
        placeholderTextColor={COLORS.textMuted}
        secureTextEntry={options.secureTextEntry}
        keyboardType={options.keyboardType}
        maxLength={options.maxLength}
        style={{ borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, paddingHorizontal: 12, paddingVertical: 11, color: COLORS.text, backgroundColor: '#fff' }}
      />
    </View>
  );

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={saving ? undefined : onClose}>
      <View style={{ flex: 1, backgroundColor: COLORS.background }}>
        <View style={{ paddingTop: 52, paddingHorizontal: SPACING.lg, paddingBottom: 14, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: COLORS.border, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <TouchableOpacity disabled={saving} onPress={onClose} style={{ padding: 4 }}><Ionicons name="close" size={24} color={COLORS.text} /></TouchableOpacity>
          <View><Text style={{ fontSize: 18, fontWeight: '900', color: COLORS.text }}>Add User</Text><Text style={{ fontSize: 11, color: COLORS.textMuted }}>Create an account and choose its phone-verification state.</Text></View>
        </View>
        <ScrollView contentContainerStyle={{ padding: SPACING.lg, gap: 14, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          {input('First Name *', 'firstName')}
          {input('Middle Name', 'middleName')}
          {input('Last Name *', 'lastName')}
          {input('Suffix', 'suffix')}
          {input('Mobile Number *', 'phone', { keyboardType: 'phone-pad', maxLength: 11, placeholder: '09XXXXXXXXX' })}

          <View style={{ gap: 6 }}><Text style={{ fontSize: 12, fontWeight: '800', color: COLORS.text }}>Role *</Text><View style={{ flexDirection: 'row', gap: 8 }}>
            {[
              { value: 'MEMBER_FARMER', label: 'Farm Member' },
              ...(actorRole === 'SRA_ADMIN' ? [{ value: 'FARM_MANAGER', label: 'Farm Manager' }] : [])
            ].map(role => <TouchableOpacity key={role.value} disabled={saving} onPress={() => set('role', role.value)} style={{ flex: 1, padding: 10, borderRadius: RADIUS.md, borderWidth: 1, borderColor: form.role === role.value ? COLORS.primary : COLORS.border, backgroundColor: form.role === role.value ? COLORS.primaryBg : '#fff' }}><Text style={{ textAlign: 'center', fontSize: 11, fontWeight: '800', color: form.role === role.value ? COLORS.primary : COLORS.textSecondary }}>{role.label}</Text></TouchableOpacity>)}
          </View></View>

          <View style={{ gap: 6 }}><Text style={{ fontSize: 12, fontWeight: '800', color: COLORS.text }}>Block Farm{(form.role === 'FARM_MANAGER' || actorRole === 'FARM_MANAGER') ? ' *' : ''}</Text><View style={{ gap: 6 }}>
            {actorRole !== 'FARM_MANAGER' && form.role === 'MEMBER_FARMER' && <TouchableOpacity disabled={saving} onPress={() => set('blockFarmId', '')} style={{ padding: 9, borderRadius: RADIUS.md, borderWidth: 1, borderColor: !form.blockFarmId ? COLORS.primary : COLORS.border, backgroundColor: !form.blockFarmId ? COLORS.primaryBg : '#fff' }}><Text style={{ fontSize: 11, fontWeight: '700', color: !form.blockFarmId ? COLORS.primary : COLORS.textSecondary }}>Not assigned yet</Text></TouchableOpacity>}
            {availableFarms.map(farm => <TouchableOpacity key={farm.id} disabled={saving} onPress={() => set('blockFarmId', farm.id)} style={{ padding: 9, borderRadius: RADIUS.md, borderWidth: 1, borderColor: form.blockFarmId === farm.id ? COLORS.primary : COLORS.border, backgroundColor: form.blockFarmId === farm.id ? COLORS.primaryBg : '#fff' }}><Text style={{ fontSize: 11, fontWeight: '700', color: form.blockFarmId === farm.id ? COLORS.primary : COLORS.textSecondary }}>{farm.name || farm.id}</Text></TouchableOpacity>)}
          </View></View>

          {input('Temporary Password *', 'password', { secureTextEntry: true })}
          <Text style={{ marginTop: -8, fontSize: 10.5, color: COLORS.textMuted }}>{PASSWORD_POLICY_HINT}</Text>

          <View style={{ gap: 6 }}><Text style={{ fontSize: 12, fontWeight: '800', color: COLORS.text }}>Phone Verification *</Text>
            {[{ value: 'REQUIRED', label: 'Requires verification' }, { value: 'VERIFIED', label: 'Already verified by authorized reviewer' }].map(mode => <TouchableOpacity key={mode.value} disabled={saving} onPress={() => set('phoneVerificationMode', mode.value)} style={{ padding: 10, borderRadius: RADIUS.md, borderWidth: 1, borderColor: form.phoneVerificationMode === mode.value ? COLORS.primary : COLORS.border, backgroundColor: form.phoneVerificationMode === mode.value ? COLORS.primaryBg : '#fff' }}><Text style={{ fontSize: 11, fontWeight: '800', color: form.phoneVerificationMode === mode.value ? COLORS.primary : COLORS.textSecondary }}>{mode.label}</Text></TouchableOpacity>)}
          </View>

          {form.phoneVerificationMode === 'VERIFIED' && <View style={{ gap: 6 }}><Text style={{ fontSize: 12, fontWeight: '800', color: COLORS.text }}>Verification Reason *</Text>
            {PHONE_VERIFICATION_REASONS.map(reason => <TouchableOpacity key={reason.value} disabled={saving} onPress={() => set('verificationReasonCode', reason.value)} style={{ padding: 9, borderRadius: RADIUS.md, borderWidth: 1, borderColor: form.verificationReasonCode === reason.value ? COLORS.primary : COLORS.border, backgroundColor: form.verificationReasonCode === reason.value ? COLORS.primaryBg : '#fff' }}><Text style={{ fontSize: 10.5, fontWeight: '700', color: form.verificationReasonCode === reason.value ? COLORS.primary : COLORS.textSecondary }}>{reason.label}</Text></TouchableOpacity>)}
            {isOtherPhoneVerificationReason(form.verificationReasonCode) && input('Verification Details *', 'verificationReasonDetails')}
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
