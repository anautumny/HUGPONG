import React from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, RADIUS, SHADOW, SPACING } from '../theme';
import { getCurrentSession, getNetworkStatus, performMobileSync, subscribe } from '../data/dataStore';
import { getOutboxDiagnostics } from '../services/syncEngine';
import { fetchAgriculturalSyncMonitor } from '../services/telemetryService';
import { syncResultMessage } from '../domain/syncPresentation';

const PH_TIME = new Intl.DateTimeFormat('en-PH', {
  timeZone: 'Asia/Manila',
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit'
});

function formatTime(value, fallback = 'Not reported') {
  if (!value) return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : PH_TIME.format(date);
}

function formatActivity(value) {
  if (!value) return 'Not reported';
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return 'Not reported';
  const minutes = Math.max(0, Math.floor((Date.now() - time) / 60000));
  if (minutes < 2) return 'Active recently';
  if (minutes < 60) return `${minutes} minutes ago`;
  return formatTime(value);
}

function statusLabel(sync = {}) {
  if (Number(sync.failedMutationCount || 0) > 0 || sync.state === 'SYNC_FAILED') return `${sync.failedMutationCount || ''} Sync Failed`.trim();
  if (Number(sync.pendingMutationCount || 0) > 0 || sync.state === 'PENDING_SYNC') return `${sync.pendingMutationCount || 0} Pending`;
  if (sync.state === 'SYNCING') return 'Syncing';
  if (sync.state === 'UP_TO_DATE') return 'Up to Date';
  return 'Not Reported';
}

function activityStatusLabel(activity = {}) {
  const days = Number.isFinite(Number(activity.inactiveDays)) ? Number(activity.inactiveDays) : null;
  if (activity.attentionStatus === 'CRITICAL') return days == null ? 'Activity Unknown' : `${days} Days Inactive`;
  if (activity.attentionStatus === 'NEEDS_ATTENTION') return days == null ? 'Activity Not Reported' : `${days} Days Inactive`;
  if (!activity.lastActiveAt && activity.basedOn === 'ACCOUNT_CREATED') return 'New Account';
  return 'Within 3-Day Window';
}

function StatusRow({ label, value }) {
  return (
    <View style={s.row}>
      <Text style={s.rowLabel}>{label}</Text>
      <Text style={s.rowValue}>{value}</Text>
    </View>
  );
}

