import React from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, RADIUS, SHADOW, SPACING } from '../theme';
import { getCurrentSession, getNetworkStatus, performMobileSync, subscribe } from '../data/dataStore';
import { getOutboxDiagnostics } from '../services/syncEngine';
import { fetchAgriculturalSyncMonitor } from '../services/telemetryService';
import { syncResultMessage } from '../domain/syncPresentation';
import { useTranslation } from '../services/i18n';

function formatTime(value, t, language, fallback = t('sync_not_reported')) {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  const locale = language === 'tl' ? 'fil-PH' : language === 'hil' ? 'hil-PH' : 'en-PH';
  return new Intl.DateTimeFormat(locale, {
    timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit'
  }).format(date);
}

function formatActivity(value, t, language) {
  if (!value) return t('sync_not_reported');
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return t('sync_not_reported');
  const minutes = Math.max(0, Math.floor((Date.now() - time) / 60000));
  if (minutes < 2) return t('sync_active_recently');
  if (minutes < 60) return `${minutes} ${t('sync_minutes_ago')}`;
  return formatTime(value, t, language);
}

function statusLabel(sync = {}, t) {
  if (Number(sync.failedMutationCount || 0) > 0 || sync.state === 'SYNC_FAILED') return `${sync.failedMutationCount || ''} ${t('sync_failed_label')}`.trim();
  if (Number(sync.pendingMutationCount || 0) > 0 || sync.state === 'PENDING_SYNC') return `${sync.pendingMutationCount || 0} ${t('sync_pending_label')}`;
  if (sync.state === 'SYNCING') return t('syncing_progress');
  if (sync.state === 'UP_TO_DATE') return t('sync_up_to_date');
  return t('sync_not_reported_title');
}

function activityStatusLabel(activity = {}, t) {
  const days = Number.isFinite(Number(activity.inactiveDays)) ? Number(activity.inactiveDays) : null;
  if (activity.attentionStatus === 'CRITICAL') return days == null ? t('sync_activity_unknown') : `${days} ${t('sync_days_inactive')}`;
  if (activity.attentionStatus === 'NEEDS_ATTENTION') return days == null ? t('sync_activity_not_reported') : `${days} ${t('sync_days_inactive')}`;
  if (!activity.lastActiveAt && activity.basedOn === 'ACCOUNT_CREATED') return t('sync_new_account');
  return t('sync_within_window');
}

function mutationTypeLabel(type, t) {
  const labels = {
    operation_log: t('sync_field_operation'),
    takeover_log: t('sync_manager_operation'),
    stage_update: t('sync_stage_update'),
    operation_amendment: t('sync_operation_correction'),
    operation_archive: t('sync_operation_archive'),
    ticket: t('sync_support_request'),
    ticket_message: t('sync_support_message')
  };
  return labels[type] || t('sync_saved_change');
}

