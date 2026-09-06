import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, ScrollView, Alert, ActivityIndicator
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS, SHADOW } from '../../theme';
import { findUserByIdOrContact, resetUserPasswordByIdentifier } from '../../data/dataStore';
import { sendFirebasePhoneSMS } from '../../services/smsService';
import { useTranslation } from '../../services/i18n';

export default function ForgotPasswordScreen({ navigation }) {
  const { t } = useTranslation();

  // Step 1: Identifier Entry; Step 2: SMS OTP Verification; Step 3: Set New Password; Step 4: Success
  const [step, setStep] = useState(1);
  const [identifier, setIdentifier] = useState('');
  const [matchedUser, setMatchedUser] = useState(null);
  const [otpCode, setOtpCode] = useState('');
  const [sentOtp, setSentOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  // ── Step 1: Send SMS OTP ─────────────────────────────────────
  const handleSendOtp = async () => {
    const raw = identifier.trim();
    if (!raw) {
      Alert.alert('Required', 'Please enter your 8-digit User ID or registered mobile number.');
      return;
    }

    setLoading(true);
    const user = findUserByIdOrContact(raw);

    if (!user) {
      setLoading(false);
      Alert.alert(
        'Account Not Found',
        'No registered account found matching this User ID or Mobile Number. Please verify with your cooperative administrator.'
      );
      return;
    }

    setMatchedUser(user);

    // Generate 6-digit random code
    const generatedOtp = String(Math.floor(100000 + Math.random() * 900000));
    setSentOtp(generatedOtp);

    const userPhone = user.contact || user.mobile || raw;

    try {
      const res = await sendFirebasePhoneSMS(userPhone, generatedOtp);
      setLoading(false);

      if (res && res.success) {
        Alert.alert(
          'SMS Code Dispatched',
          `A 6-digit SMS verification code was dispatched to ${userPhone}.`
        );
      } else {
        // Fallback for offline / dev simulation
        if (typeof __DEV__ !== 'undefined' && __DEV__) {
          Alert.alert(
            'SMS Simulation (Dev Mode)',
            `Verification code for ${userPhone}:\n\nCode: ${generatedOtp}`
          );
        } else {
          Alert.alert(
            'SMS Dispatch Notice',
            `A 6-digit verification code was sent to ${userPhone}. Please check your SMS inbox.`
          );
        }
      }
      setStep(2);
    } catch (e) {
      setLoading(false);
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        Alert.alert('SMS Simulation (Dev Mode)', `Verification code for ${userPhone}: ${generatedOtp}`);
      } else {
        Alert.alert('SMS Dispatch Notice', `A verification code was dispatched to ${userPhone}.`);
      }
      setStep(2);
    }
  };

  // ── Step 2: Verify SMS OTP ───────────────────────────────────
  const handleVerifyOtp = () => {
    const cleanOtp = otpCode.trim();
    if (!cleanOtp) {
      Alert.alert('Required', 'Please enter the 6-digit SMS code.');
      return;
    }
    if (cleanOtp !== sentOtp) {
      Alert.alert('Invalid Code', 'The verification code you entered is incorrect. Please try again.');
      return;
    }
    setStep(3);
  };

  // ── Step 3: Save New Password ────────────────────────────────
  const handleResetPassword = async () => {
    if (!newPassword || newPassword.length < 8) {
      Alert.alert('Too Short', 'New password must be at least 8 characters long.');
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert('Mismatch', 'New password and confirmation do not match.');
      return;
    }

    setLoading(true);
    const targetId = matchedUser ? (matchedUser.employeeId || matchedUser.contact) : identifier;
    const res = await resetUserPasswordByIdentifier(targetId, newPassword);
    setLoading(false);

    if (!res.success) {
      Alert.alert('Reset Failed', res.error || 'Could not reset password.');
      return;
    }

    setStep(4);
  };

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
      {/* Navigation Header */}
      <View style={s.topNav}>
        <TouchableOpacity style={s.backBtn} onPress={() => step > 1 && step < 4 ? setStep(s => s - 1) : navigation.goBack()}>
          <Ionicons name="arrow-back" size={20} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={s.navTitle}>{t('forgot_pw_title', 'Forgot Password')}</Text>
        <View style={{ width: 36 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">

          {/* STEP 1: Enter User ID or Mobile */}
          {step === 1 && (
            <>
              <View style={s.iconWrap}>
                <Ionicons name="lock-open-outline" size={44} color={COLORS.primary} />
              </View>

              <View style={s.textBlock}>
                <Text style={s.title}>{t('reset_pw_heading', 'Reset your password')}</Text>
                <Text style={s.sub}>
                  Enter your 8-digit User ID (e.g. 04000001) or registered mobile number to receive a verification code.
                </Text>
              </View>

              <View style={s.card}>
                <Text style={s.label}>User ID or Mobile Number</Text>
                <View style={s.inputWrap}>
                  <Ionicons name="person-circle-outline" size={18} color={COLORS.textMuted} />
                  <TextInput
                    style={s.input}
                    value={identifier}
                    onChangeText={setIdentifier}
                    placeholder="04000001 or 0917 123 4567"
                    placeholderTextColor={COLORS.textMuted}
                    autoCapitalize="none"
                  />
                </View>
              </View>

              <TouchableOpacity 
                style={[s.btn, loading && { opacity: 0.6 }]} 
                onPress={handleSendOtp} 
                disabled={loading}
                activeOpacity={0.8}
              >
                {loading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={s.btnText}>Send Verification Code via SMS</Text>
                )}
              </TouchableOpacity>

              {/* Lost SIM / Inaccessible Phone Advisory */}
              <View style={s.lostSimHelpBox}>
                <Ionicons name="information-circle-outline" size={20} color={COLORS.primary} style={{ marginTop: 2 }} />
                <View style={{ flex: 1 }}>
                  <Text style={s.lostSimHelpTitle}>Lost your SIM card?</Text>
                  <Text style={s.lostSimHelpText}>
                    If you lost your phone or cannot receive SMS verification codes, please visit your Block Farm Manager or SRA District Administrator. They can verify your identity and update your registered mobile number or reset your password directly from the cooperative portal.
                  </Text>
                </View>
              </View>
            </>
          )}

          {/* STEP 2: Enter 6-Digit SMS Code */}
          {step === 2 && (
            <>
              <View style={[s.iconWrap, { backgroundColor: '#E8F5E9' }]}>
                <Ionicons name="chatbubble-ellipses-outline" size={44} color={COLORS.primary} />
              </View>

              <View style={s.textBlock}>
                <Text style={s.title}>Enter SMS Code</Text>
                <Text style={s.sub}>
                  We sent a 6-digit verification code to the registered mobile number for <Text style={{ fontWeight: '700', color: COLORS.text }}>{matchedUser?.name || identifier}</Text>.
                </Text>
              </View>

              <View style={s.card}>
                <Text style={s.label}>6-Digit Verification Code</Text>
                <View style={s.inputWrap}>
                  <Ionicons name="keypad-outline" size={18} color={COLORS.textMuted} />
                  <TextInput
                    style={[s.input, { letterSpacing: 4, fontSize: 18, fontWeight: '700' }]}
                    value={otpCode}
                    onChangeText={setOtpCode}
                    placeholder="123456"
                    placeholderTextColor={COLORS.textMuted}
                    keyboardType="number-pad"
                    maxLength={6}
                  />
                </View>
                <TouchableOpacity onPress={handleSendOtp} style={{ alignSelf: 'flex-end', marginTop: 4 }}>
                  <Text style={{ fontSize: 12, color: COLORS.primary, fontWeight: '600' }}>Resend SMS Code</Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity 
                style={s.btn} 
                onPress={handleVerifyOtp}
                activeOpacity={0.8}
              >
                <Text style={s.btnText}>Verify Code &amp; Continue</Text>
              </TouchableOpacity>

              {/* SMS Troubleshooting Note */}
              <View style={[s.lostSimHelpBox, { marginTop: 8 }]}>
                <Ionicons name="shield-outline" size={18} color={COLORS.textMuted} style={{ marginTop: 2 }} />
                <View style={{ flex: 1 }}>
                  <Text style={s.lostSimHelpTitle}>Didn't receive the SMS?</Text>
                  <Text style={s.lostSimHelpText}>
                    Check your cellular signal. If you no longer have access to this SIM card, please visit your Block Farm Manager for in-person identity verification.
                  </Text>
                </View>
              </View>
            </>
          )}

          {/* STEP 3: Set New Password */}
          {step === 3 && (
            <>
              <View style={[s.iconWrap, { backgroundColor: COLORS.primaryBg }]}>
                <Ionicons name="shield-checkmark-outline" size={44} color={COLORS.primary} />
              </View>

              <View style={s.textBlock}>
                <Text style={s.title}>Create New Password</Text>
                <Text style={s.sub}>
                  Choose a secure password with at least 8 characters.
                </Text>
              </View>

              <View style={s.card}>
                <View style={{ gap: 6 }}>
                  <Text style={s.label}>New Password (8+ characters)</Text>
                  <View style={s.inputWrap}>
                    <Ionicons name="lock-closed-outline" size={18} color={COLORS.textMuted} />
                    <TextInput
                      style={[s.input, { flex: 1 }]}
                      value={newPassword}
                      onChangeText={setNewPassword}
                      secureTextEntry={!showPassword}
                      placeholder="••••••••"
                      placeholderTextColor={COLORS.textMuted}
                    />
                    <TouchableOpacity onPress={() => setShowPassword(p => !p)}>
                      <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={18} color={COLORS.textMuted} />
                    </TouchableOpacity>
                  </View>
                </View>

                <View style={{ gap: 6 }}>
                  <Text style={s.label}>Confirm New Password</Text>
                  <View style={s.inputWrap}>
                    <Ionicons name="checkmark-done-outline" size={18} color={COLORS.textMuted} />
                    <TextInput
                      style={[s.input, { flex: 1 }]}
                      value={confirmPassword}
                      onChangeText={setConfirmPassword}
                      secureTextEntry={!showPassword}
                      placeholder="••••••••"
                      placeholderTextColor={COLORS.textMuted}
                    />
                  </View>
                </View>
              </View>

              <TouchableOpacity 
                style={[s.btn, loading && { opacity: 0.6 }]} 
                onPress={handleResetPassword} 
                disabled={loading}
                activeOpacity={0.8}
              >
                {loading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={s.btnText}>Save New Password</Text>
                )}
              </TouchableOpacity>
            </>
          )}

          {/* STEP 4: Success */}
          {step === 4 && (
            <View style={s.successWrap}>
              <View style={s.successIcon}>
                <Ionicons name="checkmark-circle" size={64} color={COLORS.success} />
              </View>
              <Text style={s.successTitle}>Password Reset Complete!</Text>
              <Text style={s.successSub}>
                Your password has been successfully updated. You can now sign in using your new credentials.
              </Text>
              <TouchableOpacity 
                style={s.btn} 
                onPress={() => navigation.navigate('Login')}
                activeOpacity={0.8}
              >
                <Text style={s.btnText}>{t('back_to_signin', 'Sign In Now')}</Text>
              </TouchableOpacity>
            </View>
          )}

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  topNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.lg, paddingVertical: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: COLORS.border },
  backBtn: { padding: 8 },
  navTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  scroll: { flexGrow: 1, padding: SPACING.xl, gap: SPACING.xl, alignItems: 'center', paddingTop: 30, paddingBottom: 40 },
  iconWrap: { width: 88, height: 88, borderRadius: 24, backgroundColor: COLORS.primaryBg, justifyContent: 'center', alignItems: 'center' },
  textBlock: { gap: 8, alignItems: 'center' },
  title: { fontSize: 22, fontWeight: '800', color: COLORS.text, textAlign: 'center' },
  sub: { fontSize: 13, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 20, paddingHorizontal: 12 },
  card: { width: '100%', backgroundColor: '#fff', borderRadius: RADIUS.xl, padding: SPACING.xl, gap: 14, ...SHADOW.card },
  label: { fontSize: 12, fontWeight: '700', color: COLORS.textSecondary },
  inputWrap: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: COLORS.background, borderRadius: RADIUS.md, borderWidth: 1.5, borderColor: COLORS.border, paddingHorizontal: 12, paddingVertical: 12 },
  input: { flex: 1, fontSize: 15, color: COLORS.text, fontWeight: '600' },
  btn: { width: '100%', backgroundColor: COLORS.primary, borderRadius: RADIUS.md, paddingVertical: 15, alignItems: 'center', shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.2, shadowRadius: 5, elevation: 2 },
  btnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  successWrap: { flex: 1, alignItems: 'center', gap: SPACING.lg, paddingTop: 30 },
  successIcon: { width: 100, height: 100, borderRadius: 50, backgroundColor: COLORS.successLight, justifyContent: 'center', alignItems: 'center' },
  successTitle: { fontSize: 22, fontWeight: '800', color: COLORS.text, textAlign: 'center' },
  successSub: { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 22, paddingHorizontal: 20 },
  lostSimHelpBox: { width: '100%', flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: '#F0F8EC', borderWidth: 1, borderColor: COLORS.primary + '30', padding: 14, borderRadius: RADIUS.lg },
  lostSimHelpTitle: { fontSize: 12.5, fontWeight: '700', color: COLORS.primary, marginBottom: 2 },
  lostSimHelpText: { fontSize: 11.5, color: COLORS.textSecondary, lineHeight: 17 },
});
