import { getCurrentSession } from '../../data/dataStore';
// ══════════════════════════════════════════════════════════════
// HUGPONG Mobile — SRA Admin Home View Component
// Role: SRA Admin · Silay Sugar Regulatory Administration
// ══════════════════════════════════════════════════════════════

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS, SHADOW } from '../../theme';
import { useTranslation } from '../../services/i18n';
import { blockFarms, auditReports, resolveBlockFarmManager } from '../../data/dataStore';
import { AUDIT_STATUS, canonicalAuditStatus } from '../../domain/auditWorkflow';

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
    const actionable = auditReports.filter(a => canonicalAuditStatus(a.status) === AUDIT_STATUS.PENDING_REVIEW).length;
    return actionable === 0 ? 100 : Math.max(0, Math.round(((auditReports.length - actionable) / auditReports.length) * 100));
  }, [auditReports]);

  return (
    <View style={s.container}>

      {/* ── District Summary Card (matches Manager style) ── */}
      <View style={s.summaryCard}>
        <View style={s.summaryHeader}>
          <View>
            <Text style={s.districtName}>{t('district_name_title', 'District 3 · Silay')}</Text>
            <Text style={s.adminTag}>{t('profile_admin_role', 'SRA Admin')}: {session?.name || 'SRA Admin'}</Text>
          </View>
          <View style={s.totalBadge}>
            <Ionicons name="leaf" size={13} color={COLORS.primary} style={{ marginRight: 5 }} />
            <Text style={s.totalHa}>{totalDistrictHa.toFixed(2)} Ha</Text>
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
              <Text style={s.plotMeta}>{farm.plots} {t('member_plots_count', 'Farm Member Fields')} · New Plant: {farm.ha} Ha · Total: {farm.totalFarmHa} Ha</Text>
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
    borderWidth: 1.2,
    borderColor: '#E2EBDC',
    marginBottom: SPACING.md,
    ...SHADOW.card,
  },
  summaryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: SPACING.md,
  },
  districtName:  { fontSize: 18, fontWeight: '900', color: COLORS.text, letterSpacing: -0.2 },
  adminTag:      { fontSize: 13, color: COLORS.textMuted, marginTop: 3 },
  totalBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0F8EC',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: '#C8E6C9',
  },
  totalHa:    { fontSize: 14.5, fontWeight: '900', color: COLORS.primary },

  quickStatsRow: {
    flexDirection: 'row',
    backgroundColor: '#F7FAF5',
    borderRadius: RADIUS.lg,
    padding: SPACING.sm + 2,
    gap: 8,
    borderWidth: 1,
    borderColor: '#E5EDE0',
  },
  statBox:    { flex: 1, alignItems: 'center', paddingVertical: 4 },
  statNumber: { fontSize: 20, fontWeight: '900', color: COLORS.text },
  statLabel:  { fontSize: 11, color: COLORS.textMuted, fontWeight: '700', marginTop: 3, textTransform: 'uppercase', letterSpacing: 0.3 },

  // ── Section Header ──
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.sm,
    marginTop: 4,
  },
  sectionTitle: { fontSize: 15.5, fontWeight: '800', color: COLORS.text },
  sectionSub:   { fontSize: 12.5, color: COLORS.textMuted, marginTop: 2 },
  seeAllText:   { fontSize: 13.5, fontWeight: '800', color: COLORS.primary },

  // ── Farm / Plot Items ──
  plotItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFF',
    padding: SPACING.md + 2,
    borderRadius: RADIUS.lg,
    borderWidth: 1.2,
    borderColor: '#E2EBDC',
    ...SHADOW.card,
  },
  plotTopRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  plotName:     { fontSize: 15.5, fontWeight: '900', color: COLORS.text, flex: 1, marginRight: 8 },
  statusBadge:  { backgroundColor: '#F0F8EC', borderWidth: 1, borderColor: '#D7ECD1', paddingHorizontal: 8, paddingVertical: 3.5, borderRadius: RADIUS.xs },
  statusText:   { fontSize: 11.5, fontWeight: '900', color: COLORS.primary },
  plotManager:  { fontSize: 13, color: COLORS.textSecondary, marginTop: 2, fontWeight: '700' },
  plotMeta:     { fontSize: 12, color: COLORS.textMuted, marginTop: 3 },

  // ── Compliance Banner ──
  complianceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    backgroundColor: '#F0F8EC',
    borderRadius: RADIUS.lg,
    padding: SPACING.md + 2,
    borderWidth: 1.2,
    borderColor: '#C2E0B4',
  },
  complianceTitle: { fontSize: 14.5, fontWeight: '900', color: COLORS.primary },
  complianceBody:  { fontSize: 12.5, color: COLORS.textSecondary, marginTop: 3, lineHeight: 18 },
});

export default React.memo(SRAHomeView);
