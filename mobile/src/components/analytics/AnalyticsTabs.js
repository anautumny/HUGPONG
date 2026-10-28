import React from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, RADIUS, SHADOW } from '../../theme';
import { AppText as Text } from '../Typography';

const TABS = [
  { key: 'overview', label: 'Overview', icon: 'pie-chart' },
  { key: 'costs', label: 'Costs', icon: 'cash' },
  { key: 'operations', label: 'Operations', icon: 'construct' },
  { key: 'market', label: 'Market', icon: 'trending-up' },
];

export default function AnalyticsTabs({ activeTab, onChange }) {
  const { width, fontScale } = useWindowDimensions();
  const showIcons = width >= 480 * Math.max(1, fontScale);

  return (
    <ScrollView
      horizontal
      style={s.viewport}
      contentContainerStyle={s.bar}
      showsHorizontalScrollIndicator={false}
      accessibilityRole="tablist"
    >
      {TABS.map(tab => {
        const selected = activeTab === tab.key;
        return (
          <TouchableOpacity
            key={tab.key}
            style={[s.button, selected && s.selectedButton]}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={tab.label}
            onPress={() => onChange(tab.key)}
            activeOpacity={0.7}
          >
            {showIcons && <Ionicons name={tab.icon} size={14} color={selected ? COLORS.primary : COLORS.textSecondary} />}
            <Text numberOfLines={1} style={[s.label, selected && s.selectedLabel]}>{tab.label}</Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  viewport: { flexGrow: 0, backgroundColor: COLORS.surfaceSubtle, borderRadius: RADIUS.full },
  bar: { flexGrow: 1, flexDirection: 'row', alignItems: 'center', padding: 3, gap: 3 },
  // Intrinsic widths give Operations more room than Costs. The row can scroll
  // when accessibility scaling exceeds the available width, without shrinking.
  button: { flexGrow: 1, flexShrink: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, minHeight: 44, paddingVertical: 9, paddingHorizontal: 6, borderRadius: RADIUS.full },
  selectedButton: { backgroundColor: COLORS.surface, ...SHADOW.card },
  label: { flexShrink: 0, fontSize: 14, lineHeight: 20, fontWeight: '600', color: COLORS.textSecondary, textAlign: 'center' },
  selectedLabel: { color: COLORS.primaryDark, fontWeight: '800' },
});
