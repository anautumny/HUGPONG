import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { AppText as Text, AppTextInput as TextInput } from './Typography';
import { COLORS, RADIUS } from '../theme';

export default function TakeoverAuthorizationModal({ visible, fieldId, memberName, area, farmName, stageName,
  password, error, busy, onPasswordChange, onAuthorize, onClose }) {
  const [showPassword, setShowPassword] = useState(false);
  const scroll = useRef(null);
  const focused = useRef(false);
  const passwordTop = useRef(0);
  useEffect(() => { setShowPassword(false); focused.current = false; }, [visible, fieldId]);
  const revealInput = () => { if (focused.current) scroll.current?.scrollTo({ y: Math.max(0, passwordTop.current - 12), animated: true }); };
  return <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={() => { if (!busy) onClose(); }}>
    <SafeAreaView style={s.overlay} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={s.keyboard} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={s.card}>
          <View style={s.heading}>
            <View style={s.headingText}>
              <Text style={s.title}>Authorize Manager Takeover</Text>
              <Text style={s.subtitle}>Confirm with your Farm Manager password.</Text>
            </View>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close takeover authorization" disabled={busy} onPress={onClose} style={s.close}>
              <Ionicons name="close" size={24} color={COLORS.text} />
            </TouchableOpacity>
          </View>
          <ScrollView ref={scroll} onLayout={revealInput} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={s.body}>
            <View style={s.summary}>
              <Text style={s.caption}>FIELD</Text>
              <Text selectable style={s.fieldId}>{fieldId}</Text>
              <Text style={s.detail}>Farm Member: {memberName || 'Assigned Farm Member'}</Text>
              <Text style={s.subtitle}>{area} · {farmName} · {stageName}</Text>
            </View>
            <Text style={s.audit}>Takeover actions are recorded in the audit history under your account.</Text>
            <View style={s.passwordGroup} onLayout={event => { passwordTop.current = event.nativeEvent.layout.y; }}>
              <Text style={s.label}>Farm Manager Password</Text>
              <View style={s.passwordRow}>
                <TextInput value={password} onChangeText={onPasswordChange} editable={!busy} style={s.input}
                  accessibilityLabel="Farm Manager Password" placeholder="Enter your password" placeholderTextColor={COLORS.textMuted}
                  secureTextEntry={!showPassword} autoCapitalize="none" autoCorrect={false} spellCheck={false}
                  autoComplete="current-password" textContentType="password" returnKeyType="go" onSubmitEditing={onAuthorize}
                  onFocus={() => { focused.current = true; revealInput(); }} onBlur={() => { focused.current = false; }} />
                <TouchableOpacity accessibilityRole="button" accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                  disabled={busy} onPress={() => setShowPassword(value => !value)} style={s.eye}>
                  <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={22} color={COLORS.textSecondary} />
                </TouchableOpacity>
              </View>
            </View>
            {Boolean(error) && <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={s.error}>{error}</Text>}
            <TouchableOpacity accessibilityRole="button" accessibilityLabel={busy ? 'Authorizing Manager Takeover' : 'Authorize Manager Takeover'}
              accessibilityState={{ busy, disabled: busy }} disabled={busy} onPress={onAuthorize} style={[s.authorize, busy && s.disabled]}>
              {busy ? <ActivityIndicator color="#FFF" size="small" /> : <Ionicons name="shield-checkmark-outline" size={19} color="#FFF" />}
              <Text style={s.authorizeText}>{busy ? 'Authorizing…' : 'Authorize Manager Takeover'}</Text>
            </TouchableOpacity>
            <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={onClose} style={s.cancel}>
              <Text style={s.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  </Modal>;
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  keyboard: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 16 },
  card: { width: '100%', maxWidth: 460, maxHeight: '100%', flexShrink: 1, backgroundColor: '#FFF', borderRadius: RADIUS.xl, overflow: 'hidden' },
  heading: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 18, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  headingText: { flex: 1, minWidth: 0 }, title: { fontSize: 18, fontWeight: '800', color: COLORS.text },
  subtitle: { marginTop: 5, fontSize: 12, lineHeight: 18, color: COLORS.textSecondary },
  close: { minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center' },
  body: { padding: 18, gap: 16 }, summary: { padding: 14, borderRadius: RADIUS.md, backgroundColor: COLORS.background, gap: 5 },
  caption: { color: COLORS.textMuted, fontSize: 11, fontWeight: '700' }, fieldId: { fontSize: 14, fontWeight: '800', color: COLORS.primary, flexShrink: 1 },
  detail: { color: COLORS.text, fontSize: 13, lineHeight: 20 }, audit: { color: '#8F5700', fontSize: 12, lineHeight: 18 },
  passwordGroup: { gap: 8 }, label: { color: COLORS.text, fontSize: 14, fontWeight: '700' },
  passwordRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: COLORS.border, borderRadius: RADIUS.md, backgroundColor: COLORS.background },
  input: { flex: 1, minWidth: 0, minHeight: 52, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: COLORS.text },
  eye: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  error: { color: COLORS.danger || '#B91C1C', fontSize: 13, lineHeight: 19 },
  authorize: { minHeight: 50, padding: 14, borderRadius: RADIUS.md, backgroundColor: '#B96B00', flexDirection: 'row', gap: 8, justifyContent: 'center', alignItems: 'center' },
  authorizeText: { color: '#FFF', fontSize: 14, fontWeight: '800', flexShrink: 1, textAlign: 'center' },
  cancel: { minHeight: 44, justifyContent: 'center', alignItems: 'center' }, cancelText: { color: COLORS.textSecondary, fontSize: 14, fontWeight: '600' }, disabled: { opacity: 0.7 }
});
