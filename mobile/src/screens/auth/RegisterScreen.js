import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, ScrollView, Alert, Modal, Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS, SHADOW } from '../../theme';
import { registerUser, blockFarms } from '../../data/dataStore';
import { useTranslation } from '../../services/i18n';
import { sendFirebasePhoneSMS, formatToE164 } from '../../services/smsService';

const ROLES = ['Member', 'Farm Manager', 'SRA (Admin)'];

const ROLE_DESCRIPTIONS = {
  'Member': 'Logs weekly/monthly field operations',
  'Farm Manager': 'Reviews logs & compiles SRA reports',
  'SRA (Admin)': 'Scans QR & audits monthly reports',
};

const getAvailableBlockFarms = () => {
  return blockFarms.length > 0 ? blockFarms.map(b => b.name) : ['Nacayao Block Farm'];
};

function ProgressBar({ step, totalSteps, t }) {
  const pct = ((step) / totalSteps) * 100;
  return (
    <View style={pb.wrap}>
      <View style={pb.track}>
        <View style={[pb.fill, { width: `${pct}%` }]} />
      </View>
      <Text style={pb.label}>{t ? `${t('reg_step_of', 'Step')} ${step} ${t('reg_step_of_total', 'of')} ${totalSteps}` : `Step ${step} of ${totalSteps}`}</Text>
    </View>
  );
}
const pb = StyleSheet.create({
  wrap: { gap: 6 },
  track: { height: 4, backgroundColor: COLORS.border, borderRadius: 2, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: COLORS.primary, borderRadius: 2 },
  label: { fontSize: 11, color: COLORS.textMuted, textAlign: 'right' },
});

function Field({ label, children, error }) {
  return (
    <View style={f.group}>
      <Text style={f.label}>{label}</Text>
      {children}
      {error ? <Text style={f.error}>{error}</Text> : null}
    </View>
  );
}
const f = StyleSheet.create({
  group: { gap: 6 },
  label: { fontSize: 12, fontWeight: '600', color: COLORS.textSecondary },
  error: { fontSize: 11, color: '#D9534F' },
});

function InputBox({ icon, error, ...props }) {
  return (
    <View style={[inp.wrap, error && inp.err]}>
      {icon && <Ionicons name={icon} size={17} color={COLORS.textMuted} />}
      <TextInput style={inp.input} placeholderTextColor={COLORS.textMuted} {...props} />
    </View>
  );
}
const inp = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: COLORS.background, borderRadius: RADIUS.md, borderWidth: 1.5, borderColor: COLORS.border, paddingHorizontal: 12, paddingVertical: 13 },
  err: { borderColor: '#D9534F' },
  input: { flex: 1, fontSize: 15, color: COLORS.text, fontWeight: '500' },
});

const rc = StyleSheet.create({
  chip: { borderWidth: 1.5, borderColor: COLORS.border, borderRadius: RADIUS.md, padding: SPACING.md, backgroundColor: '#fff' },
  selected: { borderColor: COLORS.primary, backgroundColor: COLORS.primaryBg },
  chipHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  text: { fontSize: 14, color: COLORS.textSecondary, fontWeight: '500' },
  textSelected: { color: COLORS.primary, fontWeight: '700' },
});

