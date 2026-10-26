import React, { useEffect, useState, useRef } from 'react';
import { View, StyleSheet, TouchableOpacity, KeyboardAvoidingView, ScrollView, Alert, ActivityIndicator, Keyboard, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONT_FAMILY, SPACING, RADIUS, SHADOW } from '../../theme';
import { useTranslation } from '../../services/i18n';
import {
  requestPasswordRecovery,
  verifyPasswordRecovery,
  completePasswordRecovery,
  requestPasswordRecoveryReview,
  checkPasswordRecoveryReview,
  completePasswordRecoveryReview
} from '../../services/authService';
import { passwordPolicyError } from '../../domain/passwordPolicy';
import { STORAGE_KEYS, getItem, removeItem, saveItem } from '../../services/storageService';
import { getRecoveryPushToken } from '../../services/recoveryNotificationService';
import { AppText as Text, AppTextInput as TextInput } from '../../components/Typography';
import OtpCodeInput from '../../components/OtpCodeInput';

export default function ForgotPasswordScreen({ navigation, route }) {
  const { t } = useTranslation();

  const scrollViewRef = useRef(null);
  const newPwRef = useRef(null);
  const confirmPwRef = useRef(null);
  const [keyboardActive, setKeyboardActive] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (e) => {
        setKeyboardActive(true);
        setKeyboardHeight(e.endCoordinates?.height || 260);
      }
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => {
        setKeyboardActive(false);
        setKeyboardHeight(0);
      }
    );
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

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
  const [assistedMode, setAssistedMode] = useState(false);
  const [assistedPhone, setAssistedPhone] = useState('');
  const [reviewId, setReviewId] = useState('');
  const [claimToken, setClaimToken] = useState('');

  useEffect(() => {
    let active = true;
    getItem(STORAGE_KEYS.PASSWORD_RECOVERY_REVIEW).then(stored => {
      if (!active || !stored?.reviewId || !stored?.claimToken) return;
      if (Date.parse(stored.expiresAt) <= Date.now()) {
        void removeItem(STORAGE_KEYS.PASSWORD_RECOVERY_REVIEW);
        return;
      }
      setAssistedMode(true);
      setReviewId(stored.reviewId);
      setClaimToken(stored.claimToken);
      setStep(5);
    }).catch(() => {});
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!route?.params?.checkRecoveryReview || !reviewId || !claimToken) return undefined;
    let active = true;
    setLoading(true);
    checkPasswordRecoveryReview(reviewId, claimToken)
      .then(async result => {
        if (!active) return;
        if (result.status === 'APPROVED') {
          setStep(3);
          Alert.alert('Recovery approved', 'Create your new password now. This approval expires 15 minutes after it was granted.');
        } else if (['REJECTED', 'EXPIRED', 'REPLACED', 'USED'].includes(result.status)) {
          await removeItem(STORAGE_KEYS.PASSWORD_RECOVERY_REVIEW);
          Alert.alert('Recovery unavailable', result.message || 'This recovery request is no longer available.');
        } else {
          setStep(5);
        }
      })
      .catch(error => {
        if (active) Alert.alert('Status unavailable', error.message || 'The review status could not be checked.');
      })
      .finally(() => {
        if (active) {
          setLoading(false);
          navigation.setParams({ checkRecoveryReview: undefined });
        }
      });
    return () => { active = false; };
  }, [claimToken, navigation, reviewId, route?.params?.checkRecoveryReview]);

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
    if (step === 5) {
      setReviewId('');
      setClaimToken('');
      void removeItem(STORAGE_KEYS.PASSWORD_RECOVERY_REVIEW);
      setAssistedMode(false);
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

  const handleRequestReview = async () => {
    const userId = identifier.trim();
    const phone = assistedPhone.replace(/\D/g, '');
    if (!/^0[1-4]\d{6}$/.test(userId) || !/^09\d{9}$/.test(phone)) {
      Alert.alert('Account details required', 'Enter your 8-digit HUGPONG User ID and registered 11-digit mobile number.');
      return;
    }
    setLoading(true);
    try {
      const mobilePushToken = await getRecoveryPushToken();
      const result = await requestPasswordRecoveryReview(userId, phone, mobilePushToken);
      setReviewId(result.reviewId);
      setClaimToken(result.claimToken);
      await saveItem(STORAGE_KEYS.PASSWORD_RECOVERY_REVIEW, {
        reviewId: result.reviewId,
        claimToken: result.claimToken,
        expiresAt: result.expiresAt
      });
      setStep(5);
      Alert.alert(
        'Recovery request submitted',
        mobilePushToken
          ? 'You may close HUGPONG. We will notify this device when an authorized reviewer approves or rejects the request.'
          : 'Notifications are unavailable. Return to this screen and tap Check Review Status after meeting your authorized reviewer.'
      );
    } catch (error) {
      Alert.alert('Recovery request unavailable', error.message || 'The recovery review could not be requested.');
    } finally {
      setLoading(false);
    }
  };

  const handleCheckReview = async () => {
    setLoading(true);
    try {
      const result = await checkPasswordRecoveryReview(reviewId, claimToken);
      if (result.status === 'APPROVED') {
        setStep(3);
      } else if (['REJECTED', 'EXPIRED', 'REPLACED', 'USED'].includes(result.status)) {
        await removeItem(STORAGE_KEYS.PASSWORD_RECOVERY_REVIEW);
        Alert.alert('Recovery unavailable', result.message || 'This recovery request is no longer available.');
      } else {
        Alert.alert('Review pending', result.message || 'Your authorized reviewer has not approved this request yet.');
      }
    } catch (error) {
      Alert.alert('Status unavailable', error.message || 'The review status could not be checked.');
    } finally {
      setLoading(false);
    }
  };

  // ── Step 3: Save New Password ────────────────────────────────
  const handleResetPassword = async () => {
    const policyError = passwordPolicyError(newPassword);
    if (policyError) {
      Alert.alert(t('recovery_password_requirements'), policyError);
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert(t('recovery_mismatch'), t('recovery_mismatch_msg'));
      return;
    }

    setLoading(true);
    try {
      if (assistedMode) await completePasswordRecoveryReview(reviewId, claimToken, newPassword);
      else await completePasswordRecovery(recoveryId, resetToken, newPassword);
      setNewPassword('');
      setConfirmPassword('');
      setResetToken('');
      await removeItem(STORAGE_KEYS.PASSWORD_RECOVERY_REVIEW);
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

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0}
      >
        <ScrollView
          ref={scrollViewRef}
          contentContainerStyle={[
            s.scroll,
            { paddingBottom: keyboardActive ? Math.max(keyboardHeight + 20, 180) : 40 }
          ]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
          showsVerticalScrollIndicator={false}
        >

          {/* STEP 1: Enter User ID or Mobile */}
          {step === 1 && (
            <>
              <View style={s.iconWrap}>
                <Ionicons name="lock-open-outline" size={44} color={COLORS.primary} />
              </View>

              <View style={s.textBlock}>
                <Text style={s.title}>{assistedMode ? 'Request authorized recovery' : t('reset_pw_heading', 'Reset your password')}</Text>
                <Text style={s.sub}>{assistedMode ? 'For Smart/TNT or unavailable SMS, enter both account details and meet an authorized HUGPONG reviewer in person.' : t('reset_pw_sub')}</Text>
              </View>

              <View style={s.card}>
                <Text style={s.label}>{assistedMode ? '8-Digit HUGPONG User ID' : t('recovery_identifier_label')}</Text>
                <View style={s.inputWrap}>
                  <Ionicons name="person-circle-outline" size={18} color={COLORS.textMuted} />
                  <TextInput
                    style={s.input}
                    value={identifier}
                    onChangeText={setIdentifier}
                    placeholder={assistedMode ? '04000001' : '04000001 or 09171234567'}
                    placeholderTextColor={COLORS.textMuted}
                    autoCapitalize="none"
                  />
                </View>
                {assistedMode && (
                  <>
                    <Text style={s.label}>Registered Mobile Number</Text>
                    <View style={s.inputWrap}>
                      <Ionicons name="call-outline" size={18} color={COLORS.textMuted} />
                      <TextInput style={s.input} value={assistedPhone} onChangeText={value => setAssistedPhone(value.replace(/\D/g, '').slice(0, 11))} placeholder="09171234567" placeholderTextColor={COLORS.textMuted} keyboardType="phone-pad" maxLength={11} />
                    </View>
                  </>
                )}
              </View>

              <TouchableOpacity 
                style={[s.btn, loading && { opacity: 0.6 }]}
                onPress={assistedMode ? handleRequestReview : handleSendOtp}
                disabled={loading}
                activeOpacity={0.8}
              >
                {loading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={s.btnText}>{assistedMode ? 'Request Recovery Review' : t('recovery_send_code')}</Text>
                )}
              </TouchableOpacity>

              {/* Lost SIM / Inaccessible Phone Advisory */}
              <View style={s.lostSimHelpBox}>
                <Ionicons name="information-circle-outline" size={20} color={COLORS.primary} style={{ marginTop: 2 }} />
                <View style={{ flex: 1 }}>
                  <Text style={s.lostSimHelpTitle}>Using Smart/TNT or unable to receive SMS?</Text>
                  <Text style={s.lostSimHelpText}>Request authorized recovery and bring valid identification to your Farm Manager, SRA Admin, or Super Admin, depending on your role. They never create or see your new password.</Text>
                  <TouchableOpacity onPress={() => setAssistedMode(value => !value)} style={{ marginTop: 8 }}>
                    <Text style={{ color: COLORS.primary, fontSize: 12, fontWeight: '800' }}>{assistedMode ? 'Use SMS recovery instead' : 'Request authorized password recovery'}</Text>
                  </TouchableOpacity>
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
                <OtpCodeInput
                  value={otpCode}
                  onChangeText={setOtpCode}
                  onComplete={handleVerifyOtp}
                  disabled={loading}
                  autoFocus
                  accessibilityLabel={t('recovery_code_label')}
                />
                <TouchableOpacity
                  onPress={handleSendOtp}
                  disabled={loading || resendSeconds > 0}
                  style={{ alignSelf: 'flex-end', marginTop: 10, opacity: loading || resendSeconds > 0 ? 0.55 : 1 }}
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
                  <TouchableOpacity onPress={() => { setAssistedMode(true); setStep(1); }} style={{ marginTop: 8 }}>
                    <Text style={{ color: COLORS.primary, fontSize: 12, fontWeight: '800' }}>Smart/TNT or no SMS? Request authorized recovery</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </>
          )}

          {step === 5 && (
            <>
              <View style={s.iconWrap}><Ionicons name="people-circle-outline" size={44} color={COLORS.primary} /></View>
              <View style={s.textBlock}>
                <Text style={s.title}>Recovery review pending</Text>
                <Text style={s.sub}>Visit your Farm Manager, SRA Admin, or Super Admin, as applicable, for in-person identity verification. Return here after approval.</Text>
              </View>
              <View style={s.card}>
                <Text style={s.label}>Recovery Reference</Text>
                <Text style={{ fontFamily: 'monospace', fontSize: 16, fontWeight: '800', color: COLORS.text }}>{reviewId}</Text>
                <Text style={s.lostSimHelpText}>After approval, you have 15 minutes to create your own new password. The reviewer cannot see it.</Text>
                <Text style={s.lostSimHelpText}>If notifications are enabled, you may close the app. Tapping the approval notification returns you here.</Text>
              </View>
              <TouchableOpacity style={[s.btn, loading && { opacity: 0.6 }]} onPress={handleCheckReview} disabled={loading} activeOpacity={0.8}>
                {loading ? <ActivityIndicator size="small" color="#fff" /> : <Text style={s.btnText}>Check Review Status</Text>}
              </TouchableOpacity>
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
                      ref={newPwRef}
                      style={[s.input, { flex: 1 }]}
                      value={newPassword}
                      onChangeText={setNewPassword}
                      secureTextEntry={!showPassword}
                      placeholder="••••••••"
                      placeholderTextColor={COLORS.textMuted}
                      returnKeyType="next"
                      onSubmitEditing={() => confirmPwRef.current?.focus()}
                      onFocus={() => {
                        setTimeout(() => {
                          scrollViewRef.current?.scrollTo({ y: 120, animated: true });
                        }, 150);
                      }}
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
                      ref={confirmPwRef}
                      style={[s.input, { flex: 1 }]}
                      value={confirmPassword}
                      onChangeText={setConfirmPassword}
                      secureTextEntry={!showPassword}
                      placeholder="••••••••"
                      placeholderTextColor={COLORS.textMuted}
                      returnKeyType="done"
                      onFocus={() => {
                        setTimeout(() => {
                          scrollViewRef.current?.scrollToEnd({ animated: true });
                        }, 150);
                      }}
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
  title: { fontFamily: FONT_FAMILY.display, fontSize: 22, fontWeight: '800', color: COLORS.text, textAlign: 'center' },
  sub: { fontSize: 13, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 20, paddingHorizontal: 12 },
  card: { width: '100%', backgroundColor: '#fff', borderRadius: RADIUS.xl, padding: SPACING.xl, gap: 14, ...SHADOW.card },
  label: { fontSize: 12, fontWeight: '700', color: COLORS.textSecondary },
  inputWrap: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: COLORS.background, borderRadius: RADIUS.md, borderWidth: 1.5, borderColor: COLORS.border, paddingHorizontal: 12, paddingVertical: 12 },
  input: { flex: 1, fontSize: 15, color: COLORS.text, fontWeight: '600' },
  btn: { width: '100%', backgroundColor: COLORS.primary, borderRadius: RADIUS.md, paddingVertical: 15, alignItems: 'center', shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.2, shadowRadius: 5, elevation: 2 },
  btnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  successWrap: { flex: 1, alignItems: 'center', gap: SPACING.lg, paddingTop: 30 },
  successIcon: { width: 100, height: 100, borderRadius: 50, backgroundColor: COLORS.successLight, justifyContent: 'center', alignItems: 'center' },
  successTitle: { fontFamily: FONT_FAMILY.display, fontSize: 22, fontWeight: '800', color: COLORS.text, textAlign: 'center' },
  successSub: { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 22, paddingHorizontal: 20 },
  lostSimHelpBox: { width: '100%', flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: '#F0F8EC', borderWidth: 1, borderColor: COLORS.primary + '30', padding: 14, borderRadius: RADIUS.lg },
  lostSimHelpTitle: { fontSize: 12.5, fontWeight: '700', color: COLORS.primary, marginBottom: 2 },
  lostSimHelpText: { fontSize: 11.5, color: COLORS.textSecondary, lineHeight: 17 },
});
