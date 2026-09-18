import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Modal, Dimensions, Alert, Switch, TextInput, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS, SHADOW } from '../theme';
import AppHeader from '../components/AppHeader';
import { subscribe, getIsSynced, getCurrentSession, setSynced, requestFieldAssignment, fields, operationLogs, draftLogs, supportTickets, submitSupportTicket, resetLocalCache, authenticateUser, performMobileSync, logoutUser, blockFarms, getSortedPrices, auditReports } from '../data/dataStore';
import { getNetworkStatus, subscribeToNetwork, checkConnectivity } from '../services/networkService';
import { useTranslation, LANGUAGES } from '../services/i18n';

const { height } = Dimensions.get('window');

export default function ProfileScreen({ navigation }) {
  const { t, language, setLanguage, formatSyncTime } = useTranslation();
  const [session, setSessionState] = useState(getCurrentSession());
  const [synced, setSyncedState] = useState(getIsSynced());
  const [isOnline, setIsOnline] = useState(getNetworkStatus());
  const [dataVersion, setDataVersion] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState('Today, 8:05 AM');
  const [langExpanded, setLangExpanded] = useState(false);
  const [autoSync, setAutoSync] = useState(true);
  const [showTicketsModal, setShowTicketsModal] = useState(false);
  const [showLegalModal, setShowLegalModal] = useState(false);
  const [ticketTab, setTicketTab] = useState('submit');
  const [ticketForm, setTicketForm] = useState({ title: '', category: 'Offline Sync', priority: 'Normal', details: '' });
  const [ticketsList, setTicketsList] = useState(supportTickets);

  const sessionUserId = session?.id || session?.employeeId || '';
  const memberFields = fields.filter(field => field.memberUserId === sessionUserId);
  const managedFarm = blockFarms.find(farm => farm.managerUserId === sessionUserId);
  const memberFarm = blockFarms.find(farm => farm.id === memberFields[0]?.blockFarmId);
  const assignedFarm = session?.role === 'Farm Manager' ? managedFarm : memberFarm;

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
                const online = await checkConnectivity(3500);
                if (online) {
                  await performMobileSync();
                  setSyncedState(true);
                  Alert.alert(t('sync_complete_title', 'Online & Synced'), t('sync_complete_msg', 'Your records have been synchronized with the cloud server.'));
                } else {
                  Alert.alert('Still Offline', 'Could not establish internet connection. Local storage remains active.');
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
      await performMobileSync();
      setSyncedState(true);
      Alert.alert(t('sync_complete_title', 'Sync Complete'), t('sync_complete_msg', 'Your records have been synchronized with the cloud server.'));
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

  const signOut = () => {
    if (session.pendingLogs > 0) {
      Alert.alert(
        t('signout_confirm_title', 'Sign Out'),
        t('signout_unsynced_msg', 'You have pending unsynced records. Signing out without syncing may cause data loss. Please sync first or proceed anyway.'),
        [
          { text: t('btn_sync_now', 'Sync First'), onPress: doSync },
          { 
            text: t('signout_btn_anyway', 'Sign Out Anyway'), 
            style: 'destructive', 
            onPress: async () => {
              await logoutUser();
              navigation.replace('Login');
            } 
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
            onPress: async () => {
              await logoutUser();
              navigation.replace('Login');
            } 
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
                {session?.role === 'Member Farmer' ? t('role_member', 'Sugarcane Block Farm Member') : (session?.role === 'Farm Manager' ? t('role_manager', 'Block Farm Manager') : t('role_sra', 'SRA Administrator'))}
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
              label: session?.role === 'SRA Admin' ? t('profile_regulatory_agency', 'Regulatory Agency') : (session?.role === 'Farm Manager' ? t('profile_supervising_farm', 'Supervising Farm') : t('profile_block_farm', 'Block Farm Location')),
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
                  const districtName = session?.district || 'District not assigned';
                  const loc = session?.location || 'Location not assigned';
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
          ].map((r) => (
            <View key={r.key} style={s.infoRow}>
              <Ionicons name={r.icon} size={18} color={COLORS.primary} style={{ width: 26 }} />
              <Text style={s.infoLabel}>{r.label}</Text>
              <Text style={s.infoValue}>{r.value}</Text>
            </View>
          ))}
        </View>

        {/* ── SRA Regulatory Status (SRA Admin only) ── */}
        {session?.role === 'SRA Admin' && (
          <>
            <View style={s.sectionHeaderWrap}>
              <Text style={s.sectionHeaderTitle}>{t('profile_sra_status', 'SRA Regulatory System Status')}</Text>
            </View>
            <View style={s.card}>
              <View style={s.syncHeader}>
                <Text style={s.cardSubTitle}>Compliance & Circular Telemetry</Text>
                <View style={[s.syncStatusDot, { backgroundColor: getNetworkStatus() ? COLORS.success : COLORS.accent }]} />
              </View>
              
              <View style={s.telemetryRow}>
                <Text style={s.telemetryLabel}>{t('profile_district_cert', 'District Certification:')}</Text>
                <Text style={[s.telemetryValue, { color: COLORS.success }]}>
                  {(() => {
                    const district = session?.district || 'District not assigned';
                    const certCount = (auditReports || []).filter(a => a.status === 'CERTIFIED').length;
                    const totalAudits = (auditReports || []).length;
                    const totalHa = (fields || []).reduce((sum, f) => sum + (Number(f.ha) || 0), 0);
                    if (totalAudits > 0) {
                      return `${district} · ${certCount}/${totalAudits} Certified (${totalHa.toFixed(1)} Ha)`;
                    }
                    if (totalHa > 0) {
                      return `${district} · ${totalHa.toFixed(1)} Ha Monitored`;
                    }
                    return `${district} · 0 Registered Plots`;
                  })()}
                </Text>
              </View>

              <View style={s.telemetryRow}>
                <Text style={s.telemetryLabel}>{t('profile_sra_circular', 'SRA Circular Version:')}</Text>
                <Text style={[s.telemetryValue, { color: COLORS.primary }]}>
                  {(() => {
                    const sorted = getSortedPrices();
                    if (sorted.length > 0 && sorted[0].source) {
                      return `${sorted[0].circularNumber} · ${sorted[0].source} (${sorted[0].weekLabel})`;
                    }
                    if (sorted.length > 0 && sorted[0].weekLabel) {
                      return `${sorted[0].circularNumber} (${sorted[0].weekLabel})`;
                    }
                    return 'No Active Circular in Database';
                  })()}
                </Text>
              </View>

              <View style={s.telemetryRow}>
                <Text style={s.telemetryLabel}>{t('profile_central_node', 'Cloud Central Node:')}</Text>
                <Text style={[s.telemetryValue, { color: getNetworkStatus() ? COLORS.text : COLORS.accent }]}>
                  {getNetworkStatus() ? `Firebase & Gateway · ${synced ? 'Synced' : 'Syncing'}` : 'Offline Local Store Active'}
                </Text>
              </View>

              <View style={s.telemetryRow}>
                <Text style={s.telemetryLabel}>Audit Ledger Telemetry:</Text>
                <Text style={[s.telemetryValue, { color: COLORS.textSecondary }]}>
                  {`${(operationLogs || []).length} Ops Logs · ${(auditReports || []).length} Audit Dossiers`}
                </Text>
              </View>
            </View>
          </>
        )}

        {/* ── 3. Sync & Data Management ── */}
        <View style={s.sectionHeaderWrap}>
          <Text style={s.sectionHeaderTitle}>Sync & Offline Data</Text>
        </View>
        <View style={s.card}>
          {(session?.role === 'Member Farmer' || session?.role === 'Farm Manager') && (
            <View style={s.settingRow}>
              <View style={[s.settingIcon, { backgroundColor: COLORS.primaryBg }]}>
                <Ionicons name="cloud-upload-outline" size={18} color={COLORS.primary} />
              </View>
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

          {(session?.role === 'Farm Manager' || session?.role === 'Member Farmer') && (
            <TouchableOpacity 
              style={s.settingRow} 
              onPress={() => navigation.navigate('SyncMonitor')}
            >
              <View style={[s.settingIcon, { backgroundColor: COLORS.primaryBg }]}>
                <Ionicons name="pulse-outline" size={18} color={COLORS.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.settingLabel}>
                  {session?.role === 'Farm Manager' ? t('profile_sync_monitor', 'Member Sync Telemetry Monitor') : t('action_sync_hub', 'Sync Status & Diagnostics')}
                </Text>
                <Text style={s.settingSubLabel}>View queue, conflict logs, and connectivity</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
            </TouchableOpacity>
          )}

          <TouchableOpacity style={s.settingRow} onPress={clearCache}>
            <View style={[s.settingIcon, { backgroundColor: '#FEE2E2' }]}>
              <Ionicons name="trash-outline" size={18} color="#DC2626" />
            </View>
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
            <View style={[s.settingIcon, { backgroundColor: COLORS.primaryBg }]}>
              <Ionicons name="language-outline" size={18} color={COLORS.primary} />
            </View>
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
            <View style={[s.settingIcon, { backgroundColor: COLORS.primaryBg }]}>
              <Ionicons name="shield-checkmark-outline" size={18} color={COLORS.primary} />
            </View>
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
            <View style={[s.settingIcon, { backgroundColor: '#FEF3C7' }]}>
              <Ionicons name="help-buoy-outline" size={18} color="#D97706" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.settingLabel}>{t('profile_support', 'Help & Support Desk')}</Text>
              <Text style={s.settingSubLabel}>Submit issue tickets or request administrator assistance</Text>
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
            <View style={[s.settingIcon, { backgroundColor: COLORS.primaryBg }]}>
              <Ionicons name="document-text-outline" size={18} color={COLORS.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.settingLabel}>{t('profile_legal', 'Privacy Policy & Terms (RA 10173)')}</Text>
              <Text style={s.settingSubLabel}>Philippine Data Privacy Act compliance & rights</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
          </TouchableOpacity>
        </View>

        {/* ── 7. Sign Out ── */}
        <TouchableOpacity style={s.signOutBtn} onPress={signOut}>
          <Ionicons name="log-out-outline" size={20} color="#DC2626" />
          <Text style={s.signOutText}>{t('profile_logout', 'Sign Out')}</Text>
        </TouchableOpacity>

        <Text style={s.footerNote}>
          {t('profile_footer', 'v1.0.0 · HUGPONG Agricultural Platform\nData is encrypted and stored securely.')}
        </Text>
      </ScrollView>

      {/* ── Support & Tickets Modal ── */}
      <Modal visible={showTicketsModal} animationType="slide" onRequestClose={() => setShowTicketsModal(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }} edges={['top', 'bottom']}>
            {/* Header */}
            <View style={s.ticketHeader}>
              <View style={{ flex: 1 }}>
                <Text style={s.ticketTitle}>{t('support_desk_title', 'Help & Support Desk')}</Text>
                <Text style={s.ticketSub}>{t('support_desk_sub', 'Submit issues, sync collisions, or requests to SRA / Coop Admin')}</Text>
              </View>
              <TouchableOpacity onPress={() => setShowTicketsModal(false)} style={{ padding: 4 }}>
                <Ionicons name="close" size={22} color={COLORS.text} />
              </TouchableOpacity>
            </View>

            {/* Segment Switcher */}
            <View style={{ flexDirection: 'row', paddingHorizontal: SPACING.lg, paddingVertical: 10, gap: 10, borderBottomWidth: 1, borderBottomColor: COLORS.border, backgroundColor: '#F8FAF5' }}>
              <TouchableOpacity
                style={[s.ticketTabBtn, ticketTab === 'submit' && s.ticketTabBtnActive]}
                onPress={() => setTicketTab('submit')}
              >
                <Text style={[s.ticketTabText, ticketTab === 'submit' && s.ticketTabTextActive]}>{t('ticket_tab_send', 'Send New Ticket')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.ticketTabBtn, ticketTab === 'my' && s.ticketTabBtnActive]}
                onPress={() => setTicketTab('my')}
              >
                <Text style={[s.ticketTabText, ticketTab === 'my' && s.ticketTabTextActive]}>
                  {t('ticket_tab_my', 'My Tickets')} ({ticketsList.filter(t => t.author?.includes(session.name)).length || ticketsList.length})
                </Text>
              </TouchableOpacity>
            </View>

            {/* Body */}
            <ScrollView contentContainerStyle={{ padding: SPACING.lg, gap: SPACING.md, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
              {ticketTab === 'submit' ? (
                <>
                  <Text style={{ fontSize: 12, color: COLORS.textMuted, lineHeight: 18 }}>
                    {t('ticket_intro', 'Need assistance with offline sync, plot boundaries, or app errors? Your ticket will be queued directly to the cooperative dispatch team.')}
                  </Text>

                  {/* Category Picker */}
                  <View style={{ gap: 4 }}>
                    <Text style={s.formLabel}>{t('ticket_issue_category', 'Issue Category')}</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                      {['Offline Sync', 'App Glitch', 'Field Boundary', 'Agronomy & SRA', 'Other'].map(cat => (
                        <TouchableOpacity
                          key={cat}
                          style={[s.categoryChip, ticketForm.category === cat && s.categoryChipActive]}
                          onPress={() => setTicketForm(p => ({ ...p, category: cat }))}
                        >
                          <Text style={[s.categoryChipText, ticketForm.category === cat && s.categoryChipTextActive]}>{cat}</Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>

                  {/* Priority Picker */}
                  <View style={{ gap: 4 }}>
                    <Text style={s.formLabel}>{t('ticket_urgency', 'Urgency / Priority')}</Text>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      {['Normal', 'High', 'Critical'].map(prio => (
                        <TouchableOpacity
                          key={prio}
                          style={[s.priorityChip, ticketForm.priority === prio && s.priorityChipActive]}
                          onPress={() => setTicketForm(p => ({ ...p, priority: prio }))}
                        >
                          <Text style={[s.priorityChipText, ticketForm.priority === prio && s.priorityChipTextActive]}>{prio}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>

                  {/* Subject */}
                  <View style={{ gap: 4 }}>
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
                  <View style={{ gap: 4 }}>
                    <Text style={s.formLabel}>{t('ticket_description', 'Detailed Description')}</Text>
                    <TextInput
                      style={[s.ticketInput, { height: 90, textAlignVertical: 'top' }]}
                      placeholder="Describe what happened, any error messages, or what you need help with..."
                      placeholderTextColor={COLORS.textMuted}
                      multiline
                      value={ticketForm.details}
                      onChangeText={val => setTicketForm(p => ({ ...p, details: val }))}
                    />
                  </View>

                  {/* Submit Button */}
                  <TouchableOpacity
                    style={[s.ticketSubmitBtn, !ticketForm.title.trim() && { opacity: 0.5 }]}
                    disabled={!ticketForm.title.trim()}
                    onPress={() => {
                      const created = submitSupportTicket({
                        title: ticketForm.title.trim(),
                        category: ticketForm.category,
                        priority: ticketForm.priority,
                        details: ticketForm.details.trim() || 'No additional details provided.'
                      });
                      setTicketsList([...supportTickets]);
                      setTicketForm({ title: '', category: 'Offline Sync', priority: 'Normal', details: '' });
                      setTicketTab('my');
                      Alert.alert(
                        'Ticket Submitted',
                        `Your support ticket (#${created.id}) has been recorded and queued for cooperative admin review.`
                      );
                    }}
                  >
                    <Ionicons name="paper-plane-outline" size={16} color="#fff" />
                    <Text style={s.ticketSubmitBtnText}>{t('ticket_btn_send', 'Send Support Ticket')}</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  {/* List of user tickets */}
                  {ticketsList.length === 0 ? (
                    <View style={{ padding: 24, alignItems: 'center' }}>
                      <Text style={{ fontSize: 13, color: COLORS.textMuted }}>No support tickets filed yet.</Text>
                    </View>
                  ) : (
                    ticketsList.map(t => (
                      <View key={t.id} style={s.ticketCard}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                          <View style={s.ticketIdBadge}>
                            <Text style={s.ticketIdText}>{t.id}</Text>
                          </View>
                          <View style={[
                            s.ticketStatusBadge,
                            t.status === 'Resolved' ? { backgroundColor: '#E8F5E9' } : (t.status === 'In Progress' ? { backgroundColor: '#E3F2FD' } : { backgroundColor: '#FFF8E1' })
                          ]}>
                            <Text style={[
                              s.ticketStatusText,
                              t.status === 'Resolved' ? { color: COLORS.success } : (t.status === 'In Progress' ? { color: COLORS.blue } : { color: '#C97A00' })
                            ]}>
                              {t.status}
                            </Text>
                          </View>
                        </View>

                        <Text style={s.ticketCardTitle}>{t.title}</Text>
                        <Text style={s.ticketCardDetails}>{t.details}</Text>

                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6, paddingTop: 6, borderTopWidth: 1, borderTopColor: '#F0F0F0' }}>
                          <Text style={{ fontSize: 10, color: COLORS.textMuted }}>{t.category} · Priority: {t.priority}</Text>
                          <Text style={{ fontSize: 10, color: COLORS.textMuted }}>{t.date}</Text>
                        </View>

                        {t.resolutionNotes ? (
                          <View style={{ backgroundColor: '#F8FAF5', padding: 8, borderRadius: RADIUS.sm, marginTop: 6, borderLeftWidth: 2, borderLeftColor: COLORS.success }}>
                            <Text style={{ fontSize: 10, fontWeight: '700', color: COLORS.success }}>Admin Response:</Text>
                            <Text style={{ fontSize: 11, color: COLORS.text, marginTop: 2 }}>{t.resolutionNotes}</Text>
                          </View>
                        ) : null}
                      </View>
                    ))
                  )}
                </>
              )}
            </ScrollView>
          </SafeAreaView>
      </Modal>

      {/* ── Legal & Privacy Policy Modal (RA 10173) ── */}
      <Modal visible={showLegalModal} animationType="slide" onRequestClose={() => setShowLegalModal(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }} edges={['top', 'bottom']}>
            {/* Header */}
            <View style={s.ticketHeader}>
              <View style={{ flex: 1 }}>
                <Text style={s.ticketTitle}>Privacy, Terms &amp; Compliance</Text>
                <Text style={s.ticketSub}>Republic Act No. 10173 · Data Privacy Act of 2012</Text>
              </View>
              <TouchableOpacity onPress={() => setShowLegalModal(false)} style={{ padding: 4 }}>
                <Ionicons name="close" size={22} color={COLORS.text} />
              </TouchableOpacity>
            </View>

            {/* Scrollable Content */}
            <ScrollView contentContainerStyle={{ padding: SPACING.lg, gap: SPACING.md, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
              {/* SRA & DPA Notice Box */}
              <View style={{ backgroundColor: '#F0FDF4', borderWidth: 1, borderColor: '#E8F5E8', borderRadius: RADIUS.md, padding: 12, gap: 6 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="shield-checkmark" size={18} color={COLORS.primary} />
                  <Text style={{ fontSize: 13, fontWeight: '800', color: COLORS.primary }}>Philippine Legal Governance</Text>
                </View>
                <Text style={{ fontSize: 11.5, color: '#166534', lineHeight: 16 }}>
                  HUGPONG processes agricultural telemetry in full adherence to the Philippine Data Privacy Act of 2012 (RA 10173) and Sugar Regulatory Administration (SRA) district farm regulations.
                </Text>
              </View>

              {/* Data Collected */}
              <View style={{ gap: 6 }}>
                <Text style={{ fontSize: 13, fontWeight: '800', color: COLORS.text }}>1. Personal &amp; Agronomic Data Collected</Text>
                <Text style={{ fontSize: 12, color: COLORS.textSecondary, lineHeight: 17 }}>
                  • Farmer Name, Mobile Contact, and System User ID{'\n'}
                  • Farm Block Name, Association, Coordinates &amp; Hectarage{'\n'}
                  • 6-Stage Agronomic Logs (Plowing to Harvesting){'\n'}
                  • Delivery &amp; Support Verification Records
                </Text>
              </View>

              {/* Purpose & Legal Grounds */}
              <View style={{ gap: 6 }}>
                <Text style={{ fontSize: 13, fontWeight: '800', color: COLORS.text }}>2. Lawful Processing Grounds</Text>
                <Text style={{ fontSize: 12, color: COLORS.textSecondary, lineHeight: 17 }}>
                  Data is collected solely for cooperative operational management, offline field activity reconciliation, disaster assistance assessment, and SRA district quota monitoring. No data is sold or commercialized.
                </Text>
              </View>

              {/* Offline Storage */}
              <View style={{ gap: 6 }}>
                <Text style={{ fontSize: 13, fontWeight: '800', color: COLORS.text }}>3. Offline Storage &amp; Encryption</Text>
                <Text style={{ fontSize: 12, color: COLORS.textSecondary, lineHeight: 17 }}>
                  Your draft logs and credentials are saved locally in on-device encrypted storage (AsyncStorage/SQLite) to enable full functionality during remote field outages. When reconnected, data syncs over TLS encryption. Zero third-party ad trackers or analytics pixels exist in this app.
                </Text>
              </View>

              {/* Data Subject Rights */}
              <View style={{ gap: 6 }}>
                <Text style={{ fontSize: 13, fontWeight: '800', color: COLORS.text }}>4. Your Rights under RA 10173</Text>
                <Text style={{ fontSize: 12, color: COLORS.textSecondary, lineHeight: 17 }}>
                  Under RA 10173, you hold the right to be informed, right of access to your records, right to rectify errors, right to erasure/blocking, and right to lodge a complaint with the National Privacy Commission (NPC).
                </Text>
              </View>

              {/* Contact / DPO */}
              <View style={{ backgroundColor: '#F8FAF5', borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, padding: 12, gap: 4 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.text }}>Data Protection Office (DPO)</Text>
                <Text style={{ fontSize: 11, color: COLORS.textMuted }}>Email: dpo@hugpong.ph | Tel: (034) 495-0123</Text>
                <Text style={{ fontSize: 11, color: COLORS.textMuted }}>Silay City Sugarcane District, Negros Occidental</Text>
              </View>

              <TouchableOpacity
                style={{ backgroundColor: COLORS.primary, paddingVertical: 12, borderRadius: RADIUS.md, alignItems: 'center', marginTop: 8 }}
                onPress={() => setShowLegalModal(false)}
              >
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#fff' }}>I Understand &amp; Agree</Text>
              </TouchableOpacity>
            </ScrollView>
          </SafeAreaView>
      </Modal>
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
  cardSubTitle: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  infoRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SPACING.sm, paddingVertical: 10, minHeight: 44 },
  infoLabel: { fontSize: 13, color: COLORS.textMuted, flex: 1, paddingRight: 8 },
  infoValue: { fontSize: 13, fontWeight: '600', color: COLORS.text, textAlign: 'right', flexShrink: 0 },

  // Telemetry
  syncHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.sm },
  syncStatusDot: { width: 10, height: 10, borderRadius: 5 },
  telemetryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 },
  telemetryLabel: { fontSize: 12, color: COLORS.textMuted },
  telemetryValue: { fontSize: 13, fontWeight: '700' },

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
  ticketHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  ticketTitle: { fontSize: 17, fontWeight: '700', color: COLORS.text },
  ticketSub: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  ticketTabBtn: { flex: 1, paddingVertical: 10, minHeight: 44, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', borderWidth: 1, borderColor: COLORS.border },
  ticketTabBtnActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  ticketTabText: { fontSize: 13, fontWeight: '700', color: COLORS.text },
  ticketTabTextActive: { color: '#fff' },
  formLabel: { fontSize: 13, fontWeight: '700', color: COLORS.text, marginBottom: 4 },
  categoryChip: { paddingHorizontal: 14, paddingVertical: 8, minHeight: 36, borderRadius: 18, backgroundColor: '#F0F2EC', borderWidth: 1, borderColor: '#E2E6DC', justifyContent: 'center', alignItems: 'center' },
  categoryChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  categoryChipText: { fontSize: 12, fontWeight: '600', color: COLORS.text },
  categoryChipTextActive: { color: '#fff' },
  priorityChip: { flex: 1, paddingVertical: 10, minHeight: 40, borderRadius: RADIUS.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F0F2EC', borderWidth: 1, borderColor: '#E2E6DC' },
  priorityChipActive: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  priorityChipText: { fontSize: 12, fontWeight: '700', color: COLORS.text },
  priorityChipTextActive: { color: '#fff' },
  ticketInput: { backgroundColor: '#F9FAF7', borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: COLORS.text, minHeight: 44 },
  ticketSubmitBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: COLORS.primary, paddingVertical: 14, minHeight: 48, borderRadius: RADIUS.md, marginTop: 6, ...SHADOW.card },
  ticketSubmitBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  ticketCard: { backgroundColor: '#fff', borderRadius: RADIUS.md, padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border, gap: 4 },
  ticketIdBadge: { backgroundColor: '#F0F2EC', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4 },
  ticketIdText: { fontSize: 11, fontWeight: '800', color: COLORS.textSecondary },
  ticketStatusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  ticketStatusText: { fontSize: 11, fontWeight: '800' },
  ticketCardTitle: { fontSize: 14, fontWeight: '700', color: COLORS.text, marginTop: 2 },
  ticketCardDetails: { fontSize: 13, color: COLORS.textSecondary, lineHeight: 18 },
});
