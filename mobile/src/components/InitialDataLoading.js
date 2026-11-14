import React from 'react';
import { View, ScrollView, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { COLORS } from '../theme';
import { AppText as Text } from './Typography';
import { useTranslation } from '../services/i18n';

export default function InitialDataLoading({ mode = 'loading', retrying = false, onRetry, onSignOut }) {
  const { t } = useTranslation();
  const loading = mode === 'loading';
  return <ScrollView style={styles.scroll} contentContainerStyle={styles.screen}>
    <View style={styles.card} accessibilityLiveRegion="polite">
      {(loading || retrying) && <ActivityIndicator size="large" color={COLORS.primary} accessibilityLabel={t('data_loading_title')} />}
      <Text style={styles.title}>{t(loading ? 'data_loading_title' : mode === 'offline' ? 'data_offline_title' : 'data_error_title')}</Text>
      <Text style={styles.message}>{t(loading ? 'data_loading_message' : mode === 'offline' ? 'data_offline_message' : 'data_error_message')}</Text>
      {loading && <View style={styles.skeleton} accessible={false} importantForAccessibility="no-hide-descendants">
        {[0, 1, 2].map(row => <View key={row} style={styles.placeholder} />)}
      </View>}
      {!loading && <TouchableOpacity accessibilityRole="button" disabled={retrying} onPress={onRetry} style={styles.button}>
        <Text style={styles.buttonLabel}>{t('btn_try_again', 'Try Again')}</Text>
      </TouchableOpacity>}
      {!loading && onSignOut && <TouchableOpacity accessibilityRole="button" disabled={retrying} onPress={onSignOut} style={styles.secondary}>
        <Text style={styles.secondaryLabel}>{t('data_back_to_login')}</Text>
      </TouchableOpacity>}
    </View>
  </ScrollView>;
}

export function DataRefreshNotice({ notice }) {
  const { t } = useTranslation();
  if (!notice) return null;
  return <View style={styles.notice} accessibilityLiveRegion="polite">
    {notice === 'updating' && <ActivityIndicator size="small" color={COLORS.primary} />}
    <Text style={styles.noticeLabel}>{t(notice === 'updating' ? 'data_updating' : notice === 'offline' ? 'data_showing_saved' : 'data_update_failed')}</Text>
  </View>;
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: COLORS.background },
  screen: { flexGrow: 1, justifyContent: 'center', padding: 28 },
  card: { alignItems: 'center', gap: 16, width: '100%', maxWidth: 440, alignSelf: 'center' },
  title: { fontSize: 22, fontWeight: '800', color: COLORS.text, textAlign: 'center' },
  message: { fontSize: 15, lineHeight: 22, color: COLORS.textSecondary, textAlign: 'center' },
  skeleton: { gap: 12, alignSelf: 'stretch', marginTop: 12 },
  placeholder: { height: 54, borderRadius: 14, backgroundColor: COLORS.border || '#E5E7EB' },
  button: { minHeight: 48, justifyContent: 'center', borderRadius: 12, backgroundColor: COLORS.primary, paddingHorizontal: 28, paddingVertical: 12 },
  buttonLabel: { color: '#FFF', fontWeight: '700', fontSize: 15 },
  secondary: { minHeight: 44, justifyContent: 'center', padding: 10 },
  secondaryLabel: { color: COLORS.primary, fontWeight: '600' },
  notice: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 10, paddingHorizontal: 16, backgroundColor: COLORS.surface },
  noticeLabel: { flexShrink: 1, color: COLORS.textSecondary, fontSize: 13, textAlign: 'center' }
});
