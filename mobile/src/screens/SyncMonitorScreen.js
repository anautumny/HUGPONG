import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, TextInput, Linking, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS, SHADOW } from '../theme';
import { subscribe, getCurrentSession, fields, getMemberSyncHealth, performMobileSync, updateSessionFieldId } from '../data/dataStore';
import { useTranslation } from '../services/i18n';

export default function SyncMonitorScreen({ navigation }) {
  const { t, formatSyncTime } = useTranslation();
  const [session, setSession] = useState(getCurrentSession());
  const [syncHealth, setSyncHealth] = useState(getMemberSyncHealth());
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState('attention'); // 'attention', 'all', 'active', 'warning', 'critical'
  const [memberPage, setMemberPage] = useState(1);

  React.useEffect(() => {
    const unsubscribe = subscribe(() => {
      setSession({ ...getCurrentSession() });
      setSyncHealth(getMemberSyncHealth());
    });
    return unsubscribe;
  }, []);

  const isFarmManager = session.role === 'Farm Manager';
  const isSRA = session.role === 'SRA (Admin)';

  // Member terminal telemetry dynamically derived from fields
  const memberTelemetry = React.useMemo(() => {
    const devices = [
      'Samsung Galaxy A14 (Android 13)',
      'Xiaomi Redmi 12 (Android 12)',
      'Realme C55 (Android 13)',
      'Infinix Hot 30i (Android 11)',
      'Oppo A58 (Android 13)'
    ];
    const contacts = [
      '0917-123-4567',
      '0918-987-6543',
      '0919-444-8888',
      '0917-555-1234',
      '0918-666-7890'
    ];
    return fields.map((f, idx) => {
      const isLagging = f.lastSync?.includes('days') || !f.synced;
      const isCritical = f.lastSync?.includes('4 days') || f.lastSync?.includes('8 days');
      const lagDays = isCritical ? 4 : (isLagging ? 2 : 0);
      const status = isCritical ? 'critical' : (isLagging ? 'warning' : 'active');
      const statusLabel = isCritical ? `Critical (${f.lastSync})` : (isLagging ? `Lagging (${f.lastSync})` : 'Active & Synced');
      return {
        id: f.id,
        name: f.member || 'Member Farmer',
        contact: contacts[idx % contacts.length],
        ha: String(f.ha || '1.5'),
        stage: f.stage ? f.stage.split(':')[0] : 'In Progress',
        lastSync: f.lastSync || '1 hr ago',
        lagDays,
        offlineLogsCount: f.synced ? 0 : 3,
        battery: 85 - (idx * 15),
        status,
        statusLabel,
        device: devices[idx % devices.length],
        blockFarm: f.blockFarm || 'Nacayao Block Farm'
      };
    });
  }, []);

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
      `Take operational supervision of ${member.id} (${member.name})? You will be navigated to Field Ops to log activities directly on behalf of this member.`,
      [
        { text: t('btn_cancel', 'Cancel'), style: 'cancel' },
        {
          text: t('btn_take_over', 'Proceed to Take Over'),
          onPress: () => {
            navigation.navigate('Field Ops', {
              screen: 'SchedMain',
              params: { takeOverFieldId: member.id, isTakeOver: true }
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
          <Text style={s.headerSub}>{isFarmManager ? `${session.farm || 'Nacayao Block Farm'} Supervision` : (isSRA ? 'Administrative Authority' : 'Mobile Terminal Connection')}</Text>
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
              <View style={[s.alertBanner, { backgroundColor: '#FDF2F2', borderColor: '#F8B4B4' }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#FDE8E8', alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="alert-circle" size={20} color="#E02424" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 12, fontWeight: '800', color: '#E02424' }}>
                      {t('sync_critical_title', 'Sync Action Required')}: {attentionCount} Member(s) Offline
                    </Text>
                    <Text style={{ fontSize: 11, color: '#9B1C1C', marginTop: 1 }}>
                      Follow up with lagging members before monthly district report compile.
                    </Text>
                  </View>
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
              <Ionicons name="search-outline" size={16} color={COLORS.textMuted} />
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
                  <Ionicons name="close-circle" size={16} color={COLORS.textMuted} />
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
                    const badgeLabel = isCritical ? `${m.lagDays}d Offline (Critical)` : (isWarn ? `${m.lagDays}d Lag Warning` : 'Active / Synced');

                    return (
                      <View key={m.id} style={[s.memberCard, { borderColor: isCritical ? '#F8B4B4' : '#E2E8DC' }]}>
                        <View style={s.memberTopRow}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                            <View style={s.memberAvatar}>
                              <Text style={s.memberAvatarText}>{m.name.charAt(0)}</Text>
                            </View>
                            <View>
                              <Text style={s.memberName}>{m.name}</Text>
                              <Text style={s.memberFieldId}>{m.id} <Text style={{ color: COLORS.textMuted, fontWeight: '400' }}>({m.ha} Ha)</Text></Text>
                            </View>
                          </View>
                          <View style={[s.healthBadge, { backgroundColor: badgeBg, borderColor: badgeBorder }]}>
                            <View style={[s.healthDot, { backgroundColor: badgeColor }]} />
                            <Text style={[s.healthBadgeText, { color: badgeColor }]}>{badgeLabel}</Text>
                          </View>
                        </View>

                        <View style={s.memberDetailsRow}>
                          <View>
                            <Text style={s.detailLabel}>{t('stage', 'Current Stage')}</Text>
                            <Text style={s.detailValue}>{m.stage}</Text>
                          </View>
                          <View style={{ alignItems: 'flex-end' }}>
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
                            <Ionicons name="call-outline" size={14} color={COLORS.text} />
                            <Text style={s.contactBtnText} numberOfLines={1}>{t('btn_call_member', 'Call Member')}</Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={s.takeOverBtn}
                            onPress={() => handleTakeOver(m)}
                            activeOpacity={0.8}
                          >
                            <Ionicons name="navigate-outline" size={14} color={COLORS.primary} />
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
            <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: '#E8F5E9', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
              <Ionicons name="shield-checkmark" size={28} color={COLORS.success} />
            </View>
            <Text style={{ fontSize: 16, fontWeight: '800', color: COLORS.text, textAlign: 'center' }}>
              {t('sync_status_synced', 'Terminal Connected to')} {session.farm || 'Nacayao Block Farm'}
            </Text>
            <Text style={{ fontSize: 12, color: COLORS.textMuted, textAlign: 'center', marginTop: 4, lineHeight: 18 }}>
              {t('sync_toast_synced', 'Your offline operation logs and resource entries are automatically synchronized when online connectivity is detected.')}
            </Text>

            <View style={{ width: '100%', backgroundColor: '#F8FAF6', borderRadius: RADIUS.md, padding: 12, borderWidth: 1, borderColor: '#E2E8DC', marginVertical: 16, gap: 8 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 11, color: COLORS.textMuted }}>{t('my_field', 'My Field')}:</Text>
                <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.text }}>{session.fieldId || 'FLD-NCY-001'} (1.5 Ha)</Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 11, color: COLORS.textMuted }}>{t('profile_supervising_farm', 'Supervising Manager')}:</Text>
                <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.text }}>Jose Reyes ({session.farm || 'Nacayao Block Farm'})</Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 11, color: COLORS.textMuted }}>{t('sync_info', 'Latest Sync')}:</Text>
                <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.primary }}>{formatSyncTime(syncHealth.lastSync)}</Text>
              </View>
            </View>

            <View style={{ flexDirection: 'row', gap: 8, width: '100%' }}>
              <TouchableOpacity
                style={{ flex: 1, backgroundColor: COLORS.primary, paddingVertical: 12, paddingHorizontal: 6, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 5 }}
                onPress={() => {
                  performMobileSync();
                  Alert.alert(t('sync_status_synced', 'Sync Successful'), `Your local logs are now fully synchronized with ${session.farm || 'Nacayao Block Farm'}.`);
                }}
              >
                <Ionicons name="sync" size={15} color="#FFF" />
                <Text style={{ color: '#FFF', fontSize: 11.5, fontWeight: '700', textAlign: 'center', flexShrink: 1 }} numberOfLines={1}>
                  {t('profile_sync_now', 'Sync Now')}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={{ flex: 1, backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E2E8DC', paddingVertical: 12, paddingHorizontal: 6, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 5 }}
                onPress={() => {
                  Alert.alert(
                    t('btn_call_manager', 'Contact Farm Manager'),
                    'Jose Reyes (0918-987-6543)\nWould you like to place a call?',
                    [
                      { text: t('btn_cancel', 'Cancel'), style: 'cancel' },
                      { text: t('btn_call_manager', 'Call Now'), onPress: () => Alert.alert('Dialing...', 'Calling 0918-987-6543') }
                    ]
                  );
                }}
              >
                <Ionicons name="call-outline" size={15} color={COLORS.text} />
                <Text style={{ color: COLORS.text, fontSize: 11.5, fontWeight: '700', textAlign: 'center', flexShrink: 1 }} numberOfLines={1}>
                  {t('btn_call_manager', 'Call Manager')}
                </Text>
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
  backBtn: { width: 36, height: 36, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F0F2EC' },
  headerTitle: { fontSize: 15, fontWeight: '800', color: COLORS.text },
  headerSub: { fontSize: 11, color: COLORS.textMuted, marginTop: 1 },
  scroll: { padding: SPACING.lg, gap: 12 },

  // Stats Bar
  statsBar: {
    flexDirection: 'row',
    backgroundColor: '#FFF',
    borderRadius: RADIUS.lg,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: '#E2E8DC',
    alignItems: 'center',
    ...SHADOW.sm,
  },
  statItem: { flex: 1, alignItems: 'center', paddingVertical: 4, borderRadius: RADIUS.md },
  statItemActive: { backgroundColor: '#F0F4EC' },
  statNum: { fontSize: 18, fontWeight: '800' },
  statLabel: { fontSize: 10, color: COLORS.textMuted, marginTop: 2, fontWeight: '600' },
  statDiv: { width: 1, height: 26, backgroundColor: '#E2E8DC' },

  // Alert Banner
  alertBanner: {
    borderRadius: RADIUS.lg,
    padding: 12,
    borderWidth: 1,
  },

  // Search
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    borderRadius: RADIUS.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#E2E8DC',
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 12, color: COLORS.text, padding: 0 },

  sectionTitle: { fontSize: 13, fontWeight: '800', color: COLORS.text, marginTop: 4 },

  emptyBox: {
    backgroundColor: '#FFF',
    borderRadius: RADIUS.lg,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8DC',
    gap: 6,
  },
  emptyText: { fontSize: 12, color: COLORS.textMuted, textAlign: 'center' },

  // Member Telemetry Card
  memberCard: {
    backgroundColor: '#FFF',
    borderRadius: RADIUS.lg,
    padding: 14,
    borderWidth: 1,
    gap: 10,
    ...SHADOW.sm,
  },
  memberTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  memberAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.primaryBg, alignItems: 'center', justifyContent: 'center' },
  memberAvatarText: { fontSize: 14, fontWeight: '800', color: COLORS.primary },
  memberName: { fontSize: 13, fontWeight: '700', color: COLORS.text },
  memberFieldId: { fontSize: 11, fontWeight: '700', color: COLORS.primary },

  healthBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, borderWidth: 1 },
  healthDot: { width: 6, height: 6, borderRadius: 3 },
  healthBadgeText: { fontSize: 10, fontWeight: '700' },

  memberDetailsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F0F2EC',
  },
  detailLabel: { fontSize: 10, color: COLORS.textMuted, textTransform: 'uppercase', fontWeight: '700' },
  detailValue: { fontSize: 12, fontWeight: '600', color: COLORS.text, marginTop: 2 },

  memberActionRow: { flexDirection: 'row', gap: 8, marginTop: 2 },
  contactBtn: {
    flex: 1,
    backgroundColor: '#F8FAF6',
    borderWidth: 1,
    borderColor: '#E2E8DC',
    paddingVertical: 8,
    borderRadius: RADIUS.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  contactBtnText: { fontSize: 11, fontWeight: '700', color: COLORS.text },
  takeOverBtn: {
    flex: 1,
    backgroundColor: COLORS.primaryBg,
    paddingVertical: 8,
    borderRadius: RADIUS.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  takeOverBtnText: { fontSize: 11, fontWeight: '700', color: COLORS.primary },

  // Filter Pills
  filterPill: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#E2E8DC', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 },
  filterPillActive: { backgroundColor: COLORS.primaryBg, borderColor: COLORS.primary },
  filterPillText: { fontSize: 11, fontWeight: '600', color: COLORS.textSecondary },
  filterPillTextActive: { color: COLORS.primary, fontWeight: '800' },

  // Member Terminal View
  memberTerminalCard: {
    backgroundColor: '#FFF',
    borderRadius: RADIUS.lg,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8DC',
    ...SHADOW.sm,
  },
});
