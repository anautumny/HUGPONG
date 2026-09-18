import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS } from '../theme';

export default function EmptyState({
  icon = 'folder-open-outline',
  title = 'Nothing here yet',
  subtitle,
  actionLabel,
  onAction,
  iconColor,
  compact = false,
}) {
  return (
    <View style={[s.wrap, compact && s.wrapCompact]}>
      <View style={[s.iconWrap, iconColor && { backgroundColor: iconColor + '18' }]}>
        <Ionicons
          name={icon}
          size={compact ? 36 : 52}
          color={iconColor || COLORS.border}
        />
      </View>
      <Text style={[s.title, compact && s.titleCompact]}>{title}</Text>
      {subtitle ? <Text style={s.subtitle}>{subtitle}</Text> : null}
      {actionLabel && onAction ? (
        <TouchableOpacity style={s.actionBtn} onPress={onAction}>
          <Text style={s.actionBtnText}>{actionLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, paddingVertical: 60, gap: 12 },
  wrapCompact: { paddingVertical: 32, gap: 8 },
  iconWrap: { width: 80, height: 80, borderRadius: 40, backgroundColor: COLORS.background, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 17, fontWeight: '700', color: COLORS.text, textAlign: 'center' },
  titleCompact: { fontSize: 14 },
  subtitle: { fontSize: 13, color: COLORS.textMuted, textAlign: 'center', lineHeight: 20 },
  actionBtn: { backgroundColor: COLORS.primary, borderRadius: RADIUS.md, paddingHorizontal: 24, paddingVertical: 12, minHeight: 44, justifyContent: 'center', alignItems: 'center', marginTop: 4 },
  actionBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
});