export default function SyncMonitorScreen({ navigation }) {
  const [session, setSession] = React.useState(getCurrentSession());
  const [monitor, setMonitor] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [isSyncing, setIsSyncing] = React.useState(false);
  const [localRevision, setLocalRevision] = React.useState(0);
  const role = session?.role;
  const allowed = role === 'Farm Manager' || role === 'Farm Member';

  const refresh = React.useCallback(async () => {
    if (!allowed) {
      setLoading(false);
      return;
    }
    try {
      const data = await fetchAgriculturalSyncMonitor();
      setMonitor(data);
      setError('');
    } catch (refreshError) {
      setError(refreshError.message || 'Synchronization status is unavailable.');
    } finally {
      setLoading(false);
    }
  }, [allowed]);

  React.useEffect(() => subscribe(() => {
    setSession({ ...getCurrentSession() });
    setLocalRevision(value => value + 1);
  }), []);

  React.useEffect(() => {
    let timer = null;
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };
    const start = () => {
      stop();
      refresh();
      timer = setInterval(refresh, 30000);
    };
    const unsubscribeFocus = navigation.addListener('focus', start);
    const unsubscribeBlur = navigation.addListener('blur', stop);
    if (navigation.isFocused?.()) start();
    return () => {
      stop();
      unsubscribeFocus();
      unsubscribeBlur();
    };
  }, [navigation, refresh]);

  const outbox = React.useMemo(() => getOutboxDiagnostics(), [localRevision]);
  const localPending = outbox.length;
  const localFailed = outbox.filter(item => !['queued', 'retryable'].includes(item.status)).length;
  const own = monitor?.subjects?.find(subject => subject.isSelf) || null;
  const members = monitor?.subjects?.filter(subject => !subject.isSelf) || [];
  const ownSync = {
    ...(own?.sync || {}),
    pendingMutationCount: localPending,
    failedMutationCount: localFailed,
    state: localFailed > 0 ? 'SYNC_FAILED' : localPending > 0 ? 'PENDING_SYNC' : own?.sync?.state || 'UNKNOWN'
  };

  const handleSync = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      const result = await performMobileSync('MANUAL_SYNC');
      await refresh();
      Alert.alert(result.success ? 'Sync Complete' : 'Sync Incomplete', syncResultMessage(result));
    } finally {
      setIsSyncing(false);
    }
  };

  if (!allowed) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}><Ionicons name="arrow-back" size={22} color={COLORS.text} /></TouchableOpacity>
          <Text style={s.headerTitle}>Sync Monitor</Text><View style={{ width: 22 }} />
        </View>
        <View style={s.center}><Text style={s.emptyTitle}>Agricultural Sync Monitor is not available for this role.</Text></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}><Ionicons name="arrow-back" size={22} color={COLORS.text} /></TouchableOpacity>
        <View style={{ alignItems: 'center' }}>
          <Text style={s.headerTitle}>{role === 'Farm Manager' ? 'Sync Monitor' : 'My Sync Status'}</Text>
          <Text style={s.headerSub}>{monitor?.scope?.blockFarms?.map(farm => farm.name).join(', ') || 'Personal device status'}</Text>
        </View>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={s.content}>
        {error ? <View style={s.error}><Text style={s.errorText}>{error}</Text></View> : null}
        {loading ? <ActivityIndicator color={COLORS.primary} size="large" /> : (
          <>
            <View style={s.card}>
              <View style={s.cardHeading}>
                <View>
                  <Text style={s.eyebrow}>{role === 'Farm Manager' ? 'YOUR STATUS' : 'SYNC STATUS'}</Text>
                  <Text style={s.name}>{own?.displayName || session?.name || 'Current user'}</Text>
                </View>
                <View style={[s.badge, ownSync.state === 'UP_TO_DATE' ? s.goodBadge : localPending > 0 ? s.warnBadge : s.neutralBadge]}>
                  <Text style={s.badgeText}>{statusLabel(ownSync)}</Text>
                </View>
              </View>
              <StatusRow label="Last Active" value={formatActivity(own?.activity?.lastActiveAt)} />
              <StatusRow label="Platform" value={own?.activity?.lastPlatform || 'Not reported'} />
              <StatusRow label="Last Successful Sync" value={formatTime(own?.sync?.lastSuccessfulSyncAt)} />
              <StatusRow label="Pending on This Device" value={String(localPending)} />
              <StatusRow label="Connection" value={getNetworkStatus() ? 'Online' : 'Offline'} />
              {!getNetworkStatus() && localPending > 0 ? (
                <Text style={s.note}>Your changes are safely stored on this device and will synchronize when connection returns.</Text>
              ) : null}
              <TouchableOpacity style={s.syncButton} onPress={handleSync} disabled={isSyncing}>
                {isSyncing ? <ActivityIndicator color="#fff" /> : <Ionicons name="sync" size={17} color="#fff" />}
                <Text style={s.syncButtonText}>{isSyncing ? 'Synchronizing...' : 'Sync Now'}</Text>
              </TouchableOpacity>
            </View>

            {role === 'Farm Manager' ? (
              <View>
                <Text style={s.sectionTitle}>Member Activity Status</Text>
                <Text style={s.sectionSub}>An account not active for 3 days needs attention. At 5 days, it becomes critical.</Text>
                {members.length === 0 ? <Text style={s.emptyText}>No assigned active members found.</Text> : members.map(member => (
                  <View key={member.userId} style={s.memberCard}>
                    <View style={s.cardHeading}>
                      <Text style={s.memberName}>{member.displayName}</Text>
                      <View style={[s.badge, member.activity?.attentionStatus === 'CRITICAL' ? s.dangerBadge : member.activity?.attentionStatus === 'NEEDS_ATTENTION' ? s.warnBadge : member.activity?.attentionStatus === 'WITHIN_WINDOW' ? s.goodBadge : s.neutralBadge]}>
                        <Text style={s.badgeText}>{activityStatusLabel(member.activity)}</Text>
                      </View>
                    </View>
                    <StatusRow label="Last Active" value={formatActivity(member.activity?.lastActiveAt)} />
                    <StatusRow label="Activity Status" value={activityStatusLabel(member.activity)} />
                    <StatusRow label="Last Successful Sync" value={formatTime(member.sync?.lastSuccessfulSyncAt)} />
                    <StatusRow label="Last Reported" value={formatTime(member.sync?.lastReportedAt)} />
                  </View>
                ))}
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  header: { minHeight: 64, paddingHorizontal: SPACING.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: COLORS.border, backgroundColor: COLORS.surface },
  headerTitle: { fontSize: 17, fontWeight: '900', color: COLORS.text },
  headerSub: { fontSize: 10.5, color: COLORS.textMuted, marginTop: 2 },
  content: { padding: SPACING.lg, gap: 18, paddingBottom: 42 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 28 },
  card: { backgroundColor: COLORS.surface, borderRadius: RADIUS.xl, borderWidth: 1, borderColor: COLORS.border, padding: 16, ...SHADOW.sm },
  memberCard: { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.border, padding: 15, marginTop: 10 },
  cardHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 8 },
  eyebrow: { fontSize: 10, letterSpacing: 1, fontWeight: '900', color: COLORS.textMuted },
  name: { fontSize: 18, fontWeight: '900', color: COLORS.text, marginTop: 2 },
  memberName: { flex: 1, fontSize: 15, fontWeight: '900', color: COLORS.text },
  badge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  goodBadge: { backgroundColor: '#E9F8EC' },
  warnBadge: { backgroundColor: '#FFF3D6' },
  dangerBadge: { backgroundColor: '#FDECEC' },
  neutralBadge: { backgroundColor: '#EEF1ED' },
  badgeText: { fontSize: 10.5, fontWeight: '900', color: COLORS.text },
  row: { minHeight: 39, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: '#EDF0EB', gap: 12 },
  rowLabel: { fontSize: 12, color: COLORS.textMuted },
  rowValue: { flex: 1, textAlign: 'right', fontSize: 12, fontWeight: '800', color: COLORS.text },
  note: { marginTop: 10, padding: 10, borderRadius: RADIUS.md, backgroundColor: '#FFF8E8', color: '#805D13', fontSize: 11.5, lineHeight: 17 },
  syncButton: { marginTop: 14, minHeight: 44, borderRadius: RADIUS.md, backgroundColor: COLORS.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  syncButtonText: { color: '#fff', fontWeight: '900', fontSize: 13 },
  sectionTitle: { fontSize: 16, fontWeight: '900', color: COLORS.text },
  sectionSub: { fontSize: 11.5, lineHeight: 17, color: COLORS.textMuted, marginTop: 3, marginBottom: 4 },
  emptyTitle: { textAlign: 'center', fontSize: 15, fontWeight: '800', color: COLORS.text },
  emptyText: { textAlign: 'center', fontSize: 12, color: COLORS.textMuted, padding: 24 },
  error: { padding: 12, borderRadius: RADIUS.md, backgroundColor: '#FDECEC' },
  errorText: { color: '#B42318', fontSize: 12, fontWeight: '700' }
});
