// ══════════════════════════════════════════════════════════════
// HUGPONG Mobile — Farm Manager Home View Component
// Role: Block Farm Manager
// ══════════════════════════════════════════════════════════════

import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS, SHADOW } from '../../theme';
import { operationLogs } from '../../data/dataStore';
import { useTranslation } from '../../services/i18n';

function ManagerHomeView({
  session = {},
  fields = [],
  navigation,
  onManualSync
}) {
  const { t, formatStageName } = useTranslation();
  const [showAllLogs, setShowAllLogs] = useState(false);
  const DISPLAY_LIMIT = 3;

  const targetFarm = session?.farm || session?.blockFarm || 'Nacayao Block Farm';

  const { managedFields, totalHectares, totalOperationsCount, allFormattedLogs } = React.useMemo(() => {
    const mf = fields.filter(f => !f.blockFarm || f.blockFarm === targetFarm || f.blockFarm.includes('Nacayao') || f.blockFarmId === session?.blockFarmId);
    const th = mf.reduce((sum, f) => sum + (Number(f.ha) || 0), 0);
    const mIds = mf.map(f => f.id);
    const fieldMap = Object.fromEntries(mf.map(f => [f.id, f]));

    // Strictly filter for current active cycle operations belonging to this block farm
    const farmLogs = operationLogs.filter(l => {
      if (!l) return false;
      // Exclude past cycle archives, drafts, and certified past history
      if (l.isPastCycle === true || l.isPastCycle === 'true') return false;
      if (l.isArchived === true || l.isDeleted === true) return false;
      if (l.isDraft === true || l.status === 'Draft' || l.status === 'Certified') return false;
      if (typeof l.id === 'string' && (l.id.startsWith('PAST-') || l.id.startsWith('DFT-'))) return false;

      // Ensure block farm association
      const belongsToFarm = (l.blockFarm && (l.blockFarm === targetFarm || l.blockFarm.includes('Nacayao'))) || 
                            (l.fieldId && mIds.includes(l.fieldId)) || 
                            (!l.blockFarm && mIds.length === 0);
      return belongsToFarm;
    });
    const toc = farmLogs.length;

    // Sort descending by chronological date/timestamp, then ID
    const sorted = [...farmLogs].sort((a, b) => {
      const dateA = a.createdAt || a.date || a.period;
      const dateB = b.createdAt || b.date || b.period;
      const timeA = dateA ? new Date(dateA).getTime() : 0;
      const timeB = dateB ? new Date(dateB).getTime() : 0;
      if (!isNaN(timeA) && !isNaN(timeB) && timeB !== timeA) {
        return timeB - timeA;
      }
      return (b.id || '').localeCompare(a.id || '');
    });

    const formatted = sorted.map(log => {
      const f = fieldMap[log.fieldId];
      const memberName = f?.member || (log.loggedBy ? log.loggedBy.replace(/\s*\(.*?\)/, '') : 'Block Member');
      const opName = log.activity || log.operationName || 'Field Operation';
      const cost = Number(log.totalCost || log.cost || 0);
      const stageName = log.stageName ? log.stageName.split(':')[0].trim() : (f ? f.stage : '');
      return {
        ...log,
        memberName,
        fieldHa: f?.ha || log.hectares,
        opName,
        cost,
        displayDate: log.period || log.date || 'Recent',
        stageShort: stageName
      };
    });

    return {
      managedFields: mf,
      totalHectares: th,
      totalOperationsCount: toc,
      allFormattedLogs: formatted
    };
  }, [fields, targetFarm]);

  const displayedLogs = showAllLogs ? allFormattedLogs : allFormattedLogs.slice(0, DISPLAY_LIMIT);

  return (
    <View style={s.container}>
      {/* ── Modernized Farm Overview Card ── */}
      <View style={s.summaryCard}>
        <View style={s.summaryHeader}>
          <View style={{ flex: 1, marginRight: 10 }}>
            <Text style={s.farmName} numberOfLines={1}>{session?.farm || 'Nacayao Block Farm'}</Text>
            <View style={s.managerPill}>
              <Ionicons name="shield-checkmark" size={11} color={COLORS.primary} />
              <Text style={s.managerTag}>
                Supervising: <Text style={{ fontWeight: '700', color: COLORS.text }}>{session?.name || 'Manager'}</Text>
              </Text>
            </View>
          </View>
          <View style={s.totalBadge}>
            <Text style={s.totalHa}>{totalHectares.toFixed(2)} Ha</Text>
            <Text style={s.totalPlots}>{managedFields.length} Member Plots</Text>
          </View>
        </View>

        {/* 3 Refined Metric Boxes */}
        <View style={s.quickStatsRow}>
          <View style={s.statBox}>
            <View style={s.statIconRow}>
              <Ionicons name="grid-outline" size={13} color={COLORS.primary} />
              <Text style={s.statNumber}>{managedFields.length}</Text>
            </View>
            <Text style={s.statLabel}>{t('active_plots', 'Active Plots')}</Text>
          </View>

          <TouchableOpacity 
            style={s.statBox}
            onPress={() => navigation.navigate('Field Ops')}
            activeOpacity={0.7}
          >
            <View style={s.statIconRow}>
              <Ionicons name="receipt-outline" size={13} color={COLORS.primary} />
              <Text style={[s.statNumber, { color: COLORS.primary }]}>
                {totalOperationsCount}
              </Text>
            </View>
            <Text style={s.statLabel}>{t('logged_ops', 'Logged Ops')}</Text>
          </TouchableOpacity>

          <View style={s.statBox}>
            <View style={s.statIconRow}>
              <Ionicons name="cloud-done-outline" size={13} color={COLORS.success} />
              <Text style={[s.statNumber, { color: COLORS.success }]}>100%</Text>
            </View>
            <Text style={s.statLabel}>{t('sync_state', 'Sync State')}</Text>
          </View>
        </View>
      </View>

      {/* ── Latest Field Activity Feed Header ── */}
      <View style={s.sectionHeader}>
        <View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={s.sectionTitle}>{t('recent_field_activity', 'Latest Field Activity & Logs')}</Text>
            {allFormattedLogs.length > 0 && (
              <View style={s.countBadge}>
                <Text style={s.countBadgeText}>{displayedLogs.length} of {allFormattedLogs.length}</Text>
              </View>
            )}
          </View>
          <Text style={s.sectionSubtitle}>
            {showAllLogs ? `All ${allFormattedLogs.length} active cycle operations` : `Top ${displayedLogs.length} most recent operations`}
          </Text>
        </View>
        <TouchableOpacity onPress={() => navigation.navigate('Field Ops')} activeOpacity={0.7}>
          <Text style={s.seeAllText}>{t('take_over_desk', 'Take Over Desk')} →</Text>
        </TouchableOpacity>
      </View>

      {/* ── Latest Actual Operation Logs Feed ── */}
      {displayedLogs.length === 0 ? (
        <View style={s.emptyCard}>
          <Ionicons name="clipboard-outline" size={28} color={COLORS.textMuted} />
          <Text style={s.emptyTitle}>{t('no_logs_recorded', 'No Field Operations Logged Yet')}</Text>
          <Text style={s.emptySub}>Operations logged by members or manager will appear here chronologically.</Text>
        </View>
      ) : (
        displayedLogs.map(item => (
          <TouchableOpacity
            key={item.id}
            style={s.logItemCard}
            onPress={() => navigation.navigate('Field Ops', { screen: 'SchedMain', params: { fieldId: item.fieldId }, fieldId: item.fieldId })}
            activeOpacity={0.75}
          >
            {/* Top row: Plot Badge + Member Name + Date */}
            <View style={s.logTopRow}>
              <View style={s.plotBadge}>
                <Ionicons name="leaf" size={10} color={COLORS.primary} />
                <Text style={s.plotBadgeText}>{item.fieldId}</Text>
              </View>
              <Text style={s.memberName} numberOfLines={1}>· {item.memberName}</Text>
              <View style={{ flex: 1 }} />
              <View style={s.dateBadge}>
                <Ionicons name="calendar-outline" size={10} color={COLORS.textMuted} />
                <Text style={s.dateText}>{item.displayDate}</Text>
              </View>
            </View>

            {/* Middle row: Activity / Operation Name */}
            <View style={s.logMidRow}>
              <Text style={s.opNameText} numberOfLines={1}>{item.opName}</Text>
            </View>

            {/* Bottom row: Stage badge + Cost + Arrow */}
            <View style={s.logBottomRow}>
              {item.stageShort ? (
                <View style={s.stagePill}>
                  <Text style={s.stagePillText}>{item.stageShort}</Text>
                </View>
              ) : <View />}
              <View style={s.costGroup}>
                <Text style={s.costText}>₱{item.cost.toLocaleString()}</Text>
                <Ionicons name="chevron-forward" size={14} color={COLORS.textMuted} />
              </View>
            </View>
          </TouchableOpacity>
        ))
      )}

      {/* ── View All / Show Less Toggle Button ── */}
      {allFormattedLogs.length > DISPLAY_LIMIT && (
        <TouchableOpacity 
          style={s.toggleExpandBtn}
          onPress={() => setShowAllLogs(prev => !prev)}
          activeOpacity={0.75}
        >
          <Text style={s.toggleExpandText}>
            {showAllLogs 
              ? t('show_less_recent', 'Show Less (Top 3 Recent)') 
              : `${t('view_all_logs', 'View All')} ${allFormattedLogs.length} ${t('operations_logged', 'Operations')} (${allFormattedLogs.length - DISPLAY_LIMIT} older)`}
          </Text>
          <Ionicons name={showAllLogs ? "chevron-up" : "chevron-down"} size={14} color={COLORS.primary} />
        </TouchableOpacity>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { marginTop: 0 },
  summaryCard: {
    backgroundColor: '#FFF',
    borderRadius: RADIUS.xl,
    padding: SPACING.md + 2,
    borderWidth: 1.2,
    borderColor: '#E5EDE0',
    marginBottom: SPACING.md,
    ...SHADOW.card
  },
  summaryHeader: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'flex-start', 
    marginBottom: SPACING.sm + 4 
  },
  farmName: { fontSize: 17, fontWeight: '900', color: COLORS.text, letterSpacing: -0.2 },
  managerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F2F7EF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADIUS.full,
    alignSelf: 'flex-start',
    marginTop: 5,
    borderWidth: 1,
    borderColor: '#DEEBD8'
  },
  managerTag: { fontSize: 11, color: COLORS.textSecondary },
  totalBadge: { 
    alignItems: 'flex-end', 
    backgroundColor: '#F0F8EC', 
    paddingHorizontal: 10, 
    paddingVertical: 5, 
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: '#C8E6C9'
  },
  totalHa: { fontSize: 13.5, fontWeight: '900', color: COLORS.primary },
  totalPlots: { fontSize: 10.5, fontWeight: '600', color: COLORS.textSecondary, marginTop: 1 },

  quickStatsRow: { flexDirection: 'row', gap: 8 },
  statBox: { 
    flex: 1, 
    alignItems: 'center',
    backgroundColor: '#F7FAF5',
    borderRadius: RADIUS.md,
    paddingVertical: 9,
    paddingHorizontal: 6,
    borderWidth: 1,
    borderColor: '#E5EDE0'
  },
  statIconRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 2 },
  statNumber: { fontSize: 16, fontWeight: '800', color: COLORS.text },
  statLabel: { fontSize: 10, color: COLORS.textMuted, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.3 },

  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.sm, marginTop: 4 },
  sectionTitle: { fontSize: 14, fontWeight: '800', color: COLORS.text },
  sectionSubtitle: { fontSize: 11, color: COLORS.textMuted, marginTop: 1 },
  seeAllText: { fontSize: 12, fontWeight: '700', color: COLORS.primary },

  logItemCard: {
    backgroundColor: '#FFF',
    padding: 12,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: '#E8EFE5',
    marginBottom: 8,
    ...SHADOW.card
  },
  logTopRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 5 },
  plotBadge: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: 4, 
    backgroundColor: '#F0F8EC', 
    paddingHorizontal: 6, 
    paddingVertical: 2, 
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#D7ECD1'
  },
  plotBadgeText: { fontSize: 11, fontWeight: '800', color: COLORS.primary },
  memberName: { fontSize: 12, color: COLORS.textSecondary, fontWeight: '600', flexShrink: 1 },
  dateBadge: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  dateText: { fontSize: 10.5, fontWeight: '600', color: COLORS.textMuted },
  logMidRow: { marginBottom: 6 },
  opNameText: { fontSize: 13, fontWeight: '700', color: COLORS.text },
  logBottomRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  stagePill: { backgroundColor: '#F3F6F0', paddingHorizontal: 7, paddingVertical: 2.5, borderRadius: 4 },
  stagePillText: { fontSize: 10, fontWeight: '700', color: COLORS.textSecondary },
  costGroup: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  costText: { fontSize: 13.5, fontWeight: '900', color: COLORS.primary },

  emptyCard: {
    backgroundColor: '#FFF',
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E8EFE5',
    gap: 4,
    marginBottom: 8
  },
  emptyTitle: { fontSize: 13.5, fontWeight: '800', color: COLORS.text, marginTop: 4 },
  emptySub: { fontSize: 11.5, color: COLORS.textMuted, textAlign: 'center', lineHeight: 16 },

  countBadge: {
    backgroundColor: '#F0F8EC',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: '#D7ECD1'
  },
  countBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.primary
  },
  toggleExpandBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#F7FAF5',
    borderWidth: 1,
    borderColor: '#E5EDE0',
    borderRadius: RADIUS.md,
    paddingVertical: 9,
    paddingHorizontal: 12,
    marginTop: 2,
    marginBottom: 8
  },
  toggleExpandText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.primary
  }
});

export default React.memo(ManagerHomeView);
