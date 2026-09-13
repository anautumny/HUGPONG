// ══════════════════════════════════════════════════════════════
// HUGPONG Mobile — Farm Manager Analytics View Component
// Role: Block Farm Manager
// ══════════════════════════════════════════════════════════════

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS, SPACING, RADIUS, SHADOW } from '../../theme';
import { useTranslation } from '../../services/i18n';

export default function ManagerAnalyticsView({
  session = {},
  managedFields = [],
  farmLogs = [],
  benchmarks = {}
}) {
  const { t } = useTranslation();
  const totalHa = managedFields.reduce((sum, f) => sum + (Number(f.ha) || 1.5), 0);
  const totalSpent = farmLogs.reduce((sum, l) => sum + (Number(l.cost || l.totalCost) || 0), 0);
  const avgCostPerHa = totalHa > 0 ? Math.round(totalSpent / totalHa) : 0;
  const opsCount = farmLogs.length;

  return (
    <View style={s.container}>
      <View style={s.summaryCard}>
        <Text style={s.cardLabel}>{t('block_farm_agg_analytics', 'Block Farm Production Overview')}</Text>
        <Text style={s.cardTitle}>{(session?.farm || session?.blockFarm || 'District Central')} · {managedFields.length} {t('plots_lbl', 'Plots')}</Text>

        <View style={s.statsGrid}>
          <View style={s.statCell}>
            <Text style={s.statVal}>{totalHa.toFixed(1)} Ha</Text>
            <Text style={s.statDesc}>{t('total_area_lbl', 'Total Area')}</Text>
          </View>
          <View style={s.statCell}>
            <Text style={[s.statVal, { color: COLORS.primary }]}>₱{totalSpent.toLocaleString()}</Text>
            <Text style={s.statDesc}>{t('total_logged_costs', 'Production Cost')}</Text>
          </View>
          <View style={s.statCell}>
            <Text style={s.statVal}>₱{avgCostPerHa.toLocaleString()}</Text>
            <Text style={s.statDesc}>{t('avg_cost_ha', 'Cost / Hectare')}</Text>
          </View>
          <View style={s.statCell}>
            <Text style={[s.statVal, { color: COLORS.farmGreen }]}>{opsCount}</Text>
            <Text style={s.statDesc}>{t('recorded_ops_count', 'Recorded Operations')}</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { marginTop: SPACING.sm },
  summaryCard: { backgroundColor: '#FFF', borderRadius: RADIUS.xl, padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border, ...SHADOW.xs },
  cardLabel: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase', color: COLORS.textMuted },
  cardTitle: { fontSize: 15, fontWeight: '900', color: COLORS.text, marginTop: 2, marginBottom: 12 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  statCell: { width: '48%', backgroundColor: '#F9FAF7', padding: 10, borderRadius: RADIUS.md },
  statVal: { fontSize: 16, fontWeight: '900', color: COLORS.text },
  statDesc: { fontSize: 9, color: COLORS.textMuted, fontWeight: '600', marginTop: 2 }
});
