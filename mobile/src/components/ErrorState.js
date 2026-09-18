import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS, SHADOW } from '../theme';

/**
 * ErrorState — inline error card (not a full screen)
 * Use this inside scroll views when a section fails to load.
 */
export function ErrorState({ title = 'Something went wrong', message, onRetry, icon = 'alert-circle-outline' }) {
  return (
    <View style={s.card}>
      <Ionicons name={icon} size={36} color={COLORS.danger} />
      <Text style={s.title}>{title}</Text>
      {message ? <Text style={s.message}>{message}</Text> : null}
      {onRetry ? (
        <TouchableOpacity style={s.retryBtn} onPress={onRetry}>
          <Ionicons name="refresh" size={15} color={COLORS.primary} />
          <Text style={s.retryText}>Try Again</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

/**
 * NetworkErrorScreen — full-screen offline/network error
 * Use as a screen-level fallback when the app can't reach the server.
 */
export function NetworkErrorScreen({ onRetry, message }) {
  return (
    <View style={s.fullWrap}>
      <View style={s.iconWrap}>
        <Ionicons name="cloud-offline-outline" size={60} color={COLORS.textMuted} />
      </View>
      <Text style={s.fullTitle}>No Connection</Text>
      <Text style={s.fullSub}>
        {message || 'Unable to reach the server. Check your connection or work offline.'}
      </Text>
      {onRetry ? (
        <TouchableOpacity style={s.fullRetryBtn} onPress={onRetry}>
          <Ionicons name="refresh" size={16} color="#fff" />
          <Text style={s.fullRetryText}>Retry Connection</Text>
        </TouchableOpacity>
      ) : null}
      <View style={s.offlineBadge}>
        <Ionicons name="cloud-offline" size={12} color={COLORS.textMuted} />
        <Text style={s.offlineBadgeText}>Working Offline</Text>
      </View>
    </View>
  );
}

/**
 * SyncErrorBanner — slim banner shown at top of any screen when sync fails
 */
export function SyncErrorBanner({ failedCount, onRetry }) {
  if (!failedCount) return null;
  return (
    <View style={s.banner}>
      <Ionicons name="warning" size={14} color="#F5A623" />
      <Text style={s.bannerText}>{failedCount} upload{failedCount !== 1 ? 's' : ''} failed</Text>
      <TouchableOpacity onPress={onRetry} style={s.bannerBtn}>
        <Text style={s.bannerBtnText}>Retry</Text>
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  // Inline card
  card: { backgroundColor: '#fff', borderRadius: RADIUS.lg, padding: 28, alignItems: 'center', gap: 10, ...SHADOW.card, margin: SPACING.lg },
  title: { fontSize: 15, fontWeight: '700', color: COLORS.text, textAlign: 'center' },
  message: { fontSize: 13, color: COLORS.textMuted, textAlign: 'center', lineHeight: 20 },
  retryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1.5, borderColor: COLORS.primary, borderRadius: RADIUS.md, paddingHorizontal: 16, paddingVertical: 10, minHeight: 44, marginTop: 4 },
  retryText: { fontSize: 14, color: COLORS.primary, fontWeight: '700' },
  // Full screen
  fullWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.background, paddingHorizontal: 40, gap: 16 },
  iconWrap: { width: 100, height: 100, borderRadius: 50, backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center', ...SHADOW.card },
  fullTitle: { fontSize: 22, fontWeight: '800', color: COLORS.text },
  fullSub: { fontSize: 14, color: COLORS.textMuted, textAlign: 'center', lineHeight: 22 },
  fullRetryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: COLORS.primary, borderRadius: RADIUS.md, paddingHorizontal: 24, paddingVertical: 13, minHeight: 44 },
  fullRetryText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  offlineBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#fff', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6, ...SHADOW.card },
  offlineBadgeText: { fontSize: 12, color: COLORS.textMuted, fontWeight: '500' },
  // Banner
  banner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FFF3DC', paddingHorizontal: SPACING.lg, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: '#F5C842' },
  bannerText: { flex: 1, fontSize: 12, color: '#7A5500', fontWeight: '500' },
  bannerBtn: { paddingHorizontal: 12, paddingVertical: 6, minHeight: 32, minWidth: 44, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F5A623', borderRadius: 8 },
  bannerBtnText: { fontSize: 12, fontWeight: '700', color: '#fff' },
});
