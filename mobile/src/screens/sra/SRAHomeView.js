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
  const safeFields = Array.isArray(fields) ? fields : [];
  const safeBlockFarms = Array.isArray(blockFarms) ? blockFarms : [];
  const safeAuditReports = Array.isArray(auditReports) ? auditReports : [];

  const blockFarmsList = React.useMemo(() => {
    const list = safeBlockFarms;
    return list.map(bf => {
      const bfFields = safeFields.filter(f => f.blockFarmId === bf.id || f.blockFarm === bf.name || (bf.code && f.blockFarmId === bf.code));
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
        status: resolvedMgr === 'Pending Appointment' ? 'Pending Manager' : null
      };
    });
  }, [safeFields, safeBlockFarms]);

  const totalDistrictHa = React.useMemo(() => {
    return blockFarmsList.reduce((sum, f) => sum + (Number(f.ha) || 0), 0);
  }, [blockFarmsList]);

  const totalPlots = React.useMemo(() => {
    return blockFarmsList.reduce((s, f) => s + f.plots, 0);
  }, [blockFarmsList]);

  const complianceRate = React.useMemo(() => {
    if (safeAuditReports.length === 0) return 100;
    const actionable = safeAuditReports.filter(a => canonicalAuditStatus(a.status) === AUDIT_STATUS.PENDING_REVIEW).length;
    return actionable === 0 ? 100 : Math.max(0, Math.round(((safeAuditReports.length - actionable) / safeAuditReports.length) * 100));
  }, [safeAuditReports]);

  return (
    <View style={s.container}>

      {/* ── District Summary Card (matches Manager style) ── */}
      <View style={s.summaryCard}>
        <Text style={s.eyebrow}>SRA REGULATORY WORKSPACE</Text>
        <Text style={s.districtName}>{t('district_name_title', 'District 3 · Silay')}</Text>
        <Text style={s.adminName}>{t('profile_admin_role', 'Administrator')}: {session?.name || 'SRA Admin'}</Text>
        <View style={s.metrics}>
          <Metric value={blockFarmsList.length} label={t('block_farms_count_lbl', 'Block Farms')} />
          <Metric
            value={totalPlots}
            label={t('registered_plots_lbl', 'Registered Plots')}
            onPress={() => navigation.navigate('Field Ops')}
          />
          <Metric value={`${totalDistrictHa.toFixed(2)} Ha`} label={t('district_area_lbl', 'District Area')} />
          <Metric value={`${complianceRate}%`} label={t('compliance_lbl', 'Compliance')} />
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
                {farm.status && (
                  <View style={s.statusBadge}>
                    <Text style={s.statusText}>{farm.status}</Text>
                  </View>
                )}
              </View>
              <Text style={s.plotManager}>{t('manager_label', 'Manager')}: {farm.manager}</Text>
              <Text style={s.plotMeta}>{farm.plots} {t('member_plots_count', 'Farm Member Fields')} · New Plant: {farm.ha} Ha · Total: {farm.totalFarmHa} Ha</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
          </TouchableOpacity>
        ))}
      </View>

    </View>
  );
}

function Metric({ value, label, onPress }) {
  const content = (
    <>
      <Text style={s.metricValue}>{value}</Text>
      <Text style={s.metricLabel} numberOfLines={2}>{label}</Text>
    </>
  );

  if (onPress) {
    return (
      <TouchableOpacity style={s.metric} onPress={onPress} activeOpacity={0.7}>
        {content}
      </TouchableOpacity>
    );
  }

  return (
    <View style={s.metric}>
      {content}
    </View>
  );
}

const s = StyleSheet.create({
  container: { marginTop: 0 },

  // ── Summary Card ──
  summaryCard: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.xl,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    ...SHADOW.sm,
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
    color: COLORS.primary,
  },
  districtName: {
    fontSize: 20,
    fontWeight: '900',
    color: COLORS.text,
    marginTop: 4,
  },
  adminName: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 3,
  },
  metrics: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 16,
  },
  metric: {
    flex: 1,
    minHeight: 74,
    paddingHorizontal: 6,
    paddingVertical: 10,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.primaryBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricValue: {
    fontSize: 16,
    fontWeight: '900',
    color: COLORS.text,
    textAlign: 'center',
  },
  metricLabel: {
    fontSize: 9.5,
    color: COLORS.textMuted,
    marginTop: 2,
    textAlign: 'center',
  },

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
});

export default React.memo(SRAHomeView);
