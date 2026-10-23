import React, { useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, RADIUS } from '../../theme';
import { AppText as Text } from '../Typography';
import { paginate } from '../../utils/pagination';
import { useTranslation } from '../../services/i18n';

export function usePagination(items, { pageSize = 10, resetKey } = {}) {
  const [state, setState] = useState({ page: 1, key: resetKey });
  const changed = !Object.is(state.key, resetKey);
  const result = paginate(items, changed ? 1 : state.page, pageSize);
  // Clamp state as records disappear, so later additions do not jump back to an
  // obsolete page. Reset synchronously when the user changes the list's filter.
  if (changed || state.page !== result.page) {
    setState({ page: result.page, key: resetKey });
  }
  const setPage = page => setState({ page, key: resetKey });
  return { ...result, setPage };
}

export default function Pagination({ page, totalPages, start, end, total, setPage, label = 'records' }) {
  const { t } = useTranslation();
  if (total === 0) return null;
  return (
    <View style={styles.container}>
      <Text style={styles.summary} accessibilityLiveRegion="polite">{start}–{end} / {total} {label}</Text>
      <View style={styles.controls}>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={`Previous page of ${label}`}
          accessibilityState={{ disabled: page <= 1 }}
          disabled={page <= 1}
          onPress={() => setPage(page - 1)}
          style={[styles.button, page <= 1 && styles.disabled]}
        >
          <Ionicons name="chevron-back" size={18} color={COLORS.primary} />
          <Text style={styles.buttonText}>{t('btn_prev', 'Previous')}</Text>
        </TouchableOpacity>
        <Text style={styles.page}>{page} / {totalPages}</Text>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={`Next page of ${label}`}
          accessibilityState={{ disabled: page >= totalPages }}
          disabled={page >= totalPages}
          onPress={() => setPage(page + 1)}
          style={[styles.button, page >= totalPages && styles.disabled]}
        >
          <Text style={styles.buttonText}>{t('btn_next', 'Next')}</Text>
          <Ionicons name="chevron-forward" size={18} color={COLORS.primary} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 8, paddingTop: 12, marginTop: 8, borderTopWidth: 1, borderTopColor: COLORS.border },
  summary: { fontSize: 12, color: COLORS.textMuted, textAlign: 'center' },
  controls: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 8 },
  button: { minHeight: 44, paddingHorizontal: 12, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3, borderRadius: RADIUS.sm, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface },
  buttonText: { fontSize: 12, fontWeight: '700', color: COLORS.primary },
  page: { fontSize: 12, fontWeight: '600', color: COLORS.text, textAlign: 'center' },
  disabled: { opacity: 0.4 },
});
