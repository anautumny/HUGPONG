// ══════════════════════════════════════════════════════════════
// HUGPONG Mobile — Farm Manager Field Operations View Component
// Role: Block Farm Manager
// ══════════════════════════════════════════════════════════════

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS, SHADOW } from '../../theme';
import { useTranslation } from '../../services/i18n';

function ManagerFieldOpsView({
  session = {},
  fields = [],
  onGenerateAudit,
  onOpenTakeover,
  onOpenApprovalModal,
  navigation
}) {
  const { t, formatStageName } = useTranslation();

  const managedFields = React.useMemo(() => {
    if (session?.blockFarmId) {
      return fields.filter(f => f.blockFarmId === session.blockFarmId || f.blockFarm === (session?.farm || session?.blockFarm || 'District Central') );
    }
    const targetFarm = session?.farm || session?.blockFarm || 'District Central';
    return fields.filter(f => !f.blockFarm || f.blockFarm === targetFarm);
  }, [fields, session?.farm, session?.blockFarmId]);

  return (
    <View style={s.container}>
      {/* Manager Action Panel */}
      <Text style={s.sectionLabel}>{t('manager_oversight_lbl', 'Manager Command & Oversight')}</Text>
      <View style={s.commandRow}>
        <TouchableOpacity style={s.auditBtn} onPress={onGenerateAudit} activeOpacity={0.8}>
          <Ionicons name="qr-code-outline" size={18} color="#FFF" />
          <Text style={s.auditBtnText} numberOfLines={1} adjustsFontSizeToFit>{t('btn_compile_generate_qr', 'Compile & Generate SRA QR')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.takeoverBtn} onPress={onOpenTakeover} activeOpacity={0.8}>
          <Ionicons name="swap-horizontal" size={18} color={COLORS.primary} />
          <Text style={s.takeoverBtnText} numberOfLines={1} adjustsFontSizeToFit>{t('take_over_ops_btn', 'Take Over Ops')}</Text>
        </TouchableOpacity>
      </View>

      {/* Supervised Field Registry */}
      <View style={s.sectionHeader}>
        <Text style={s.sectionTitle}>{t('supervised_plots_label', 'Supervised Plots')} ({managedFields.length})</Text>
        <Text style={s.farmTag}>{(session?.farm || session?.blockFarm || 'District Central')}</Text>
      </View>

      {managedFields.map(f => (
        <View key={f.id} style={s.plotCard}>
          <View style={s.plotHeader}>
            <View>
              <Text style={s.plotId}>{f.id}</Text>
              <Text style={s.plotMember}>{t('farmer_label', 'Farmer')}: {f.member}</Text>
            </View>
            <View style={s.haBadge}>
              <Text style={s.haText}>{f.ha} Ha</Text>
            </View>
          </View>

          <View style={s.stageRow}>
            <Ionicons name="leaf-outline" size={13} color={COLORS.textMuted} />
            <Text style={s.stageText}>{formatStageName ? formatStageName(f.stage) : (f.stage || 'Pre-Planting')}</Text>
          </View>

          <View style={s.plotFooter}>
            <Text style={s.syncStatus}>
              <Ionicons name="checkmark-circle" size={12} color={COLORS.success} /> {t('synced', 'Synced')}
            </Text>
            <TouchableOpacity style={s.inspectBtn} onPress={onOpenTakeover}>
              <Text style={s.inspectText}>{t('manage_plot_link', 'Manage Plot →')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  container: { marginTop: SPACING.sm },
  sectionLabel: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', color: COLORS.textMuted, marginBottom: 8, letterSpacing: 0.5 },
  commandRow: { flexDirection: 'row', gap: 8, marginBottom: SPACING.md },
  auditBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: COLORS.primary, paddingVertical: 12, paddingHorizontal: 8, borderRadius: RADIUS.lg, minHeight: 44, ...SHADOW.xs },
  auditBtnText: { color: '#FFF', fontSize: 12.5, fontWeight: '800', textAlign: 'center', flexShrink: 1 },
  takeoverBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#FFF', borderWidth: 1, borderColor: COLORS.primary, paddingVertical: 12, paddingHorizontal: 8, borderRadius: RADIUS.lg, minHeight: 44, ...SHADOW.xs },
  takeoverBtnText: { color: COLORS.primary, fontSize: 12.5, fontWeight: '800', textAlign: 'center', flexShrink: 1 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  sectionTitle: { fontSize: 14, fontWeight: '800', color: COLORS.text },
  farmTag: { fontSize: 11, color: COLORS.textMuted, fontWeight: '600' },
  plotCard: { backgroundColor: '#FFF', borderRadius: RADIUS.xl, padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border, marginBottom: SPACING.sm, ...SHADOW.xs },
  plotHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 },
  plotId: { fontSize: 14, fontWeight: '900', color: COLORS.text },
  plotMember: { fontSize: 11, color: COLORS.textMuted, marginTop: 2 },
  haBadge: { backgroundColor: COLORS.primaryBg, paddingHorizontal: 8, paddingVertical: 4, borderRadius: RADIUS.sm },
  haText: { fontSize: 12, fontWeight: '800', color: COLORS.primary },
  stageRow: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#F9FAF7', padding: 8, borderRadius: RADIUS.md, marginVertical: 6 },
  stageText: { fontSize: 11, fontWeight: '700', color: COLORS.text },
  plotFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 6, borderTopWidth: 1, borderTopColor: COLORS.border },
  syncStatus: { fontSize: 11, color: COLORS.success, fontWeight: '700' },
  inspectBtn: { paddingVertical: 4 },
  inspectText: { fontSize: 12, fontWeight: '700', color: COLORS.primary }
});

export default React.memo(ManagerFieldOpsView);
