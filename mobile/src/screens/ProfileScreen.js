import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Modal, Dimensions, Alert, Switch, TextInput, Platform, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS, SHADOW } from '../theme';
import AppHeader from '../components/AppHeader';
import LegalPolicyModal from '../components/LegalPolicyModal';
import { subscribe, getIsSynced, getCurrentSession, setSynced, requestFieldAssignment, fields, operationLogs, draftLogs, supportTickets, submitSupportTicket, addSupportTicketMessage, resetLocalCache, authenticateUser, performMobileSync, logoutUser, blockFarms, getSortedPrices, auditReports } from '../data/dataStore';
import {
  getNetworkStatus,
  getConnectivityDetails,
  subscribeToNetwork,
  checkConnectivity,
  CONNECTIVITY_STATUS
} from '../services/networkService';
import { useTranslation, LANGUAGES } from '../services/i18n';
import { syncResultMessage } from '../domain/syncPresentation';
import { canCreateSupportTicket, SUPPORT_TICKET_CATEGORIES, supportStatusLabel } from '../domain/supportTickets';

const { height } = Dimensions.get('window');

export default function ProfileScreen({ navigation }) {
  const { t, language, setLanguage, formatSyncTime } = useTranslation();
  const [session, setSessionState] = useState(getCurrentSession());
  const [synced, setSyncedState] = useState(getIsSynced());
  const [isOnline, setIsOnline] = useState(getNetworkStatus());
  const [dataVersion, setDataVersion] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [lastSync, setLastSync] = useState('Today, 8:05 AM');
  const [langExpanded, setLangExpanded] = useState(false);
  const [autoSync, setAutoSync] = useState(true);
  const [showTicketsModal, setShowTicketsModal] = useState(false);
  const [showLegalModal, setShowLegalModal] = useState(false);
  const [ticketTab, setTicketTab] = useState('active');
  const [ticketForm, setTicketForm] = useState({ title: '', category: 'Synchronization', details: '' });
  const [ticketsList, setTicketsList] = useState(supportTickets);
  const [isSubmittingTicket, setIsSubmittingTicket] = useState(false);
  const ticketSubmitLock = useRef(false);
  const [ticketReplies, setTicketReplies] = useState({});
  const [sendingTicketReplyId, setSendingTicketReplyId] = useState(null);

  const sessionUserId = session?.id || session?.employeeId || '';
  const memberFields = fields.filter(field => field.memberUserId === sessionUserId);
  const managedFarm = blockFarms.find(farm => farm.managerUserId === sessionUserId);
  const memberFarm = blockFarms.find(farm => farm.id === memberFields[0]?.blockFarmId);
  const assignedFarm = session?.role === 'Farm Manager' ? managedFarm : memberFarm;
  const ticketCreationAllowed = canCreateSupportTicket(session?.canonicalRole || session?.role || session?.roleKey);
  const activeTickets = ticketsList.filter(ticket => ['PENDING_SUBMISSION', 'OPEN', 'IN_PROGRESS'].includes(String(ticket.status || '').replace(/[\s-]+/g, '_').toUpperCase()));
  const ticketHistory = ticketsList.filter(ticket => ['RESOLVED', 'CLOSED'].includes(String(ticket.status || '').replace(/[\s-]+/g, '_').toUpperCase()));

  useEffect(() => {
    const unsubscribeSession = subscribe(() => {
      const sess = getCurrentSession();
      setSessionState({ ...sess });
      setSyncedState(getIsSynced());
      setDataVersion(v => v + 1);
    });
    const unsubscribeNetwork = subscribeToNetwork((online) => {
      setIsOnline(online);
    });
    return () => {
      unsubscribeSession();
      unsubscribeNetwork();
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      setSessionState({ ...getCurrentSession() });
      setSyncedState(getIsSynced());
      setIsOnline(getNetworkStatus());
      setDataVersion(v => v + 1);
    }, [])
  );

  const doSync = async () => {
    if (!isOnline) {
      Alert.alert(
        'Offline Mode Active',
        'You are currently offline. Operations are stored locally and will sync once reconnected.',
        [
          {
            text: 'Check Connection',
            onPress: async () => {
              setSyncing(true);
              try {
                const online = await checkConnectivity({ force: true });
                if (online) {
                  const result = await performMobileSync('MANUAL_SYNC');
                  setSyncedState(result.remainingCount === 0);
                  Alert.alert(
                    result.remainingCount === 0 ? t('sync_complete_title', 'Online & Synced') : 'Sync Incomplete',
                    syncResultMessage(result),
                    result.remainingCount > 0 && (session?.role === 'Farm Member' || session?.role === 'Farm Manager') ? [
                      { text: 'View Sync Details', onPress: () => navigation.navigate('SyncMonitor') },
                      { text: 'Try Again', onPress: () => doSync() },
                      { text: 'Close', style: 'cancel' }
                    ] : undefined
                  );
                } else {
                  const serverUnavailable = getConnectivityDetails().status === CONNECTIVITY_STATUS.SERVER_UNAVAILABLE;
                  Alert.alert(
                    serverUnavailable ? 'HUGPONG Server Unavailable' : 'Still Offline',
                    serverUnavailable
                      ? 'Your internet connection is active, but HUGPONG is temporarily unavailable. Local storage remains active.'
                      : 'Could not establish internet connection. Local storage remains active.'
                  );
                }
              } catch (e) {
                Alert.alert('Connection Check', 'Unable to complete connection check.');
              } finally {
                setSyncing(false);
              }
            }
          },
          { text: 'OK', style: 'cancel' }
        ]
      );
      return;
    }
    setSyncing(true);
    try {
      const result = await performMobileSync('MANUAL_SYNC');
      setSyncedState(result.remainingCount === 0);
      Alert.alert(
        result.remainingCount === 0 ? t('sync_complete_title', 'Sync Complete') : 'Sync Incomplete',
        syncResultMessage(result),
        result.remainingCount > 0 && (session?.role === 'Farm Member' || session?.role === 'Farm Manager') ? [
          { text: 'View Sync Details', onPress: () => navigation.navigate('SyncMonitor') },
          { text: 'Try Again', onPress: () => doSync() },
          { text: 'Close', style: 'cancel' }
        ] : undefined
      );
    } catch (e) {
      Alert.alert(t('sync_error_title', 'Sync Failed'), e.message || 'Unable to complete sync.');
    } finally {
      setSyncing(false);
    }
  };

  const clearCache = () => {
    Alert.alert(
      t('cache_clear_confirm_title', 'Clear Cache?'),
      t('cache_clear_confirm_msg', 'This will remove all locally cached drafts and reset offline buffers. Unsynced local drafts will be wiped.\n\nAre you sure you want to proceed?'),
      [
        { text: t('btn_cancel', 'Cancel'), style: 'cancel' },
        { 
          text: t('profile_cache', 'Clear Local Cache'), 
          style: 'destructive', 
          onPress: async () => {
            await resetLocalCache();
            Alert.alert(t('cache_cleared', 'Cache Cleared'), t('cache_cleared_msg', 'Local offline buffer and cached drafts have been reset.'));
          } 
        },
      ]
    );
  };

  const completeSignOut = async () => {
    if (isSigningOut) return;
    setIsSigningOut(true);
    try {
      await logoutUser();
      navigation.replace('Login');
    } catch (error) {
      Alert.alert(t('error_title', 'Sign Out Failed'), error.message || 'Unable to end the current session. Please try again.');
    } finally {
      setIsSigningOut(false);
    }
  };

  const signOut = () => {
    if (isSigningOut) return;
    if (Number(session?.pendingLogs || 0) > 0) {
      Alert.alert(
        t('signout_confirm_title', 'Sign Out'),
        t('signout_unsynced_msg', 'You have pending unsynced records. Signing out without syncing may cause data loss. Please sync first or proceed anyway.'),
        [
          { text: t('btn_sync_now', 'Sync First'), onPress: doSync },
          { 
            text: t('signout_btn_anyway', 'Sign Out Anyway'), 
            style: 'destructive', 
            onPress: completeSignOut
          },
          { text: t('btn_cancel', 'Cancel'), style: 'cancel' },
        ]
      );
    } else {
      Alert.alert(
        t('signout_confirm_title', 'Sign Out'),
        t('signout_confirm_msg', 'Are you sure you want to sign out?'),
        [
          { text: t('btn_cancel', 'Cancel'), style: 'cancel' },
          { 
            text: t('profile_logout', 'Sign Out'), 
            style: 'destructive', 
            onPress: completeSignOut
          },
        ]
      );
    }
  };

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <AppHeader />

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {!isOnline && (
          <View style={s.offlineBanner}>
            <Ionicons name="cloud-offline-outline" size={18} color="#B45309" />
            <Text style={s.offlineBannerText}>
              Offline Mode Active · Profile credentials and cloud sync settings are read-only until reconnected.
            </Text>
          </View>
        )}

        {/* ── 1. Account Section ── */}
        <View style={s.sectionHeaderWrap}>
          <Text style={s.sectionHeaderTitle}>Account</Text>
        </View>
        <View style={[s.card, s.identityCard]}>
          <View style={s.avatarWrap}>
            <Text style={s.avatarText}>
              {session?.name ? session.name.split(' ').map(n => n[0]).join('').slice(0, 2) : 'U'}
            </Text>
          </View>
          <View style={s.identityInfo}>
            <Text style={s.identityName}>{session?.name || 'User'}</Text>
            <View style={s.roleBadge}>
              <Text style={s.roleText}>
                {session?.role === 'Farm Member' ? t('role_member', 'Farm Member') : (session?.role === 'Farm Manager' ? t('role_manager', 'Farm Manager') : t('role_sra', 'SRA Admin'))}
              </Text>
            </View>
            <Text style={s.identityId}>ID: {session?.employeeId || session?.contact || '—'}</Text>
          </View>
        </View>

        {/* ── 2. Farm & Field Context ── */}
        <View style={s.sectionHeaderWrap}>
          <Text style={s.sectionHeaderTitle}>
            {session?.role === 'SRA Admin' ? t('profile_admin_jurisdiction', 'Administrative Jurisdiction') : t('profile_op_assignment', 'Farm & Field Context')}
          </Text>
        </View>
        <View style={s.card}>
          {[
            { 
              key: 'farm_agency',
              icon: 'business', 
              label: session?.role === 'SRA Admin' ? t('profile_regulatory_agency', 'Regulatory Agency') : (session?.role === 'Farm Manager' ? t('profile_supervising_farm', 'Supervising Farm') : t('profile_block_farm', 'Block Farm')),
              value: session?.role === 'SRA Admin' ? 'Sugar Regulatory Administration (SRA)' : (assignedFarm?.name || 'Unassigned')
            },
            { 
              key: 'field_scope',
              icon: 'map', 
              label: session?.role === 'SRA Admin'
                ? t('profile_admin_jurisdiction', 'Jurisdiction') 
                : (session?.role === 'Farm Manager' ? t('profile_supervised_scope', 'Supervised Scope') : t('my_fields', 'My Field(s)')), 
              value: (() => {
                if (session?.role === 'SRA Admin') {
                  const districtName = session?.district || 'District 3 · Silay';
                  const loc = session?.location || 'Silay Mill District, Negros Occidental';
                  return `${districtName} · ${loc}`;
                }
                if (session?.role === 'Farm Manager') {
                  const managedFields = fields.filter(field => field.blockFarmId === managedFarm?.id);
                  const totalHa = managedFields.reduce((sum, f) => sum + (Number(f.ha) || 0), 0);
                  return `${managedFarm?.name || 'Unassigned'} (${managedFields.length} Plots · ${totalHa.toFixed(1)} Ha)`;
                }
                if (memberFields.length > 0) {
                  return memberFields.map(f => `${f.id} (${f.ha} Ha)`).join(', ');
                }
                return 'No Plot Assigned';
              })()
            },
            { key: 'mobile_contact', icon: 'call', label: t('profile_mobile_contact', 'Mobile Contact'), value: session.mobile || session.contact || '—' },
          ].map((r, idx, arr) => (
            <View key={r.key} style={[s.infoRowClean, idx < arr.length - 1 && s.infoRowBorder]}>
              <View style={s.infoIconWrapClean}>
                <Ionicons name={r.icon} size={18} color={COLORS.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.infoLabelClean}>{r.label}</Text>
                <Text style={s.infoValueClean}>{r.value}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* ── SRA Regulatory Status (SRA Admin only) ── */}
        {session?.role === 'SRA Admin' && (
          <>
            <View style={s.sectionHeaderWrap}>
              <Text style={s.sectionHeaderTitle}>{t('profile_sra_status', 'SRA Regulatory Data Status')}</Text>
            </View>
            <View style={[s.card, s.telemetryPanel]}>
              <View style={s.syncHeader}>
                <View style={s.telemetryTitleGroup}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.cardSubTitle}>Regulatory Data Status</Text>
                    <Text style={s.telemetrySubtitle}>Current synchronized district records</Text>
                  </View>
                </View>
                <View style={[s.telemetryStatusBadge, !isOnline && s.telemetryStatusBadgeOffline]}>
                  <View style={[s.syncStatusDot, { backgroundColor: isOnline ? COLORS.success : COLORS.accent }]} />
                  <Text style={[s.telemetryStatusText, !isOnline && s.telemetryStatusTextOffline]}>
                    {isOnline ? 'Online' : 'Offline'}
                  </Text>
                </View>
              </View>

              <View style={s.telemetryList}>
                {/* District Certification */}
                <View style={[s.telemetryRowClean, s.telemetryRowBorder]}>
                  <View style={s.telemetryRowIcon}>
                    <Ionicons name="shield-checkmark-outline" size={17} color={COLORS.primary} />
                  </View>
                  <View style={s.telemetryRowBody}>
                    <Text style={s.telemetryLabelClean}>{t('profile_district_cert', 'District Certification')}</Text>
                    <Text style={s.telemetryValueClean}>
                      {(() => {
                        const district = session?.district || 'District 3 · Silay';
                        const certCount = (auditReports || []).filter(a => String(a.status || '').toUpperCase() === 'CERTIFIED').length;
                        const totalAudits = (auditReports || []).length;
                        const totalHa = (fields || []).reduce((sum, f) => sum + (Number(f.ha) || 0), 0);
                        if (totalAudits > 0) {
                          return `${district} · ${certCount}/${totalAudits} Certified (${totalHa.toFixed(1)} Ha)`;
                        }
                        if (totalHa > 0) {
                          return `${district} · ${totalHa.toFixed(1)} Ha Monitored`;
                        }
                        return `${district} · No audit or field records`;
                      })()}
                    </Text>
                  </View>
                </View>

                {/* SRA Circular Version */}
                <View style={[s.telemetryRowClean, s.telemetryRowBorder]}>
                  <View style={s.telemetryRowIcon}>
                    <Ionicons name="document-text-outline" size={17} color={COLORS.primary} />
                  </View>
                  <View style={s.telemetryRowBody}>
                    <Text style={s.telemetryLabelClean}>{t('profile_sra_circular', 'SRA Circular Version')}</Text>
                    <Text style={s.telemetryValueClean}>
                      {(() => {
                        const sorted = getSortedPrices();
                        if (sorted.length > 0) {
                          const item = sorted[0];
                          const circ = String(item.circularNumber || '').trim();
                          const week = String(item.weekLabel || '').trim();
                          let name = circ || 'Official SRA Circular';
                          if (name.length > 35) {
                            const m = name.match(/(SRA Circular\s*#?\s*\d+)/i);
                            if (m) name = `${m[1]} (Official Millsite Notice)`;
                          }
                          return week ? `${name} · ${week}` : name;
                        }
                        return 'No official circular published';
                      })()}
                    </Text>
                  </View>
                </View>

                {/* Cloud Central Node */}
                <View style={[s.telemetryRowClean, s.telemetryRowBorder]}>
                  <View style={s.telemetryRowIcon}>
                    <Ionicons name={isOnline ? 'cloud-done-outline' : 'cloud-offline-outline'} size={17} color={isOnline ? COLORS.success : COLORS.accent} />
                  </View>
                  <View style={s.telemetryRowBody}>
                    <Text style={s.telemetryLabelClean}>{t('profile_central_node', 'Cloud Central Node')}</Text>
                    <Text style={s.telemetryValueClean}>
                      {isOnline ? (synced ? 'Online · Local records synced' : 'Online · Synchronization pending') : 'Offline · Local records available'}
                    </Text>
                  </View>
                </View>

                {/* Audit Ledger Telemetry */}
                <View style={s.telemetryRowClean}>
                  <View style={s.telemetryRowIcon}>
                    <Ionicons name="layers-outline" size={17} color={COLORS.primary} />
                  </View>
                  <View style={s.telemetryRowBody}>
                    <Text style={s.telemetryLabelClean}>Audit Ledger Telemetry</Text>
                    <Text style={s.telemetryValueClean}>
                      {`${(operationLogs || []).length} Ops Logs · ${(auditReports || []).length} Audit Dossiers`}
                    </Text>
                  </View>
                </View>
              </View>
            </View>
          </>
        )}

        {/* ── 3. Sync & Data Management ── */}
        <View style={s.sectionHeaderWrap}>
          <Text style={s.sectionHeaderTitle}>Sync & Offline Data</Text>
        </View>
        <View style={s.card}>
          {(session?.role === 'Farm Member' || session?.role === 'Farm Manager') && (
            <View style={s.settingRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.settingLabel}>{t('profile_auto_sync', 'Automatic Cloud Sync')}</Text>
                <Text style={s.settingSubLabel}>Sync records automatically when connection is active</Text>
              </View>
              <Switch
                value={autoSync}
                onValueChange={setAutoSync}
                trackColor={{ false: COLORS.border, true: COLORS.primaryLight }}
                thumbColor={autoSync ? COLORS.primary : '#f4f3f4'}
              />
            </View>
          )}

          {(session?.role === 'Farm Manager' || session?.role === 'Farm Member') && (
            <TouchableOpacity 
              style={s.settingRow} 
              onPress={() => navigation.navigate('SyncMonitor')}
            >
              <View style={{ flex: 1 }}>
                <Text style={s.settingLabel}>
                  {session?.role === 'Farm Manager' ? t('profile_sync_monitor', 'Farm Member Sync Telemetry Monitor') : t('action_sync_hub', 'Sync Status & Diagnostics')}
                </Text>
                <Text style={s.settingSubLabel}>View queue, conflict logs, and connectivity</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
            </TouchableOpacity>
          )}

          <TouchableOpacity style={s.settingRow} onPress={clearCache}>
            <View style={{ flex: 1 }}>
              <Text style={[s.settingLabel, { color: '#DC2626' }]}>{t('profile_cache', 'Clear Local Cache')}</Text>
              <Text style={s.settingSubLabel}>Reset offline draft buffer and local cache</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
          </TouchableOpacity>
        </View>

        {/* ── 4. Preferences & Security ── */}
        <View style={s.sectionHeaderWrap}>
          <Text style={s.sectionHeaderTitle}>Preferences & Security</Text>
        </View>
        <View style={s.card}>
          <TouchableOpacity style={s.settingRow} onPress={() => setLangExpanded(e => !e)}>
            <View style={{ flex: 1 }}>
              <Text style={s.settingLabel}>{t('profile_language', 'Language / Wika')}</Text>
              <Text style={s.settingSubLabel}>{(LANGUAGES.find(l => l.key === language) || LANGUAGES[0])?.native} ({(LANGUAGES.find(l => l.key === language) || LANGUAGES[0])?.label})</Text>
            </View>
            <Ionicons name={langExpanded ? 'chevron-up' : 'chevron-down'} size={18} color={COLORS.textMuted} />
          </TouchableOpacity>

          {langExpanded && (
            <View style={s.langDropdown}>
              {LANGUAGES.map(lang => (
                <TouchableOpacity key={lang.key} style={s.langRow} onPress={() => { setLanguage(lang.key); setLangExpanded(false); }}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.langLabel}>{lang.native}</Text>
                    <Text style={s.langSub}>{lang.label}</Text>
                  </View>
                  {language === lang.key && <Ionicons name="checkmark-circle" size={20} color={COLORS.primary} />}
                </TouchableOpacity>
              ))}
            </View>
          )}

          <TouchableOpacity style={s.settingRow} onPress={() => navigation.navigate('Security')}>
            <View style={{ flex: 1 }}>
              <Text style={s.settingLabel}>{t('profile_security', 'Security & Password')}</Text>
              <Text style={s.settingSubLabel}>Update account password and authentication</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
          </TouchableOpacity>
        </View>

        {/* ── 5. Support & Feedback ── */}
        <View style={s.sectionHeaderWrap}>
          <Text style={s.sectionHeaderTitle}>Support</Text>
        </View>
        <View style={s.card}>
          <TouchableOpacity style={s.settingRow} onPress={() => setShowTicketsModal(true)}>
            <View style={{ flex: 1 }}>
              <Text style={s.settingLabel}>{t('profile_support', 'Help & Support Desk')}</Text>
              <Text style={s.settingSubLabel}>Create a ticket or check Super Admin responses</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
          </TouchableOpacity>
        </View>

        {/* ── 6. Legal & Compliance ── */}
        <View style={s.sectionHeaderWrap}>
          <Text style={s.sectionHeaderTitle}>Legal</Text>
        </View>
        <View style={s.card}>
          <TouchableOpacity style={s.settingRow} onPress={() => setShowLegalModal(true)}>
            <View style={{ flex: 1 }}>
              <Text style={s.settingLabel}>{t('profile_legal', 'Privacy, Terms & Compliance')}</Text>
              <Text style={s.settingSubLabel}>Current policies, data rights, and regulatory limits</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
          </TouchableOpacity>
        </View>

        {/* ── 7. Sign Out ── */}
        <TouchableOpacity
          style={[s.signOutBtn, isSigningOut && { opacity: 0.65 }]}
          onPress={signOut}
          disabled={isSigningOut}
        >
          {isSigningOut
            ? <ActivityIndicator size="small" color="#DC2626" />
            : <Ionicons name="log-out-outline" size={20} color="#DC2626" />}
          <Text style={s.signOutText}>
            {isSigningOut ? t('profile_signing_out', 'Signing Out...') : t('profile_logout', 'Sign Out')}
          </Text>
        </TouchableOpacity>

        <Text style={s.footerNote}>
          {t('profile_footer', 'v1.0.0 · HUGPONG Agricultural Platform\nOffline data may be cached on this device.')}
        </Text>
      </ScrollView>

      {/* ── Support & Tickets Modal ── */}
      <Modal visible={showTicketsModal} animationType="slide" onRequestClose={() => setShowTicketsModal(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }} edges={['top', 'bottom']}>
            {/* Header */}
            <View style={s.ticketHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                <View style={s.ticketIconWrap}>
                  <Ionicons name="help-buoy-outline" size={22} color={COLORS.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.ticketTitle}>{t('support_desk_title', 'Help & Support Desk')}</Text>
                  <Text style={s.ticketSub}>{t('support_desk_sub', 'Create a support ticket and check Super Admin responses')}</Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => setShowTicketsModal(false)} style={s.ticketCloseBtn}>
                <Ionicons name="close" size={20} color={COLORS.text} />
              </TouchableOpacity>
            </View>

            {/* Segment Switcher */}
            <View style={s.ticketTabWrap}>
              <View style={s.ticketSegmentTrack}>
                {ticketCreationAllowed && (
                  <TouchableOpacity
                    style={[s.ticketTabBtn, ticketTab === 'submit' && s.ticketTabBtnActive]}
                    onPress={() => setTicketTab('submit')}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="create-outline" size={14} color={ticketTab === 'submit' ? COLORS.primary : COLORS.textMuted} />
                    <Text style={[s.ticketTabText, ticketTab === 'submit' && s.ticketTabTextActive]} numberOfLines={1}>
                      {t('ticket_tab_send', 'New Ticket')}
                    </Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  style={[s.ticketTabBtn, ticketTab === 'active' && s.ticketTabBtnActive]}
                  onPress={() => setTicketTab('active')}
                  activeOpacity={0.7}
                >
                  <Ionicons name="file-tray-full-outline" size={14} color={ticketTab === 'active' ? COLORS.primary : COLORS.textMuted} />
                  <Text style={[s.ticketTabText, ticketTab === 'active' && s.ticketTabTextActive]} numberOfLines={1}>
                    {t('ticket_tab_my', 'My Tickets')} ({activeTickets.length})
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.ticketTabBtn, ticketTab === 'history' && s.ticketTabBtnActive]}
                  onPress={() => setTicketTab('history')}
                  activeOpacity={0.7}
                >
                  <Ionicons name="time-outline" size={14} color={ticketTab === 'history' ? COLORS.primary : COLORS.textMuted} />
                  <Text style={[s.ticketTabText, ticketTab === 'history' && s.ticketTabTextActive]} numberOfLines={1}>
                    History
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Body */}
            <ScrollView contentContainerStyle={{ padding: SPACING.lg, gap: SPACING.md, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
              {ticketTab === 'submit' ? (
                <>
                  <View style={s.ticketNoticeBox}>
                    <Ionicons name="information-circle-outline" size={20} color={COLORS.primary} />
                    <Text style={s.ticketNoticeText}>
                      {t('ticket_intro', 'Need assistance with offline sync, plot boundaries, or app errors? Your ticket will be queued directly to the cooperative dispatch team.')}
                    </Text>
                  </View>

                  {/* Category Picker */}
                  <View style={{ gap: 6 }}>
                    <Text style={s.formLabel}>{t('ticket_issue_category', 'Issue Category')}</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                      {SUPPORT_TICKET_CATEGORIES.map(category => {
                        const active = ticketForm.category === category;
                        return (
                          <TouchableOpacity
                            key={category}
                            style={[s.categoryChip, active && s.categoryChipActive]}
                            onPress={() => setTicketForm(p => ({ ...p, category }))}
                            activeOpacity={0.8}
                          >
                            <Text style={[s.categoryChipText, active && s.categoryChipTextActive]}>{category}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>

                  {/* Subject */}
                  <View style={{ gap: 6 }}>
                    <Text style={s.formLabel}>{t('ticket_subject', 'Subject / Short Summary')}</Text>
                    <TextInput
                      style={s.ticketInput}
                      placeholder="e.g. Cannot sync field operation logs"
                      placeholderTextColor={COLORS.textMuted}
                      value={ticketForm.title}
                      onChangeText={val => setTicketForm(p => ({ ...p, title: val }))}
                    />
                  </View>

                  {/* Details */}
                  <View style={{ gap: 6 }}>
                    <Text style={s.formLabel}>{t('ticket_description', 'Detailed Description')}</Text>
                    <TextInput
                      style={[s.ticketInput, s.ticketInputArea]}
                      placeholder="Describe what happened, any error messages, or what you need help with..."
                      placeholderTextColor={COLORS.textMuted}
                      multiline
                      value={ticketForm.details}
                      onChangeText={val => setTicketForm(p => ({ ...p, details: val }))}
                    />
                  </View>

                  {/* Submit Button */}
                  <TouchableOpacity
                    style={[s.ticketSubmitBtn, (!ticketForm.title.trim() || !ticketForm.details.trim() || isSubmittingTicket) && { opacity: 0.5 }]}
                    disabled={!ticketForm.title.trim() || !ticketForm.details.trim() || isSubmittingTicket}
                    onPress={async () => {
                      if (ticketSubmitLock.current) return;
                      ticketSubmitLock.current = true;
                      setIsSubmittingTicket(true);
                      try {
                        const created = await submitSupportTicket({
                          title: ticketForm.title.trim(),
                          category: ticketForm.category,
                          details: ticketForm.details.trim()
                        });
                        setTicketsList([...supportTickets]);
                        setTicketForm({ title: '', category: 'Synchronization', details: '' });
                        setTicketTab('active');
                        Alert.alert(
                          created?.queued ? 'Ticket Queued' : 'Ticket Submitted',
                          created?.queued
                            ? 'Ticket queued for submission. It will be sent automatically when the connection returns.'
                            : `Support received ticket #${created?.id || 'TICK-NEW'}. Status: Open.`
                        );
                      } catch (error) {
                        Alert.alert('Unable to Save Ticket', error.message || 'Please try again.');
                      } finally {
                        ticketSubmitLock.current = false;
                        setIsSubmittingTicket(false);
                      }
                    }}
                  >
                    {isSubmittingTicket ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="paper-plane-outline" size={17} color="#fff" />}
                    <Text style={s.ticketSubmitBtnText}>{isSubmittingTicket ? 'Submitting...' : t('ticket_btn_send', 'Submit Ticket')}</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  {(ticketTab === 'history' ? ticketHistory : activeTickets).length === 0 ? (
                    <View style={s.emptyTicketBox}>
                      <Ionicons name="chatbubbles-outline" size={42} color={COLORS.textMuted} />
                      <Text style={s.emptyTicketTitle}>{ticketTab === 'history' ? 'No Ticket History Yet' : 'No Active Support Tickets'}</Text>
                      <Text style={s.emptyTicketSub}>{ticketTab === 'history' ? 'Resolved tickets will appear here.' : 'Create a ticket whenever you need help from Super Admin.'}</Text>
                      {ticketCreationAllowed && ticketTab !== 'history' && <TouchableOpacity style={s.createFirstTicketBtn} onPress={() => setTicketTab('submit')}><Text style={s.createFirstTicketText}>Create Ticket</Text></TouchableOpacity>}
                    </View>
                  ) : (
                    (ticketTab === 'history' ? ticketHistory : activeTickets).map(t => {
                      const canonicalStatus = String(t.status || 'OPEN').replace(/[\s-]+/g, '_').toUpperCase();
                      const isResolved = canonicalStatus === 'RESOLVED' || canonicalStatus === 'CLOSED';
                      const isInProgress = canonicalStatus === 'IN_PROGRESS';
                      const isPending = canonicalStatus === 'PENDING_SUBMISSION';
                      const statusBg = isResolved ? '#E8F5E9' : (isInProgress ? '#E8F5E4' : '#FFF8E1');
                      const statusBorder = isResolved ? '#C8E6C9' : (isInProgress ? '#A3D9A5' : '#FDE68A');
                      const statusColor = isResolved ? COLORS.success : (isInProgress ? COLORS.primary : '#A16207');
                      const statusIcon = isResolved ? 'checkmark-circle' : (isInProgress ? 'time-outline' : (isPending ? 'cloud-upload-outline' : 'ellipse-outline'));
                      const statusText = supportStatusLabel(canonicalStatus);

                      const ticketTitle = t.title || t.subject || 'Support Ticket';
                      const ticketDetails = t.details || t.messages?.[0]?.text || 'No description provided';
                      const ticketDate = t.date || (t.createdAt ? new Date(t.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Recent');

                      return (
                        <View key={t.id} style={s.ticketCard}>
                          <View style={s.ticketTopRow}>
                            <View style={s.ticketIdBadge}>
                              <Ionicons name="ticket-outline" size={12} color={COLORS.primary} />
                              <Text style={s.ticketIdText}>{t.id}</Text>
                            </View>
                            <View style={[s.ticketStatusBadge, { backgroundColor: statusBg, borderColor: statusBorder }]}>
                              <Ionicons name={statusIcon} size={12} color={statusColor} />
                              <Text style={[s.ticketStatusText, { color: statusColor }]}>{statusText}</Text>
                            </View>
                          </View>

                          <Text style={s.ticketCardTitle}>{ticketTitle}</Text>
                          <Text style={s.ticketCardDetails}>{ticketDetails}</Text>

                          <View style={s.ticketMetaRow}>
                            <View style={s.ticketPill}>
                              <Text style={s.ticketPillText}>{t.category || 'Other'}</Text>
                            </View>
                            <View style={[s.priorityPill, t.priority === 'Critical' ? { backgroundColor: '#FEE2E2' } : (t.priority === 'High' ? { backgroundColor: '#FEF3C7' } : { backgroundColor: '#F0F8EC' })]}>
                              <Text style={[s.priorityPillText, t.priority === 'Critical' ? { color: '#DC2626' } : (t.priority === 'High' ? { color: '#D97706' } : { color: COLORS.primary })]}>
                                {t.priority || 'Normal'}
                              </Text>
                            </View>
                            <Text style={s.ticketDateText}>{ticketDate}</Text>
                          </View>

                          {(t.messages || []).slice(1).map((message, index) => (
                            <View key={message.messageId || index} style={s.adminResponseBox}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                <Ionicons name="chatbubble-ellipses-outline" size={13} color={COLORS.primary} />
                                <Text style={[s.adminResponseLabel, { color: COLORS.primary }]}>{message.authorName || 'Super Admin'}:</Text>
                              </View>
                              <Text style={s.adminResponseBody}>{message.content || message.text}</Text>
                            </View>
                          ))}

                          {t.resolutionNotes && !(t.messages || []).some(message => message.content === t.resolutionNotes) ? (
                            <View style={s.adminResponseBox}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                <Ionicons name="checkmark-done" size={13} color={COLORS.success} />
                                <Text style={s.adminResponseLabel}>Admin Resolution Response:</Text>
                              </View>
                              <Text style={s.adminResponseBody}>{t.resolutionNotes}</Text>
                            </View>
                          ) : null}

                          {['PENDING_SUBMISSION', 'OPEN', 'IN_PROGRESS'].includes(canonicalStatus) && (
                            <View style={{ gap: 8, marginTop: 4 }}>
                              <TextInput
                                style={s.ticketInput}
                                placeholder="Add a follow-up message..."
                                placeholderTextColor={COLORS.textMuted}
                                value={ticketReplies[t.id] || ''}
                                onChangeText={value => setTicketReplies(current => ({ ...current, [t.id]: value }))}
                                editable={sendingTicketReplyId !== t.id}
                              />
                              <TouchableOpacity
                                style={[s.ticketSubmitBtn, { marginTop: 0, minHeight: 42, paddingVertical: 10 }, (!String(ticketReplies[t.id] || '').trim() || sendingTicketReplyId === t.id) && { opacity: 0.5 }]}
                                disabled={!String(ticketReplies[t.id] || '').trim() || sendingTicketReplyId === t.id}
                                onPress={async () => {
                                  setSendingTicketReplyId(t.id);
                                  try {
                                    const result = await addSupportTicketMessage(t.id, ticketReplies[t.id]);
                                    setTicketsList([...supportTickets]);
                                    setTicketReplies(current => ({ ...current, [t.id]: '' }));
                                    Alert.alert(result.queued ? 'Follow-up Queued' : 'Follow-up Sent', result.queued ? 'Your message is saved and will be retried when connected.' : 'Your follow-up is now visible to support.');
                                  } catch (error) {
                                    Alert.alert('Unable to Send', error.message || 'Please try again.');
                                  } finally {
                                    setSendingTicketReplyId(null);
                                  }
                                }}
                              >
                                {sendingTicketReplyId === t.id ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="send-outline" size={15} color="#fff" />}
                                <Text style={s.ticketSubmitBtnText}>{sendingTicketReplyId === t.id ? 'Sending...' : 'Send Follow-up'}</Text>
                              </TouchableOpacity>
                            </View>
                          )}
                        </View>
                      );
                    })
                  )}
                </>
              )}
            </ScrollView>
          </SafeAreaView>
      </Modal>

      <LegalPolicyModal visible={showLegalModal} onClose={() => setShowLegalModal(false)} />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  iconBtn: { padding: 8, minHeight: 44, minWidth: 44, justifyContent: 'center', alignItems: 'center' },
  scroll: { padding: SPACING.md, gap: SPACING.md, paddingBottom: 24 },
  card: { backgroundColor: '#fff', borderRadius: RADIUS.lg, padding: SPACING.md, ...SHADOW.card },

  offlineBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FEF0D0',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: RADIUS.md,
  },
  offlineBannerText: { flex: 1, fontSize: 12, color: '#92400E', fontWeight: '600', lineHeight: 16 },

  sectionHeaderWrap: { marginTop: 4, marginBottom: -4, paddingHorizontal: 4 },
  sectionHeaderTitle: { fontSize: 13, fontWeight: '700', color: COLORS.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 },

  // Identity
  identityCard: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  avatarWrap: { width: 56, height: 56, borderRadius: 28, backgroundColor: COLORS.primary, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  avatarText: { fontSize: 20, fontWeight: '800', color: '#fff' },
  identityInfo: { flex: 1, gap: 3 },
  identityName: { fontSize: 18, fontWeight: '700', color: COLORS.text },
  roleBadge: { backgroundColor: COLORS.primaryBg, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 3, alignSelf: 'flex-start' },
  roleText: { fontSize: 12, fontWeight: '700', color: COLORS.primary },
  identityId: { fontSize: 12, color: COLORS.textMuted },

  // Info rows
  cardSubTitle: { fontSize: 15, fontWeight: '800', color: COLORS.text },
  infoRowClean: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  infoRowBorder: { borderBottomWidth: 1, borderBottomColor: '#F0F4EC' },
  infoIconWrapClean: { width: 38, height: 38, borderRadius: 10, backgroundColor: '#F0F8EC', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#D7ECD1' },
  infoLabelClean: { fontSize: 11, fontWeight: '700', color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 0.3 },
  infoValueClean: { fontSize: 14, fontWeight: '800', color: COLORS.text, marginTop: 2 },

  // Telemetry
  telemetryPanel: { padding: 14, gap: 14 },
  syncHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  telemetryTitleGroup: { flex: 1 },
  telemetrySubtitle: { fontSize: 10.5, color: COLORS.textMuted, marginTop: 1, lineHeight: 14 },
  telemetryStatusBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#F0F8EC', paddingHorizontal: 8, paddingVertical: 5, borderRadius: RADIUS.full, borderWidth: 1, borderColor: '#D7ECD1' },
  telemetryStatusBadgeOffline: { backgroundColor: '#FFF8E8', borderColor: '#F4DEAA' },
  telemetryStatusText: { fontSize: 10.5, fontWeight: '800', color: COLORS.primary },
  telemetryStatusTextOffline: { color: '#9A6700' },
  syncStatusDot: { width: 8, height: 8, borderRadius: 4 },
  telemetryList: {
    backgroundColor: '#FAFCF8',
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: '#E6EEE2',
    overflow: 'hidden'
  },
  telemetryRowClean: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 12, paddingVertical: 11 },
  telemetryRowBorder: { borderBottomWidth: 1, borderBottomColor: '#E8EFE4' },
  telemetryRowIcon: { width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F0F7EC' },
  telemetryRowBody: { flex: 1, minWidth: 0 },
  telemetryLabelClean: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.45
  },
  telemetryValueClean: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.text,
    lineHeight: 18,
    marginTop: 2
  },
  // Fallbacks for legacy references
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, paddingVertical: 10 },
  infoIconWrap: { width: 26 },
  infoLabel: { fontSize: 12, color: COLORS.textMuted },
  infoValue: { fontSize: 13, fontWeight: '700', color: COLORS.text },
  telemetryRow: { paddingVertical: 6 },
  telemetryLabel: { fontSize: 11, color: COLORS.textMuted },
  telemetryValue: { fontSize: 13, fontWeight: '700', color: COLORS.text },

  // Settings & Rows
  settingRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, minHeight: 48 },
  settingIcon: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  settingLabel: { fontSize: 14, color: COLORS.text, fontWeight: '600' },
  settingSubLabel: { fontSize: 12, color: COLORS.textMuted, marginTop: 1 },

  // Language Dropdown
  langDropdown: { marginTop: 4 },
  langRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, minHeight: 46 },
  langLabel: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  langSub: { fontSize: 12, color: COLORS.textMuted },

  // Sign Out
  signOutBtn: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FEF2F2',
    borderRadius: RADIUS.md,
    paddingVertical: 14,
    minHeight: 48,
    borderWidth: 1,
    borderColor: '#FECACA',
    marginTop: 4
  },
  signOutText: { fontSize: 15, fontWeight: '700', color: '#DC2626' },
  footerNote: { fontSize: 12, color: COLORS.textMuted, textAlign: 'center', lineHeight: 18, marginTop: 8 },

  // Tickets Modal Styles
  ticketOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  ticketContainer: { backgroundColor: '#fff', borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl, maxHeight: '92%', height: '92%' },
  ticketHeader: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    paddingHorizontal: SPACING.lg, 
    paddingVertical: SPACING.md, 
    borderBottomWidth: 1, 
    borderBottomColor: '#E2E8DC',
    backgroundColor: '#FFF'
  },
  ticketIconWrap: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#E8F5E4', alignItems: 'center', justifyContent: 'center' },
  ticketTitle: { fontSize: 17, fontWeight: '800', color: COLORS.text },
  ticketSub: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  ticketCloseBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#F0F4EC', alignItems: 'center', justifyContent: 'center' },
  
  ticketTabWrap: { paddingHorizontal: SPACING.lg, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#E2E8DC', backgroundColor: '#F8FAF5' },
  ticketSegmentTrack: { flexDirection: 'row', backgroundColor: '#EEF2E6', borderRadius: RADIUS.md, padding: 3, gap: 4 },
  ticketTabBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 9, paddingHorizontal: 4, minHeight: 40, borderRadius: RADIUS.sm },
  ticketTabBtnActive: { backgroundColor: '#FFF', ...SHADOW.card },
  ticketTabText: { fontSize: 12, fontWeight: '700', color: COLORS.textMuted },
  ticketTabTextActive: { color: COLORS.primaryDark, fontWeight: '800' },

  ticketNoticeBox: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#F2F7EF', borderWidth: 1, borderColor: '#DCE8D7', borderRadius: RADIUS.lg, padding: 12 },
  ticketNoticeText: { flex: 1, fontSize: 12.5, color: COLORS.textSecondary, lineHeight: 18 },

  formLabel: { fontSize: 13.5, fontWeight: '800', color: COLORS.text, marginBottom: 2 },
  categoryChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 13, paddingVertical: 9, minHeight: 40, borderRadius: RADIUS.full, backgroundColor: '#F4F7F1', borderWidth: 1.2, borderColor: '#DEE7D9' },
  categoryChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  categoryChipText: { fontSize: 12.5, fontWeight: '700', color: COLORS.textSecondary },
  categoryChipTextActive: { color: '#fff', fontWeight: '800' },

  priorityChip: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 10, minHeight: 42, borderRadius: RADIUS.md, backgroundColor: '#F4F7F1', borderWidth: 1.2, borderColor: '#DEE7D9' },
  priorityChipText: { fontSize: 12.5, fontWeight: '700', color: COLORS.textSecondary },

  ticketInput: { backgroundColor: '#FAFCF8', borderWidth: 1.2, borderColor: '#D8E2D3', borderRadius: RADIUS.lg, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, color: COLORS.text, minHeight: 46 },
  ticketInputArea: { height: 95, textAlignVertical: 'top' },

  ticketSubmitBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: COLORS.primary, paddingVertical: 14, minHeight: 50, borderRadius: RADIUS.lg, marginTop: 6, ...SHADOW.card },
  ticketSubmitBtnText: { fontSize: 15.5, fontWeight: '800', color: '#fff' },

  ticketCard: { backgroundColor: '#fff', borderRadius: RADIUS.xl, padding: 15, borderWidth: 1.2, borderColor: '#E2E8DC', gap: 8, ...SHADOW.card },
  ticketTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  ticketIdBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#F0F5EC', paddingHorizontal: 8, paddingVertical: 3.5, borderRadius: 6 },
  ticketIdText: { fontSize: 12, fontWeight: '800', color: COLORS.primary },
  ticketStatusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 4, borderRadius: RADIUS.full, borderWidth: 1 },
  ticketStatusText: { fontSize: 11.5, fontWeight: '800' },
  ticketCardTitle: { fontSize: 15.5, fontWeight: '800', color: COLORS.text, marginTop: 1 },
  ticketCardDetails: { fontSize: 13.5, color: COLORS.textSecondary, lineHeight: 19 },
  ticketMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#F0F4EC' },
  ticketPill: { backgroundColor: '#F2F6EF', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  ticketPillText: { fontSize: 11.5, fontWeight: '700', color: COLORS.textSecondary },
  priorityPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  priorityPillText: { fontSize: 11.5, fontWeight: '800' },
  ticketDateText: { fontSize: 11.5, color: COLORS.textMuted, marginLeft: 'auto' },

  adminResponseBox: { backgroundColor: '#F7FAF5', padding: 10, borderRadius: RADIUS.md, marginTop: 4, borderLeftWidth: 3, borderLeftColor: COLORS.success, gap: 3 },
  adminResponseLabel: { fontSize: 11.5, fontWeight: '800', color: COLORS.success },
  adminResponseBody: { fontSize: 12.5, color: COLORS.text, lineHeight: 17 },

  emptyTicketBox: { padding: 28, alignItems: 'center', gap: 8, backgroundColor: '#FBFDF9', borderRadius: RADIUS.xl, borderWidth: 1, borderColor: '#E5ECE0', marginTop: 10 },
  emptyTicketTitle: { fontSize: 15, fontWeight: '800', color: COLORS.text },
  emptyTicketSub: { fontSize: 12.5, color: COLORS.textMuted, textAlign: 'center', lineHeight: 18 },
  createFirstTicketBtn: { marginTop: 8, paddingHorizontal: 16, paddingVertical: 9, borderRadius: RADIUS.md, backgroundColor: COLORS.primaryBg },
  createFirstTicketText: { fontSize: 13, fontWeight: '800', color: COLORS.primary },
});
