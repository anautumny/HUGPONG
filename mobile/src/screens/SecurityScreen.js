import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  TextInput, Alert, ActivityIndicator
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS, SHADOW } from '../theme';
import { 
  getCurrentSession, 
  updateUserMobileNumber, 
  updateUserPassword, 
  subscribe 
} from '../data/dataStore';
import { useTranslation } from '../services/i18n';

export default function SecurityScreen({ navigation }) {
  const { t } = useTranslation();
  const [session, setSession] = useState(getCurrentSession());

  // Change Password State
  const [showChangePw, setShowChangePw] = useState(false);
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [loadingPw, setLoadingPw] = useState(false);

  // Change Mobile Number State
  const [showChangePhone, setShowChangePhone] = useState(false);
  const [newPhone, setNewPhone] = useState('');
  const [phoneVerifyPw, setPhoneVerifyPw] = useState('');
  const [showPhoneVerifyPw, setShowPhoneVerifyPw] = useState(false);
  const [loadingPhone, setLoadingPhone] = useState(false);

  useEffect(() => {
    const unsubscribe = subscribe(() => {
      setSession(getCurrentSession());
    });
    return unsubscribe;
  }, []);

  const handlePasswordSubmit = async () => {
    if (!currentPw) {
      Alert.alert(t('error_title', 'Required'), 'Please enter your current password.');
      return;
    }
    if (newPw.length < 8) {
      Alert.alert(t('error_title', 'Too Short'), 'New password must be at least 8 characters long.');
      return;
    }
    if (newPw !== confirmPw) {
      Alert.alert(t('error_title', 'Mismatch'), 'New password and confirmation do not match.');
      return;
    }

    setLoadingPw(true);
    const res = await updateUserPassword(currentPw, newPw);
    setLoadingPw(false);

    if (!res.success) {
      Alert.alert('Update Failed', res.error || 'Could not update password.');
      return;
    }

    Alert.alert(
      'Password Updated',
      'Your account password has been changed successfully.',
      [{ text: 'OK', onPress: () => {
        setShowChangePw(false);
        setCurrentPw('');
        setNewPw('');
        setConfirmPw('');
      }}]
    );
  };

  const handlePhoneSubmit = async () => {
    const clean = newPhone.replace(/\D/g, '');
    if (!clean.startsWith('09') || clean.length !== 11) {
      if (!(clean.startsWith('639') && clean.length === 12)) {
        Alert.alert(
          'Invalid Mobile Number',
          'Please enter a valid 11-digit Philippine mobile number starting with 09 (e.g. 09171234567).'
        );
        return;
      }
    }

    if (!phoneVerifyPw) {
      Alert.alert(
        'Password Required',
        'Please enter your account password to authorize changing your registered mobile number.'
      );
      return;
    }

    setLoadingPhone(true);
    const res = await updateUserMobileNumber(newPhone, phoneVerifyPw);
    setLoadingPhone(false);

    if (!res.success) {
      Alert.alert('Update Failed', res.error || 'Could not update mobile number.');
      return;
    }

    Alert.alert(
      'Mobile Number Updated',
      'Your registered mobile number has been updated successfully. You can use your new number or your User ID to log in.',
      [{ text: 'OK', onPress: () => {
        setShowChangePhone(false);
        setNewPhone('');
        setPhoneVerifyPw('');
      }}]
    );
  };

  const userEmployeeId = session?.employeeId || session?.userId || session?.contact || '—';
  const userMobile = session?.mobile || session?.contact || '—';

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      {/* Top App Bar */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={20} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>{t('sec_title', 'Security & Password')}</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

        {/* Account Identity Card */}
        <View style={s.accountCard}>
          <View style={s.accountHeader}>
            <View style={s.avatarWrap}>
              <Ionicons name="shield-checkmark" size={22} color={COLORS.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.userName}>{session?.name || 'HUGPONG User'}</Text>
              <Text style={s.userRole}>{session?.role || 'Member'} · {session?.farm || (session?.farm || session?.blockFarm || 'District Central')}</Text>
            </View>
          </View>

          <View style={s.idRowContainer}>
            <View style={s.idBox}>
              <Text style={s.idLabel}>Official User ID</Text>
              <Text style={s.idValue}>{userEmployeeId}</Text>
              <Text style={s.idSubtext}>Permanent / Login ID</Text>
            </View>
            <View style={s.idBox}>
              <Text style={s.idLabel}>Registered Mobile</Text>
              <Text style={s.idValue}>{userMobile}</Text>
              <Text style={s.idSubtext}>SMS Code &amp; Direct Calls</Text>
            </View>
          </View>

          <View style={s.lostSimNote}>
            <Ionicons name="information-circle" size={16} color={COLORS.primary} />
            <Text style={s.lostSimText}>
              Lost your SIM or phone? Your <Text style={{ fontWeight: '700' }}>8-digit User ID ({userEmployeeId})</Text> never changes and will always work to log in to your account.
            </Text>
          </View>
        </View>

        {/* Change Registered Mobile Number Card */}
        <View style={s.card}>
          <TouchableOpacity 
            style={s.sectionRow} 
            onPress={() => setShowChangePhone(prev => !prev)}
            activeOpacity={0.7}
          >
            <View style={[s.secIcon, { backgroundColor: '#E8F5E9' }]}>
              <Ionicons name="call" size={17} color={COLORS.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.sectionLabel}>Change Registered Mobile Number</Text>
              <Text style={s.sectionSub}>Update your contact number for SMS verification &amp; direct calls</Text>
            </View>
            <Ionicons name={showChangePhone ? 'chevron-up' : 'chevron-down'} size={18} color={COLORS.textMuted} />
          </TouchableOpacity>

          {showChangePhone && (
            <View style={s.formWrap}>
              <Text style={s.formDesc}>
                Enter your new 11-digit mobile number and verify your account password to authorize the change.
              </Text>

              <View style={s.fieldGroup}>
                <Text style={s.fieldLabel}>New Mobile Number <Text style={s.req}>*</Text></Text>
                <View style={s.inputWrap}>
                  <Ionicons name="phone-portrait-outline" size={17} color={COLORS.textMuted} />
                  <TextInput
                    style={s.textInput}
                    value={newPhone}
                    onChangeText={setNewPhone}
                    placeholder="e.g. 0918 987 6543"
                    placeholderTextColor={COLORS.textMuted}
                    keyboardType="phone-pad"
                    maxLength={13}
                  />
                </View>
              </View>

              <View style={s.fieldGroup}>
                <Text style={s.fieldLabel}>Confirm Current Password <Text style={s.req}>*</Text></Text>
                <View style={s.inputWrap}>
                  <Ionicons name="lock-closed-outline" size={17} color={COLORS.textMuted} />
                  <TextInput
                    style={[s.textInput, { flex: 1 }]}
                    value={phoneVerifyPw}
                    onChangeText={setPhoneVerifyPw}
                    secureTextEntry={!showPhoneVerifyPw}
                    placeholder="Enter password to authorize"
                    placeholderTextColor={COLORS.textMuted}
                  />
                  <TouchableOpacity onPress={() => setShowPhoneVerifyPw(p => !p)} style={{ padding: 4 }}>
                    <Ionicons name={showPhoneVerifyPw ? 'eye-off-outline' : 'eye-outline'} size={17} color={COLORS.textMuted} />
                  </TouchableOpacity>
                </View>
              </View>

              <TouchableOpacity 
                style={[s.submitBtn, loadingPhone && s.btnDisabled]} 
                onPress={handlePhoneSubmit}
                disabled={loadingPhone}
                activeOpacity={0.8}
              >
                {loadingPhone ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={s.submitBtnText}>Update Registered Number</Text>
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Change Password Card */}
        <View style={s.card}>
          <TouchableOpacity 
            style={s.sectionRow} 
            onPress={() => setShowChangePw(prev => !prev)}
            activeOpacity={0.7}
          >
            <View style={[s.secIcon, { backgroundColor: COLORS.primaryBg }]}>
              <Ionicons name="lock-closed" size={17} color={COLORS.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.sectionLabel}>{t('sec_change_pw', 'Change Password')}</Text>
              <Text style={s.sectionSub}>Update your account security credentials</Text>
            </View>
            <Ionicons name={showChangePw ? 'chevron-up' : 'chevron-down'} size={18} color={COLORS.textMuted} />
          </TouchableOpacity>

          {showChangePw && (
            <View style={s.formWrap}>
              <View style={s.fieldGroup}>
                <Text style={s.fieldLabel}>{t('sec_curr_pw', 'Current Password')} <Text style={s.req}>*</Text></Text>
                <View style={s.inputWrap}>
                  <Ionicons name="key-outline" size={17} color={COLORS.textMuted} />
                  <TextInput
                    style={[s.textInput, { flex: 1 }]}
                    value={currentPw}
                    onChangeText={setCurrentPw}
                    secureTextEntry={!showCurrentPw}
                    placeholder="••••••••"
                    placeholderTextColor={COLORS.textMuted}
                  />
                  <TouchableOpacity onPress={() => setShowCurrentPw(p => !p)} style={{ padding: 4 }}>
                    <Ionicons name={showCurrentPw ? 'eye-off-outline' : 'eye-outline'} size={17} color={COLORS.textMuted} />
                  </TouchableOpacity>
                </View>
              </View>

              <View style={s.fieldGroup}>
                <Text style={s.fieldLabel}>{t('sec_new_pw', 'New Password')} <Text style={s.req}>*</Text></Text>
                <View style={s.inputWrap}>
                  <Ionicons name="lock-closed-outline" size={17} color={COLORS.textMuted} />
                  <TextInput
                    style={[s.textInput, { flex: 1 }]}
                    value={newPw}
                    onChangeText={setNewPw}
                    secureTextEntry={!showNewPw}
                    placeholder="••••••••"
                    placeholderTextColor={COLORS.textMuted}
                  />
                  <TouchableOpacity onPress={() => setShowNewPw(p => !p)} style={{ padding: 4 }}>
                    <Ionicons name={showNewPw ? 'eye-off-outline' : 'eye-outline'} size={17} color={COLORS.textMuted} />
                  </TouchableOpacity>
                </View>
              </View>

              {newPw.length > 0 && (
                <View style={s.pwStrength}>
                  {[
                    { key: '8+ chars', label: '8+ chars' },
                    { key: 'Uppercase', label: 'Uppercase' },
                    { key: 'Number', label: 'Number' },
                    { key: 'Symbol', label: 'Symbol' }
                  ].map(check => {
                    const passed =
                      check.key === '8+ chars' ? newPw.length >= 8 :
                      check.key === 'Uppercase' ? /[A-Z]/.test(newPw) :
                      check.key === 'Number' ? /\d/.test(newPw) :
                      /[^a-zA-Z0-9]/.test(newPw);
                    return (
                      <View key={check.key} style={s.strengthItem}>
                        <Ionicons name={passed ? 'checkmark-circle' : 'ellipse-outline'} size={13} color={passed ? COLORS.success : COLORS.textMuted} />
                        <Text style={[s.strengthText, { color: passed ? COLORS.success : COLORS.textMuted }]}>{check.label}</Text>
                      </View>
                    );
                  })}
                </View>
              )}

              <View style={s.fieldGroup}>
                <Text style={s.fieldLabel}>{t('sec_confirm_pw', 'Confirm New Password')} <Text style={s.req}>*</Text></Text>
                <View style={s.inputWrap}>
                  <Ionicons name="checkmark-done-outline" size={17} color={COLORS.textMuted} />
                  <TextInput
                    style={[s.textInput, { flex: 1 }]}
                    value={confirmPw}
                    onChangeText={setConfirmPw}
                    secureTextEntry={!showNewPw}
                    placeholder="••••••••"
                    placeholderTextColor={COLORS.textMuted}
                  />
                </View>
              </View>

              <TouchableOpacity 
                style={[s.submitBtn, loadingPw && s.btnDisabled]} 
                onPress={handlePasswordSubmit}
                disabled={loadingPw}
                activeOpacity={0.8}
              >
                {loadingPw ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={s.submitBtnText}>{t('sec_update_pw', 'Update Password')}</Text>
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Session Security */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Session Security</Text>
          <TouchableOpacity 
            style={s.dangerRow} 
            activeOpacity={0.7}
            onPress={() => Alert.alert(
              t('sec_signout_all_title', 'Sign Out All Devices'), 
              t('sec_signout_all_msg', 'This will end all active sessions and require re-authentication with your User ID or mobile number.'), 
              [
                { text: t('btn_cancel', 'Cancel'), style: 'cancel' }, 
                { 
                  text: t('sec_btn_signout_all', 'Sign Out All'), 
                  style: 'destructive',
                  onPress: () => navigation.reset({ index: 0, routes: [{ name: 'Login' }] })
                }
              ]
            )}
          >
            <View style={[s.secIcon, { backgroundColor: '#FFF0F0' }]}>
              <Ionicons name="log-out" size={17} color="#D9534F" />
            </View>
            <View style={s.dangerBody}>
              <Text style={s.dangerTitle}>{t('sec_signout_all', 'Sign Out All Devices')}</Text>
              <Text style={s.dangerSub}>Revoke active mobile session &amp; return to sign in</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
          </TouchableOpacity>
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.lg, paddingVertical: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: COLORS.border },
  backBtn: { padding: 8 },
  headerTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  scroll: { padding: SPACING.lg, gap: SPACING.md, paddingBottom: 40 },
  
  accountCard: { backgroundColor: '#fff', borderRadius: RADIUS.lg, padding: SPACING.lg, borderWidth: 1, borderColor: COLORS.border, gap: SPACING.md, ...SHADOW.card },
  accountHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatarWrap: { width: 44, height: 44, borderRadius: 12, backgroundColor: COLORS.primaryBg, justifyContent: 'center', alignItems: 'center' },
  userName: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  userRole: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  
  idRowContainer: { flexDirection: 'row', gap: 10 },
  idBox: { flex: 1, backgroundColor: COLORS.background, borderRadius: RADIUS.md, padding: 12, borderWidth: 1, borderColor: COLORS.border },
  idLabel: { fontSize: 10, fontWeight: '700', color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  idValue: { fontSize: 14, fontWeight: '800', color: COLORS.primary, marginTop: 3 },
  idSubtext: { fontSize: 10, color: COLORS.textSecondary, marginTop: 2 },

  lostSimNote: { flexDirection: 'row', gap: 8, backgroundColor: COLORS.primaryBg, borderRadius: RADIUS.md, padding: 10, alignItems: 'flex-start' },
  lostSimText: { flex: 1, fontSize: 11, color: COLORS.textSecondary, lineHeight: 16 },

  card: { backgroundColor: '#fff', borderRadius: RADIUS.lg, padding: SPACING.lg, ...SHADOW.card },
  cardTitle: { fontSize: 14, fontWeight: '700', color: COLORS.text, marginBottom: SPACING.sm },
  sectionRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  secIcon: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  sectionLabel: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  sectionSub: { fontSize: 11, color: COLORS.textMuted, marginTop: 1 },
  
  formWrap: { marginTop: SPACING.md, gap: SPACING.md, paddingTop: SPACING.md, borderTopWidth: 1, borderTopColor: COLORS.border },
  formDesc: { fontSize: 12, color: COLORS.textSecondary, lineHeight: 17 },
  fieldGroup: { gap: 6 },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: COLORS.textSecondary },
  req: { color: COLORS.danger },
  inputWrap: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: COLORS.background, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: 12, paddingVertical: 10 },
  textInput: { flex: 1, fontSize: 14, color: COLORS.text },
  
  pwStrength: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  strengthItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  strengthText: { fontSize: 11 },
  
  submitBtn: { backgroundColor: COLORS.primary, borderRadius: RADIUS.md, paddingVertical: 12, alignItems: 'center', marginTop: 4 },
  submitBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  btnDisabled: { opacity: 0.6 },

  dangerRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, paddingVertical: 8 },
  dangerBody: { flex: 1, gap: 2 },
  dangerTitle: { fontSize: 14, fontWeight: '700', color: '#D9534F' },
  dangerSub: { fontSize: 11, color: COLORS.textMuted },
});
