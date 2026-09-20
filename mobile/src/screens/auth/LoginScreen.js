import React, { useState, useEffect, useRef } from 'react';
import { View, Text, Image, StyleSheet, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, ScrollView, Alert, ActivityIndicator, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS, SHADOW } from '../../theme';
import {
  authenticateUser,
  isValidUserIdentifier,
  requestCurrentPhoneVerification,
  updateUserPassword,
  verifyCurrentPhone,
  fastLoginRole
} from '../../data/dataStore';
import { useTranslation } from '../../services/i18n';
import { isOnline, addNetworkListener } from '../../services/networkService';

const LOGO = require('../../../assets/HUGPONG LOGO.png');

export default function LoginScreen({ navigation }) {
  const { t } = useTranslation();
  const [contactNumber, setContactNumber] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const [authError, setAuthError] = useState('');
  const [deviceOnline, setDeviceOnline] = useState(isOnline());

  // Security: Brute-Force Rate Limiting & Account Lockout
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockoutSeconds, setLockoutSeconds] = useState(0);
  const timerRef = useRef(null);

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
  const [pendingPasswordChange, setPendingPasswordChange] = useState(false);
  const [fastLoggingIn, setFastLoggingIn] = useState('');

  const handleFastLogin = async (roleName) => {
    setFastLoggingIn(roleName);
    setAuthError('');
    try {
      const res = await fastLoginRole(roleName);
      if (res.success) {
        navigation.replace('MainTabs');
      } else {
        setAuthError(res.error || 'Failed to fast sign in.');
      }
    } catch (err) {
      setAuthError('An error occurred during fast sign in.');
    } finally {
      setFastLoggingIn('');
    }
  };

  useEffect(() => {
    const unsubNet = addNetworkListener((status) => {
      setDeviceOnline(status);
    });
    return () => {
      if (typeof unsubNet === 'function') unsubNet();
    };
  }, []);

  useEffect(() => {
    if (lockoutSeconds > 0) {
      timerRef.current = setTimeout(() => {
        setLockoutSeconds(prev => prev - 1);
      }, 1000);
    } else if (lockoutSeconds === 0 && failedAttempts >= 5) {
      setFailedAttempts(0);
      setAuthError('');
    }
    return () => clearTimeout(timerRef.current);
  }, [lockoutSeconds, failedAttempts]);

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
    if (lockoutSeconds > 0) {
      Alert.alert(
        'Account Temporarily Locked',
        `Too many failed attempts. Please wait ${lockoutSeconds} seconds before trying again.`
      );
      return;
    }

    setAuthError('');
    if (!validate()) return;
    setLoading(true);

    try {
      const res = await authenticateUser(contactNumber, password);
      setLoading(false);

      if (!res.success) {
        const nextAttempts = failedAttempts + 1;
        setFailedAttempts(nextAttempts);

        if (nextAttempts >= 5) {
          setLockoutSeconds(60);
          setAuthError('Too many failed attempts. Login locked for 60 seconds to protect your account.');
        } else {
          setAuthError(res.error || t('auth_invalid_credentials', 'Invalid User ID, mobile number, or password.'));
        }
        return;
      }

      // Successful authentication
      setFailedAttempts(0);
      setAuthError('');

      setAuthenticatedUser(res.user);
      if (res.user?.pendingFirstLoginVerification === true || res.user?.phoneVerified === false) {
        setPendingPasswordChange(res.requiresPasswordChange === true);
        setPhoneVerificationCode('');
        setPhoneVerificationError('');
        const request = await requestCurrentPhoneVerification();
        if (!request.success) {
          setAuthError(request.error || 'A phone verification code could not be sent.');
          return;
        }
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
      setLoading(false);
      setAuthError('Authentication service is unavailable. An online server login is required.');
    }
  };

  const handleVerifyPhone = async () => {
    if (!/^\d{6}$/.test(phoneVerificationCode.trim())) {
      setPhoneVerificationError('Enter the complete 6-digit verification code.');
      return;
    }
    setPhoneVerificationSaving(true);
    setPhoneVerificationError('');
    const result = await verifyCurrentPhone(phoneVerificationCode.trim());
    setPhoneVerificationSaving(false);
    if (!result.success) {
      setPhoneVerificationError(result.error || 'The verification code is incorrect or expired.');
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

  const handleSaveFirstLoginPassword = async () => {
    const isLen = newPassword.length >= 8;
    const isCase = /[a-z]/.test(newPassword) && /[A-Z]/.test(newPassword);
    const isNum = /[0-9]/.test(newPassword);
    const isNotDefault = !['hugpong', 'hugpong2026', 'password123'].includes(newPassword.trim().toLowerCase());

    if (!isLen) {
      setFirstLoginError('Password must be at least 8 characters long.');
      return;
    }
    if (!isCase) {
      setFirstLoginError('Password must contain both UPPERCASE (A-Z) and lowercase (a-z) letters.');
      return;
    }
    if (!isNum) {
      setFirstLoginError('Password must contain at least one number (0-9).');
      return;
    }
    if (!isNotDefault) {
      setFirstLoginError('Cannot use temporary default password ("hugpong" / "hugpong2026").');
      return;
    }
    if (newPassword !== confirmPassword) {
      setFirstLoginError('Passwords do not match. Please re-enter.');
      return;
    }

    setFirstLoginSaving(true);
    setFirstLoginError('');
    try {
      const res = await updateUserPassword(password, newPassword);
      setFirstLoginSaving(false);

      if (!res.success) {
        setFirstLoginError(res.error || 'Failed to set password. Please try again.');
        return;
      }

      setShowFirstLoginModal(false);
      Alert.alert(
        'Password Configured',
        'Your new secure password has been set successfully. Welcome to HUGPONG!'
      );
      navigation.replace('MainTabs');
    } catch (err) {
      setFirstLoginSaving(false);
      setFirstLoginError('An unexpected error occurred. Please try again.');
    }
  };

  // Requirement status calculations
  const reqLen = newPassword.length >= 8;
  const reqCase = /[a-z]/.test(newPassword) && /[A-Z]/.test(newPassword);
  const reqNum = /[0-9]/.test(newPassword);
  const reqDiff = !['hugpong', 'hugpong2026', 'password123'].includes(newPassword.trim().toLowerCase()) && newPassword.trim().length > 0;
  const isReqValid = reqLen && reqCase && reqNum && reqDiff && newPassword === confirmPassword && confirmPassword.length > 0;

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
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
            {!deviceOnline ? (
              <View style={s.offlineBanner}>
                <Ionicons name="cloud-offline-outline" size={20} color="#B45309" />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={s.offlineBannerTitle}>You are currently offline</Text>
                  <Text style={s.offlineBannerText}>
                    An active internet connection is required to sign in or register for the first time. Once signed in, you stay logged in offline.
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
                  {lockoutSeconds > 0 ? `Security Lockout: Wait ${lockoutSeconds}s` : authError}
                </Text>
              </View>
            ) : null}

            {/* Contact Number / User ID */}
            <View style={s.fieldGroup}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <Text style={s.label}>{t('auth_identifier_label', 'User ID or Mobile Number')}</Text>
                <Text style={{ fontSize: 11, color: COLORS.primary, fontWeight: '600' }}>Lost SIM? Use User ID</Text>
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
                    {lockoutSeconds > 0 ? `Locked (${lockoutSeconds}s)` : t('auth_sign_in', 'Sign In to App')}
                  </Text>
                  <Ionicons name={lockoutSeconds > 0 ? "lock-closed" : "arrow-forward"} size={18} color="#fff" />
                </>
              )}
            </TouchableOpacity>

            <View style={s.securityNotice}>
              <Ionicons name="shield-checkmark-outline" size={14} color={COLORS.primary} />
              <Text style={s.securityNoticeText}>Encrypted &amp; SRA Certified Agricultural Gateway</Text>
            </View>

            {/* Quick Shell Preview Switcher for Development / Fast Log In */}
            <View style={s.quickLoginWrap}>
              <View style={s.quickLoginHeaderRow}>
                <View style={s.quickDivider} />
                <Text style={s.quickLoginTitle}>Development Role Preview</Text>
                <View style={s.quickDivider} />
              </View>

              <View style={s.quickGrid}>
                <TouchableOpacity
                  style={[s.quickRoleBtn, fastLoggingIn === 'Member Farmer' && s.quickRoleBtnActive]}
                  onPress={() => handleFastLogin('Member Farmer')}
                  disabled={Boolean(fastLoggingIn)}
                  activeOpacity={0.75}
                >
                  <View style={[s.quickRoleIconWrap, { backgroundColor: '#EBF7EE' }]}>
                    <Ionicons name="leaf-outline" size={14} color="#15803D" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.quickRoleTitle}>Member Farmer</Text>
                    <Text style={s.quickRoleSub} numberOfLines={1}>Juan · DEV-FLD-001</Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[s.quickRoleBtn, fastLoggingIn === 'Farm Manager' && s.quickRoleBtnActive]}
                  onPress={() => handleFastLogin('Farm Manager')}
                  disabled={Boolean(fastLoggingIn)}
                  activeOpacity={0.75}
                >
                  <View style={[s.quickRoleIconWrap, { backgroundColor: COLORS.primaryBg }]}>
                    <Ionicons name="business-outline" size={14} color={COLORS.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.quickRoleTitle}>Farm Manager</Text>
                    <Text style={s.quickRoleSub} numberOfLines={1}>Jose · DEV-BF-001</Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[s.quickRoleBtn, fastLoggingIn === 'SRA Admin' && s.quickRoleBtnActive]}
                  onPress={() => handleFastLogin('SRA Admin')}
                  disabled={Boolean(fastLoggingIn)}
                  activeOpacity={0.75}
                >
                  <View style={[s.quickRoleIconWrap, { backgroundColor: '#EFF6FF' }]}>
                    <Ionicons name="shield-checkmark-outline" size={14} color="#2563EB" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.quickRoleTitle}>SRA Admin</Text>
                    <Text style={s.quickRoleSub} numberOfLines={1}>Maria · Regulatory</Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[s.quickRoleBtn, fastLoggingIn === 'Super Admin' && s.quickRoleBtnActive]}
                  onPress={() => handleFastLogin('Super Admin')}
                  disabled={Boolean(fastLoggingIn)}
                  activeOpacity={0.75}
                >
                  <View style={[s.quickRoleIconWrap, { backgroundColor: '#F3F4F6' }]}>
                    <Ionicons name="settings-outline" size={14} color="#4B5563" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.quickRoleTitle}>Super Admin</Text>
                    <Text style={s.quickRoleSub} numberOfLines={1}>System · All Dist</Text>
                  </View>
                </TouchableOpacity>
              </View>
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
          <View style={s.legalNoticeRow}>
            <Ionicons name="shield-checkmark-outline" size={13} color={COLORS.textMuted} />
            <Text style={s.legalNoticeText}>
              Protected under Republic Act No. 10173 (Data Privacy Act of 2012)
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal visible={showPhoneVerificationModal} transparent animationType="fade">
        <View style={s.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ width: '100%' }}>
            <View style={s.modalCard}>
              <View style={s.modalHeaderRow}>
                <View style={s.modalIconWrap}>
                  <Ionicons name="phone-portrait-outline" size={22} color="#D97706" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.modalTitle}>Verify Your Registered Phone</Text>
                  <Text style={s.modalSub}>Enter the 6-digit code sent by the HUGPONG server before opening farm records.</Text>
                </View>
              </View>
              {phoneVerificationError ? (
                <View style={s.firstLoginErrorBox}>
                  <Ionicons name="alert-circle" size={16} color="#DC2626" />
                  <Text style={s.firstLoginErrorText}>{phoneVerificationError}</Text>
                </View>
              ) : null}
              <View style={s.fieldGroup}>
                <Text style={s.label}>Verification Code</Text>
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
              <View style={s.modalBtnRow}>
                <TouchableOpacity
                  style={s.modalCancelBtn}
                  onPress={async () => {
                    const result = await requestCurrentPhoneVerification();
                    if (!result.success) setPhoneVerificationError(result.error || 'A new code could not be sent.');
                  }}
                >
                  <Text style={s.modalCancelText}>Resend Code</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.modalSaveBtn} onPress={handleVerifyPhone} disabled={phoneVerificationSaving}>
                  {phoneVerificationSaving
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Text style={s.modalSaveText}>Verify Phone</Text>}
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
        onRequestClose={() => {
          setShowFirstLoginModal(false);
        }}
      >
        <View style={s.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ width: '100%' }}>
            <View style={s.modalCard}>
              {/* Header */}
              <View style={s.modalHeaderRow}>
                <View style={s.modalIconWrap}>
                  <Ionicons name="shield-half" size={22} color="#D97706" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.modalTitle}>Set Your New Secure Password</Text>
                  <Text style={s.modalSub}>
                    Welcome to HUGPONG! Since this is your first time logging in, please create a new secure password to protect your account and farm records.
                  </Text>
                </View>
              </View>

              {/* Account Context Badge */}
              <View style={s.modalAccountBox}>
                <View style={s.modalAccountRow}>
                  <Text style={s.modalAccountLbl}>Account Holder</Text>
                  <Text style={s.modalAccountVal}>{authenticatedUser?.name || 'Authorized Personnel'}</Text>
                </View>
                <View style={[s.modalAccountRow, { borderTopWidth: 1, borderTopColor: '#E5E7EB', paddingTop: 4 }]}>
                  <Text style={s.modalAccountLbl}>User ID / Role</Text>
                  <Text style={[s.modalAccountVal, { color: COLORS.primary, fontWeight: '800' }]}>
                    {authenticatedUser?.employeeId || contactNumber} ({authenticatedUser?.role || 'Member Farmer'})
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
                <Text style={s.label}>New Password *</Text>
                <View style={s.inputWrap}>
                  <Ionicons name="lock-closed-outline" size={18} color={COLORS.textMuted} style={s.inputIcon} />
                  <TextInput
                    style={[s.input, { flex: 1 }]}
                    value={newPassword}
                    onChangeText={v => {
                      setNewPassword(v);
                      setFirstLoginError('');
                    }}
                    placeholder="Minimum 8 characters"
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
                <Text style={s.label}>Confirm New Password *</Text>
                <View style={s.inputWrap}>
                  <Ionicons name="lock-closed-outline" size={18} color={COLORS.textMuted} style={s.inputIcon} />
                  <TextInput
                    style={[s.input, { flex: 1 }]}
                    value={confirmPassword}
                    onChangeText={v => {
                      setConfirmPassword(v);
                      setFirstLoginError('');
                    }}
                    placeholder="Re-enter new password"
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
                <Text style={s.checklistTitle}>Security Requirements:</Text>
                <View style={s.checklistItem}>
                  <Ionicons name={reqLen ? "checkmark-circle" : "ellipse-outline"} size={14} color={reqLen ? "#16A34A" : COLORS.textMuted} />
                  <Text style={[s.checklistText, reqLen && s.checklistTextPassed]}>At least 8 characters long</Text>
                </View>
                <View style={s.checklistItem}>
                  <Ionicons name={reqCase ? "checkmark-circle" : "ellipse-outline"} size={14} color={reqCase ? "#16A34A" : COLORS.textMuted} />
                  <Text style={[s.checklistText, reqCase && s.checklistTextPassed]}>Contains UPPERCASE &amp; lowercase letters (A-Z, a-z)</Text>
                </View>
                <View style={s.checklistItem}>
                  <Ionicons name={reqNum ? "checkmark-circle" : "ellipse-outline"} size={14} color={reqNum ? "#16A34A" : COLORS.textMuted} />
                  <Text style={[s.checklistText, reqNum && s.checklistTextPassed]}>Contains at least one number (0-9)</Text>
                </View>
                <View style={s.checklistItem}>
                  <Ionicons name={reqDiff ? "checkmark-circle" : "ellipse-outline"} size={14} color={reqDiff ? "#16A34A" : COLORS.textMuted} />
                  <Text style={[s.checklistText, reqDiff && s.checklistTextPassed]}>Cannot be temporary default password</Text>
                </View>
              </View>

              {/* Action Buttons */}
              <View style={s.modalBtnRow}>
                <TouchableOpacity
                  style={s.modalCancelBtn}
                  onPress={() => {
                    setShowFirstLoginModal(false);
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={s.modalCancelText}>Sign Out</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[s.modalSaveBtn, (!isReqValid || firstLoginSaving) && { opacity: 0.7 }]}
                  onPress={handleSaveFirstLoginPassword}
                  disabled={firstLoginSaving}
                  activeOpacity={0.8}
                >
                  {firstLoginSaving ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Text style={s.modalSaveText}>Save Password &amp; Open</Text>
                      <Ionicons name="arrow-forward" size={16} color="#fff" />
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
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

  quickLoginWrap: {
    marginTop: 8,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  quickLoginHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  quickDivider: {
    flex: 1,
    height: 1,
    backgroundColor: '#E5E7EB',
  },
  quickLoginTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  quickGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'space-between',
  },
  quickRoleBtn: {
    width: '48.5%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingVertical: 8,
    paddingHorizontal: 9,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: '#F9FAF7',
  },
  quickRoleBtnActive: {
    borderColor: COLORS.primary,
    backgroundColor: '#EBF7EE',
  },
  quickRoleIconWrap: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickRoleTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.text,
  },
  quickRoleSub: {
    fontSize: 9.5,
    color: COLORS.textMuted,
    fontWeight: '600',
    marginTop: 1,
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
    alignItems: 'center',
    gap: 10,
    marginTop: 6,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  modalCancelBtn: {
    paddingVertical: 11,
    paddingHorizontal: 16,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCancelText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  modalSaveBtn: {
    flex: 1,
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
    fontSize: 12.5,
    fontWeight: '800',
    color: '#fff',
  },
});
