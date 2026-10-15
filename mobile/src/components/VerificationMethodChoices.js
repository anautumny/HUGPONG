import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText as Text } from './Typography';
import { COLORS } from '../theme';
import { useTranslation } from '../services/i18n';

export default function VerificationMethodChoices({ value, onChange, disabled = false }) {
  const { t } = useTranslation();
  const options = [
    { value: 'sms', icon: 'chatbubble-ellipses-outline', title: t('reg_btn_send_code', 'Send Code via SMS'), description: t('reg_sms_supported_networks', 'Choose this for supported mobile networks.') },
    { value: 'review', icon: 'people-outline', title: t('reg_phone_verification_action', 'Request Phone Verification Review'), description: t('reg_smart_tnt_review_help', 'Choose this for Smart/TNT or when you cannot receive an SMS code.') }
  ];
  return <View style={styles.list} accessibilityLabel="Choose a verification method">
    {options.map(option => {
      const selected = option.value === value;
      return <TouchableOpacity key={option.value} accessibilityRole="radio" accessibilityLabel={option.title}
        accessibilityState={{ checked: selected, disabled }} disabled={disabled} onPress={() => onChange(option.value)} activeOpacity={0.75}
        style={[styles.choice, selected && styles.selected, disabled && styles.disabled]}>
        <View style={[styles.icon, selected && styles.selectedIcon]}><Ionicons name={option.icon} size={22} color={selected ? '#fff' : COLORS.primary} /></View>
        <View style={styles.copy}><Text style={[styles.title, selected && styles.selectedText]}>{option.title}</Text><Text style={[styles.description, selected && styles.selectedDescription]}>{option.description}</Text></View>
        <Ionicons name={selected ? 'radio-button-on' : 'radio-button-off'} size={24} color={selected ? '#fff' : COLORS.primary} />
      </TouchableOpacity>;
    })}
  </View>;
}
const styles = StyleSheet.create({
  list: { gap: 12 },
  choice: { minHeight: 88, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14, borderWidth: 2, borderColor: COLORS.primary, backgroundColor: '#fff', elevation: 2, shadowColor: '#173D24', shadowOpacity: 0.10, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } },
  selected: { backgroundColor: COLORS.primary }, disabled: { opacity: 0.55 },
  icon: { padding: 9, borderRadius: 10, backgroundColor: COLORS.primaryBg }, selectedIcon: { backgroundColor: '#ffffff22' },
  copy: { flex: 1, minWidth: 0 }, title: { fontSize: 14, fontWeight: '800', color: COLORS.primary },
  description: { marginTop: 4, fontSize: 12, lineHeight: 17, color: COLORS.textSecondary },
  selectedText: { color: '#fff' }, selectedDescription: { color: '#ffffffdf' }
});
