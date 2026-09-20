// ══════════════════════════════════════════════════════════════
// HUGPONG Mobile — Farm Manager Home View Component
// Role: Block Farm Manager
// ══════════════════════════════════════════════════════════════

import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS, SHADOW } from '../../theme';
import { operationLogs, users } from '../../data/dataStore';
import { useTranslation } from '../../services/i18n';

function ManagerHomeView({
  session = {},
  fields = [],
  blockFarms = [],
  navigation,
  onManualSync
}) {
  const { t, formatStageName } = useTranslation();
  const [showAllLogs, setShowAllLogs] = useState(false);
  const DISPLAY_LIMIT = 3;

  const managerUserId = session?.employeeId || session?.id || '';
  const managedFarmIds = new Set(blockFarms.filter(farm => farm.managerUserId === managerUserId).map(farm => farm.id));
  const targetFarm = blockFarms.find(farm => managedFarmIds.has(farm.id))?.name || 'Unassigned Block Farm';

  const { managedFields, totalHectares, totalOperationsCount, allFormattedLogs } = React.useMemo(() => {
    const mf = fields.filter(field => managedFarmIds.has(field.blockFarmId));
    const th = mf.reduce((sum, f) => sum + (Number(f.ha) || 0), 0);
    const mIds = mf.map(f => f.id);
    const fieldMap = Object.fromEntries(mf.map(f => [f.id, f]));

    // Strictly filter for current active cycle operations belonging to this block farm
    const farmLogs = operationLogs.filter(l => {
      if (!l) return false;
      if (l.status !== 'ACTIVE' || l.isDraft === true) return false;

      // Ensure block farm association
      return Boolean(l.fieldId && mIds.includes(l.fieldId));
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
  }, [fields, targetFarm, managerUserId]);

  // Identify members belonging to this farm who specifically need sync attention
  const membersNeedingAttention = React.useMemo(() => {
    const list = [];
    managedFields.forEach(f => {
      const member = users.find(u => (u.id || u.employeeId) === f.memberUserId);
      const lagDays = Number(f.syncLagDays || 0);
      const offlineCount = Number(f.offlineLogsCount || 0);
      const isOffline = f.synced === false;
      const isLagging = lagDays >= 3 || (f.lastSync && String(f.lastSync).includes('days')) || isOffline;
      const isCritical = lagDays >= 7;

      if (isCritical || isLagging || offlineCount > 0 || isOffline) {
        list.push({
          id: f.id,
          name: member?.name || member?.displayName || f.memberName || f.member || 'Block Member',
          phone: member?.phone || member?.contact || f.contact || '',
          ha: String(f.ha || f.areaHa || 0),
          stage: f.stage ? f.stage.split(':')[0] : 'In Progress',
          lagDays,
          lastSync: f.lastSync || (isLagging ? `${lagDays || 3}d ago` : 'Offline buffer'),
          offlineLogsCount: offlineCount,
          status: isCritical ? 'critical' : 'warning',
          statusLabel: isCritical ? `${lagDays || 7}d Critical Offline` : (offlineCount > 0 ? `${offlineCount} Offline Logs` : `${lagDays || 3}d Sync Lag`)
        });
      }
    });
    return list;
  }, [managedFields]);

  const handleCallMember = (m) => {
    const cleanPhone = (m.phone || '').replace(/[^0-9+]/g, '');
    Alert.alert(
      `${t('btn_call_member', 'Call Member')}: ${m.name}`,
      `${t('profile_mobile_contact', 'Mobile')}: ${m.phone || '0917-000-0004'}\n${t('field_plot', 'Plot')}: ${m.id} (${m.ha} Ha)\n${t('status', 'Status')}: ${m.statusLabel}\n\nDirect carrier dialer without SMS charges.`,
      [
        { text: t('btn_cancel', 'Cancel'), style: 'cancel' },
        {
          text: t('btn_call_now', 'Call Now'),
          onPress: async () => {
            const telUrl = `tel:${cleanPhone || '09170000004'}`;
            try {
              const supported = await Linking.canOpenURL(telUrl);
              if (supported) await Linking.openURL(telUrl);
              else Alert.alert('Dialer Info', `Dialing ${m.name} at ${m.phone || '0917-000-0004'}...`);
            } catch (err) {
              Alert.alert('Notice', `Unable to launch phone dialer.`);
            }
          }
        }
      ]
    );
  };

  const handleTakeoverField = (m) => {
    navigation.navigate('Field Ops', {
      screen: 'SchedMain',
      params: { takeOverFieldId: m.id, requestTakeOver: true }
    });
  };

  const displayedLogs = showAllLogs ? allFormattedLogs : allFormattedLogs.slice(0, DISPLAY_LIMIT);

  return (
    <View style={s.container}>
      {/* ── Modernized Farm Overview Card ── */}
      <View style={s.summaryCard}>
        <View style={s.summaryHeader}>
          <View style={{ flex: 1, marginRight: 10 }}>
            <Text style={s.farmName} numberOfLines={1}>{session?.farm || (session?.farm || session?.blockFarm || 'District Central')}</Text>
            <View style={s.managerPill}>
              <Ionicons name="shield-checkmark" size={11} color={COLORS.primary} />
              <Text style={s.managerTag}>
                Supervising: <Text style={{ fontWeight: '700', color: COLORS.text }}>{session?.name || 'Manager'}</Text>
              </Text>
            </View>
          </View>
          <View style={s.totalBadge}>
            <Ionicons name="leaf" size={13} color={COLORS.primary} style={{ marginRight: 5 }} />
            <Text style={s.totalHa}>{totalHectares.toFixed(2)} Ha</Text>
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

          <TouchableOpacity 
            style={s.statBox}
            onPress={() => navigation.navigate('SyncMonitor')}
            activeOpacity={0.7}
          >
            <View style={s.statIconRow}>
              <Ionicons name="cloud-done-outline" size={13} color={COLORS.success} />
              <Text style={[s.statNumber, { color: COLORS.success }]}>100%</Text>
            </View>
            <Text style={s.statLabel}>{t('sync_state', 'Sync State')}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Members Needing Sync Attention (Only lagging or offline plots) ── */}
      {membersNeedingAttention.length > 0 ? (
        <View style={s.attentionSection}>
          <View style={s.sectionHeader}>
            <View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={[s.sectionTitle, { color: '#B91C1C' }]}>{t('sync_attention_title', 'Sync Attention Required')}</Text>
                <View style={[s.countBadge, { backgroundColor: '#FEE2E2', borderColor: '#FCA5A5' }]}>
                  <Text style={[s.countBadgeText, { color: '#B91C1C' }]}>{membersNeedingAttention.length}</Text>
                </View>
              </View>
              <Text style={s.sectionSubtitle}>
                {t('sync_attention_sub', 'Member plots requiring offline sync follow-up')}
              </Text>
            </View>
            <TouchableOpacity onPress={() => navigation.navigate('SyncMonitor')} activeOpacity={0.7} style={{ minHeight: 36, justifyContent: 'center' }}>
              <Text style={[s.seeAllText, { color: '#B91C1C' }]}>{t('sync_monitor_link', 'Monitor All')} →</Text>
            </TouchableOpacity>
          </View>

          {membersNeedingAttention.map(m => (
            <View key={m.id} style={[s.attentionCard, m.status === 'critical' ? s.attentionCardCritical : s.attentionCardWarning]}>
              <View style={s.attentionTopRow}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                  <View style={[s.attentionAvatar, m.status === 'critical' ? { backgroundColor: '#FEE2E2' } : { backgroundColor: '#FEF3C7' }]}>
                    <Text style={[s.attentionAvatarText, m.status === 'critical' ? { color: '#DC2626' } : { color: '#D97706' }]}>
                      {m.name.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.attentionMemberName} numberOfLines={1}>{m.name}</Text>
                    <Text style={s.attentionPlotId}>
                      {m.id} <Text style={{ color: COLORS.textMuted, fontWeight: '500' }}>· {m.ha} Ha</Text>
                    </Text>
                  </View>
                </View>
                <View style={[s.attentionStatusBadge, m.status === 'critical' ? { backgroundColor: '#FEE2E2', borderColor: '#FCA5A5' } : { backgroundColor: '#FEF3C7', borderColor: '#FCD34D' }]}>
                  <Ionicons name={m.status === 'critical' ? 'alert-circle' : 'time-outline'} size={12} color={m.status === 'critical' ? '#DC2626' : '#D97706'} />
                  <Text style={[s.attentionStatusText, { color: m.status === 'critical' ? '#DC2626' : '#D97706' }]}>
                    {m.statusLabel}
                  </Text>
                </View>
              </View>

              <View style={s.attentionMetaRow}>
                <Text style={s.attentionMetaText}>Stage: <Text style={{ fontWeight: '700', color: COLORS.text }}>{m.stage}</Text></Text>
                <Text style={s.attentionMetaText}>Last Synced: <Text style={{ fontWeight: '700', color: COLORS.textSecondary }}>{m.lastSync}</Text></Text>
              </View>

              <View style={s.attentionActionRow}>
                <TouchableOpacity
                  style={s.attentionCallBtn}
                  onPress={() => handleCallMember(m)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="call-outline" size={15} color={COLORS.text} />
                  <Text style={s.attentionCallBtnText}>{t('btn_call_member', 'Call Member')}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={s.attentionTakeoverBtn}
                  onPress={() => handleTakeoverField(m)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="shield-checkmark-outline" size={15} color={COLORS.primary} />
                  <Text style={s.attentionTakeoverBtnText}>{t('btn_take_over', 'Take Over Plot')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>
      ) : (
        <TouchableOpacity
          style={s.allSyncedBanner}
          onPress={() => navigation.navigate('SyncMonitor')}
          activeOpacity={0.8}
        >
          <View style={s.allSyncedIconWrap}>
            <Ionicons name="checkmark-circle" size={20} color={COLORS.success} />
          </View>
          <View style={{ flex: 1, paddingRight: 8 }}>
            <Text style={s.allSyncedTitle}>{t('all_members_healthy_title', 'All Member Plots Synced & Healthy')}</Text>
            <Text style={s.allSyncedSub}>{t('all_members_healthy_sub', 'No member plots require offline sync intervention.')}</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
        </TouchableOpacity>
      )}

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
        <TouchableOpacity onPress={() => navigation.navigate('Field Ops')} activeOpacity={0.7} style={{ minHeight: 36, justifyContent: 'center' }}>
          <Text style={s.seeAllText}>{t('view_field_ops', 'Field Ops')} →</Text>
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
                <Text style={s.costText}>₱{Number(item.cost || 0).toLocaleString()}</Text>
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
  farmName: { fontSize: 18, fontWeight: '900', color: COLORS.text, letterSpacing: -0.2 },
  managerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F2F7EF',
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: RADIUS.full,
    alignSelf: 'flex-start',
    marginTop: 5,
    borderWidth: 1,
    borderColor: '#DEEBD8'
  },
  managerTag: { fontSize: 12, color: COLORS.textSecondary },
  totalBadge: { 
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0F8EC', 
    paddingHorizontal: 12, 
    paddingVertical: 6, 
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: '#C8E6C9',
    alignSelf: 'flex-start'
  },
  totalHa: { fontSize: 14.5, fontWeight: '900', color: COLORS.primary },

  attentionSection: {
    marginBottom: SPACING.md,
  },
  attentionCard: {
    backgroundColor: '#FFF',
    borderRadius: RADIUS.lg,
    padding: 13,
    borderWidth: 1.2,
    marginBottom: 8,
    gap: 8,
    ...SHADOW.card,
  },
  attentionCardWarning: {
    borderColor: '#FCD34D',
    backgroundColor: '#FFFEFA',
  },
  attentionCardCritical: {
    borderColor: '#FCA5A5',
    backgroundColor: '#FFF9F9',
  },
  attentionTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  attentionAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  attentionAvatarText: {
    fontSize: 15,
    fontWeight: '800',
  },
  attentionMemberName: {
    fontSize: 14.5,
    fontWeight: '800',
    color: COLORS.text,
  },
  attentionPlotId: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.primary,
    marginTop: 1,
  },
  attentionStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: RADIUS.full,
    borderWidth: 1,
  },
  attentionStatusText: {
    fontSize: 11,
    fontWeight: '800',
  },
  attentionMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
    borderTopWidth: 1,
    borderTopColor: '#F0F4EC',
  },
  attentionMetaText: {
    fontSize: 12,
    color: COLORS.textMuted,
  },
  attentionActionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 2,
  },
  attentionCallBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#F8FAF6',
    borderWidth: 1.2,
    borderColor: '#D0DBC9',
    borderRadius: RADIUS.md,
    paddingVertical: 10,
    minHeight: 44,
  },
  attentionCallBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.text,
  },
  attentionTakeoverBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#F0F8EC',
    borderWidth: 1.2,
    borderColor: COLORS.primary,
    borderRadius: RADIUS.md,
    paddingVertical: 10,
    minHeight: 44,
  },
  attentionTakeoverBtnText: {
    fontSize: 13,
    fontWeight: '900',
    color: COLORS.primary,
  },
  allSyncedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5FAF3',
    borderRadius: RADIUS.lg,
    padding: 12,
    borderWidth: 1,
    borderColor: '#DCEDD7',
    marginBottom: SPACING.md,
    ...SHADOW.sm,
  },
  allSyncedIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#E8F5E4',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  allSyncedTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#15803D',
  },
  allSyncedSub: {
    fontSize: 11.5,
    color: COLORS.textMuted,
    marginTop: 1,
  },

  quickStatsRow: { flexDirection: 'row', gap: 8 },
  statBox: { 
    flex: 1, 
    alignItems: 'center',
    backgroundColor: '#F7FAF5',
    borderRadius: RADIUS.md,
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderWidth: 1,
    borderColor: '#E5EDE0'
  },
  statIconRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 2 },
  statNumber: { fontSize: 18, fontWeight: '900', color: COLORS.text },
  statLabel: { fontSize: 11, color: COLORS.textMuted, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.3 },

  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.sm, marginTop: 6 },
  sectionTitle: { fontSize: 15.5, fontWeight: '800', color: COLORS.text },
  sectionSubtitle: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  seeAllText: { fontSize: 13.5, fontWeight: '800', color: COLORS.primary },

  logItemCard: {
    backgroundColor: '#FFF',
    padding: 13,
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
    paddingHorizontal: 7, 
    paddingVertical: 2.5, 
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#D7ECD1'
  },
  plotBadgeText: { fontSize: 12, fontWeight: '800', color: COLORS.primary },
  memberName: { fontSize: 13, color: COLORS.textSecondary, fontWeight: '600', flexShrink: 1 },
  dateBadge: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  dateText: { fontSize: 11.5, fontWeight: '600', color: COLORS.textMuted },
  logMidRow: { marginBottom: 6 },
  opNameText: { fontSize: 14.5, fontWeight: '700', color: COLORS.text },
  logBottomRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  stagePill: { backgroundColor: '#F3F6F0', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4 },
  stagePillText: { fontSize: 11.5, fontWeight: '700', color: COLORS.textSecondary },
  costGroup: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  costText: { fontSize: 15, fontWeight: '900', color: COLORS.primary },

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
  emptyTitle: { fontSize: 14, fontWeight: '800', color: COLORS.text, marginTop: 4 },
  emptySub: { fontSize: 12, color: COLORS.textMuted, textAlign: 'center', lineHeight: 17 },

  countBadge: {
    backgroundColor: '#F0F8EC',
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: '#D7ECD1'
  },
  countBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.primary
  },
  toggleExpandBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#F7FAF5',
    borderWidth: 1.5,
    borderColor: '#E5EDE0',
    borderRadius: RADIUS.md,
    paddingVertical: 11,
    paddingHorizontal: 14,
    minHeight: 44,
    marginTop: 4,
    marginBottom: 8
  },
  toggleExpandText: {
    fontSize: 13.5,
    fontWeight: '800',
    color: COLORS.primary
  }
});

export default React.memo(ManagerHomeView);
