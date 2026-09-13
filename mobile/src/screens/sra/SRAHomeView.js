import { getCurrentSession } from '../../data/dataStore';
// ══════════════════════════════════════════════════════════════
// HUGPONG Mobile — SRA Administrator Home View Component
// Role: SRA (Admin) · Silay Sugar Regulatory Administration
// ══════════════════════════════════════════════════════════════

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS, SHADOW } from '../../theme';
import { useTranslation } from '../../services/i18n';
import { blockFarms, auditReports, resolveBlockFarmManager } from '../../data/dataStore';

function SRAHomeView({ session = {}, fields = [], navigation }) {
  const { t } = useTranslation();

  const blockFarmsList = React.useMemo(() => {
    const list = blockFarms;
    return list.map(bf => {
      const bfFields = fields.filter(f => f.blockFarmId === bf.id || f.blockFarm === bf.name || (bf.code && f.blockFarmId === bf.code));
      const activeFieldsList = bfFields;
      const totalHa = bfFields.reduce((s, f) => s + (Number(f.ha || f.area) || 0), 0);
      const resolvedMgr = resolveBlockFarmManager(bf);
      return {
        id: bf.id,
        name: bf.name || (session?.farm || session?.blockFarm || 'District Central'),
        manager: resolvedMgr,
        plots: bfFields.length,
        ha: totalHa,
        totalHa,
        totalFarmHa: totalHa,
        status: resolvedMgr === 'Pending Appointment' ? 'Pending Manager' : 'SRA Verified ✓'
      };
    });
  }, [fields]);

  const totalDistrictHa = React.useMemo(() => {
    return blockFarmsList.reduce((sum, f) => sum + (Number(f.ha) || 0), 0);
  }, [blockFarmsList]);

  const totalPlots = React.useMemo(() => {
    return blockFarmsList.reduce((s, f) => s + f.plots, 0);
  }, [blockFarmsList]);

  const complianceRate = React.useMemo(() => {
    if (!auditReports || auditReports.length === 0) return 100;
    const certified = auditReports.filter(a => a.status === 'Certified').length;
    return Math.round((certified / auditReports.length) * 100);
  }, [auditReports]);

  return (
    <View style={s.container}>

      {/* ── District Summary Card (matches Manager style) ── */}
      <View style={s.summaryCard}>
        <View style={s.summaryHeader}>
          <View>
            <Text style={s.districtName}>{t('district_name_title', 'District 3 · Silay')}</Text>
            <Text style={s.adminTag}>{t('profile_admin_role', 'Administrator')}: {session?.name || 'Administrator'}</Text>
          </View>
          <View style={s.totalBadge}>
            <Text style={s.totalHa}>{totalDistrictHa.toFixed(2)} Ha</Text>
            <Text style={s.totalPlots}>{totalPlots} {t('member_plots_count', 'Member Plots')}</Text>
          </View>
        </View>

        <View style={s.quickStatsRow}>
          <View style={s.statBox}>
            <Text style={s.statNumber}>{blockFarmsList.length}</Text>
            <Text style={s.statLabel}>{t('block_farms_count_lbl', 'Block Farms')}</Text>
          </View>
          <TouchableOpacity
            style={s.statBox}
            onPress={() => navigation.navigate('Field Ops')}
            activeOpacity={0.7}
          >
            <Text style={[s.statNumber, { color: COLORS.primary }]}>{totalPlots}</Text>
            <Text style={s.statLabel}>{t('registered_plots_lbl', 'Registered Plots')}</Text>
          </TouchableOpacity>
          <View style={s.statBox}>
            <Text style={[s.statNumber, { color: complianceRate >= 80 ? COLORS.success : '#D97706' }]}>{complianceRate}%</Text>
            <Text style={s.statLabel}>{t('compliance_lbl', 'Compliance')}</Text>
          </View>
        </View>
      </View>

      {/* ── Supervised Block Farms ── */}
      <View style={s.sectionHeader}>
        <View>
          <Text style={s.sectionTitle}>{t('supervised_block_farms', 'Supervised Block Farms')}</Text>
          <Text style={s.sectionSub}>{t('tap_farm_to_view', 'Tap a farm to view field operations')}</Text>
        </View>
        <TouchableOpacity onPress={() => navigation.navigate('Field Ops')}>
          <Text style={s.seeAllText}>{t('audit_desk_link', 'Audit Desk →')}</Text>
        </TouchableOpacity>
      </View>

      <View style={{ gap: 8, marginBottom: SPACING.md }}>
        {blockFarmsList.map(farm => (
          <TouchableOpacity
            key={farm.name}
            style={s.plotItem}
            onPress={() => navigation.navigate('Field Ops', { screen: 'SchedMain', params: { farmName: farm.name } })}
            activeOpacity={0.7}
          >
            <View style={{ flex: 1 }}>
              <View style={s.plotTopRow}>
                <Text style={s.plotName}>{farm.name}</Text>
                <View style={s.statusBadge}>
                  <Text style={s.statusText}>{farm.status}</Text>
                </View>
              </View>
              <Text style={s.plotManager}>{t('manager_label', 'Manager')}: {farm.manager}</Text>
              <Text style={s.plotMeta}>{farm.plots} {t('member_plots_count', 'Member Plots')} · New Plant: {farm.ha} Ha · Total: {farm.totalFarmHa} Ha</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Compliance Notice ── */}
      <View style={s.complianceCard}>
        <Ionicons name="shield-checkmark" size={20} color={COLORS.primary} />
        <View style={{ flex: 1 }}>
          <Text style={s.complianceTitle}>{t('official_sra_desk', 'Official SRA Compliance Desk')}</Text>
          <Text style={s.complianceBody}>
            {t('sra_compliance_desk_body', 'Audit field operations, issue verified QR compliance certificates, and monitor district price benchmarks.')}
          </Text>
        </View>
      </View>

    </View>
  );
}

const s = StyleSheet.create({
  container: { marginTop: 0 },

  // ── Summary Card ──
  summaryCard: {
    backgroundColor: '#FFF',
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: SPACING.md,
    ...SHADOW.card,
  },
  summaryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: SPACING.md,
  },
  districtName:  { fontSize: 16, fontWeight: '800', color: COLORS.text },
  adminTag:      { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  totalBadge: {
    alignItems: 'flex-end',
    backgroundColor: COLORS.primaryBg,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: RADIUS.md,
  },
  totalHa:    { fontSize: 13, fontWeight: '800', color: COLORS.primary },
  totalPlots: { fontSize: 10, fontWeight: '600', color: COLORS.primaryLight },

  quickStatsRow: {
    flexDirection: 'row',
    backgroundColor: '#F8FAF5',
    borderRadius: RADIUS.lg,
    padding: SPACING.sm,
  },
  statBox:    { flex: 1, alignItems: 'center' },
  statNumber: { fontSize: 18, fontWeight: '800', color: COLORS.text },
  statLabel:  { fontSize: 10, color: COLORS.textMuted, fontWeight: '600', marginTop: 2 },

  // ── Section Header ──
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  sectionSub:   { fontSize: 11, color: COLORS.textMuted, marginTop: 1 },
  seeAllText:   { fontSize: 12, fontWeight: '700', color: COLORS.primary },

  // ── Farm / Plot Items ──
  plotItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFF',
    padding: SPACING.md,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOW.card,
  },
  plotTopRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 },
  plotName:     { fontSize: 14, fontWeight: '800', color: COLORS.text, flex: 1, marginRight: 8 },
  statusBadge:  { backgroundColor: COLORS.primaryBg, paddingHorizontal: 6, paddingVertical: 2, borderRadius: RADIUS.xs },
  statusText:   { fontSize: 10, fontWeight: '800', color: COLORS.primary },
  plotManager:  { fontSize: 12, color: COLORS.textSecondary, marginTop: 1, fontWeight: '600' },
  plotMeta:     { fontSize: 11, color: COLORS.textMuted, marginTop: 2 },

  // ── Compliance Banner ──
  complianceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    backgroundColor: '#F0F8EC',
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: '#C2E0B4',
  },
  complianceTitle: { fontSize: 13, fontWeight: '800', color: COLORS.primary },
  complianceBody:  { fontSize: 11, color: COLORS.textSecondary, marginTop: 2 },
});

export default React.memo(SRAHomeView);
