import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  KeyboardAvoidingView, ScrollView, Alert, ActivityIndicator
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS, SHADOW } from '../../theme';
import { useTranslation } from '../../services/i18n';
import {
  requestPasswordRecovery,
  verifyPasswordRecovery,
  completePasswordRecovery
} from '../../services/authService';

export default function ForgotPasswordScreen({ navigation }) {
  const { t } = useTranslation();

  // Step 1: Identifier Entry; Step 2: SMS OTP Verification; Step 3: Set New Password; Step 4: Success
  const [step, setStep] = useState(1);
  const [identifier, setIdentifier] = useState('');
  const [recoveryId, setRecoveryId] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resendSeconds, setResendSeconds] = useState(0);
  const [codeRequestsRemaining, setCodeRequestsRemaining] = useState(3);

  useEffect(() => {
    if (resendSeconds <= 0) return undefined;
    const timer = setInterval(() => {
      setResendSeconds(value => Math.max(0, value - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendSeconds > 0]);

  const handleBack = () => {
    if (step === 2) {
      setRecoveryId('');
      setOtpCode('');
      setStep(1);
      return;
    }
    if (step === 3) {
      setRecoveryId('');
      setResetToken('');
      setOtpCode('');
      setStep(1);
      return;
    }
    navigation.goBack();
  };

  // ── Step 1: Send SMS OTP ─────────────────────────────────────
  const handleSendOtp = async () => {
    if (step === 2 && resendSeconds > 0) return;
    const raw = identifier.trim();
    if (!raw) {
      Alert.alert(t('recovery_required_title'), t('recovery_identifier_required'));
      return;
    }

    setLoading(true);
    try {
      const result = await requestPasswordRecovery(raw);
      setRecoveryId(result.recoveryId);
      setOtpCode('');
      setResendSeconds(Math.max(0, Number(result.resendAfterSeconds || 0)));
      setCodeRequestsRemaining(Math.max(0, Number(result.codeRequestsRemaining ?? 0)));
      setStep(2);
      Alert.alert(t('recovery_request_received'), t('link_sent_msg'));
    } catch (error) {
      if (error.data?.retryAfterSeconds) {
        setResendSeconds(Math.max(0, Number(error.data.retryAfterSeconds)));
        setCodeRequestsRemaining(Math.max(0, Number(error.data.remaining ?? 0)));
      }
      Alert.alert(t('recovery_unavailable'), t('recovery_request_failed'));
    } finally {
      setLoading(false);
    }
  };

  const formatCountdown = value => {
    const minutes = Math.floor(value / 60);
    const seconds = value % 60;
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  };

  // ── Step 2: Verify SMS OTP ───────────────────────────────────
  const handleVerifyOtp = async () => {
    const cleanOtp = otpCode.trim();
    if (!/^\d{6}$/.test(cleanOtp)) {
      Alert.alert(t('recovery_required_title'), t('recovery_code_required'));
      return;
    }
    setLoading(true);
    try {
      const result = await verifyPasswordRecovery(recoveryId, cleanOtp);
      setResetToken(result.resetToken);
      setStep(3);
    } catch (error) {
      Alert.alert(t('recovery_verification_failed'), t('recovery_code_invalid'));
    } finally {
      setLoading(false);
    }
  };

  // ── Step 3: Save New Password ────────────────────────────────
  const handleResetPassword = async () => {
    if (!newPassword || newPassword.length < 8 || !/[A-Za-z]/.test(newPassword) || !/\d/.test(newPassword)) {
      Alert.alert(t('recovery_password_requirements'), t('recovery_password_rule'));
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert(t('recovery_mismatch'), t('recovery_mismatch_msg'));
      return;
    }

    setLoading(true);
    try {
      await completePasswordRecovery(recoveryId, resetToken, newPassword);
      setNewPassword('');
      setConfirmPassword('');
      setResetToken('');
      setStep(4);
    } catch (error) {
      Alert.alert(t('recovery_reset_failed'), t('recovery_reset_failed_msg'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
      {/* Navigation Header */}
      <View style={s.topNav}>
        <TouchableOpacity style={s.backBtn} onPress={handleBack}>
          <Ionicons name="arrow-back" size={20} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={s.navTitle}>{t('forgot_pw_title', 'Forgot Password')}</Text>
        <View style={{ width: 36 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">

          {/* STEP 1: Enter User ID or Mobile */}
          {step === 1 && (
            <>
              <View style={s.iconWrap}>
                <Ionicons name="lock-open-outline" size={44} color={COLORS.primary} />
              </View>

              <View style={s.textBlock}>
                <Text style={s.title}>{t('reset_pw_heading', 'Reset your password')}</Text>
                <Text style={s.sub}>{t('reset_pw_sub')}</Text>
              </View>

              <View style={s.card}>
                <Text style={s.label}>{t('recovery_identifier_label')}</Text>
                <View style={s.inputWrap}>
                  <Ionicons name="person-circle-outline" size={18} color={COLORS.textMuted} />
                  <TextInput
                    style={s.input}
                    value={identifier}
                    onChangeText={setIdentifier}
                    placeholder="04000001 or 09171234567"
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
                  <Text style={s.btnText}>{t('recovery_send_code')}</Text>
                )}
              </TouchableOpacity>

              {/* Lost SIM / Inaccessible Phone Advisory */}
              <View style={s.lostSimHelpBox}>
                <Ionicons name="information-circle-outline" size={20} color={COLORS.primary} style={{ marginTop: 2 }} />
                <View style={{ flex: 1 }}>
                  <Text style={s.lostSimHelpTitle}>{t('recovery_lost_sim_title')}</Text>
                  <Text style={s.lostSimHelpText}>{t('recovery_lost_sim_help')}</Text>
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
                <Text style={s.title}>{t('recovery_enter_code_title')}</Text>
                <Text style={s.sub}>
                  {t('recovery_enter_code_prefix')}{' '}
                  <Text style={{ fontWeight: '700', color: COLORS.text }}>{identifier}</Text>,{' '}
                  {t('recovery_enter_code_suffix')}
                </Text>
              </View>

              <View style={s.card}>
                <Text style={s.label}>{t('recovery_code_label')}</Text>
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
                <TouchableOpacity
                  onPress={handleSendOtp}
                  disabled={loading || resendSeconds > 0}
                  style={{ alignSelf: 'flex-end', marginTop: 4, opacity: loading || resendSeconds > 0 ? 0.55 : 1 }}
                >
                  <Text style={{ fontSize: 12, color: COLORS.primary, fontWeight: '600' }}>
                    {resendSeconds > 0
                      ? `${codeRequestsRemaining === 0 ? t('recovery_limit_reached') : t('recovery_resend_available')} ${t('time_in', 'in')} ${formatCountdown(resendSeconds)}`
                      : `${t('recovery_request_new_code')} (${codeRequestsRemaining} ${t('recovery_remaining')})`}
                  </Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={[s.btn, loading && { opacity: 0.6 }]}
                onPress={handleVerifyOtp}
                disabled={loading}
                activeOpacity={0.8}
              >
                {loading ? <ActivityIndicator size="small" color="#fff" /> : <Text style={s.btnText}>{t('recovery_verify_continue')}</Text>}
              </TouchableOpacity>

              {/* SMS Troubleshooting Note */}
              <View style={[s.lostSimHelpBox, { marginTop: 8 }]}>
                <Ionicons name="shield-outline" size={18} color={COLORS.textMuted} style={{ marginTop: 2 }} />
                <View style={{ flex: 1 }}>
                  <Text style={s.lostSimHelpTitle}>{t('recovery_sms_missing_title')}</Text>
                  <Text style={s.lostSimHelpText}>{t('recovery_sms_missing_help')}</Text>
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
                <Text style={s.title}>{t('recovery_create_password')}</Text>
                <Text style={s.sub}>{t('recovery_create_password_sub')}</Text>
              </View>

              <View style={s.card}>
                <View style={{ gap: 6 }}>
                  <Text style={s.label}>{t('recovery_new_password_label')}</Text>
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
                  <Text style={s.label}>{t('recovery_confirm_password_label')}</Text>
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
                  <Text style={s.btnText}>{t('recovery_save_password')}</Text>
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
              <Text style={s.successTitle}>{t('recovery_complete_title')}</Text>
              <Text style={s.successSub}>{t('recovery_complete_msg')}</Text>
              <TouchableOpacity 
                style={s.btn} 
                onPress={() => navigation.replace('Login')}
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
