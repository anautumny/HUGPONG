import { getCurrentSession } from '../../data/dataStore';
// ══════════════════════════════════════════════════════════════
// HUGPONG Mobile — SRA Administrator Field Operations View Component
// Role: SRA (Admin) · Silay Sugar Regulatory Administration
// ══════════════════════════════════════════════════════════════

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS, SHADOW } from '../../theme';
import { useTranslation } from '../../services/i18n';

function SRAFieldOpsView({
  session = {},
  fields = [],
  logs = [],
  selectedFarm = 'All Block Farms',
  onSelectFarm,
  onOpenAuditScanner,
  navigation
}) {
  const { t } = useTranslation();

  const availableFarms = React.useMemo(() => {
    return ['All Block Farms', ...new Set(fields.map(f => f.blockFarm || f.blockFarmName || (session?.farm || session?.blockFarm || 'District Central')))];
  }, [fields]);

  const filteredFields = React.useMemo(() => {
    return selectedFarm === 'All Block Farms' ? fields : fields.filter(f => (f.blockFarm || f.blockFarmName || (session?.farm || session?.blockFarm || 'District Central')) === selectedFarm);
  }, [fields, selectedFarm]);

  const totalHectares = React.useMemo(() => {
    return filteredFields.reduce((sum, f) => sum + (Number(f.ha) || 0), 0);
  }, [filteredFields]);

  return (
    <View style={s.container}>
      {/* SRA Scanner Launch Button */}
      <TouchableOpacity style={s.scanBtn} onPress={onOpenAuditScanner}>
        <Ionicons name="scan-circle" size={22} color="#FFF" />
        <Text style={s.scanBtnText}>{t('open_scanner_btn', 'Open QR Certification Scanner')}</Text>
      </TouchableOpacity>

      {/* District Farm Filter */}
      <Text style={s.sectionLabel}>{t('district_block_farms', 'District 3 Block Farms')}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.farmScroll} contentContainerStyle={{ gap: 8 }}>
        {availableFarms.map(farm => (
          <TouchableOpacity
            key={farm}
            style={[s.farmChip, selectedFarm === farm && s.farmChipActive]}
            onPress={() => onSelectFarm && onSelectFarm(farm)}
          >
            <Text style={[s.farmChipText, selectedFarm === farm && s.farmChipTextActive]}>{farm}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Cluster Overview Summary */}
      <View style={s.summaryCard}>
        <View style={s.summaryHeader}>
          <View>
            <Text style={s.summaryTitle}>{selectedFarm}</Text>
            <Text style={s.summarySub}>{t('silay_regulatory_scope', 'Silay SRA Regulatory Scope')}</Text>
          </View>
          <TouchableOpacity
            style={s.analyticsLink}
            onPress={() => navigation.navigate('Analytics', { blockFarm: selectedFarm })}
          >
            <Text style={s.analyticsLinkText}>{t('analytics_link_text', 'Analytics →')}</Text>
          </TouchableOpacity>
        </View>

        <View style={s.metricsRow}>
          <View style={s.metricBox}>
            <Text style={s.metricVal}>{totalHectares.toFixed(1)} Ha</Text>
            <Text style={s.metricLbl}>{t('total_area_lbl', 'Total Area')}</Text>
          </View>
          <View style={s.metricBox}>
            <Text style={s.metricVal}>{filteredFields.length}</Text>
            <Text style={s.metricLbl}>{t('plots_lbl', 'Plots')}</Text>
          </View>
          <View style={s.metricBox}>
            <Text style={[s.metricVal, { color: COLORS.success }]}>{logs.length}</Text>
            <Text style={s.metricLbl}>{t('logged_ops_label', 'Logged Ops')}</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { marginTop: SPACING.sm },
  scanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.primary,
    paddingVertical: 14,
    borderRadius: RADIUS.xl,
    marginBottom: SPACING.md,
    ...SHADOW.sm
  },
  scanBtnText: { color: '#FFF', fontSize: 13, fontWeight: '800' },
  sectionLabel: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', color: COLORS.textMuted, marginBottom: 8, letterSpacing: 0.5 },
  farmScroll: { marginBottom: SPACING.md },
  farmChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: RADIUS.full, backgroundColor: '#FFF', borderWidth: 1, borderColor: COLORS.border },
  farmChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  farmChipText: { fontSize: 12, fontWeight: '700', color: COLORS.text },
  farmChipTextActive: { color: '#FFF' },
  summaryCard: { backgroundColor: '#FFF', borderRadius: RADIUS.xl, padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border, ...SHADOW.xs },
  summaryHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  summaryTitle: { fontSize: 15, fontWeight: '900', color: COLORS.text },
  summarySub: { fontSize: 11, color: COLORS.textMuted, marginTop: 1 },
  analyticsLink: { backgroundColor: COLORS.primaryBg, paddingHorizontal: 10, paddingVertical: 5, borderRadius: RADIUS.sm },
  analyticsLinkText: { fontSize: 11, fontWeight: '800', color: COLORS.primary },
  metricsRow: { flexDirection: 'row', gap: 8 },
  metricBox: { flex: 1, backgroundColor: '#F9FAF7', padding: 10, borderRadius: RADIUS.md, alignItems: 'center' },
  metricVal: { fontSize: 16, fontWeight: '900', color: COLORS.text },
  metricLbl: { fontSize: 9, color: COLORS.textMuted, fontWeight: '700', textTransform: 'uppercase', marginTop: 2 }
});

export default React.memo(SRAFieldOpsView);
