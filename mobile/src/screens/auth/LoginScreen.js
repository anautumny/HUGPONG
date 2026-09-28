import React, { useState, useEffect, useRef } from 'react';
import { View, Text, Image, StyleSheet, TextInput, TouchableOpacity, KeyboardAvoidingView, ScrollView, Alert, ActivityIndicator, Modal, Animated, Easing } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS, SHADOW } from '../../theme';
import {
  authenticateUser,
  isValidUserIdentifier,
  logoutUser,
  requestCurrentPhoneVerification,
  updateUserPassword,
  verifyCurrentPhone
} from '../../data/dataStore';
import { useTranslation } from '../../services/i18n';
import {
  isOnline,
  addNetworkListener,
  checkConnectivity,
  getConnectivityDetails,
  CONNECTIVITY_STATUS
} from '../../services/networkService';
import { API_UNAVAILABLE_MESSAGE } from '../../config/apiConfig';
import CirclingRetryButton from '../../components/CirclingRetryButton';
import LegalPolicyModal from '../../components/LegalPolicyModal';
import { STORAGE_KEYS, getItem, removeItem, saveItem } from '../../services/storageService';
import { passwordPolicy } from '../../domain/passwordPolicy';

const LOGO = require('../../../assets/HUGPONG LOGO.png');