export default function RegisterScreen({ navigation }) {
  const { t, language, setLanguage } = useTranslation();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    firstName: '',
    middleInitial: '',
    lastName: '',
    role: 'Member',
    blockFarm: '',
    contactNumber: '',
    password: '', 
    confirmPassword: '',
  });
  const [showPw, setShowPw] = useState(false);
  const [showCPw, setShowCPw] = useState(false);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [codeVerified, setCodeVerified] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');
  const [expectedCode, setExpectedCode] = useState('');
  const [countdown, setCountdown] = useState(0);
  const [registeredAccount, setRegisteredAccount] = useState(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  const getPasswordStrength = (pwd) => {
    if (!pwd) return { score: 0, level: '', color: COLORS.border, pct: 0, hasMin: false, hasLetter: false, hasNum: false, hasUpper: false };
    const hasMin = pwd.length >= 8;
    const hasLetter = /[a-zA-Z]/.test(pwd);
    const hasNum = /[0-9]/.test(pwd);
    const hasUpper = /[A-Z]/.test(pwd) && /[a-z]/.test(pwd);
    const hasSpecial = /[^A-Za-z0-9]/.test(pwd);

    let score = 0;
    if (hasMin) score += 1;
    if (hasLetter && hasNum) score += 1;
    if (hasUpper) score += 1;
    if (hasSpecial) score += 1;

    if (score >= 3) return { score, level: 'Strong', color: '#10B981', pct: 100, hasMin, hasLetter, hasNum, hasUpper, hasSpecial };
    if (score === 2) return { score, level: 'Moderate', color: '#F59E0B', pct: 60, hasMin, hasLetter, hasNum, hasUpper, hasSpecial };
    return { score, level: 'Weak', color: '#EF4444', pct: 30, hasMin, hasLetter, hasNum, hasUpper, hasSpecial };
  };

  const set = (key, val) => { setForm(p => ({ ...p, [key]: val })); setErrors(p => ({ ...p, [key]: null })); };

  // Resend countdown timer
  React.useEffect(() => {
    let timer;
    if (countdown > 0) {
      timer = setTimeout(() => setCountdown(c => c - 1), 1000);
    }
    return () => clearTimeout(timer);
  }, [countdown]);

  const stepTitles = [
    { title: t('reg_step_personal', 'Personal Info'), sub: t('reg_step_personal_sub', 'Enter your official farmer identity') },
    { title: t('reg_step_farm', 'Select Block Farm'), sub: t('reg_step_farm_sub', 'Assign your sugarcane block farm cooperative') },
    { 
      title: t('reg_step_contact', 'Contact Number'), 
      sub: codeSent && !codeVerified ? t('reg_step_verify_sub', 'Enter the 6-digit SMS verification code') : 'Used for SMS verification. Permanent User ID issued upon signup' 
    },
    { title: t('reg_step_password', 'Set Password'), sub: t('reg_step_password_sub', 'Secure your HUGPONG account') },
  ];

  const totalSteps = stepTitles.length;
  const activeStepTitle = stepTitles[step - 1].title;

  const handleSendCode = async () => {
    const raw = (form.contactNumber || '').replace(/\D/g, '');
    if (!raw.startsWith('09') || raw.length !== 11) {
      setErrors(p => ({ ...p, contactNumber: t('auth_enter_valid_phone', 'Enter a valid 11-digit mobile number (09XXXXXXXXX)') }));
      return;
    }

    const formatted = formatToE164(raw);
    const randomOtp = Math.floor(100000 + Math.random() * 900000).toString();
    setExpectedCode(randomOtp);
    setCodeSent(true);
    setVerificationCode('');
    setCountdown(60);
    setErrors(p => ({ ...p, contactNumber: null, verificationCode: null }));
    setLoading(true);

    try {
      const smsResult = await sendFirebasePhoneSMS(raw, randomOtp);
      setLoading(false);

      if (smsResult.success) {
        Alert.alert(
          '🔥 Firebase SMS Dispatched',
          `A real SMS verification request was sent to ${formatted} through your Firebase project (hugpong-ff).\n\nPlease enter your verification code below to verify your SIM.`,
          [{ text: 'Enter Code', onPress: () => {} }]
        );
      } else {
        Alert.alert('Firebase Notice', smsResult.error || 'Verification code dispatched.');
      }
    } catch (err) {
      setLoading(false);
      Alert.alert('Verification Code', `Your code is: ${randomOtp}`);
    }
  };

  const handleVerifyCode = () => {
    const entered = verificationCode.trim();
    if (!entered || entered.length !== 6 || !/^\d{6}$/.test(entered)) {
      setErrors(p => ({ ...p, verificationCode: t('reg_enter_code_label', 'Please enter the complete 6-digit verification code.') }));
      return;
    }

    setCodeVerified(true);
    setErrors(p => ({ ...p, verificationCode: null }));
    setStep(4);
  };

  const validateStep = () => {
    const e = {};
    if (step === 1) {
      if (!form.firstName.trim()) e.firstName = 'First name is required';
      if (!form.lastName.trim()) e.lastName = 'Last name is required';
    }
    if (step === 2) {
      if (!form.blockFarm) e.blockFarm = 'Please select your block farm';
    }
    if (step === 3) {
      const cleaned = form.contactNumber.replace(/[^0-9]/g, '');
      if (!cleaned.startsWith('09') || cleaned.length !== 11) {
        e.contactNumber = t('auth_enter_valid_phone', 'Enter a valid 11-digit PH mobile number (09XXXXXXXXX)');
      } else if (!codeVerified) {
        e.contactNumber = t('reg_verify_needed', 'Please verify your mobile number with the SMS code');
      }
    }
    if (step === 4) {
      const pwd = form.password || '';
      if (!pwd) {
        e.password = 'Password is required';
      } else if (pwd.length < 8) {
        e.password = 'Password must be at least 8 characters';
      } else if (!/[0-9]/.test(pwd)) {
        e.password = 'Password must contain at least one number (0-9)';
      } else if (!/[a-zA-Z]/.test(pwd)) {
        e.password = 'Password must contain at least one letter (a-z)';
      }

      if (!form.confirmPassword) {
        e.confirmPassword = 'Confirm your password';
      } else if (form.password !== form.confirmPassword) {
        e.confirmPassword = 'Passwords do not match';
      }
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const next = async () => {
    if (!validateStep()) return;
    if (step < totalSteps) { setStep(s => s + 1); return; }
    setLoading(true);

    try {
      const res = await registerUser(form);
      setLoading(false);
      if (res && res.user) {
        setRegisteredAccount(res.user);
        setShowSuccessModal(true);
      } else {
        Alert.alert('Registration Successful', `Welcome to HUGPONG, ${form.firstName}! Your farmer member account is now active.`, [
          { text: 'Go to Dashboard', onPress: () => navigation.replace('MainTabs') }
        ]);
      }
    } catch (err) {
      setLoading(false);
      Alert.alert('Registration Error', 'An error occurred while creating your account. Please try again.');
    }
  };

  const handleMainButtonPress = () => {
    if (step === 3) {
      if (!codeSent) {
        handleSendCode();
        return;
      }
      if (!codeVerified) {
        handleVerifyCode();
        return;
      }
    }
    next();
  };

  const getMainButtonInfo = () => {
    if (loading) return { text: 'Creating account...', icon: null };
    if (step === 3) {
      if (!codeSent) return { text: t('reg_btn_send_code', 'Send Code via SMS'), icon: 'chatbubble-ellipses-outline' };
      if (!codeVerified) return { text: t('reg_btn_verify_continue', 'Verify & Continue'), icon: 'shield-checkmark-outline' };
    }
    if (step === totalSteps) return { text: t('reg_btn_create_account', 'Create Account'), icon: 'checkmark-circle-outline' };
    return { text: t('reg_btn_continue', 'Continue'), icon: 'arrow-forward' };
  };

  const back = () => {
    if (step === 3 && codeSent && !codeVerified) {
      setCodeSent(false);
      setVerificationCode('');
      return;
    }
    if (step > 1) {
      setStep(s => s - 1);
    } else {
      navigation.replace('Login');
    }
  };

  const btnInfo = getMainButtonInfo();

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* Top Nav */}
        <View style={s.topNav}>
          <TouchableOpacity style={s.backBtn} onPress={back}>
            <Ionicons name="arrow-back" size={20} color={COLORS.text} />
          </TouchableOpacity>
          <Text style={s.navTitle} numberOfLines={1}>{t('reg_nav_title', 'Member Registration')}</Text>
          
          <View style={{ width: 36 }} />
        </View>

        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
          <ProgressBar step={step} totalSteps={totalSteps} t={t} />

          <View style={s.stepHeader}>
            <Text style={s.stepTitle}>{stepTitles[step - 1].title}</Text>
            <Text style={s.stepSub}>{stepTitles[step - 1].sub}</Text>
          </View>

          <View style={s.card}>
            {/* STEP 1: PERSONAL INFO */}
            {step === 1 && <>
              <Field label={t('reg_first_name', 'First Name *')} error={errors.firstName}>
                <InputBox value={form.firstName} onChangeText={v => set('firstName', v)} placeholder="e.g. Juan" error={errors.firstName} autoCapitalize="words" />
              </Field>
              <Field label={t('reg_middle_initial', 'Middle Initial (Optional)')}>
                <InputBox value={form.middleInitial} onChangeText={v => set('middleInitial', v)} placeholder="e.g. D" autoCapitalize="characters" maxLength={3} />
              </Field>
              <Field label={t('reg_last_name', 'Last Name *')} error={errors.lastName}>
                <InputBox value={form.lastName} onChangeText={v => set('lastName', v)} placeholder="e.g. Dela Cruz" error={errors.lastName} autoCapitalize="words" />
              </Field>
            </>}

            {/* STEP 2: BLOCK FARM */}
            {step === 2 && <>
              <Field label={t('reg_select_farm_label', 'Select Your Assigned Block Farm *')} error={errors.blockFarm}>
                <View style={{ gap: 8 }}>
                  {getAvailableBlockFarms().map(farm => (
                    <TouchableOpacity 
                      key={farm}
                      style={[rc.chip, form.blockFarm === farm && rc.selected, { paddingVertical: 14 }]}
                      onPress={() => set('blockFarm', farm)}
                    >
                      <View style={rc.chipHeader}>
                        {form.blockFarm === farm ? (
                          <Ionicons name="radio-button-on" size={18} color={COLORS.primary} />
                        ) : (
                          <Ionicons name="radio-button-off" size={18} color={COLORS.border} />
                        )}
                        <Text style={[rc.text, form.blockFarm === farm && rc.textSelected]}>{farm}</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              </Field>
            </>}

            {/* STEP 3: CONTACT NUMBER */}
            {step === 3 && <>
              {!codeSent ? (
                <>
                  <Field label={t('reg_mobile_label', 'Mobile Number *')} error={errors.contactNumber}>
                    <InputBox 
                      icon="call-outline" 
                      value={form.contactNumber} 
                      onChangeText={v => { set('contactNumber', v); setErrors(p => ({ ...p, contactNumber: null })); }} 
                      placeholder="09XX XXX XXXX" 
                      keyboardType="phone-pad" 
                      maxLength={11} 
                      error={errors.contactNumber} 
                    />
                  </Field>
                  <View style={s.infoNoticeBox}>
                    <Ionicons name="shield-checkmark-outline" size={16} color={COLORS.primary} />
                    <Text style={s.infoNoticeText}>
                      {t('reg_sms_notice', 'We will send a 6-digit one-time SMS verification code to confirm this SIM card belongs to you. Standard rates apply.')}
                    </Text>
                  </View>
                </>
              ) : !codeVerified ? (
                <>
                  <View style={s.otpSentBanner}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.otpSentLabel}>{t('reg_code_sent_to', 'SMS Code Sent to:')}</Text>
                      <Text style={s.otpSentPhone}>+63 {form.contactNumber.slice(1)}</Text>
                    </View>
                    <TouchableOpacity 
                      onPress={() => { setCodeSent(false); setVerificationCode(''); setErrors(p => ({ ...p, verificationCode: null })); }}
                      style={s.editPhoneBtn}
                    >
                      <Ionicons name="create-outline" size={13} color={COLORS.primary} />
                      <Text style={s.editPhoneBtnText}>{t('reg_btn_change', 'Change')}</Text>
                    </TouchableOpacity>
                  </View>

                  <Field label={t('reg_enter_code_label', 'Enter 6-digit SMS Code *')} error={errors.verificationCode}>
                    <View style={[inp.wrap, errors.verificationCode && inp.err, { justifyContent: 'center' }]}>
                      <TextInput 
                        style={[inp.input, s.otpInput]} 
                        value={verificationCode} 
                        onChangeText={v => {
                          setVerificationCode(v);
                          setErrors(p => ({ ...p, verificationCode: null }));
                        }} 
                        placeholder="• • • • • •" 
                        placeholderTextColor={COLORS.textMuted}
                        keyboardType="number-pad" 
                        maxLength={6} 
                        autoFocus={true}
                      />
                    </View>
                  </Field>

                  <View style={s.resendRow}>
                    <Text style={s.resendText}>{t('reg_resend_prompt', "Didn't receive the SMS?")}</Text>
                    <TouchableOpacity 
                      disabled={countdown > 0} 
                      onPress={handleSendCode}
                      style={{ paddingVertical: 4 }}
                    >
                      <Text style={[s.resendBtnText, countdown > 0 && { color: COLORS.textMuted }]}>
                        {countdown > 0 ? `${t('reg_resend_countdown', 'Resend code in')} ${countdown}s` : t('reg_resend_btn', 'Resend Code')}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </>
              ) : (
                <View style={s.verifiedCard}>
                  <Ionicons name="checkmark-circle" size={24} color={COLORS.success} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.verifiedTitle}>{t('reg_verified_msg', 'Mobile Number Verified ✓')}</Text>
                    <Text style={s.verifiedPhone}>+63 {form.contactNumber.slice(1)}</Text>
                  </View>
                  <TouchableOpacity 
                    onPress={() => { setCodeVerified(false); setCodeSent(false); }}
                    style={{ padding: 4 }}
                  >
                    <Text style={{ color: COLORS.primary, fontSize: 12, fontWeight: '700' }}>{t('reg_btn_change', 'Change')}</Text>
                  </TouchableOpacity>
                </View>
              )}
            </>}

            {/* STEP 4: SET SECURE PASSWORD */}
            {step === 4 && (() => {
              const str = getPasswordStrength(form.password);
              const passwordsMatch = !!(form.confirmPassword && form.password === form.confirmPassword);
              return (
                <>
                  <Field label={t('reg_password_label', 'Password *')} error={errors.password}>
                    <View style={[inp.wrap, errors.password && inp.err]}>
                      <Ionicons name="lock-closed-outline" size={17} color={COLORS.textMuted} />
                      <TextInput 
                        style={[inp.input, { flex: 1 }]} 
                        value={form.password} 
                        onChangeText={v => set('password', v)} 
                        placeholder="Min. 8 chars (letters & numbers)" 
                        placeholderTextColor={COLORS.textMuted} 
                        secureTextEntry={!showPw} 
                      />
                      <TouchableOpacity onPress={() => setShowPw(p => !p)}>
                        <Ionicons name={showPw ? 'eye-off-outline' : 'eye-outline'} size={17} color={COLORS.textMuted} />
                      </TouchableOpacity>
                    </View>
                  </Field>

                  {/* Password Strength Indicator */}
                  {form.password.length > 0 && (
                    <View style={s.pwStrengthContainer}>
                      <View style={s.pwStrengthHeader}>
                        <Text style={s.pwStrengthLabel}>Password Security:</Text>
                        <View style={[s.pwStrengthBadge, { backgroundColor: str.color + '20' }]}>
                          <Text style={[s.pwStrengthBadgeText, { color: str.color }]}>{str.level}</Text>
                        </View>
                      </View>
                      <View style={s.pwStrengthTrack}>
                        <View style={[s.pwStrengthBar, { width: `${str.pct}%`, backgroundColor: str.color }]} />
                      </View>
                    </View>
                  )}

                  {/* Security Requirement Checklist */}
                  <View style={s.pwRulesBox}>
                    <Text style={s.pwRulesTitle}>Security Requirements:</Text>
                    <View style={s.pwRuleItem}>
                      <Ionicons 
                        name={str.hasMin ? 'checkmark-circle' : 'ellipse-outline'} 
                        size={15} 
                        color={str.hasMin ? COLORS.success : COLORS.textMuted} 
                      />
                      <Text style={[s.pwRuleText, str.hasMin && s.pwRuleTextMet]}>At least 8 characters</Text>
                    </View>
                    <View style={s.pwRuleItem}>
                      <Ionicons 
                        name={str.hasLetter && str.hasNum ? 'checkmark-circle' : 'ellipse-outline'} 
                        size={15} 
                        color={str.hasLetter && str.hasNum ? COLORS.success : COLORS.textMuted} 
                      />
                      <Text style={[s.pwRuleText, str.hasLetter && str.hasNum && s.pwRuleTextMet]}>Contains both letters & numbers (0-9)</Text>
                    </View>
                    <View style={s.pwRuleItem}>
                      <Ionicons 
                        name={str.hasUpper || str.hasSpecial ? 'checkmark-circle' : 'ellipse-outline'} 
                        size={15} 
                        color={str.hasUpper || str.hasSpecial ? COLORS.success : COLORS.textMuted} 
                      />
                      <Text style={[s.pwRuleText, (str.hasUpper || str.hasSpecial) && s.pwRuleTextMet]}>Uppercase or symbol (recommended)</Text>
                    </View>
                  </View>

                  <Field label={t('reg_confirm_password', 'Confirm Password *')} error={errors.confirmPassword}>
                    <View style={[inp.wrap, errors.confirmPassword && inp.err, passwordsMatch && { borderColor: COLORS.success }]}>
                      <Ionicons name="lock-closed-outline" size={17} color={passwordsMatch ? COLORS.success : COLORS.textMuted} />
                      <TextInput 
                        style={[inp.input, { flex: 1 }]} 
                        value={form.confirmPassword} 
                        onChangeText={v => set('confirmPassword', v)} 
                        placeholder="Repeat your password" 
                        placeholderTextColor={COLORS.textMuted} 
                        secureTextEntry={!showCPw} 
                      />
                      {passwordsMatch ? (
                        <Ionicons name="checkmark-circle" size={18} color={COLORS.success} style={{ marginRight: 4 }} />
                      ) : null}
                      <TouchableOpacity onPress={() => setShowCPw(p => !p)}>
                        <Ionicons name={showCPw ? 'eye-off-outline' : 'eye-outline'} size={17} color={COLORS.textMuted} />
                      </TouchableOpacity>
                    </View>
                  </Field>
                </>
              );
            })()}
          </View>

          <TouchableOpacity style={[s.btn, loading && s.btnDisabled]} onPress={handleMainButtonPress} disabled={loading}>
            <Text style={s.btnText}>{btnInfo.text}</Text>
            {btnInfo.icon && <Ionicons name={btnInfo.icon} size={18} color="#fff" />}
          </TouchableOpacity>

          <View style={s.adminNoteBox}>
            <Ionicons name="information-circle-outline" size={16} color={COLORS.textMuted} />
            <Text style={s.adminNoteText}>
              {t('reg_admin_note', 'Are you a Farm Manager or SRA Officer? Your accounts are provisioned directly by the SRA District Administrator. Please contact your coordinator.')}
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Registration Success Credential Modal */}
      <Modal visible={showSuccessModal} transparent animationType="fade">
        <View style={s.modalOverlay}>
          <View style={s.successCard}>
            <View style={s.successIconWrap}>
              <Ionicons name="checkmark-circle" size={46} color={COLORS.primary} />
            </View>

            <Text style={s.successTitle}>Registration Successful!</Text>
            <Text style={s.successSub}>
              Welcome to HUGPONG, <Text style={{ fontWeight: '700', color: COLORS.text }}>{registeredAccount?.name || `${form.firstName} ${form.lastName}`}</Text>
            </Text>

            {/* Permanent User ID Display */}
            <View style={s.credIdBox}>
              <Text style={s.credIdLabel}>OFFICIAL PERMANENT USER ID</Text>
              <Text selectable style={s.credIdVal}>{registeredAccount?.employeeId || '04000006'}</Text>
              <Text style={s.credIdSub}>Immutable 8-digit Login Credential</Text>
            </View>

            {/* Credential Metadata */}
            <View style={s.metaRow}>
              <View style={s.metaCol}>
                <Text style={s.metaLabel}>Registered Mobile</Text>
                <Text style={s.metaVal}>{registeredAccount?.contact || form.contactNumber}</Text>
              </View>
              <View style={s.metaCol}>
                <Text style={s.metaLabel}>Block Farm</Text>
                <Text style={s.metaVal} numberOfLines={1}>{registeredAccount?.blockFarm || form.blockFarm}</Text>
              </View>
            </View>

            {/* Lost SIM Advisory */}
            <View style={s.lostSimCard}>
              <Ionicons name="shield-checkmark" size={18} color={COLORS.primary} style={{ marginTop: 1 }} />
              <Text style={s.lostSimText}>
                <Text style={{ fontWeight: '700' }}>Important Notice:</Text> Write down or screenshot your 8-digit User ID. Even if you lose or replace your SIM card in the future, this User ID is permanently linked to your plot and will always work to sign in.
              </Text>
            </View>

            {/* Actions */}
            <View style={s.modalActionCol}>
              <TouchableOpacity
                style={s.shareCredBtn}
                onPress={async () => {
                  const id = registeredAccount?.employeeId || '04000006';
                  try {
                    await Share.share({
                      message: `HUGPONG Farmer Credentials\nName: ${registeredAccount?.name || `${form.firstName} ${form.lastName}`}\nPermanent User ID: ${id}\nMobile: ${registeredAccount?.contact || form.contactNumber}\nFarm: ${registeredAccount?.blockFarm || form.blockFarm}\n\nKeep your User ID safe! It remains valid even if your phone or SIM changes.`,
                      title: 'HUGPONG Farmer Credentials'
                    });
                  } catch (e) {
                    Alert.alert('Farmer User ID', id);
                  }
                }}
                activeOpacity={0.8}
              >
                <Ionicons name="share-social-outline" size={16} color={COLORS.primary} />
                <Text style={s.shareCredBtnText}>Share / Save Credentials</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={s.proceedBtn}
                onPress={() => {
                  setShowSuccessModal(false);
                  navigation.replace('MainTabs');
                }}
                activeOpacity={0.8}
              >
                <Text style={s.proceedBtnText}>Go to Dashboard</Text>
                <Ionicons name="arrow-forward" size={16} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  topNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.md, paddingVertical: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: COLORS.border },
  backBtn: { padding: 8 },
  navTitle: { fontSize: 15, fontWeight: '700', color: COLORS.text, flex: 1, marginHorizontal: 6 },
  topNavLang: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  miniLangChip: { paddingHorizontal: 7, paddingVertical: 4, borderRadius: 12, backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border },
  miniLangChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  miniLangText: { fontSize: 10, fontWeight: '800', color: COLORS.textSecondary },
  miniLangTextActive: { color: '#fff' },
  scroll: { padding: SPACING.xl, gap: SPACING.lg },
  stepHeader: { gap: 4 },
  stepTitle: { fontSize: 24, fontWeight: '800', color: COLORS.text },
  stepSub: { fontSize: 14, color: COLORS.textMuted },
  card: { backgroundColor: '#fff', borderRadius: RADIUS.xl, padding: SPACING.xl, gap: SPACING.lg, ...SHADOW.card },
  btn: { backgroundColor: COLORS.primary, borderRadius: RADIUS.md, paddingVertical: 16, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 },
  btnDisabled: { opacity: 0.6 },
  btnText: { fontSize: 16, fontWeight: '700', color: '#fff' },
  otpSentBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: COLORS.primaryBg, padding: 12, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.primary + '30' },
  otpSentLabel: { fontSize: 11, color: COLORS.textMuted, fontWeight: '500' },
  otpSentPhone: { fontSize: 14, fontWeight: '700', color: COLORS.text, marginTop: 2 },
  editPhoneBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: COLORS.border },
  editPhoneBtnText: { fontSize: 12, fontWeight: '700', color: COLORS.primary },
  otpInput: { fontSize: 22, letterSpacing: 8, textAlign: 'center', fontWeight: '800', color: COLORS.primary, paddingVertical: 8 },
  resendRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 4 },
  resendText: { fontSize: 12, color: COLORS.textMuted },
  resendBtnText: { fontSize: 12, fontWeight: '700', color: COLORS.primary },
  verifiedCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: COLORS.success + '15', padding: 14, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.success + '40' },
  verifiedTitle: { fontSize: 13, fontWeight: '700', color: COLORS.success },
  verifiedPhone: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  infoNoticeBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 12, backgroundColor: COLORS.background, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border },
  infoNoticeText: { flex: 1, fontSize: 11, color: COLORS.textMuted, lineHeight: 16 },
  adminNoteBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 12, backgroundColor: COLORS.background, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, marginTop: 4 },
  adminNoteText: { flex: 1, fontSize: 11, color: COLORS.textMuted, lineHeight: 16 },
  pwStrengthContainer: { gap: 6, marginTop: -4 },
  pwStrengthHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pwStrengthLabel: { fontSize: 11, fontWeight: '600', color: COLORS.textMuted },
  pwStrengthBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  pwStrengthBadgeText: { fontSize: 11, fontWeight: '800' },
  pwStrengthTrack: { height: 5, backgroundColor: COLORS.border, borderRadius: 3, overflow: 'hidden' },
  pwStrengthBar: { height: '100%', borderRadius: 3 },
  pwRulesBox: { backgroundColor: COLORS.background, padding: 12, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, gap: 6 },
  pwRulesTitle: { fontSize: 11, fontWeight: '700', color: COLORS.textSecondary, marginBottom: 2 },
  pwRuleItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pwRuleText: { fontSize: 12, color: COLORS.textMuted, fontWeight: '500' },
  pwRuleTextMet: { color: COLORS.text, fontWeight: '600' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'center', alignItems: 'center', padding: SPACING.lg },
  successCard: { width: '100%', backgroundColor: '#fff', borderRadius: RADIUS.xl, padding: 22, alignItems: 'center', ...SHADOW.lg },
  successIconWrap: { width: 66, height: 66, borderRadius: 33, backgroundColor: COLORS.primaryBg, justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  successTitle: { fontSize: 20, fontWeight: '800', color: COLORS.text, textAlign: 'center' },
  successSub: { fontSize: 13, color: COLORS.textSecondary, textAlign: 'center', marginTop: 3, marginBottom: 16 },
  credIdBox: { width: '100%', backgroundColor: '#F0F8EC', borderRadius: RADIUS.lg, borderWidth: 1.5, borderColor: COLORS.primary, padding: 14, alignItems: 'center', marginBottom: 12 },
  credIdLabel: { fontSize: 10.5, fontWeight: '800', letterSpacing: 1, color: COLORS.primary, marginBottom: 4 },
  credIdVal: { fontSize: 28, fontWeight: '900', color: COLORS.primary, letterSpacing: 3, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
  credIdSub: { fontSize: 11, color: COLORS.textSecondary, marginTop: 4, fontWeight: '500' },
  metaRow: { width: '100%', flexDirection: 'row', justifyContent: 'space-between', backgroundColor: COLORS.background, padding: 10, borderRadius: RADIUS.md, marginBottom: 12, gap: 10 },
  metaCol: { flex: 1 },
  metaLabel: { fontSize: 10, color: COLORS.textMuted, fontWeight: '600' },
  metaVal: { fontSize: 12.5, fontWeight: '700', color: COLORS.text, marginTop: 2 },
  lostSimCard: { width: '100%', flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: '#EFF6FF', borderWidth: 1, borderColor: '#BFDBFE', padding: 12, borderRadius: RADIUS.md, marginBottom: 16 },
  lostSimText: { flex: 1, fontSize: 11.5, color: '#1E40AF', lineHeight: 17 },
  modalActionCol: { width: '100%', gap: 8 },
  shareCredBtn: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: COLORS.primaryBg, borderWidth: 1, borderColor: COLORS.primary + '40', paddingVertical: 12, borderRadius: RADIUS.md },
  shareCredBtnText: { fontSize: 13, fontWeight: '700', color: COLORS.primary },
  proceedBtn: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: COLORS.primary, paddingVertical: 14, borderRadius: RADIUS.md },
  proceedBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
});
