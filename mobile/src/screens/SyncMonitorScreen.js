import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, TextInput, Linking, Platform, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS, SHADOW } from '../theme';
import { subscribe, getCurrentSession, fields, users, blockFarms, getMemberSyncHealth, performMobileSync, updateSessionFieldId } from '../data/dataStore';
import { useTranslation } from '../services/i18n';

export default function SyncMonitorScreen({ navigation }) {
  const { t, formatSyncTime } = useTranslation();
  const [session, setSession] = useState(getCurrentSession());
  const [syncHealth, setSyncHealth] = useState(getMemberSyncHealth());
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState('attention'); // 'attention', 'all', 'active', 'warning', 'critical'
  const [memberPage, setMemberPage] = useState(1);
  const [isSyncing, setIsSyncing] = useState(false);

  const handleSyncNow = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      const result = await performMobileSync('MANUAL_SYNC');
      Alert.alert(
        result.remainingCount === 0 ? t('sync_status_synced', 'Sync Successful') : 'Sync Incomplete',
        result.remainingCount === 0
          ? `${result.processedCount || 0} queued record(s) synchronized. No records remain.`
          : `${result.processedCount || 0} synchronized, ${result.failedCount || 0} failed, and ${result.remainingCount} remain queued.`
      );
    } finally {
      setIsSyncing(false);
    }
  };

  React.useEffect(() => {
    const unsubscribe = subscribe(() => {
      setSession({ ...getCurrentSession() });
      setSyncHealth(getMemberSyncHealth());
    });
    return unsubscribe;
  }, []);

  const isFarmManager = session?.role === 'Farm Manager';
  const isSRA = session?.role === 'SRA Admin';
  const sessionUserId = session?.id || session?.employeeId || '';
  const assignedField = fields.find(field => field.memberUserId === sessionUserId);
  const assignedFarm = blockFarms.find(farm => farm.id === assignedField?.blockFarmId);
  const assignedManager = users.find(user => (user.id || user.employeeId) === assignedFarm?.managerUserId);
  const managedFarm = blockFarms.find(farm => farm.managerUserId === sessionUserId);

  // Manager telemetry uses only persisted field/user sync information.
  const memberTelemetry = React.useMemo(() => {
    const managedFields = managedFarm ? fields.filter(field => field.blockFarmId === managedFarm.id) : [];
    return managedFields.map((f) => {
      const member = users.find(user => (user.id || user.employeeId) === f.memberUserId);
      const isLagging = f.lastSync?.includes('days') || !f.synced;
      const lagDays = Number(f.syncLagDays || 0);
      const isCritical = lagDays >= 7;
      const status = isCritical ? 'critical' : (isLagging ? 'warning' : 'active');
      const statusLabel = isCritical ? `Critical (${f.lastSync})` : (isLagging ? `Lagging (${f.lastSync})` : 'Active & Synced');
      return {
        id: f.id,
        name: member?.name || member?.displayName || 'Unassigned',
        contact: member?.phone || member?.contact || '',
        ha: String(f.ha || 0),
        stage: f.stage ? f.stage.split(':')[0] : 'In Progress',
        lastSync: f.lastSync || 'No sync recorded',
        lagDays,
        offlineLogsCount: Number(f.offlineLogsCount || 0),
        battery: f.batteryLevel ?? null,
        status,
        statusLabel,
        device: f.deviceName || '',
        blockFarm: managedFarm?.name || 'Unassigned'
      };
    });
  }, [managedFarm?.id, syncHealth]);

  const { attentionCount, activeCount, warningCount, criticalCount } = React.useMemo(() => {
    let att = 0, act = 0, warn = 0, crit = 0;
    memberTelemetry.forEach(m => {
      if (m.status === 'warning' || m.status === 'critical') att++;
      if (m.status === 'active') act++;
      if (m.status === 'warning') warn++;
      if (m.status === 'critical') crit++;
    });
    return { attentionCount: att, activeCount: act, warningCount: warn, criticalCount: crit };
  }, [memberTelemetry]);

  const filteredMembers = React.useMemo(() => {
    let list = memberTelemetry;
    if (filterMode === 'attention') {
      list = memberTelemetry.filter(m => m.status === 'warning' || m.status === 'critical');
    } else if (filterMode === 'active') {
      list = memberTelemetry.filter(m => m.status === 'active');
    } else if (filterMode === 'warning') {
      list = memberTelemetry.filter(m => m.status === 'warning');
    } else if (filterMode === 'critical') {
      list = memberTelemetry.filter(m => m.status === 'critical');
    }

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(m =>
        m.name.toLowerCase().includes(q) ||
        m.id.toLowerCase().includes(q) ||
        m.contact.toLowerCase().includes(q) ||
        m.stage.toLowerCase().includes(q)
      );
    }
    return list;
  }, [memberTelemetry, filterMode, searchQuery]);

  const handleContactMember = (member) => {
    const cleanPhone = (member.contact || '').replace(/[^0-9+]/g, '');

    Alert.alert(
      `${t('btn_call_member', 'Call Member')}: ${member.name}`,
      `${t('profile_mobile_contact', 'Mobile')}: ${member.contact}\n${t('field_plot', 'Field Plot')}: ${member.id} (${member.ha || 1.5} Ha)\n${t('status', 'Sync Status')}: ${formatSyncTime(member.lastSync)}\n\nDirect carrier call via your device dialer (no SMS fees).`,
      [
        { text: t('btn_cancel', 'Cancel'), style: 'cancel' },
        {
          text: t('btn_call_now', 'Call Now'),
          onPress: async () => {
            const telUrl = `tel:${cleanPhone}`;
            try {
              const supported = await Linking.canOpenURL(telUrl);
              if (supported) {
                await Linking.openURL(telUrl);
              } else {
                Alert.alert('Dialer Info', `Dialing ${member.contact} on device...`);
              }
            } catch (err) {
              Alert.alert('Error', 'Unable to launch native phone dialer.');
            }
          }
        }
      ]
    );
  };

  const handleTakeOver = (member) => {
    Alert.alert(
      t('btn_take_over', 'Take Over Field Plot'),
      `Take operational supervision of ${member.id} (${member.name})? You will be navigated to Field Ops to enter your manager account password and authorize supervisor take over.`,
      [
        { text: t('btn_cancel', 'Cancel'), style: 'cancel' },
        {
          text: t('btn_take_over', 'Proceed to Take Over'),
          onPress: () => {
            navigation.navigate('Field Ops', {
              screen: 'SchedMain',
              params: { takeOverFieldId: member.id, requestTakeOver: true }
            });
          }
        }
      ]
    );
  };

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={20} color={COLORS.text} />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={s.headerTitle}>{isFarmManager ? t('telemetry_title', 'Member Sync Monitor') : (isSRA ? 'SRA Terminal' : t('action_sync_hub', 'Sync Status'))}</Text>
          <Text style={s.headerSub}>{isFarmManager ? `${managedFarm?.name || 'Unassigned'} Supervision` : (isSRA ? 'Administrative Authority' : 'Mobile Terminal Connection')}</Text>
        </View>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* ── FARM MANAGER VIEW ── */}
        {isFarmManager ? (
          <>
            {/* Telemetry Summary Stats */}
            <View style={s.statsBar}>
              <TouchableOpacity
                style={[s.statItem, filterMode === 'attention' && s.statItemActive]}
                onPress={() => setFilterMode(filterMode === 'attention' ? 'all' : 'attention')}
              >
                <Text style={[s.statNum, { color: attentionCount > 0 ? '#E02424' : COLORS.success }]}>{attentionCount}</Text>
                <Text style={s.statLabel}>{t('telemetry_needs_attention', 'Needs Attention')}</Text>
              </TouchableOpacity>
              <View style={s.statDiv} />
              <TouchableOpacity
                style={[s.statItem, filterMode === 'warning' && s.statItemActive]}
                onPress={() => setFilterMode(filterMode === 'warning' ? 'all' : 'warning')}
              >
                <Text style={[s.statNum, { color: '#C97A00' }]}>{warningCount}</Text>
                <Text style={s.statLabel}>{t('telemetry_lag_warning', 'Lag (3+ days)')}</Text>
              </TouchableOpacity>
              <View style={s.statDiv} />
              <TouchableOpacity
                style={[s.statItem, filterMode === 'critical' && s.statItemActive]}
                onPress={() => setFilterMode(filterMode === 'critical' ? 'all' : 'critical')}
              >
                <Text style={[s.statNum, { color: '#E02424' }]}>{criticalCount}</Text>
                <Text style={s.statLabel}>{t('telemetry_critical', 'Critical (7+ days)')}</Text>
              </TouchableOpacity>
            </View>

            {/* Overdue Warning Alert Banner */}
            {attentionCount > 0 && (
              <View style={s.alertBanner}>
                <View style={s.alertIconWrap}>
                  <Ionicons name="alert-circle" size={22} color="#DC2626" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.alertTitle}>
                    {t('sync_critical_title', 'Sync Action Required')}: {attentionCount} Member(s) Offline
                  </Text>
                  <Text style={s.alertSub}>
                    Follow up with lagging members before monthly district report compile.
                  </Text>
                </View>
              </View>
            )}

            {/* Filter Pills */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -SPACING.lg, marginBottom: 8 }} contentContainerStyle={{ paddingHorizontal: SPACING.lg, gap: 6 }}>
              {[
                { key: 'attention', label: `${t('telemetry_needs_attention', 'Needs Attention')} (${attentionCount})` },
                { key: 'all', label: `${t('telemetry_all_members', 'All Members')} (${memberTelemetry.length})` },
                { key: 'warning', label: `${t('telemetry_lag_warning', 'Lag Warning')} (${warningCount})` },
                { key: 'critical', label: `${t('telemetry_critical', 'Critical Offline')} (${criticalCount})` },
                { key: 'active', label: `${t('profile_synced', 'Active Synced')} (${activeCount})` },
              ].map(chip => (
                <TouchableOpacity
                  key={chip.key}
                  style={[s.filterPill, filterMode === chip.key && s.filterPillActive]}
                  onPress={() => {
                    setFilterMode(chip.key);
                    setMemberPage(1);
                  }}
                >
                  <Text style={[s.filterPillText, filterMode === chip.key && s.filterPillTextActive]}>{chip.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Search Input */}
            <View style={s.searchContainer}>
              <Ionicons name="search-outline" size={17} color={COLORS.textMuted} />
              <TextInput
                style={s.searchInput}
                placeholder={t('search_members_placeholder', 'Search members or field ID...')}
                placeholderTextColor={COLORS.textMuted}
                value={searchQuery}
                onChangeText={(q) => {
                  setSearchQuery(q);
                  setMemberPage(1);
                }}
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => { setSearchQuery(''); setMemberPage(1); }}>
                  <Ionicons name="close-circle" size={17} color={COLORS.textMuted} />
                </TouchableOpacity>
              )}
            </View>

            {/* Member Telemetry Cards */}
            <Text style={s.sectionTitle}>
              {filterMode === 'attention' ? `Members Requiring Sync Attention (${filteredMembers.length})` : `Registered Block Farm Members (${filteredMembers.length})`}
            </Text>

            {(() => {
              const pageSize = 3;
              const totalPages = Math.ceil(filteredMembers.length / pageSize) || 1;
              const curPage = Math.min(memberPage, totalPages);
              const paginatedMembers = filteredMembers.slice((curPage - 1) * pageSize, curPage * pageSize);

              return filteredMembers.length === 0 ? (
                <View style={[s.emptyBox, { paddingVertical: 24, gap: 8, alignItems: 'center' }]}>
                  <Ionicons name="checkmark-circle-outline" size={40} color={COLORS.success} />
                  <Text style={{ fontSize: 14, fontWeight: '800', color: COLORS.text }}>{t('all_members_synced', 'All Block Farm Members Synced')}</Text>
                  <Text style={[s.emptyText, { textAlign: 'center' }]}>{t('all_members_synced_sub', 'No members have sync lag or offline buffer delays at this time.')}</Text>
                  <TouchableOpacity
                    style={{ marginTop: 6, paddingHorizontal: 14, paddingVertical: 7, borderRadius: RADIUS.md, backgroundColor: COLORS.primaryBg }}
                    onPress={() => { setFilterMode('all'); setMemberPage(1); }}
                  >
                    <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.primary }}>{t('view_all_members', 'View All Members')} ({memberTelemetry.length})</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <>
                  {paginatedMembers.map(m => {
                    const isCritical = m.status === 'critical';
                    const isWarn = m.status === 'warning';
                    const badgeBg = isCritical ? '#FDF2F2' : (isWarn ? '#FFFBF0' : '#F0F9F0');
                    const badgeBorder = isCritical ? '#F8B4B4' : (isWarn ? '#FEF0D0' : '#D1F2D1');
                    const badgeColor = isCritical ? '#E02424' : (isWarn ? '#C97A00' : COLORS.success);
                    const badgeIcon = isCritical ? 'alert-circle' : (isWarn ? 'time' : 'checkmark-circle');
                    const badgeLabel = isCritical ? `${m.lagDays}d Offline (Critical)` : (isWarn ? `${m.lagDays}d Lag Warning` : 'Active / Synced');

                    return (
                      <View key={m.id} style={[s.memberCard, isCritical ? s.memberCardCritical : (isWarn ? s.memberCardWarn : s.memberCardActive)]}>
                        <View style={s.memberTopRow}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                            <View style={[s.memberAvatar, isCritical ? { backgroundColor: '#FEE2E2' } : (isWarn ? { backgroundColor: '#FEF3C7' } : { backgroundColor: '#E8F5E4' })]}>
                              <Text style={[s.memberAvatarText, isCritical ? { color: '#DC2626' } : (isWarn ? { color: '#D97706' } : { color: COLORS.primary })]}>
                                {m.name.charAt(0).toUpperCase()}
                              </Text>
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={s.memberName} numberOfLines={1}>{m.name}</Text>
                              <View style={s.plotRow}>
                                <Ionicons name="grid-outline" size={11} color={COLORS.primary} />
                                <Text style={s.memberFieldId}>{m.id}</Text>
                                <Text style={s.memberHa}>· {m.ha} Ha</Text>
                              </View>
                            </View>
                          </View>
                          <View style={[s.healthBadge, { backgroundColor: badgeBg, borderColor: badgeBorder }]}>
                            <Ionicons name={badgeIcon} size={12} color={badgeColor} />
                            <Text style={[s.healthBadgeText, { color: badgeColor }]}>{badgeLabel}</Text>
                          </View>
                        </View>

                        <View style={s.memberDetailsRow}>
                          <View style={{ flex: 1.2 }}>
                            <Text style={s.detailLabel}>{t('stage', 'Stage')}</Text>
                            <Text style={s.detailValue} numberOfLines={1}>{m.stage}</Text>
                          </View>
                          <View style={{ flex: 1, alignItems: 'center' }}>
                            <Text style={s.detailLabel}>Offline Buffer</Text>
                            <Text style={[s.detailValue, { color: m.offlineLogsCount > 0 ? '#D97706' : COLORS.textSecondary }]}>
                              {m.offlineLogsCount > 0 ? `${m.offlineLogsCount} pending` : '0 queued'}
                            </Text>
                          </View>
                          <View style={{ flex: 1.2, alignItems: 'flex-end' }}>
                            <Text style={s.detailLabel}>{t('sync_info', 'Latest Sync')}</Text>
                            <Text style={[s.detailValue, { color: badgeColor }]}>{formatSyncTime(m.lastSync)}</Text>
                          </View>
                        </View>

                        <View style={s.memberActionRow}>
                          <TouchableOpacity
                            style={s.contactBtn}
                            onPress={() => handleContactMember(m)}
                            activeOpacity={0.8}
                          >
                            <Ionicons name="call-outline" size={16} color={COLORS.text} />
                            <Text style={s.contactBtnText} numberOfLines={1}>{t('btn_call_member', 'Call Member')}</Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={s.takeOverBtn}
                            onPress={() => handleTakeOver(m)}
                            activeOpacity={0.8}
                          >
                            <Ionicons name="shield-checkmark-outline" size={16} color={COLORS.primary} />
                            <Text style={s.takeOverBtnText} numberOfLines={1}>{t('btn_take_over', 'Take Over Plot')}</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    );
                  })}

                  {/* Pagination Controls */}
                  {totalPages > 1 && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, marginTop: 4, borderTopWidth: 1, borderTopColor: COLORS.border }}>
                      <TouchableOpacity
                        disabled={curPage === 1}
                        onPress={() => setMemberPage(p => Math.max(1, p - 1))}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 5, paddingHorizontal: 10, borderRadius: RADIUS.xs, borderWidth: 1, borderColor: curPage === 1 ? COLORS.border : COLORS.primary, backgroundColor: curPage === 1 ? '#F8F9FA' : COLORS.primaryBg, opacity: curPage === 1 ? 0.6 : 1 }}
                      >
                        <Ionicons name="chevron-back" size={13} color={curPage === 1 ? COLORS.textMuted : COLORS.primary} />
                        <Text style={{ fontSize: 11, fontWeight: '700', color: curPage === 1 ? COLORS.textMuted : COLORS.primary }}>{t('btn_prev', 'Prev')}</Text>
                      </TouchableOpacity>

                      <Text style={{ fontSize: 11, fontWeight: '700', color: COLORS.textSecondary }}>
                        {t('page_label', 'Page')} {curPage} {t('of_label', 'of')} {totalPages} ({filteredMembers.length} {t('members_label', 'Members')})
                      </Text>

                      <TouchableOpacity
                        disabled={curPage === totalPages}
                        onPress={() => setMemberPage(p => Math.min(totalPages, p + 1))}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 5, paddingHorizontal: 10, borderRadius: RADIUS.xs, borderWidth: 1, borderColor: curPage === totalPages ? COLORS.border : COLORS.primary, backgroundColor: curPage === totalPages ? '#F8F9FA' : COLORS.primaryBg, opacity: curPage === totalPages ? 0.6 : 1 }}
                      >
                        <Text style={{ fontSize: 11, fontWeight: '700', color: curPage === totalPages ? COLORS.textMuted : COLORS.primary }}>{t('btn_next', 'Next')}</Text>
                        <Ionicons name="chevron-forward" size={13} color={curPage === totalPages ? COLORS.textMuted : COLORS.primary} />
                      </TouchableOpacity>
                    </View>
                  )}
                </>
              );
            })()}
          </>
        ) : isSRA ? (
          /* ── SRA ADMIN VIEW ── */
          <View style={s.memberTerminalCard}>
            <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: '#E0F0FA', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
              <Ionicons name="business" size={26} color={COLORS.primary} />
            </View>
            <Text style={{ fontSize: 16, fontWeight: '800', color: COLORS.text, textAlign: 'center' }}>
              {t('role_sra', 'SRA Administrator')}
            </Text>
            <Text style={{ fontSize: 12, color: COLORS.textMuted, textAlign: 'center', marginTop: 4, lineHeight: 18 }}>
              {t('profile_sra_status', 'Individual member sync health & telemetry is supervised directly by local Farm Managers. SRA Administrators supervise sugar price circulars, monthly compiled audit reports, and macro analytics.')}
            </Text>

            <View style={{ width: '100%', backgroundColor: '#F8FAF6', borderRadius: RADIUS.md, padding: 12, borderWidth: 1, borderColor: '#E2E8DC', marginVertical: 16, gap: 8 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 11, color: COLORS.textMuted }}>{t('profile_supervised_scope', 'Administrative Scope')}:</Text>
                <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.text }}>{t('view_all_fields', 'All District Block Farms')}</Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 11, color: COLORS.textMuted }}>{t('profile_district_cert', 'Cloud Certification Status')}:</Text>
                <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.success }}>{t('profile_sra_certified', 'Online / Certified')}</Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 11, color: COLORS.textMuted }}>{t('price_card_title', 'Mill Price Feed')}:</Text>
                <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.primary }}>HPCo Silay (Live)</Text>
              </View>
            </View>

            <TouchableOpacity
              style={{ width: '100%', backgroundColor: COLORS.primary, paddingVertical: 10, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 }}
              onPress={() => {
                navigation.goBack();
              }}
            >
              <Ionicons name="arrow-back" size={16} color="#FFF" />
              <Text style={{ color: '#FFF', fontSize: 12, fontWeight: '700' }}>{t('btn_close', 'Return to Overview')}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          /* ── REGULAR MEMBER VIEW ── */
          <View style={s.memberTerminalCard}>
            <View style={s.statusIconWrap}>
              <Ionicons name="shield-checkmark" size={32} color={COLORS.primary} />
            </View>

            <Text style={s.statusTitle}>Fully Synced</Text>
            <Text style={s.statusSub}>All records match the cloud database.</Text>

            <View style={s.infoBox}>
              <View style={s.infoItem}>
                <Text style={s.infoItemLabel}>Field</Text>
                <Text style={s.infoItemValue} numberOfLines={1}>
                  {assignedField ? `${assignedField.id} (${Number(assignedField.ha || 0).toFixed(2)} Ha)` : 'DEV-FLD-001 (1.00 Ha)'}
                </Text>
              </View>

              <View style={s.infoItem}>
                <Text style={s.infoItemLabel}>Farm</Text>
                <Text style={s.infoItemValue} numberOfLines={1}>
                  {assignedFarm?.name || 'Development Test Block Farm'}
                </Text>
              </View>

              <View style={s.infoItem}>
                <Text style={s.infoItemLabel}>Manager</Text>
                <Text style={s.infoItemValue} numberOfLines={1}>
                  {assignedManager?.name || assignedManager?.displayName || 'District Farm Manager'}
                </Text>
              </View>

              <View style={s.infoItem}>
                <Text style={s.infoItemLabel}>Last Synced</Text>
                <Text style={[s.infoItemValue, { color: COLORS.primary }]} numberOfLines={1}>
                  {formatSyncTime(syncHealth.lastSync)}
                </Text>
              </View>
            </View>

            <View style={s.actionRow}>
              <TouchableOpacity
                style={[s.primarySyncBtn, isSyncing && { opacity: 0.7 }]}
                onPress={handleSyncNow}
                disabled={isSyncing}
                activeOpacity={0.8}
              >
                {isSyncing ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <>
                    <Ionicons name="sync-outline" size={16} color="#FFF" />
                    <Text style={s.primarySyncBtnText}>{t('profile_sync_now', 'Sync Now')}</Text>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={s.secondaryCallBtn}
                onPress={() => {
                  Alert.alert(
                    t('btn_call_manager', 'Call Manager'),
                    `${assignedManager?.name || 'Farm Manager'}\nDirect carrier dialer.`,
                    [
                      { text: t('btn_cancel', 'Cancel'), style: 'cancel' },
                      { text: t('btn_call_now', 'Call Now'), onPress: () => Alert.alert('Dialing...', 'Calling 0918-987-6543') }
                    ]
                  );
                }}
                activeOpacity={0.8}
              >
                <Ionicons name="call-outline" size={16} color={COLORS.text} />
                <Text style={s.secondaryCallBtnText}>{t('btn_call_manager', 'Call Manager')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8DC',
    backgroundColor: '#FFF',
  },
  backBtn: { width: 40, height: 40, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F0F4EC', borderWidth: 1, borderColor: '#DEEBD8' },
  headerTitle: { fontSize: 16.5, fontWeight: '800', color: COLORS.text },
  headerSub: { fontSize: 12, color: COLORS.textMuted, marginTop: 1 },
  scroll: { padding: SPACING.lg, gap: 12 },

  // Stats Bar
  statsBar: {
    flexDirection: 'row',
    backgroundColor: '#FFF',
    borderRadius: RADIUS.xl,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderWidth: 1.2,
    borderColor: '#E2E8DC',
    alignItems: 'center',
    ...SHADOW.card,
  },
  statItem: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: RADIUS.md, minHeight: 52 },
  statItemActive: { backgroundColor: '#F0F8EC', borderWidth: 1, borderColor: '#C8E6C9' },
  statNum: { fontSize: 20, fontWeight: '900' },
  statLabel: { fontSize: 11, color: COLORS.textMuted, marginTop: 3, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.2 },
  statDiv: { width: 1, height: 28, backgroundColor: '#E2E8DC' },

  // Alert Banner
  alertBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
    borderWidth: 1.2,
    borderRadius: RADIUS.xl,
    padding: 13,
    ...SHADOW.sm,
  },
  alertIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  alertTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#B91C1C',
  },
  alertSub: {
    fontSize: 12,
    color: '#991B1B',
    marginTop: 2,
    lineHeight: 16,
  },

  // Search
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    borderRadius: RADIUS.lg,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1.2,
    borderColor: '#DCE7D8',
    minHeight: 48,
    gap: 10,
    ...SHADOW.sm,
  },
  searchInput: { flex: 1, fontSize: 14, color: COLORS.text, padding: 0 },

  sectionTitle: { fontSize: 15, fontWeight: '800', color: COLORS.text, marginTop: 4 },

  emptyBox: {
    backgroundColor: '#FFF',
    borderRadius: RADIUS.xl,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.2,
    borderColor: '#E2E8DC',
    gap: 6,
    ...SHADOW.card,
  },
  emptyText: { fontSize: 13, color: COLORS.textMuted, textAlign: 'center', lineHeight: 18 },

  // Member Telemetry Card
  memberCard: {
    backgroundColor: '#FFF',
    borderRadius: RADIUS.xl,
    padding: 15,
    borderWidth: 1.2,
    borderColor: '#E2E8DC',
    gap: 10,
    ...SHADOW.card,
  },
  memberCardActive: {
    borderColor: '#DEEAD8',
  },
  memberCardWarn: {
    borderColor: '#FCD34D',
    backgroundColor: '#FFFEFA',
  },
  memberCardCritical: {
    borderColor: '#FCA5A5',
    backgroundColor: '#FFF9F9',
  },
  memberTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  memberAvatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: COLORS.primaryBg, alignItems: 'center', justifyContent: 'center' },
  memberAvatarText: { fontSize: 17, fontWeight: '900', color: COLORS.primary },
  memberName: { fontSize: 15.5, fontWeight: '800', color: COLORS.text },
  plotRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  memberFieldId: { fontSize: 12.5, fontWeight: '800', color: COLORS.primary },
  memberHa: { fontSize: 12, fontWeight: '600', color: COLORS.textMuted },

  healthBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 4.5, borderRadius: RADIUS.full, borderWidth: 1 },
  healthBadgeText: { fontSize: 11.5, fontWeight: '800' },

  memberDetailsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F0F4EC',
  },
  detailLabel: { fontSize: 11, color: COLORS.textMuted, textTransform: 'uppercase', fontWeight: '800', letterSpacing: 0.3 },
  detailValue: { fontSize: 13.5, fontWeight: '700', color: COLORS.text, marginTop: 2 },

  memberActionRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  contactBtn: {
    flex: 1,
    backgroundColor: '#F8FAF6',
    borderWidth: 1.2,
    borderColor: '#D0DBC9',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: RADIUS.md,
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    ...SHADOW.sm,
  },
  contactBtnText: { fontSize: 13.5, fontWeight: '800', color: COLORS.text },
  takeOverBtn: {
    flex: 1,
    backgroundColor: '#F0F8EC',
    borderWidth: 1.2,
    borderColor: COLORS.primary,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: RADIUS.md,
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    ...SHADOW.sm,
  },
  takeOverBtnText: { fontSize: 13.5, fontWeight: '900', color: COLORS.primary },

  // Filter Pills
  filterPill: { backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#E2E8DC', borderRadius: RADIUS.full, paddingHorizontal: 14, paddingVertical: 9, minHeight: 38, justifyContent: 'center' },
  filterPillActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  filterPillText: { fontSize: 12.5, fontWeight: '700', color: COLORS.textSecondary },
  filterPillTextActive: { color: '#fff', fontWeight: '900' },

  // Member Terminal View
  memberTerminalCard: {
    backgroundColor: '#FFF',
    borderRadius: RADIUS.lg,
    padding: 24,
    alignItems: 'center',
    ...SHADOW.card,
  },
  statusIconWrap: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: COLORS.primaryBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  statusTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.text,
    textAlign: 'center',
  },
  statusSub: {
    fontSize: 13,
    color: COLORS.textMuted,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 16,
  },
  infoBox: {
    width: '100%',
    backgroundColor: '#F9FAF7',
    borderRadius: RADIUS.md,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginBottom: 20,
  },
  infoItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 9,
  },
  infoItemLabel: {
    fontSize: 13,
    color: COLORS.textMuted,
    fontWeight: '500',
  },
  infoItemValue: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
    textAlign: 'right',
    maxWidth: '65%',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  primarySyncBtn: {
    flex: 1,
    backgroundColor: COLORS.primary,
    paddingVertical: 14,
    minHeight: 48,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  primarySyncBtnText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700',
  },
  secondaryCallBtn: {
    flex: 1,
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 14,
    minHeight: 48,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  secondaryCallBtnText: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '600',
  },
});
