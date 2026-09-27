import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, ScrollView, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS, SHADOW } from '../../theme';
import { useTranslation } from '../../services/i18n';
import { setItem } from '../../services/storageService';

const LOGO = require('../../../assets/HUGPONG LOGO.png');

const LANG_CONFIGS = [
  {
    key: 'hil',
    nativeName: 'Hiligaynon',
    regionName: 'Ilonggo (Negros Occidental & Panay)',
    icon: 'leaf',
    iconColor: '#2D6A2E',
    iconBg: '#E8F5E9',
    badgeKey: 'language_recommended',
    regionKey: 'language_hil_region',
    taglineKey: 'language_hil_tagline',
  },
  {
    key: 'tl',
    nativeName: 'Filipino',
    regionName: 'Tagalog (Pambansang Wika)',
    icon: 'flag',
    iconColor: '#1565C0',
    iconBg: '#E3F2FD',
    badgeKey: null,
    regionKey: 'language_tl_region',
    taglineKey: 'language_tl_tagline',
  },
  {
    key: 'en',
    nativeName: 'English',
    regionName: 'Official Agricultural Terms & SRA Standard',
    icon: 'globe',
    iconColor: '#7B1FA2',
    iconBg: '#F3E5F5',
    badgeKey: null,
    regionKey: 'language_en_region',
    taglineKey: 'language_en_tagline',
  },
];

export default function LanguageSelectScreen({ navigation }) {
  const { language, setLanguage, t } = useTranslation();
  const [selected, setSelected] = useState(language || 'hil');
  const { width } = useWindowDimensions();
  const isCompact = width < 370;

  const handleSelect = (langKey) => {
    setSelected(langKey);
    setLanguage(langKey).catch(() => {});
  };

  const handleContinue = async () => {
    await setLanguage(selected);
    await setItem('@hugpong_lang_chosen', 'true');
    navigation.replace('Onboarding');
  };

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={[s.scroll, isCompact && s.scrollCompact]} showsVerticalScrollIndicator={false}>
        {/* Top Branding */}
        <View style={s.header}>
          <View style={s.logoCard}>
            <Image source={LOGO} style={s.logoImg} resizeMode="contain" />
          </View>
          <Text style={s.brandName}>HUGPONG</Text>
          <Text style={s.title}>{t('lang_select_title', 'Choose Your Preferred Language')}</Text>
          <Text style={s.subtitle}>{t('lang_select_description', 'Select your language for reports, crop planning, and field logging.')}</Text>
        </View>

        {/* Language Options List */}
        <View style={s.cardList}>
          {LANG_CONFIGS.map(item => {
            const isSelected = selected === item.key;
            return (
              <TouchableOpacity
                key={item.key}
                style={[s.langCard, isCompact && s.langCardCompact, isSelected && s.langCardSelected]}
                onPress={() => handleSelect(item.key)}
                activeOpacity={0.85}
              >
                {/* Left Icon */}
                <View style={[s.iconBox, { backgroundColor: item.iconBg }]}>
                  <Ionicons name={item.icon} size={22} color={item.iconColor} />
                </View>

                {/* Info */}
                <View style={s.langInfo}>
                  <View style={s.nameRow}>
                    <Text style={[s.nativeName, isSelected && s.nativeNameSelected]}>
                      {item.nativeName}
                    </Text>
                    {item.badgeKey && (
                      <View style={s.badgeWrap}>
                        <Text style={s.badgeText}>{t(item.badgeKey, 'Recommended')}</Text>
                      </View>
                    )}
                  </View>
                  <Text style={s.regionName}>{t(item.regionKey, item.regionName)}</Text>
                  <Text style={s.tagline}>{t(item.taglineKey, '')}</Text>
                </View>

                {/* Right Selection Radio */}
                <View style={s.radioBox}>
                  {isSelected ? (
                    <Ionicons name="checkmark-circle" size={24} color={COLORS.primary} />
                  ) : (
                    <View style={s.radioUnchecked} />
                  )}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Bottom Helper Note */}
        <View style={s.noteBox}>
          <Ionicons name="information-circle-outline" size={16} color={COLORS.textMuted} />
          <Text style={s.noteText}>{t('language_change_anytime', 'You can change your preferred language at any time in Profile.')}</Text>
        </View>

        {/* Primary Action Button */}
        <TouchableOpacity style={s.continueBtn} onPress={handleContinue} activeOpacity={0.85}>
          <Text style={s.continueBtnText}>{t('language_continue', 'Continue to HUGPONG')}</Text>
          <Ionicons name="arrow-forward" size={18} color="#fff" />
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  scroll: { flexGrow: 1, padding: SPACING.xl, paddingBottom: 36, gap: SPACING.lg, justifyContent: 'center' },
  scrollCompact: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.lg, gap: SPACING.md },
  header: { alignItems: 'center', textAlign: 'center', gap: 6, paddingTop: 8 },
  logoCard: { width: 84, height: 84, borderRadius: 24, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', ...SHADOW.card, marginBottom: 4 },
  logoImg: { width: 62, height: 62 },
  brandName: { fontSize: 13, fontWeight: '900', color: COLORS.primary, letterSpacing: 2, textTransform: 'uppercase' },
  title: { fontSize: 22, fontWeight: '800', color: COLORS.text, textAlign: 'center', marginTop: 4 },
  subtitle: { fontSize: 13, color: COLORS.textMuted, textAlign: 'center', lineHeight: 18, paddingHorizontal: 12 },

  cardList: { gap: 12, marginTop: 4 },
  langCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#fff',
    borderRadius: RADIUS.xl,
    padding: 16,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    gap: 14,
    ...SHADOW.card,
  },
  langCardCompact: { padding: 12, gap: 10 },
  langCardSelected: {
    borderColor: COLORS.primary,
    backgroundColor: '#F7FCF5',
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  langInfo: { flex: 1, minWidth: 0, gap: 2 },
  nameRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  nativeName: { fontSize: 17, fontWeight: '800', color: COLORS.text, flexShrink: 1 },
  nativeNameSelected: { color: COLORS.primary },
  badgeWrap: {
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#C8E6C9',
  },
  badgeText: { fontSize: 10, fontWeight: '800', color: '#2E7D32', textTransform: 'uppercase' },
  regionName: { fontSize: 12, fontWeight: '600', color: COLORS.textSecondary },
  tagline: { fontSize: 11, color: COLORS.textMuted, lineHeight: 15, marginTop: 2 },
  radioBox: { width: 26, height: 26, alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 9 },
  radioUnchecked: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: COLORS.border },

  noteBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  noteText: { flex: 1, fontSize: 11, color: COLORS.textMuted, lineHeight: 16 },

  continueBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.lg,
    minHeight: 52,
    paddingVertical: 16,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    ...SHADOW.md,
  },
  continueBtnText: { fontSize: 16, fontWeight: '800', color: '#fff', textAlign: 'center', flexShrink: 1 },
});