export default function LoginScreen({ navigation, route }) {
  const { t } = useTranslation();
  const [contactNumber, setContactNumber] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const [authError, setAuthError] = useState(() => String(route?.params?.sessionNotice || ''));
  const [deviceOnline, setDeviceOnline] = useState(isOnline());
  const [connectivityStatus, setConnectivityStatus] = useState(getConnectivityDetails().status);
  const [showOfflineGateModal, setShowOfflineGateModal] = useState(false);
  const [showLegalModal, setShowLegalModal] = useState(false);

  // Security: Brute-Force Rate Limiting & Account Lockout
  const [lockoutSeconds, setLockoutSeconds] = useState(0);
  const [lockoutUntil, setLockoutUntil] = useState(0);

  // First-Time Password Change Assistant State
  const [showFirstLoginModal, setShowFirstLoginModal] = useState(false);
  const [authenticatedUser, setAuthenticatedUser] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [firstLoginError, setFirstLoginError] = useState('');
  const [firstLoginSaving, setFirstLoginSaving] = useState(false);
  const [showPhoneVerificationModal, setShowPhoneVerificationModal] = useState(false);
  const [phoneVerificationCode, setPhoneVerificationCode] = useState('');
  const [phoneVerificationError, setPhoneVerificationError] = useState('');
  const [phoneVerificationSaving, setPhoneVerificationSaving] = useState(false);
  const [phoneVerificationResending, setPhoneVerificationResending] = useState(false);
  const [phoneVerificationResendSeconds, setPhoneVerificationResendSeconds] = useState(0);
  const [phoneVerificationRequestsRemaining, setPhoneVerificationRequestsRemaining] = useState(3);
  const [pendingPasswordChange, setPendingPasswordChange] = useState(false);
  const [setupSigningOut, setSetupSigningOut] = useState(false);
  const [isRetryingOffline, setIsRetryingOffline] = useState(false);
  const [offlineRetryFeedback, setOfflineRetryFeedback] = useState('');
  const spinAnim = useRef(new Animated.Value(0)).current;
  const loopAnimRef = useRef(null);

  const startSpinAnimation = () => {
    spinAnim.setValue(0);
    loopAnimRef.current = Animated.loop(
      Animated.timing(spinAnim, {
        toValue: 1,
        duration: 800,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    loopAnimRef.current.start();
  };

  const stopSpinAnimation = () => {
    if (loopAnimRef.current) {
      loopAnimRef.current.stop();
    }
    spinAnim.setValue(0);
  };

  const handleRetryOffline = async () => {
    if (isRetryingOffline) return;
    setIsRetryingOffline(true);
    setOfflineRetryFeedback('');
    startSpinAnimation();

    try {
      const reachable = await checkConnectivity({ force: true });
      if (reachable) {
        setDeviceOnline(true);
        setConnectivityStatus(CONNECTIVITY_STATUS.ONLINE);
      } else {
        const details = getConnectivityDetails();
        setConnectivityStatus(details.status);
        setOfflineRetryFeedback(
          details.status === CONNECTIVITY_STATUS.SERVER_UNAVAILABLE
            ? 'Server is temporarily unreachable. Please retry shortly.'
            : 'No internet connection detected. Please check Wi-Fi or mobile data.'
        );
      }
    } catch {
      setOfflineRetryFeedback('Unable to connect. Please check your network.');
    } finally {
      setTimeout(() => {
        stopSpinAnimation();
        setIsRetryingOffline(false);
      }, 500);
    }
  };

  useEffect(() => {
    const unsubNet = addNetworkListener((status, details) => {
      setDeviceOnline(status);
      setConnectivityStatus(details.status);
      if (status) {
        setShowOfflineGateModal(false);
      }
    });
    return () => {
      if (typeof unsubNet === 'function') unsubNet();
    };
  }, []);

  useEffect(() => {
    let active = true;
    getItem(STORAGE_KEYS.LOGIN_LOCKOUT_UNTIL, 0).then(stored => {
      if (!active) return;
      const expiry = Number(stored || 0);
      if (Number.isFinite(expiry) && expiry > Date.now()) {
        setLockoutUntil(expiry);
        setLockoutSeconds(Math.max(1, Math.ceil((expiry - Date.now()) / 1000)));
        setAuthError(t('auth_lockout_60'));
      } else {
        removeItem(STORAGE_KEYS.LOGIN_LOCKOUT_UNTIL);
      }
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!lockoutUntil) return undefined;
    const updateRemaining = () => {
      const remaining = Math.max(0, Math.ceil((lockoutUntil - Date.now()) / 1000));
      setLockoutSeconds(remaining);
      if (remaining === 0) {
        setLockoutUntil(0);
        setAuthError('');
        removeItem(STORAGE_KEYS.LOGIN_LOCKOUT_UNTIL);
      }
    };
    updateRemaining();
    const timer = setInterval(updateRemaining, 1000);
    return () => clearInterval(timer);
  }, [lockoutUntil]);

  const applyServerLockout = async (data = {}) => {
    const serverExpiry = Date.parse(data.lockoutUntil || data.windowResetsAt || '');
    const retrySeconds = Math.max(1, Number(data.retryAfterSeconds || 60));
    const expiry = Number.isFinite(serverExpiry) ? serverExpiry : Date.now() + (retrySeconds * 1000);
    setLockoutUntil(expiry);
    setLockoutSeconds(Math.max(1, Math.ceil((expiry - Date.now()) / 1000)));
    await saveItem(STORAGE_KEYS.LOGIN_LOCKOUT_UNTIL, expiry);
  };

  useEffect(() => {
    if (phoneVerificationResendSeconds <= 0) return undefined;
    const timer = setInterval(() => {
      setPhoneVerificationResendSeconds(value => Math.max(0, value - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [phoneVerificationResendSeconds > 0]);

  const validate = () => {
    const e = {};
    const raw = String(contactNumber || '').trim();
    const cleaned = raw.replace(/\D/g, '');
    const isId = /^0[1-4]\d{6}$/.test(raw) || /^0[1-4]\d{6}$/.test(cleaned);
    const isPhone = (cleaned.startsWith('09') && cleaned.length === 11) || (cleaned.startsWith('639') && cleaned.length === 12);

    if (!isId && !isPhone && !isValidUserIdentifier(raw)) {
      e.contactNumber = t('auth_enter_valid_id_or_phone', 'Enter your 8-digit User ID (e.g. 04000001) or 11-digit mobile number (09XXXXXXXXX)');
    }
    if (password.length < 8) {
      e.password = t('auth_pw_min_length', 'Password must be at least 8 characters');
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleLogin = async () => {
    if (loading) return;
    if (lockoutSeconds > 0) {
      Alert.alert(
        t('auth_lockout_title'),
        t('auth_lockout_wait')
      );
      return;
    }

    setAuthError('');
    if (!validate()) return;
    setLoading(true);

    try {
      const serverReachable = await checkConnectivity({ force: true });
      if (!serverReachable) {
        const connectivity = getConnectivityDetails();
        if (connectivity.status === CONNECTIVITY_STATUS.NO_INTERNET) {
          setShowOfflineGateModal(true);
        } else {
          setAuthError(API_UNAVAILABLE_MESSAGE);
        }
        return;
      }

      const res = await authenticateUser(contactNumber, password);

      if (!res.success) {
        if (res.isNetworkError) {
          setAuthError(res.code === 'API_CONFIGURATION_ERROR'
            ? res.error
            : API_UNAVAILABLE_MESSAGE);
          return;
        }
        if (res.code === 'LOGIN_RATE_LIMITED' || res.status === 429) {
          await applyServerLockout(res.data);
          setAuthError(res.error || t('auth_lockout_60'));
        } else {
          setAuthError(res.error || t('auth_invalid_credentials', 'Invalid User ID, mobile number, or password.'));
        }
        return;
      }

      // Successful authentication
      await removeItem(STORAGE_KEYS.LOGIN_LOCKOUT_UNTIL);
      setLockoutUntil(0);
      setLockoutSeconds(0);
      setAuthError('');

      setAuthenticatedUser(res.user);
      if (res.user?.pendingFirstLoginVerification === true || res.user?.phoneVerified === false) {
        setPendingPasswordChange(res.requiresPasswordChange === true);
        setPhoneVerificationCode('');
        setPhoneVerificationError('');
        const request = await requestCurrentPhoneVerification();
        if (!request.success) {
          setPhoneVerificationResendSeconds(Math.max(0, Number(request.retryAfterSeconds || 0)));
          setPhoneVerificationRequestsRemaining(Math.max(0, Number(request.remaining ?? 0)));
          if (request.code === 'RESEND_COOLDOWN' || request.code === 'HOURLY_CODE_LIMIT') {
            setPhoneVerificationError(request.error || t('auth_latest_code'));
            setShowPhoneVerificationModal(true);
            return;
          }
          setAuthError(request.error || t('auth_code_send_failed'));
          return;
        }
        setPhoneVerificationResendSeconds(Math.max(0, Number(request.resendAfterSeconds || 0)));
        setPhoneVerificationRequestsRemaining(Math.max(0, Number(request.codeRequestsRemaining ?? 0)));
        setShowPhoneVerificationModal(true);
        return;
      }

      if (res.requiresPasswordChange) {
        setNewPassword('');
        setConfirmPassword('');
        setFirstLoginError('');
        setShowFirstLoginModal(true);
        return;
      }

      navigation.replace('MainTabs');
    } catch (error) {
      setAuthError(API_UNAVAILABLE_MESSAGE);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyPhone = async () => {
    if (!/^\d{6}$/.test(phoneVerificationCode.trim())) {
      setPhoneVerificationError(t('auth_code_complete'));
      return;
    }
    setPhoneVerificationSaving(true);
    setPhoneVerificationError('');
    const result = await verifyCurrentPhone(phoneVerificationCode.trim());
    setPhoneVerificationSaving(false);
    if (!result.success) {
      setPhoneVerificationError(result.error || t('auth_code_invalid'));
      return;
    }
    setAuthenticatedUser(result.user);
    setShowPhoneVerificationModal(false);
    if (pendingPasswordChange) {
      setNewPassword('');
      setConfirmPassword('');
      setFirstLoginError('');
      setShowFirstLoginModal(true);
      return;
    }
    navigation.replace('MainTabs');
  };

  const handleResendPhoneVerification = async () => {
    if (phoneVerificationResending || setupSigningOut || phoneVerificationResendSeconds > 0) return;
    setPhoneVerificationResending(true);
    setPhoneVerificationError('');
    try {
      const result = await requestCurrentPhoneVerification();
      if (!result.success) {
        setPhoneVerificationResendSeconds(Math.max(0, Number(result.retryAfterSeconds || 0)));
        setPhoneVerificationRequestsRemaining(Math.max(0, Number(result.remaining ?? 0)));
        setPhoneVerificationError(result.error || t('auth_new_code_failed'));
      } else {
        setPhoneVerificationResendSeconds(Math.max(0, Number(result.resendAfterSeconds || 0)));
        setPhoneVerificationRequestsRemaining(Math.max(0, Number(result.codeRequestsRemaining ?? 0)));
      }
    } catch (error) {
      setPhoneVerificationError(error.message || t('auth_new_code_failed'));
    } finally {
      setPhoneVerificationResending(false);
    }
  };

  const completeSetupSignOut = async () => {
    if (setupSigningOut) return;
    setSetupSigningOut(true);
    try {
      await logoutUser();
      setShowPhoneVerificationModal(false);
      setShowFirstLoginModal(false);
      setAuthenticatedUser(null);
      setPendingPasswordChange(false);
      setPhoneVerificationCode('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error) {
      Alert.alert(t('auth_signout_failed_title'), error.message || t('auth_signout_failed_msg'));
    } finally {
      setSetupSigningOut(false);
    }
  };

  const confirmSetupSignOut = () => {
    if (setupSigningOut || phoneVerificationSaving || phoneVerificationResending || firstLoginSaving) return;
    Alert.alert(
      t('auth_signout_setup_title'),
      t('auth_signout_setup_msg'),
      [
        { text: t('auth_continue_setup'), style: 'cancel' },
        { text: t('first_sign_out'), style: 'destructive', onPress: completeSetupSignOut }
      ]
    );
  };

  const handleSaveFirstLoginPassword = async () => {
    const policy = passwordPolicy(newPassword);
    const isLen = policy.hasValidLength;
    const isCase = policy.hasLowercase && policy.hasUppercase;
    const isNum = policy.hasNumber;
    const isNotDefault = policy.isUnpredictable;

    if (!isLen) {
      setFirstLoginError(t('auth_password_min_full'));
      return;
    }
    if (!isCase) {
      setFirstLoginError(t('auth_password_case'));
      return;
    }
    if (!isNum) {
      setFirstLoginError(t('auth_password_number'));
      return;
    }
    if (!isNotDefault) {
      setFirstLoginError(t('auth_password_default'));
      return;
    }
    if (newPassword !== confirmPassword) {
      setFirstLoginError(t('auth_password_mismatch'));
      return;
    }

    setFirstLoginSaving(true);
    setFirstLoginError('');
    try {
      const res = await updateUserPassword(password, newPassword);
      setFirstLoginSaving(false);

      if (!res.success) {
        setFirstLoginError(res.error || t('auth_password_save_failed'));
        return;
      }

      setShowFirstLoginModal(false);
      Alert.alert(
        t('auth_password_configured_title'),
        t('auth_password_configured_msg')
      );
      navigation.replace('MainTabs');
    } catch (err) {
      setFirstLoginSaving(false);
      setFirstLoginError(t('auth_unexpected_error'));
    }
  };

  // Requirement status calculations
  const firstLoginPolicy = passwordPolicy(newPassword);
  const reqLen = firstLoginPolicy.hasValidLength;
  const reqCase = firstLoginPolicy.hasLowercase && firstLoginPolicy.hasUppercase;
  const reqNum = firstLoginPolicy.hasNumber;
  const reqDiff = firstLoginPolicy.isUnpredictable;
  const isReqValid = reqLen && reqCase && reqNum && reqDiff && newPassword === confirmPassword && confirmPassword.length > 0;

  if (!deviceOnline && connectivityStatus !== CONNECTIVITY_STATUS.CHECKING && !showFirstLoginModal && !showPhoneVerificationModal) {
    const isServerDown = connectivityStatus === CONNECTIVITY_STATUS.SERVER_UNAVAILABLE;
    const spin = spinAnim.interpolate({
      inputRange: [0, 1],
      outputRange: ['0deg', '360deg'],
    });

    return (
      <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
        <View style={s.offlineScreenContainer}>
          {/* Header */}
          <View style={s.offlineHeader}>
            <Image source={LOGO} style={s.offlineLogoImg} resizeMode="contain" />
          </View>

          {/* Center Minimal State (Exact Instagram Style) */}
          <View style={s.offlineCenterContent}>
            <TouchableOpacity
              onPress={handleRetryOffline}
              disabled={isRetryingOffline}
              activeOpacity={0.65}
              style={s.offlineIconWrap}
              accessibilityRole="button"
              accessibilityLabel={t('a11y_retry_connection')}
            >
              <Animated.View style={{ transform: [{ rotate: spin }] }}>
                <Ionicons
                  name="reload"
                  size={48}
                  color="#111827"
                />
              </Animated.View>
            </TouchableOpacity>

            <Text style={s.offlineTitle}>
              {isServerDown ? t('offline_server_unavailable_title') : t('auth_no_internet_title')}
            </Text>

            {offlineRetryFeedback ? (
              <Text style={s.offlineFeedbackText}>{offlineRetryFeedback}</Text>
            ) : null}
          </View>

          {/* Footer Notice */}
          <View style={s.offlineFooter}>
            <TouchableOpacity
              style={s.legalNoticeRow}
              onPress={() => setShowLegalModal(true)}
              accessibilityRole="button"
              accessibilityLabel={t('a11y_open_legal')}
            >
              <Ionicons name="shield-checkmark-outline" size={13} color={COLORS.textMuted} />
              <Text style={s.legalNoticeText}>
                {t('profile_legal')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <LegalPolicyModal visible={showLegalModal} onClose={() => setShowLegalModal(false)} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

          {/* Header */}
          <View style={s.header}>
            <Image source={LOGO} style={s.logoImg} resizeMode="contain" />
            <Text style={s.title}>{t('auth_welcome_title', 'Welcome back')}</Text>
            <Text style={s.sub}>{t('auth_welcome_sub', 'Sign in to your HUGPONG mobile account')}</Text>
          </View>

          {/* Login Card */}
          <View style={s.card}>

            {/* Offline First-Time Login Notice */}
            {!deviceOnline && connectivityStatus !== CONNECTIVITY_STATUS.CHECKING ? (
              <View style={s.offlineBanner}>
                <Ionicons name="cloud-offline-outline" size={20} color="#B45309" />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={s.offlineBannerTitle}>
                    {connectivityStatus === CONNECTIVITY_STATUS.NO_INTERNET
                      ? 'No internet connection'
                      : 'HUGPONG server unavailable'}
                  </Text>
                  <Text style={s.offlineBannerText}>
                    {connectivityStatus === CONNECTIVITY_STATUS.NO_INTERNET
                      ? 'Connect to Wi-Fi or mobile data to sign in. Once signed in, your field work remains available offline.'
                      : 'Your internet connection is active, but the HUGPONG server cannot be reached. Please retry shortly.'}
                  </Text>
                </View>
              </View>
            ) : null}

            {/* Lockout or Auth Error Banner */}
            {authError ? (
              <View style={[s.errorBanner, lockoutSeconds > 0 && s.lockoutBanner]}>
                <Ionicons 
                  name={lockoutSeconds > 0 ? "shield-outline" : "alert-circle-outline"} 
                  size={18} 
                  color={lockoutSeconds > 0 ? "#B45309" : "#DC2626"} 
                />
                <Text style={[s.errorBannerText, lockoutSeconds > 0 && s.lockoutBannerText]}>
                  {lockoutSeconds > 0 ? t('auth_lockout_wait') : authError}
                </Text>
              </View>
            ) : null}

            {/* Contact Number / User ID */}
            <View style={s.fieldGroup}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <Text style={s.label}>{t('auth_identifier_label', 'User ID or Mobile Number')}</Text>
                <Text style={{ fontSize: 11, color: COLORS.primary, fontWeight: '600' }}>{t('auth_lost_sim_user_id')}</Text>
              </View>
              <View style={[s.inputWrap, errors.contactNumber && s.inputError]}>
                <Ionicons name="person-circle-outline" size={18} color={COLORS.textMuted} style={s.inputIcon} />
                <TextInput
                  style={s.input}
                  value={contactNumber}
                  onChangeText={v => { 
                    setContactNumber(v); 
                    setErrors(p => ({ ...p, contactNumber: null })); 
                    setAuthError('');
                  }}
                  placeholder="04000001 or 0919 444 8888"
                  placeholderTextColor={COLORS.textMuted}
                  keyboardType="default"
                  maxLength={20}
                  editable={lockoutSeconds === 0}
                  autoComplete="username"
                  autoCapitalize="none"
                />
              </View>
              {errors.contactNumber && <Text style={s.errorText}>{errors.contactNumber}</Text>}
            </View>

            {/* Password */}
            <View style={s.fieldGroup}>
              <Text style={s.label}>{t('auth_password', 'Password')}</Text>
              <View style={[s.inputWrap, errors.password && s.inputError]}>
                <Ionicons name="lock-closed-outline" size={18} color={COLORS.textMuted} style={s.inputIcon} />
                <TextInput
                  style={[s.input, { flex: 1 }]}
                  value={password}
                  onChangeText={v => { 
                    setPassword(v); 
                    setErrors(p => ({ ...p, password: null })); 
                    setAuthError('');
                  }}
                  placeholder="••••••••"
                  placeholderTextColor={COLORS.textMuted}
                  secureTextEntry={!showPw}
                  editable={lockoutSeconds === 0}
                  autoComplete="password"
                />
                <TouchableOpacity onPress={() => setShowPw(p => !p)} style={{ padding: 4 }} activeOpacity={0.7}>
                  <Ionicons name={showPw ? 'eye-off-outline' : 'eye-outline'} size={18} color={COLORS.textMuted} />
                </TouchableOpacity>
              </View>
              {errors.password && <Text style={s.errorText}>{errors.password}</Text>}
            </View>

            {/* Forgot Password */}
            <TouchableOpacity style={s.forgotWrap} onPress={() => navigation.navigate('ForgotPassword')}>
              <Text style={s.forgotText}>{t('auth_forgot_pw', 'Forgot Password?')}</Text>
            </TouchableOpacity>

            {/* Sign In Button */}
            <TouchableOpacity 
              style={[
                s.btn, 
                (loading || lockoutSeconds > 0) && s.btnDisabled,
                lockoutSeconds > 0 && { backgroundColor: '#9CA3AF' }
              ]} 
              onPress={handleLogin} 
              disabled={loading || lockoutSeconds > 0}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Text style={s.btnText}>
                    {lockoutSeconds > 0 ? t('auth_try_again_later', 'Try Again Later') : t('auth_sign_in', 'Sign In to App')}
                  </Text>
                  <Ionicons name={lockoutSeconds > 0 ? "lock-closed" : "arrow-forward"} size={18} color="#fff" />
                </>
              )}
            </TouchableOpacity>

            <View style={s.securityNotice}>
              <Ionicons name="shield-checkmark-outline" size={14} color={COLORS.primary} />
              <Text style={s.securityNoticeText}>{t('auth_authenticated_session')}</Text>
            </View>

          </View>

          {/* Register Link */}
          <View style={s.registerRow}>
            <Text style={s.registerText}>{t('auth_no_account', "Don't have an account?")} </Text>
            <TouchableOpacity onPress={() => navigation.navigate('Register')}>
              <Text style={s.registerLink}>{t('auth_register_now', 'Create Account')}</Text>
            </TouchableOpacity>
          </View>

          {/* Legal Compliance Footer Notice */}
          <TouchableOpacity
            style={s.legalNoticeRow}
            onPress={() => setShowLegalModal(true)}
            accessibilityRole="button"
            accessibilityLabel={t('a11y_open_legal')}
          >
            <Ionicons name="shield-checkmark-outline" size={13} color={COLORS.textMuted} />
            <Text style={s.legalNoticeText}>
              {t('profile_legal')}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal
        visible={showPhoneVerificationModal}
        transparent
        animationType="fade"
        onRequestClose={confirmSetupSignOut}
      >
        <View style={s.modalOverlay}>
          <KeyboardAvoidingView style={{ width: '100%' }}>
            <View style={s.modalCard}>
              <View style={s.modalHeaderRow}>
                <View style={s.modalIconWrap}>
                  <Ionicons name="phone-portrait-outline" size={22} color="#D97706" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.modalTitle}>{t('first_verify_title')}</Text>
                  <Text style={s.modalSub}>{t('first_verify_sub')}</Text>
                </View>
              </View>
              {phoneVerificationError ? (
                <View style={s.firstLoginErrorBox}>
                  <Ionicons name="alert-circle" size={16} color="#DC2626" />
                  <Text style={s.firstLoginErrorText}>{phoneVerificationError}</Text>
                </View>
              ) : null}
              <View style={s.fieldGroup}>
                <Text style={s.label}>{t('first_verification_code')}</Text>
                <View style={s.inputWrap}>
                  <Ionicons name="keypad-outline" size={18} color={COLORS.textMuted} />
                  <TextInput
                    style={[s.input, { letterSpacing: 4 }]}
                    value={phoneVerificationCode}
                    onChangeText={value => { setPhoneVerificationCode(value); setPhoneVerificationError(''); }}
                    keyboardType="number-pad"
                    maxLength={6}
                    placeholder="123456"
                    placeholderTextColor={COLORS.textMuted}
                  />
                </View>
              </View>
              <TouchableOpacity
                style={[s.setupSignOutBtn, setupSigningOut && { opacity: 0.65 }]}
                onPress={confirmSetupSignOut}
                disabled={setupSigningOut || phoneVerificationSaving || phoneVerificationResending}
              >
                {setupSigningOut
                  ? <ActivityIndicator size="small" color="#DC2626" />
                  : <Ionicons name="log-out-outline" size={16} color="#DC2626" />}
                <Text style={s.setupSignOutText}>{setupSigningOut ? t('profile_signing_out') : t('first_sign_out')}</Text>
              </TouchableOpacity>
              <View style={s.modalBtnRow}>
                <TouchableOpacity
                  style={s.modalCancelBtn}
                  onPress={handleResendPhoneVerification}
                  disabled={phoneVerificationResending || phoneVerificationSaving || setupSigningOut || phoneVerificationResendSeconds > 0}
                >
                  {phoneVerificationResending
                    ? <ActivityIndicator size="small" color={COLORS.primary} />
                    : <Text style={s.modalCancelText}>
                        {phoneVerificationResendSeconds > 0
                          ? `${phoneVerificationRequestsRemaining === 0 ? t('recovery_limit_reached') : t('reg_resend_btn')} ${Math.floor(phoneVerificationResendSeconds / 60)}:${String(phoneVerificationResendSeconds % 60).padStart(2, '0')}`
                          : `${t('reg_resend_btn')} (${phoneVerificationRequestsRemaining} ${t('recovery_remaining')})`}
                      </Text>}
                </TouchableOpacity>
                <TouchableOpacity
                  style={s.modalSaveBtn}
                  onPress={handleVerifyPhone}
                  disabled={phoneVerificationSaving || setupSigningOut}
                >
                  {phoneVerificationSaving
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Text style={s.modalSaveText}>{t('first_verify_phone')}</Text>}
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* ── FIRST-TIME LOGIN PASSWORD CHANGE ASSISTANT MODAL ── */}
      <Modal
        visible={showFirstLoginModal}
        transparent={true}
        animationType="fade"
        onRequestClose={confirmSetupSignOut}
      >
        <View style={s.modalOverlay}>
          <KeyboardAvoidingView style={{ width: '100%' }}>
            <View style={s.modalCard}>
              {/* Header */}
              <View style={s.modalHeaderRow}>
                <View style={s.modalIconWrap}>
                  <Ionicons name="shield-half" size={22} color="#D97706" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.modalTitle}>{t('first_password_title')}</Text>
                  <Text style={s.modalSub}>{t('first_password_sub')}</Text>
                </View>
              </View>

              {/* Account Context Badge */}
              <View style={s.modalAccountBox}>
                <View style={s.modalAccountRow}>
                  <Text style={s.modalAccountLbl}>{t('first_account_holder')}</Text>
                  <Text style={s.modalAccountVal}>{authenticatedUser?.name || 'Authorized Personnel'}</Text>
                </View>
                <View style={[s.modalAccountRow, { borderTopWidth: 1, borderTopColor: '#E5E7EB', paddingTop: 4 }]}>
                  <Text style={s.modalAccountLbl}>{t('first_user_role')}</Text>
                  <Text style={[s.modalAccountVal, { color: COLORS.primary, fontWeight: '800' }]}>
                    {authenticatedUser?.employeeId || contactNumber} ({authenticatedUser?.role || 'Farm Member'})
                  </Text>
                </View>
              </View>

              {/* Error Message */}
              {firstLoginError ? (
                <View style={s.firstLoginErrorBox}>
                  <Ionicons name="alert-circle" size={16} color="#DC2626" />
                  <Text style={s.firstLoginErrorText}>{firstLoginError}</Text>
                </View>
              ) : null}

              {/* New Password Input */}
              <View style={s.fieldGroup}>
                <Text style={s.label}>{t('first_new_password')}</Text>
                <View style={s.inputWrap}>
                  <Ionicons name="lock-closed-outline" size={18} color={COLORS.textMuted} style={s.inputIcon} />
                  <TextInput
                    style={[s.input, { flex: 1 }]}
                    value={newPassword}
                    onChangeText={v => {
                      setNewPassword(v);
                      setFirstLoginError('');
                    }}
                    placeholder={t('first_password_placeholder')}
                    placeholderTextColor={COLORS.textMuted}
                    secureTextEntry={!showNewPw}
                    autoComplete="password"
                  />
                  <TouchableOpacity onPress={() => setShowNewPw(p => !p)} style={{ padding: 4 }}>
                    <Ionicons name={showNewPw ? 'eye-off-outline' : 'eye-outline'} size={18} color={COLORS.textMuted} />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Confirm Password Input */}
              <View style={s.fieldGroup}>
                <Text style={s.label}>{t('first_confirm_password')}</Text>
                <View style={s.inputWrap}>
                  <Ionicons name="lock-closed-outline" size={18} color={COLORS.textMuted} style={s.inputIcon} />
                  <TextInput
                    style={[s.input, { flex: 1 }]}
                    value={confirmPassword}
                    onChangeText={v => {
                      setConfirmPassword(v);
                      setFirstLoginError('');
                    }}
                    placeholder={t('first_confirm_placeholder')}
                    placeholderTextColor={COLORS.textMuted}
                    secureTextEntry={!showConfirmPw}
                    autoComplete="password"
                  />
                  <TouchableOpacity onPress={() => setShowConfirmPw(p => !p)} style={{ padding: 4 }}>
                    <Ionicons name={showConfirmPw ? 'eye-off-outline' : 'eye-outline'} size={18} color={COLORS.textMuted} />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Interactive Security Checklist */}
              <View style={s.checklistCard}>
                <Text style={s.checklistTitle}>{t('first_security_requirements')}</Text>
                <View style={s.checklistItem}>
                  <Ionicons name={reqLen ? "checkmark-circle" : "ellipse-outline"} size={14} color={reqLen ? "#16A34A" : COLORS.textMuted} />
                  <Text style={[s.checklistText, reqLen && s.checklistTextPassed]}>{t('first_rule_length')}</Text>
                </View>
                <View style={s.checklistItem}>
                  <Ionicons name={reqCase ? "checkmark-circle" : "ellipse-outline"} size={14} color={reqCase ? "#16A34A" : COLORS.textMuted} />
                  <Text style={[s.checklistText, reqCase && s.checklistTextPassed]}>{t('first_rule_case')}</Text>
                </View>
                <View style={s.checklistItem}>
                  <Ionicons name={reqNum ? "checkmark-circle" : "ellipse-outline"} size={14} color={reqNum ? "#16A34A" : COLORS.textMuted} />
                  <Text style={[s.checklistText, reqNum && s.checklistTextPassed]}>{t('first_rule_number')}</Text>
                </View>
                <View style={s.checklistItem}>
                  <Ionicons name={reqDiff ? "checkmark-circle" : "ellipse-outline"} size={14} color={reqDiff ? "#16A34A" : COLORS.textMuted} />
                  <Text style={[s.checklistText, reqDiff && s.checklistTextPassed]}>{t('first_rule_not_temporary')}</Text>
                </View>
              </View>

              {/* Action Buttons */}
              <View style={s.modalBtnRow}>
                <TouchableOpacity
                  style={[s.modalCancelBtn, setupSigningOut && { opacity: 0.65 }]}
                  onPress={confirmSetupSignOut}
                  disabled={setupSigningOut || firstLoginSaving}
                  activeOpacity={0.7}
                >
                  {setupSigningOut
                    ? <ActivityIndicator size="small" color="#DC2626" />
                    : <Text style={s.modalCancelText}>{t('first_sign_out')}</Text>}
                </TouchableOpacity>

                <TouchableOpacity
                  style={[s.modalSaveBtn, (!isReqValid || firstLoginSaving) && { opacity: 0.7 }]}
                  onPress={handleSaveFirstLoginPassword}
                  disabled={firstLoginSaving || setupSigningOut}
                  activeOpacity={0.8}
                >
                  {firstLoginSaving ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Text style={s.modalSaveText}>{t('first_save_open')}</Text>
                      <Ionicons name="arrow-forward" size={16} color="#fff" />
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* Offline Connection Required Barrier Modal */}
      <Modal
        visible={showOfflineGateModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowOfflineGateModal(false)}
      >
        <View style={s.modalOverlay}>
          <View style={[s.modalContent, { maxWidth: 380, alignItems: 'center', paddingVertical: 24, paddingHorizontal: 20 }]}>
            <View style={{
              width: 58,
              height: 58,
              borderRadius: 29,
              backgroundColor: '#FEF3C7',
              borderWidth: 1.5,
              borderColor: '#FDE68A',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 14,
            }}>
              <Ionicons name="cloud-offline" size={30} color="#D97706" />
            </View>

            <Text style={{ fontSize: 18, fontWeight: '900', color: COLORS.text, textAlign: 'center', marginBottom: 8 }}>
              {t('auth_no_internet_title')}
            </Text>

            <Text style={{ fontSize: 13, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 19, marginBottom: 20 }}>
              {t('auth_no_internet_desc')}
            </Text>

            <CirclingRetryButton
              label="Scan for Internet"
              scanningLabel="Scanning Connection..."
              theme="primary"
              style={{ width: '100%', minHeight: 46 }}
              onResult={(online) => {
                setDeviceOnline(online);
                if (online) {
                  setShowOfflineGateModal(false);
                } else if (getConnectivityDetails().status === CONNECTIVITY_STATUS.SERVER_UNAVAILABLE) {
                  setShowOfflineGateModal(false);
                  setAuthError(API_UNAVAILABLE_MESSAGE);
                }
              }}
            />

            <TouchableOpacity
              onPress={() => setShowOfflineGateModal(false)}
              style={{ marginTop: 12, paddingVertical: 8, paddingHorizontal: 16 }}
              activeOpacity={0.7}
            >
              <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.textMuted }}>
                {t('btn_dismiss')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      <LegalPolicyModal visible={showLegalModal} onClose={() => setShowLegalModal(false)} />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  // Minimal Instagram-style Offline Screen
  offlineScreenContainer: {
    flex: 1,
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 24,
    backgroundColor: '#FFFFFF',
  },
  offlineHeader: {
    width: '100%',
    alignItems: 'center',
    paddingTop: 8,
  },
  offlineLogoImg: {
    width: 44,
    height: 44,
  },
  offlineCenterContent: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    maxWidth: 320,
    marginTop: -20,
  },
  offlineIconWrap: {
    width: 72,
    height: 72,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  offlineTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  offlineFeedbackText: {
    fontSize: 12,
    color: '#B45309',
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 12,
  },
  offlineFooter: {
    width: '100%',
    alignItems: 'center',
  },
  safe: { flex: 1, backgroundColor: COLORS.background },
  scroll: { flexGrow: 1, padding: SPACING.lg, gap: SPACING.lg, paddingBottom: 32, justifyContent: 'center' },
  header: { alignItems: 'center', gap: 6, paddingTop: 10 },
  logoImg: { width: 80, height: 80 },
  title: { fontSize: 24, fontWeight: '900', color: COLORS.text, letterSpacing: -0.3 },
  sub: { fontSize: 13, color: COLORS.textMuted },
  card: { backgroundColor: '#fff', borderRadius: RADIUS['2xl'] || 24, padding: SPACING.xl, gap: SPACING.md, ...SHADOW.card },
  
  offlineBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FEF0D0',
    padding: 12,
    borderRadius: RADIUS.md,
  },
  offlineBannerTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#92400E',
  },
  offlineBannerText: {
    fontSize: 11,
    color: '#B45309',
    lineHeight: 15,
  },

  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    padding: 10,
    borderRadius: RADIUS.md,
  },
  errorBannerText: {
    flex: 1,
    fontSize: 11.5,
    color: '#DC2626',
    fontWeight: '600',
  },
  lockoutBanner: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FEF0D0',
  },
  lockoutBannerText: {
    color: '#B45309',
  },

  fieldGroup: { gap: 4 },
  label: { fontSize: 11, fontWeight: '700', color: COLORS.textSecondary, textTransform: 'uppercase', letterSpacing: 0.3 },
  inputWrap: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    backgroundColor: COLORS.background, 
    borderRadius: RADIUS.md, 
    borderWidth: 1, 
    borderColor: COLORS.border, 
    paddingHorizontal: 12, 
    paddingVertical: 10, 
    gap: 8 
  },
  inputError: { borderColor: '#D9534F' },
  inputIcon: { flexShrink: 0 },
  input: { flex: 1, fontSize: 14, color: COLORS.text, fontWeight: '600' },
  errorText: { fontSize: 11, color: '#D9534F', marginTop: 2 },
  forgotWrap: { alignSelf: 'flex-end', marginTop: -2 },
  forgotText: { fontSize: 12, color: COLORS.primaryLight, fontWeight: '700' },
  btn: { 
    backgroundColor: COLORS.primary, 
    borderRadius: RADIUS.lg, 
    paddingVertical: 14, 
    flexDirection: 'row', 
    justifyContent: 'center', 
    alignItems: 'center', 
    gap: 8, 
    marginTop: 4,
    ...SHADOW.sm 
  },
  btnDisabled: { opacity: 0.7 },
  btnText: { fontSize: 15, fontWeight: '800', color: '#fff' },

  securityNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    marginTop: 2,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  securityNoticeText: {
    fontSize: 10.5,
    color: COLORS.textMuted,
    fontWeight: '600',
  },

  registerRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 4 },
  registerText: { fontSize: 13, color: COLORS.textMuted },
  registerLink: { fontSize: 13, fontWeight: '800', color: COLORS.primary },
  legalNoticeRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, marginTop: 12, paddingHorizontal: 16 },
  legalNoticeText: { fontSize: 10.5, color: COLORS.textMuted, textAlign: 'center', lineHeight: 14 },

  // First Login Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalCard: {
    backgroundColor: '#fff',
    borderRadius: RADIUS['2xl'] || 24,
    padding: 20,
    gap: 14,
    width: '100%',
    maxWidth: 420,
    ...SHADOW.lg,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  modalIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FEF0D0',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 2,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: COLORS.text,
  },
  modalSub: {
    fontSize: 11.5,
    color: COLORS.textMuted,
    lineHeight: 16,
    marginTop: 2,
  },
  modalAccountBox: {
    backgroundColor: '#F9FAFB',
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 10,
    gap: 6,
  },
  modalAccountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalAccountLbl: {
    fontSize: 10.5,
    textTransform: 'uppercase',
    fontWeight: '700',
    color: COLORS.textMuted,
  },
  modalAccountVal: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.text,
  },
  firstLoginErrorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    padding: 8,
    borderRadius: RADIUS.sm,
  },
  firstLoginErrorText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#DC2626',
    flex: 1,
  },
  checklistCard: {
    backgroundColor: '#F0FDF4',
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: '#BBF7D0',
    padding: 10,
    gap: 4,
  },
  checklistTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#166534',
    marginBottom: 2,
  },
  checklistItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  checklistText: {
    fontSize: 10.5,
    color: COLORS.textMuted,
    fontWeight: '500',
  },
  checklistTextPassed: {
    color: '#166534',
    fontWeight: '700',
  },
  modalBtnRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'stretch',
    gap: 10,
    marginTop: 6,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  modalCancelBtn: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 11,
    paddingHorizontal: 16,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCancelText: {
    flexShrink: 1,
    textAlign: 'center',
    lineHeight: 17,
    fontSize: 12.5,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  setupSignOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    marginTop: 4,
  },
  setupSignOutText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#DC2626',
  },
  modalSaveBtn: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: COLORS.primary,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: RADIUS.md,
    ...SHADOW.xs,
  },
  modalSaveText: {
    flexShrink: 1,
    textAlign: 'center',
    lineHeight: 17,
    fontSize: 12.5,
    fontWeight: '800',
    color: '#fff',
  },
});