function mutationStatusLabel(status, t) {
  if (status === 'validation' || status === 'rejected') return t('sync_needs_correction');
  if (status === 'conflict') return t('sync_needs_review');
  if (status === 'authorization') return t('sync_permission_changed');
  if (status === 'authentication') return t('sync_signin_required');
  if (status === 'syncing') return t('syncing_progress');
  return t('sync_waiting');
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
  const { t, language } = useTranslation();
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
      setError(t('sync_status_unavailable'));
    } finally {
      setLoading(false);
    }
  }, [allowed, t]);

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
  const localFailed = outbox.filter(item => !['queued', 'retryable', 'syncing'].includes(item.status)).length;
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
      Alert.alert(result.success ? t('sync_complete') : t('sync_incomplete'), syncResultMessage(result));
    } finally {
      setIsSyncing(false);
    }
  };

  if (!allowed) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}><Ionicons name="arrow-back" size={22} color={COLORS.text} /></TouchableOpacity>
          <Text style={s.headerTitle}>{t('sync_monitor_title')}</Text><View style={{ width: 22 }} />
        </View>
        <View style={s.center}><Text style={s.emptyTitle}>{t('sync_role_unavailable')}</Text></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}><Ionicons name="arrow-back" size={22} color={COLORS.text} /></TouchableOpacity>
        <View style={s.headerCopy}>
          <Text style={s.headerTitle}>{role === 'Farm Manager' ? t('sync_monitor_title') : t('sync_my_status')}</Text>
          <Text style={s.headerSub}>{monitor?.scope?.blockFarms?.map(farm => farm.name).join(', ') || t('sync_personal_device')}</Text>
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
                  <Text style={s.eyebrow}>{role === 'Farm Manager' ? t('sync_your_status') : t('sync_status_heading')}</Text>
                  <Text style={s.name}>{own?.displayName || session?.name || t('sync_current_user')}</Text>
                </View>
                <View style={[s.badge, ownSync.state === 'UP_TO_DATE' ? s.goodBadge : localPending > 0 ? s.warnBadge : s.neutralBadge]}>
                  <Text style={s.badgeText}>{statusLabel(ownSync, t)}</Text>
                </View>
              </View>
              <StatusRow label={t('sync_last_active')} value={formatActivity(own?.activity?.lastActiveAt, t, language)} />
              <StatusRow label={t('sync_platform')} value={own?.activity?.lastPlatform || t('sync_not_reported')} />
              <StatusRow label={t('sync_last_successful')} value={formatTime(own?.sync?.lastSuccessfulSyncAt, t, language)} />
              <StatusRow label={t('sync_pending_device')} value={String(localPending)} />
              <StatusRow label={t('sync_connection')} value={getNetworkStatus() ? t('sync_online') : t('sync_offline')} />
              {!getNetworkStatus() && localPending > 0 ? (
                <Text style={s.note}>{t('sync_safe_local_note')}</Text>
              ) : null}
              <TouchableOpacity style={s.syncButton} onPress={handleSync} disabled={isSyncing}>
                {isSyncing ? <ActivityIndicator color="#fff" /> : <Ionicons name="sync" size={17} color="#fff" />}
                <Text style={s.syncButtonText}>{isSyncing ? t('syncing_progress') : t('profile_sync_now')}</Text>
              </TouchableOpacity>
            </View>

            {outbox.length > 0 ? (
              <View>
                <Text style={s.sectionTitle}>{t('sync_changes_waiting')}</Text>
                <Text style={s.sectionSub}>{t('sync_changes_waiting_sub')}</Text>
                {outbox.map((item, index) => (
                  <View key={item.mutationId || `${item.type}-${index}`} style={s.queueCard}>
                    <View style={s.queueHeading}>
                      <Text style={s.queueTitle}>{mutationTypeLabel(item.type, t)}</Text>
                      <Text style={s.queueStatus}>{mutationStatusLabel(item.status, t)}</Text>
                    </View>
                    {item.lastError ? <Text style={s.queueError}>{item.lastError}</Text> : null}
                    <Text style={s.queueMeta}>{t('sync_attempted')} {Number(item.retryCount || 0)} {Number(item.retryCount || 0) === 1 ? t('sync_time_singular') : t('sync_time_plural')}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            {role === 'Farm Manager' ? (
              <View>
                <Text style={s.sectionTitle}>{t('sync_member_activity')}</Text>
                <Text style={s.sectionSub}>{t('sync_member_activity_sub')}</Text>
                {members.length === 0 ? <Text style={s.emptyText}>{t('sync_no_members')}</Text> : members.map(member => (
                  <View key={member.userId} style={s.memberCard}>
                    <View style={s.cardHeading}>
                      <Text style={s.memberName}>{member.displayName}</Text>
                      <View style={[s.badge, member.activity?.attentionStatus === 'CRITICAL' ? s.dangerBadge : member.activity?.attentionStatus === 'NEEDS_ATTENTION' ? s.warnBadge : member.activity?.attentionStatus === 'WITHIN_WINDOW' ? s.goodBadge : s.neutralBadge]}>
                        <Text style={s.badgeText}>{activityStatusLabel(member.activity, t)}</Text>
                      </View>
                    </View>
                    <StatusRow label={t('sync_last_active')} value={formatActivity(member.activity?.lastActiveAt, t, language)} />
                    <StatusRow label={t('sync_activity_status')} value={activityStatusLabel(member.activity, t)} />
                    <StatusRow label={t('sync_last_successful')} value={formatTime(member.sync?.lastSuccessfulSyncAt, t, language)} />
                    <StatusRow label={t('sync_last_reported')} value={formatTime(member.sync?.lastReportedAt, t, language)} />
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
  headerCopy: { flex: 1, minWidth: 0, alignItems: 'center', paddingHorizontal: 8 },
  headerTitle: { flexShrink: 1, textAlign: 'center', fontSize: 17, lineHeight: 21, fontWeight: '900', color: COLORS.text },
  headerSub: { flexShrink: 1, textAlign: 'center', fontSize: 10.5, lineHeight: 14, color: COLORS.textMuted, marginTop: 2 },
  content: { padding: SPACING.lg, gap: 18, paddingBottom: 42 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 28 },
  card: { backgroundColor: COLORS.surface, borderRadius: RADIUS.xl, borderWidth: 1, borderColor: COLORS.border, padding: 16, ...SHADOW.sm },
  memberCard: { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.border, padding: 15, marginTop: 10 },
  queueCard: { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.border, padding: 14, marginTop: 10 },
  queueHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  queueTitle: { flex: 1, fontSize: 13, fontWeight: '900', color: COLORS.text },
  queueStatus: { maxWidth: '45%', flexShrink: 1, textAlign: 'right', fontSize: 10.5, lineHeight: 14, fontWeight: '900', color: '#805D13' },
  queueError: { marginTop: 8, fontSize: 11.5, lineHeight: 17, color: '#B42318' },
  queueMeta: { marginTop: 6, fontSize: 10.5, color: COLORS.textMuted },
  cardHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 8 },
  eyebrow: { fontSize: 10, letterSpacing: 1, fontWeight: '900', color: COLORS.textMuted },
  name: { fontSize: 18, fontWeight: '900', color: COLORS.text, marginTop: 2 },
  memberName: { flex: 1, fontSize: 15, fontWeight: '900', color: COLORS.text },
  badge: { maxWidth: '48%', flexShrink: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  goodBadge: { backgroundColor: '#E9F8EC' },
  warnBadge: { backgroundColor: '#FFF3D6' },
  dangerBadge: { backgroundColor: '#FDECEC' },
  neutralBadge: { backgroundColor: '#EEF1ED' },
  badgeText: { flexShrink: 1, textAlign: 'center', fontSize: 10.5, lineHeight: 14, fontWeight: '900', color: COLORS.text },
  row: { minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: '#EDF0EB', gap: 12, paddingVertical: 5 },
  rowLabel: { flex: 1, minWidth: 0, fontSize: 12, lineHeight: 17, color: COLORS.textMuted },
  rowValue: { flex: 1, minWidth: 0, textAlign: 'right', fontSize: 12, lineHeight: 17, fontWeight: '800', color: COLORS.text },
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
