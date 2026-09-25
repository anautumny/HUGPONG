import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, RADIUS, SHADOW, SPACING } from '../../theme';
import { operationLogs } from '../../data/dataStore';
import { sortOperationsNewestFirst } from '../../utils/dataHelpers';
import { useTranslation } from '../../services/i18n';
import { fetchAgriculturalSyncMonitor } from '../../services/telemetryService';
import { SUGARCANE_STAGES } from '../../constants/cropStages';

function summarizeCropStages(cycles) {
  const counts = new Map();
  cycles.forEach(cycle => {
    const stageNumber = Number(cycle.currentStageNumber);
    if (!Number.isInteger(stageNumber)) return;
    counts.set(stageNumber, (counts.get(stageNumber) || 0) + 1);
  });

  const summaries = [...counts.entries()]
    .sort(([left], [right]) => left - right)
    .map(([stageNumber, count]) => {
      const stage = SUGARCANE_STAGES.find(item => item.stageNumber === stageNumber);
      return `${count} ${stage?.shortName || `Stage ${stageNumber}`}`;
    });

  return summaries.length > 0
    ? `Current stages: ${summaries.join(', ')}.`
    : 'Current stages have not been recorded.';
}

export default function ManagerHomeView({ session = {}, fields = [], cropCycles = [], blockFarms = [], navigation }) {
  const { t } = useTranslation();
  const [showAllLogs, setShowAllLogs] = React.useState(false);
  const [activityMonitor, setActivityMonitor] = React.useState(null);
  const [activityError, setActivityError] = React.useState('');
  const managerUserId = session.employeeId || session.id || '';
  const managedFarms = blockFarms.filter(farm => farm.managerUserId === managerUserId);
  const managedFarmIds = new Set(managedFarms.map(farm => farm.id));
  const managedFields = fields.filter(field => managedFarmIds.has(field.blockFarmId));
  const managedFieldIds = new Set(managedFields.map(field => field.id));
  const totalHectares = managedFields.reduce((sum, field) => sum + Number(field.ha || 0), 0);
  const logs = sortOperationsNewestFirst(operationLogs.filter(log =>
    log?.status === 'ACTIVE'
    && log.isDraft !== true
    && managedFieldIds.has(log.fieldId)
  ));
  const visibleLogs = showAllLogs ? logs : logs.slice(0, 3);
  const farmName = managedFarms.map(farm => farm.name).filter(Boolean).join(', ') || 'Unassigned Block Farm';
  const activeCropCycles = cropCycles.filter(cycle => (
    cycle.status === 'ACTIVE' && managedFields.some(field => field.currentCycleId === cycle.id)
  ));
  const cropCycleDescription = managedFields.length === 0
    ? 'Register a member plot before starting a Crop Year Cycle.'
    : activeCropCycles.length === 0
      ? 'No active Crop Year Cycle is recorded for the assigned plots.'
      : summarizeCropStages(activeCropCycles);
  const memberActivity = activityMonitor?.subjects?.filter(account => !account.isSelf) || [];
  const attentionAccounts = memberActivity.filter(account => account.activity?.attentionStatus === 'NEEDS_ATTENTION');
  const criticalAccounts = memberActivity.filter(account => account.activity?.attentionStatus === 'CRITICAL');
  const issueAccounts = [...criticalAccounts, ...attentionAccounts];
  const issueNames = issueAccounts.map(account => account.displayName).filter(Boolean);
  const activityTitle = criticalAccounts.length > 0
    ? `${criticalAccounts.length} Critical Member Account${criticalAccounts.length === 1 ? '' : 's'}`
    : attentionAccounts.length > 0
      ? `${attentionAccounts.length} Member Account${attentionAccounts.length === 1 ? '' : 's'} Need Attention`
      : 'Member Activity Status';
  const activityDescription = activityError
    ? 'Member activity status is unavailable. Open the monitor to retry.'
    : issueNames.length > 0
      ? `${issueNames.slice(0, 3).join(', ')}${issueNames.length > 3 ? ` and ${issueNames.length - 3} more` : ''}`
      : 'All assigned members are within the expected activity window.';

  const refreshMemberActivity = React.useCallback(async () => {
    try {
      setActivityMonitor(await fetchAgriculturalSyncMonitor());
      setActivityError('');
    } catch (error) {
      setActivityError(error.message || 'Member activity status is unavailable.');
    }
  }, []);

  React.useEffect(() => {
    const unsubscribe = navigation.addListener('focus', refreshMemberActivity);
    if (navigation.isFocused?.()) refreshMemberActivity();
    return unsubscribe;
  }, [navigation, refreshMemberActivity]);

  return (
    <View style={s.container}>
      <View style={s.summaryCard}>
        <Text style={s.eyebrow}>MANAGER WORKSPACE</Text>
        <Text style={s.farmName}>{farmName}</Text>
        <Text style={s.managerName}>Supervising: {session.name || 'Farm Manager'}</Text>
        <View style={s.metrics}>
          <Metric value={managedFields.length} label={t('active_plots', 'Active Plots')} />
          <Metric value={logs.length} label={t('logged_ops', 'Logged Ops')} />
          <Metric value={`${totalHectares.toFixed(2)} Ha`} label="Managed Area" />
        </View>
      </View>

      <View style={s.cycleCard}>
        <Text style={s.cycleLabel}>CROP YEAR CYCLES</Text>
        <View style={s.cycleSummary}>
          <Text style={s.cycleValue}>{activeCropCycles.length} Active</Text>
          <Text style={s.cycleCoverage}>{activeCropCycles.length}/{managedFields.length} plots</Text>
        </View>
        <Text style={s.cycleDescription}>{cropCycleDescription}</Text>
      </View>

      <TouchableOpacity style={s.syncCard} onPress={() => navigation.navigate('SyncMonitor')} activeOpacity={0.8}>
        <View style={s.syncIcon}><Ionicons name="pulse-outline" size={21} color={COLORS.primary} /></View>
        <View style={{ flex: 1 }}>
          <Text style={s.syncTitle}>{activityTitle}</Text>
          <Text style={s.syncSub}>{activityDescription}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
      </TouchableOpacity>

      <View style={s.sectionHeader}>
        <View>
          <Text style={s.sectionTitle}>{t('recent_field_activity', 'Latest Field Activity & Logs')}</Text>
          <Text style={s.sectionSub}>{logs.length} active-cycle operation{logs.length === 1 ? '' : 's'}</Text>
        </View>
        <TouchableOpacity onPress={() => navigation.navigate('Field Ops')}>
          <Text style={s.link}>Field Ops →</Text>
        </TouchableOpacity>
      </View>

      {visibleLogs.length === 0 ? (
        <View style={s.emptyCard}>
          <Text style={s.emptyTitle}>No submitted field operations yet</Text>
          <Text style={s.emptySub}>Activity from assigned Block Farm fields will appear here.</Text>
        </View>
      ) : visibleLogs.map(log => {
        const field = managedFields.find(item => item.id === log.fieldId);
        return (
          <TouchableOpacity key={log.id} style={s.logCard} onPress={() => navigation.navigate('Field Ops')} activeOpacity={0.8}>
            <View style={{ flex: 1 }}>
              <Text style={s.logTitle}>{log.activity || log.operationName || 'Field Operation'}</Text>
              <Text style={s.logMeta}>{field?.member || log.loggedBy || 'Farm Member'} · {log.fieldId}</Text>
              <Text style={s.logDate}>{log.period || log.date || 'Recent'}</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
          </TouchableOpacity>
        );
      })}

      {logs.length > 3 ? (
        <TouchableOpacity style={s.showButton} onPress={() => setShowAllLogs(value => !value)}>
          <Text style={s.showText}>{showAllLogs ? 'Show Latest 3' : `Show All ${logs.length}`}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function Metric({ value, label }) {
  return (
    <View style={s.metric}>
      <Text style={s.metricValue}>{value}</Text>
      <Text style={s.metricLabel}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  container: { gap: 14, paddingBottom: 24 },
  summaryCard: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.xl, padding: SPACING.lg, ...SHADOW.sm },
  eyebrow: { fontSize: 10, fontWeight: '900', letterSpacing: 1, color: COLORS.primary },
  farmName: { fontSize: 20, fontWeight: '900', color: COLORS.text, marginTop: 4 },
  managerName: { fontSize: 12, color: COLORS.textMuted, marginTop: 3 },
  metrics: { flexDirection: 'row', gap: 8, marginTop: 16 },
  metric: { flex: 1, minHeight: 78, padding: 10, borderRadius: RADIUS.md, backgroundColor: COLORS.primaryBg, alignItems: 'center', justifyContent: 'center' },
  metricValue: { fontSize: 16, fontWeight: '900', color: COLORS.text, textAlign: 'center' },
  metricLabel: { fontSize: 9.5, color: COLORS.textMuted, marginTop: 2, textAlign: 'center' },
  cycleCard: { padding: 14, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.lg },
  cycleLabel: { fontSize: 10, fontWeight: '800', color: COLORS.textMuted, letterSpacing: 0.7 },
  cycleSummary: { marginTop: 6, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 },
  cycleValue: { fontSize: 18, fontWeight: '900', color: COLORS.text },
  cycleCoverage: { fontSize: 11, fontWeight: '700', color: COLORS.textMuted },
  cycleDescription: { marginTop: 5, fontSize: 11, lineHeight: 16, color: COLORS.textMuted },
  syncCard: { flexDirection: 'row', gap: 11, alignItems: 'center', padding: 14, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.lg },
  syncIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: COLORS.primaryBg, alignItems: 'center', justifyContent: 'center' },
  syncTitle: { fontSize: 14, fontWeight: '900', color: COLORS.text },
  syncSub: { fontSize: 10.5, lineHeight: 15, color: COLORS.textMuted, marginTop: 2 },
  sectionHeader: { marginTop: 5, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  sectionTitle: { fontSize: 15, fontWeight: '900', color: COLORS.text },
  sectionSub: { fontSize: 10.5, color: COLORS.textMuted, marginTop: 2 },
  link: { color: COLORS.primary, fontSize: 12, fontWeight: '800' },
  emptyCard: { padding: 25, alignItems: 'center', borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface },
  emptyTitle: { marginTop: 7, fontSize: 13, fontWeight: '800', color: COLORS.text },
  emptySub: { marginTop: 3, fontSize: 10.5, color: COLORS.textMuted, textAlign: 'center' },
  logCard: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 13, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface },
  logIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: COLORS.primaryBg, alignItems: 'center', justifyContent: 'center' },
  logTitle: { fontSize: 13, fontWeight: '800', color: COLORS.text },
  logMeta: { marginTop: 2, fontSize: 10.5, color: COLORS.textMuted },
  logDate: { marginTop: 2, fontSize: 10, color: COLORS.primary, fontWeight: '700' },
  showButton: { alignSelf: 'center', paddingHorizontal: 18, paddingVertical: 9, borderRadius: 999, backgroundColor: COLORS.primaryBg },
  showText: { color: COLORS.primary, fontSize: 11.5, fontWeight: '800' }
});
