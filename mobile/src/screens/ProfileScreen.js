import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Alert, Switch, TextInput, Platform, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS, SHADOW } from '../theme';
import AppHeader from '../components/AppHeader';
import { ScreenHeader } from '../components/ui';
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
import { canCreateSupportTicket, SUPPORT_TICKET_CATEGORIES } from '../domain/supportTickets';

const TICKET_CATEGORY_TRANSLATION_KEYS = {
  'Account / Login': 'ticket_category_account',
  Synchronization: 'ticket_category_sync',
  'Field / Operation Data': 'ticket_category_field',
  'Audit / QR': 'ticket_category_audit',
  'SRA Price': 'ticket_category_price',
  Other: 'ticket_category_other',
};

const TICKET_PRIORITY_TRANSLATION_KEYS = {
  Critical: 'ticket_priority_critical',
  High: 'ticket_priority_high',
  Normal: 'ticket_priority_normal',
};

const TICKET_STATUS_TRANSLATION_KEYS = {
  PENDING_SUBMISSION: 'ticket_status_pending',
  OPEN: 'ticket_status_open',
  IN_PROGRESS: 'ticket_status_in_progress',
  RESOLVED: 'ticket_status_resolved',
  CLOSED: 'ticket_status_closed',
};

export default function ProfileScreen({ navigation }) {
  const { t, language, setLanguage, formatSyncTime } = useTranslation();
  const [session, setSessionState] = useState(getCurrentSession());
  const [synced, setSyncedState] = useState(getIsSynced());
  const [isOnline, setIsOnline] = useState(getNetworkStatus());
  const [dataVersion, setDataVersion] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isClearingCache, setIsClearingCache] = useState(false);
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
  const sessionFarm = blockFarms.find(farm => farm.id === (session?.blockFarmId || session?.affiliatedBlockFarmId));
  const assignedFarm = session?.role === 'Farm Manager'
    ? (managedFarm || sessionFarm)
    : (memberFarm || sessionFarm);
  const ticketCreationAllowed = canCreateSupportTicket(session?.canonicalRole || session?.role || session?.roleKey);
  const activeTickets = ticketsList.filter(ticket => ['PENDING_SUBMISSION', 'OPEN', 'IN_PROGRESS'].includes(String(ticket.status || '').replace(/[\s-]+/g, '_').toUpperCase()));
  const ticketHistory = ticketsList.filter(ticket => ['RESOLVED', 'CLOSED'].includes(String(ticket.status || '').replace(/[\s-]+/g, '_').toUpperCase()));
  const localizedTicketCategory = category => t(
    TICKET_CATEGORY_TRANSLATION_KEYS[category] || 'ticket_category_other',
    category || 'Other'
  );
  const localizedTicketPriority = priority => t(
    TICKET_PRIORITY_TRANSLATION_KEYS[priority] || 'ticket_priority_normal',
    priority || 'Normal'
  );
  const localizedTicketStatus = status => {
    const canonicalStatus = String(status || 'OPEN').replace(/[\s-]+/g, '_').toUpperCase();
    const fallback = canonicalStatus
      .toLowerCase()
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
    return t(TICKET_STATUS_TRANSLATION_KEYS[canonicalStatus] || 'ticket_status_open', fallback);
  };

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
        t('sync_offline_title', 'Offline Mode Active'),
        t('sync_offline_msg', 'You are currently offline. Operations are stored locally and will sync once reconnected.'),
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
                    result.remainingCount === 0 ? t('sync_complete_title', 'Online & Synced') : t('sync_incomplete_title', 'Sync Incomplete'),
                    syncResultMessage(result),
                    result.remainingCount > 0 && (session?.role === 'Farm Member' || session?.role === 'Farm Manager') ? [
                      { text: t('sync_view_details', 'View Sync Details'), onPress: () => navigation.navigate('SyncMonitor') },
                      { text: t('btn_try_again', 'Try Again'), onPress: () => doSync() },
                      { text: t('btn_close', 'Close'), style: 'cancel' }
                    ] : undefined
                  );
                } else {
                  const serverUnavailable = getConnectivityDetails().status === CONNECTIVITY_STATUS.SERVER_UNAVAILABLE;
                  Alert.alert(
                    serverUnavailable ? t('sync_server_unavailable_title', 'HUGPONG Server Unavailable') : t('sync_still_offline_title', 'Still Offline'),
                    serverUnavailable
                      ? t('sync_server_unavailable_msg', 'Your internet connection is active, but HUGPONG is temporarily unavailable. Local storage remains active.')
                      : t('sync_still_offline_msg', 'Could not establish internet connection. Local storage remains active.')
                  );
                }
              } catch (e) {
                Alert.alert(t('sync_connection_check_title', 'Connection Check'), t('sync_connection_check_failed', 'Unable to complete connection check.'));
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
        result.remainingCount === 0 ? t('sync_complete_title', 'Sync Complete') : t('sync_incomplete_title', 'Sync Incomplete'),
        syncResultMessage(result),
        result.remainingCount > 0 && (session?.role === 'Farm Member' || session?.role === 'Farm Manager') ? [
          { text: t('sync_view_details', 'View Sync Details'), onPress: () => navigation.navigate('SyncMonitor') },
          { text: t('btn_try_again', 'Try Again'), onPress: () => doSync() },
          { text: t('btn_close', 'Close'), style: 'cancel' }
        ] : undefined
      );
    } catch (e) {
      Alert.alert(t('sync_error_title', 'Sync Failed'), e.message || t('sync_failed_msg', 'Unable to complete sync.'));
    } finally {
      setSyncing(false);
    }
  };

  const clearCache = () => {
    if (isClearingCache) return;
    Alert.alert(
      t('cache_clear_confirm_title', 'Clear Cache?'),
      t('cache_clear_confirm_msg', 'This will remove all locally cached drafts and reset offline buffers. Unsynced local drafts will be wiped.\n\nAre you sure you want to proceed?'),
      [
        { text: t('btn_cancel', 'Cancel'), style: 'cancel' },
        { 
          text: t('profile_cache', 'Clear Local Cache'), 
          style: 'destructive', 
          onPress: async () => {
            setIsClearingCache(true);
            try {
              await resetLocalCache();
              Alert.alert(t('cache_cleared', 'Cache Cleared'), t('cache_cleared_msg', 'Local offline buffer and cached drafts have been reset.'));
            } catch (error) {
              Alert.alert(t('cache_clear_failed_title', 'Cache Clear Failed'), error.message || t('cache_clear_failed_msg', 'The local cache could not be cleared.'));
            } finally {
              setIsClearingCache(false);
            }
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
      Alert.alert(t('signout_failed_title', 'Sign Out Failed'), error.message || t('signout_failed_msg', 'Unable to end the current session. Please try again.'));
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

  // ── In-App Sub-Screen: Legal Information ──
  if (showLegalModal) {
    return (
      <LegalPolicyModal
        visible={true}
        onClose={() => setShowLegalModal(false)}
      />
    );
  }

  // ── In-App Sub-Screen: Help & Support Desk ──
  if (showTicketsModal) {
    return (
      <SafeAreaView style={s.safe} edges={['top']}>
        <ScreenHeader
          title={t('support_desk_title', 'Help & Support Desk')}
          subtitle={t('support_desk_sub', 'Create a support ticket and check Super Admin responses')}
          onBackPress={() => setShowTicketsModal(false)}
        />

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
                <Text
                  style={[s.ticketTabText, ticketTab === 'submit' && s.ticketTabTextActive]}
                  numberOfLines={2}
                  adjustsFontSizeToFit
                  minimumFontScale={0.78}
                >
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
              <Text
                style={[s.ticketTabText, ticketTab === 'active' && s.ticketTabTextActive]}
                numberOfLines={2}
                adjustsFontSizeToFit
                minimumFontScale={0.78}
              >
                {t('ticket_tab_my', 'My Tickets')} ({activeTickets.length})
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.ticketTabBtn, ticketTab === 'history' && s.ticketTabBtnActive]}
              onPress={() => setTicketTab('history')}
              activeOpacity={0.7}
            >
              <Ionicons name="time-outline" size={14} color={ticketTab === 'history' ? COLORS.primary : COLORS.textMuted} />
              <Text
                style={[s.ticketTabText, ticketTab === 'history' && s.ticketTabTextActive]}
                numberOfLines={2}
                adjustsFontSizeToFit
                minimumFontScale={0.78}
              >
                {t('ticket_tab_history', 'History')}
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
                            <Text style={[s.categoryChipText, active && s.categoryChipTextActive]}>{localizedTicketCategory(category)}</Text>
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
                      placeholder={t('ticket_subject_placeholder', 'e.g. Cannot sync field operation logs')}
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
                      placeholder={t('ticket_description_placeholder', 'Describe what happened, any error messages, or what you need help with...')}
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
                          created?.queued ? t('ticket_queued_title', 'Ticket Queued') : t('ticket_submitted_title', 'Ticket Submitted'),
                          created?.queued
                            ? t('ticket_queued_msg', 'Ticket queued for submission. It will be sent automatically when the connection returns.')
                            : `${t('ticket_submitted_msg', 'Support received your ticket.')} #${created?.id || 'TICK-NEW'}`
                        );
                      } catch (error) {
                        Alert.alert(t('ticket_save_failed_title', 'Unable to Save Ticket'), error.message || t('ticket_save_failed_msg', 'Please try again.'));
                      } finally {
                        ticketSubmitLock.current = false;
                        setIsSubmittingTicket(false);
                      }
                    }}
                  >
                    {isSubmittingTicket ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="paper-plane-outline" size={17} color="#fff" />}
                    <Text style={s.ticketSubmitBtnText}>{isSubmittingTicket ? t('ticket_submitting', 'Submitting...') : t('ticket_btn_send', 'Submit Ticket')}</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  {(ticketTab === 'history' ? ticketHistory : activeTickets).length === 0 ? (
                    <View style={s.emptyTicketBox}>
                      <Ionicons name="chatbubbles-outline" size={42} color={COLORS.textMuted} />
                      <Text style={s.emptyTicketTitle}>{ticketTab === 'history' ? t('ticket_no_history_title', 'No Ticket History Yet') : t('ticket_no_active_title', 'No Active Support Tickets')}</Text>
                      <Text style={s.emptyTicketSub}>{ticketTab === 'history' ? t('ticket_no_history_sub', 'Resolved tickets will appear here.') : t('ticket_no_active_sub', 'Create a ticket whenever you need help from Super Admin.')}</Text>
                      {ticketCreationAllowed && ticketTab !== 'history' && <TouchableOpacity style={s.createFirstTicketBtn} onPress={() => setTicketTab('submit')}><Text style={s.createFirstTicketText}>{t('ticket_create', 'Create Ticket')}</Text></TouchableOpacity>}
                    </View>
                  ) : (
                    (ticketTab === 'history' ? ticketHistory : activeTickets).map(ticket => {
                      const canonicalStatus = String(ticket.status || 'OPEN').replace(/[\s-]+/g, '_').toUpperCase();
                      const isResolved = canonicalStatus === 'RESOLVED' || canonicalStatus === 'CLOSED';
                      const isInProgress = canonicalStatus === 'IN_PROGRESS';
                      const isPending = canonicalStatus === 'PENDING_SUBMISSION';
                      const statusBg = isResolved ? '#E8F5E9' : (isInProgress ? '#E8F5E4' : '#FFF8E1');
                      const statusBorder = isResolved ? '#C8E6C9' : (isInProgress ? '#A3D9A5' : '#FDE68A');
                      const statusColor = isResolved ? COLORS.success : (isInProgress ? COLORS.primary : '#A16207');
                      const statusIcon = isResolved ? 'checkmark-circle' : (isInProgress ? 'time-outline' : (isPending ? 'cloud-upload-outline' : 'ellipse-outline'));
                      const statusText = localizedTicketStatus(canonicalStatus);

                      const ticketTitle = ticket.title || ticket.subject || t('ticket_default_title', 'Support Ticket');
                      const ticketDetails = ticket.details || ticket.messages?.[0]?.text || t('ticket_no_description', 'No description provided');
                      const ticketDate = ticket.date || (ticket.createdAt
                        ? new Date(ticket.createdAt).toLocaleDateString(language === 'en' ? 'en-PH' : 'fil-PH', { month: 'short', day: 'numeric', year: 'numeric' })
                        : t('ticket_recent', 'Recent'));

                      return (
                        <View key={ticket.id} style={s.ticketCard}>
                          <View style={s.ticketTopRow}>
                            <View style={s.ticketIdBadge}>
                              <Ionicons name="ticket-outline" size={12} color={COLORS.primary} />
                              <Text style={s.ticketIdText}>{ticket.id}</Text>
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
                              <Text style={s.ticketPillText}>{localizedTicketCategory(ticket.category)}</Text>
                            </View>
                            <View style={[s.priorityPill, ticket.priority === 'Critical' ? { backgroundColor: '#FEE2E2' } : (ticket.priority === 'High' ? { backgroundColor: '#FEF3C7' } : { backgroundColor: '#F0F8EC' })]}>
                              <Text style={[s.priorityPillText, ticket.priority === 'Critical' ? { color: '#DC2626' } : (ticket.priority === 'High' ? { color: '#D97706' } : { color: COLORS.primary })]}>
                                {localizedTicketPriority(ticket.priority)}
                              </Text>
                            </View>
                            <Text style={s.ticketDateText}>{ticketDate}</Text>
                          </View>

                          {(ticket.messages || []).slice(1).map((message, index) => (
                            <View key={message.messageId || index} style={s.adminResponseBox}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                <Ionicons name="chatbubble-ellipses-outline" size={13} color={COLORS.primary} />
                                <Text style={[s.adminResponseLabel, { color: COLORS.primary }]}>{message.authorName || t('role_super_admin', 'Super Admin')}:</Text>
                              </View>
                              <Text style={s.adminResponseBody}>{message.content || message.text}</Text>
                            </View>
                          ))}

                          {ticket.resolutionNotes && !(ticket.messages || []).some(message => message.content === ticket.resolutionNotes) ? (
                            <View style={s.adminResponseBox}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                <Ionicons name="checkmark-done" size={13} color={COLORS.success} />
                                <Text style={s.adminResponseLabel}>{t('ticket_admin_resolution', 'Admin Resolution Response')}:</Text>
                              </View>
                              <Text style={s.adminResponseBody}>{ticket.resolutionNotes}</Text>
                            </View>
                          ) : null}

                          {['PENDING_SUBMISSION', 'OPEN', 'IN_PROGRESS'].includes(canonicalStatus) && (
                            <View style={{ gap: 8, marginTop: 4 }}>
                              <TextInput
                                style={s.ticketInput}
                                placeholder={t('ticket_reply_placeholder', 'Add a follow-up message...')}
                                placeholderTextColor={COLORS.textMuted}
                                value={ticketReplies[ticket.id] || ''}
                                onChangeText={value => setTicketReplies(current => ({ ...current, [ticket.id]: value }))}
                                editable={sendingTicketReplyId !== ticket.id}
                              />
                              <TouchableOpacity
                                style={[s.ticketSubmitBtn, { marginTop: 0, minHeight: 42, paddingVertical: 10 }, (!String(ticketReplies[ticket.id] || '').trim() || sendingTicketReplyId === ticket.id) && { opacity: 0.5 }]}
                                disabled={!String(ticketReplies[ticket.id] || '').trim() || sendingTicketReplyId === ticket.id}
                                onPress={async () => {
                                  setSendingTicketReplyId(ticket.id);
                                  try {
                                    const result = await addSupportTicketMessage(ticket.id, ticketReplies[ticket.id]);
                                    setTicketsList([...supportTickets]);
                                    setTicketReplies(current => ({ ...current, [ticket.id]: '' }));
                                    Alert.alert(
                                      result.queued ? t('ticket_followup_queued_title', 'Follow-up Queued') : t('ticket_followup_sent_title', 'Follow-up Sent'),
                                      result.queued
                                        ? t('ticket_followup_queued_msg', 'Your message is saved and will be retried when connected.')
                                        : t('ticket_followup_sent_msg', 'Your follow-up is now visible to support.')
                                    );
                                  } catch (error) {
                                    Alert.alert(t('ticket_followup_failed_title', 'Unable to Send'), error.message || t('ticket_save_failed_msg', 'Please try again.'));
                                  } finally {
                                    setSendingTicketReplyId(null);
                                  }
                                }}
                              >
                                {sendingTicketReplyId === ticket.id ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="send-outline" size={15} color="#fff" />}
                                <Text style={s.ticketSubmitBtnText}>{sendingTicketReplyId === ticket.id ? t('ticket_sending', 'Sending...') : t('ticket_send_followup', 'Send Follow-up')}</Text>
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
    );
  }

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <AppHeader />

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {!isOnline && (
          <View style={s.offlineBanner}>
            <Ionicons name="cloud-offline-outline" size={18} color="#B45309" />
            <Text style={s.offlineBannerText}>
              {t('profile_offline_banner', 'Offline Mode Active · Profile credentials and cloud sync settings are read-only until reconnected.')}
            </Text>
          </View>
        )}

        {/* ── 1. Account Section ── */}
        <View style={s.sectionHeaderWrap}>
          <Text style={s.sectionHeaderTitle}>{t('profile_account_section', 'Account')}</Text>
        </View>
        <View style={[s.card, s.identityCard]}>
          <View style={s.avatarWrap}>
            <Text style={s.avatarText}>
              {session?.name ? session.name.split(' ').map(n => n[0]).join('').slice(0, 2) : 'U'}
            </Text>
          </View>
          <View style={s.identityInfo}>
            <Text style={s.identityName}>{session?.name || t('profile_user_fallback', 'User')}</Text>
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
              value: session?.role === 'SRA Admin' ? 'Sugar Regulatory Administration (SRA)' : (assignedFarm?.name || t('profile_unassigned', 'Unassigned'))
            },
            { 
              key: 'field_scope',
              icon: 'map', 
              label: session?.role === 'SRA Admin'
                ? t('profile_admin_jurisdiction', 'Jurisdiction') 
                : (session?.role === 'Farm Manager' ? t('profile_supervised_scope', 'Supervised Scope') : t('my_fields', 'My Field(s)')), 
              value: (() => {
                if (session?.role === 'SRA Admin') {
                  const districtName = session?.district || '';
                  const loc = session?.location || '';
                  return [districtName, loc].filter(Boolean).join(' · ') || t('profile_not_configured', 'Not configured');
                }
                if (session?.role === 'Farm Manager') {
                  const managedFields = fields.filter(field => field.blockFarmId === managedFarm?.id);
                  const totalHa = managedFields.reduce((sum, f) => sum + (Number(f.ha) || 0), 0);
                  return `${managedFarm?.name || t('profile_unassigned', 'Unassigned')} (${managedFields.length} ${t('profile_plots', 'Plots')} · ${totalHa.toFixed(1)} Ha)`;
                }
                if (memberFields.length > 0) {
                  return memberFields.map(f => `${f.id} (${f.ha} Ha)`).join(', ');
                }
                return t('profile_no_plot_assigned', 'No Plot Assigned');
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
                    <Text style={s.cardSubTitle}>{t('profile_regulatory_data_title', 'Regulatory Data Status')}</Text>
                    <Text style={s.telemetrySubtitle}>{t('profile_current_district_records', 'Current synchronized district records')}</Text>
                  </View>
                </View>
                <View style={[s.telemetryStatusBadge, !isOnline && s.telemetryStatusBadgeOffline]}>
                  <View style={[s.syncStatusDot, { backgroundColor: isOnline ? COLORS.success : COLORS.accent }]} />
                  <Text style={[s.telemetryStatusText, !isOnline && s.telemetryStatusTextOffline]}>
                    {isOnline ? t('profile_online', 'Online') : t('profile_offline', 'Offline')}
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
                        const district = session?.district || session?.location || t('profile_assigned_scope', 'Assigned regulatory scope');
                        const certCount = (auditReports || []).filter(a => String(a.status || '').toUpperCase() === 'CERTIFIED').length;
                        const totalAudits = (auditReports || []).length;
                        const totalHa = (fields || []).reduce((sum, f) => sum + (Number(f.ha) || 0), 0);
                        if (totalAudits > 0) {
                          return `${district} · ${certCount}/${totalAudits} ${t('profile_certified', 'Certified')} (${totalHa.toFixed(1)} Ha)`;
                        }
                        if (totalHa > 0) {
                          return `${district} · ${totalHa.toFixed(1)} Ha ${t('profile_monitored', 'Monitored')}`;
                        }
                        return `${district} · ${t('profile_no_audit_records', 'No audit or field records')}`;
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
                          let name = circ || t('profile_published_price_reference', 'Published Price Reference');
                          if (name.length > 35) {
                            const m = name.match(/(SRA Circular\s*#?\s*\d+)/i);
                            if (m) name = `${m[1]} (${t('profile_official_millsite_notice', 'Official Millsite Notice')})`;
                          }
                          return week ? `${name} · ${week}` : name;
                        }
                        return t('profile_no_price_reference', 'No price reference published');
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
                      {isOnline
                        ? (synced ? t('profile_node_online_synced', 'Online · Local records synced') : t('profile_node_online_pending', 'Online · Synchronization pending'))
                        : t('profile_node_offline_available', 'Offline · Local records available')}
                    </Text>
                  </View>
                </View>

                {/* Audit Ledger Telemetry */}
                <View style={s.telemetryRowClean}>
                  <View style={s.telemetryRowIcon}>
                    <Ionicons name="layers-outline" size={17} color={COLORS.primary} />
                  </View>
                  <View style={s.telemetryRowBody}>
                    <Text style={s.telemetryLabelClean}>{t('profile_audit_ledger', 'Audit Ledger Telemetry')}</Text>
                    <Text style={s.telemetryValueClean}>
                      {`${(operationLogs || []).length} ${t('profile_operation_logs', 'Operation Logs')} · ${(auditReports || []).length} ${t('profile_audit_dossiers', 'Audit Dossiers')}`}
                    </Text>
                  </View>
                </View>
              </View>
            </View>
          </>
        )}

        {/* ── 3. Sync & Data Management ── */}
        <View style={s.sectionHeaderWrap}>
          <Text style={s.sectionHeaderTitle}>{t('profile_section_sync')}</Text>
        </View>
        <View style={s.card}>
          {(session?.role === 'Farm Member' || session?.role === 'Farm Manager') && (
            <View style={s.settingRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.settingLabel}>{t('profile_auto_sync', 'Automatic Cloud Sync')}</Text>
                <Text style={s.settingSubLabel}>{t('profile_auto_sync_sub')}</Text>
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
                <Text style={s.settingSubLabel}>{t('profile_sync_monitor_sub')}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
            </TouchableOpacity>
          )}

          <TouchableOpacity style={[s.settingRow, isClearingCache && { opacity: 0.6 }]} onPress={clearCache} disabled={isClearingCache}>
            <View style={{ flex: 1 }}>
              <Text style={[s.settingLabel, { color: '#DC2626' }]}>{isClearingCache ? t('profile_clearing_cache', 'Clearing Local Cache...') : t('profile_cache', 'Clear Local Cache')}</Text>
              <Text style={s.settingSubLabel}>{t('profile_cache_sub')}</Text>
            </View>
            {isClearingCache ? <ActivityIndicator size="small" color="#DC2626" /> : <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />}
          </TouchableOpacity>
        </View>

        {/* ── 4. Preferences & Security ── */}
        <View style={s.sectionHeaderWrap}>
          <Text style={s.sectionHeaderTitle}>{t('profile_section_preferences')}</Text>
        </View>
        <View style={s.card}>
          <TouchableOpacity style={s.settingRow} onPress={() => setLangExpanded(e => !e)}>
            <View style={{ flex: 1 }}>
              <Text style={s.settingLabel}>{t('profile_language', 'Language / Wika')}</Text>
              <Text style={s.settingSubLabel}>{(LANGUAGES.find(l => l.key === language) || LANGUAGES[0])?.native}</Text>
            </View>
            <Ionicons name={langExpanded ? 'chevron-up' : 'chevron-down'} size={18} color={COLORS.textMuted} />
          </TouchableOpacity>

          {langExpanded && (
            <View style={s.langDropdown}>
              {LANGUAGES.map(lang => (
                <TouchableOpacity key={lang.key} style={s.langRow} onPress={() => { setLanguage(lang.key).catch(() => {}); setLangExpanded(false); }}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.langLabel}>{lang.native}</Text>
                    <Text style={s.langSub}>{t(`language_${lang.key}_region`, lang.label)}</Text>
                  </View>
                  {language === lang.key && <Ionicons name="checkmark-circle" size={20} color={COLORS.primary} />}
                </TouchableOpacity>
              ))}
            </View>
          )}

          <TouchableOpacity style={s.settingRow} onPress={() => navigation.navigate('Security')}>
            <View style={{ flex: 1 }}>
              <Text style={s.settingLabel}>{t('profile_security', 'Security & Password')}</Text>
              <Text style={s.settingSubLabel}>{t('profile_security_sub')}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
          </TouchableOpacity>
        </View>

        {/* ── 5. Support & Feedback ── */}
        <View style={s.sectionHeaderWrap}>
          <Text style={s.sectionHeaderTitle}>{t('profile_section_support')}</Text>
        </View>
        <View style={s.card}>
          <TouchableOpacity style={s.settingRow} onPress={() => setShowTicketsModal(true)}>
            <View style={{ flex: 1 }}>
              <Text style={s.settingLabel}>{t('profile_support', 'Help & Support Desk')}</Text>
              <Text style={s.settingSubLabel}>{t('profile_support_sub')}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
          </TouchableOpacity>
        </View>

        {/* ── 6. Legal & Compliance ── */}
        <View style={s.sectionHeaderWrap}>
          <Text style={s.sectionHeaderTitle}>{t('profile_section_legal')}</Text>
        </View>
        <View style={s.card}>
          <TouchableOpacity style={s.settingRow} onPress={() => setShowLegalModal(true)}>
            <View style={{ flex: 1 }}>
              <Text style={s.settingLabel}>{t('profile_legal', 'Privacy, Terms & Compliance')}</Text>
              <Text style={s.settingSubLabel}>{t('profile_legal_sub')}</Text>
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
            ? <ActivityIndicator size="small" color={COLORS.danger} />
            : <Ionicons name="log-out-outline" size={20} color={COLORS.danger} />}
          <Text style={s.signOutText}>
            {isSigningOut ? t('profile_signing_out', 'Signing Out...') : t('profile_logout', 'Sign Out')}
          </Text>
        </TouchableOpacity>

        <Text style={s.footerNote}>
          {t('profile_footer', 'v1.0.0 · HUGPONG Agricultural Platform\nOffline data may be cached on this device.')}
        </Text>
      </ScrollView>

      
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  iconBtn: { padding: 8, minHeight: 44, minWidth: 44, justifyContent: 'center', alignItems: 'center' },
  scroll: { padding: SPACING.md, gap: SPACING.md, paddingBottom: 24 },
  card: { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.md, ...SHADOW.card },

  offlineBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.warningBg,
    borderWidth: 1,
    borderColor: COLORS.warning,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: RADIUS.md,
  },
  offlineBannerText: { flex: 1, fontSize: 12, color: COLORS.warning, fontWeight: '600', lineHeight: 16 },

  sectionHeaderWrap: { marginTop: 4, marginBottom: -4, paddingHorizontal: 4 },
  sectionHeaderTitle: { fontSize: 13, fontWeight: '700', color: COLORS.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 },

  // Identity
  identityCard: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  avatarWrap: { width: 56, height: 56, borderRadius: 28, backgroundColor: COLORS.primary, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  avatarText: { fontSize: 20, fontWeight: '800', color: COLORS.textInverse },
  identityInfo: { flex: 1, gap: 3 },
  identityName: { fontSize: 18, fontWeight: '700', color: COLORS.text },
  roleBadge: { backgroundColor: COLORS.primaryBg, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 3, alignSelf: 'flex-start' },
  roleText: { fontSize: 12, fontWeight: '700', color: COLORS.primary },
  identityId: { fontSize: 12, color: COLORS.textMuted },

  // Info rows
  cardSubTitle: { fontSize: 15, fontWeight: '800', color: COLORS.text },
  infoRowClean: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  infoRowBorder: { borderBottomWidth: 1, borderBottomColor: COLORS.borderLight },
  infoIconWrapClean: { width: 38, height: 38, borderRadius: 10, backgroundColor: COLORS.primaryBg, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: COLORS.primaryBorder },
  infoLabelClean: { fontSize: 11, fontWeight: '700', color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 0.3 },
  infoValueClean: { fontSize: 14, fontWeight: '800', color: COLORS.text, marginTop: 2 },

  // Telemetry
  telemetryPanel: { padding: 14, gap: 14 },
  syncHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  telemetryTitleGroup: { flex: 1 },
  telemetrySubtitle: { fontSize: 10.5, color: COLORS.textMuted, marginTop: 1, lineHeight: 14 },
  telemetryStatusBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: COLORS.primaryBg, paddingHorizontal: 8, paddingVertical: 5, borderRadius: RADIUS.full, borderWidth: 1, borderColor: COLORS.primaryBorder },
  telemetryStatusBadgeOffline: { backgroundColor: COLORS.warningBg, borderColor: COLORS.warning },
  telemetryStatusText: { fontSize: 10.5, fontWeight: '800', color: COLORS.primary },
  telemetryStatusTextOffline: { color: '#9A6700' },
  syncStatusDot: { width: 8, height: 8, borderRadius: 4 },
  telemetryList: {
    backgroundColor: COLORS.surfaceSubtle,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden'
  },
  telemetryRowClean: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 12, paddingVertical: 11 },
  telemetryRowBorder: { borderBottomWidth: 1, borderBottomColor: COLORS.borderLight },
  telemetryRowIcon: { width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.primaryBg },
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
  settingLabel: { fontSize: 14, color: COLORS.text, fontWeight: '600', flexShrink: 1 },
  settingSubLabel: { fontSize: 12, color: COLORS.textMuted, marginTop: 1, lineHeight: 17, flexShrink: 1 },

  // Language Dropdown
  langDropdown: { marginTop: 4 },
  langRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, minHeight: 46 },
  langLabel: { fontSize: 14, fontWeight: '700', color: COLORS.text, flexShrink: 1 },
  langSub: { fontSize: 12, lineHeight: 17, color: COLORS.textMuted, flexShrink: 1 },

  // Sign Out
  signOutBtn: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.dangerBg,
    borderRadius: RADIUS.md,
    paddingVertical: 14,
    minHeight: 48,
    borderWidth: 1,
    borderColor: COLORS.danger,
    marginTop: 4
  },
  signOutText: { fontSize: 15, fontWeight: '700', color: COLORS.danger },
  footerNote: { fontSize: 12, color: COLORS.textMuted, textAlign: 'center', lineHeight: 18, marginTop: 8 },

  // Tickets Modal Styles
  ticketOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  ticketContainer: { backgroundColor: COLORS.surface, borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl, maxHeight: '92%', height: '92%' },
  ticketHeader: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    paddingHorizontal: SPACING.lg, 
    paddingVertical: SPACING.md, 
    borderBottomWidth: 1, 
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.surface
  },
  ticketIconWrap: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#E8F5E4', alignItems: 'center', justifyContent: 'center' },
  ticketTitle: { fontSize: 17, fontWeight: '800', color: COLORS.text },
  ticketSub: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  ticketCloseBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#F0F4EC', alignItems: 'center', justifyContent: 'center' },
  
  ticketTabWrap: { paddingHorizontal: SPACING.lg, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORS.border, backgroundColor: COLORS.background },
  ticketSegmentTrack: { flexDirection: 'row', alignItems: 'stretch', backgroundColor: COLORS.surfaceSubtle, borderRadius: RADIUS.md, padding: 3, gap: 4 },
  ticketTabBtn: { flex: 1, minWidth: 0, flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, paddingVertical: 7, paddingHorizontal: 2, minHeight: 56, borderRadius: RADIUS.sm },
  ticketTabBtnActive: { backgroundColor: COLORS.surface, ...SHADOW.card },
  ticketTabText: { width: '100%', flexShrink: 1, fontSize: 11.5, lineHeight: 14, fontWeight: '700', color: COLORS.textMuted, textAlign: 'center' },
  ticketTabTextActive: { color: COLORS.primaryDark, fontWeight: '800' },

  ticketNoticeBox: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#F2F7EF', borderWidth: 1, borderColor: '#DCE8D7', borderRadius: RADIUS.lg, padding: 12 },
  ticketNoticeText: { flex: 1, fontSize: 12.5, color: COLORS.textSecondary, lineHeight: 18 },

  formLabel: { fontSize: 13.5, fontWeight: '800', color: COLORS.text, marginBottom: 2 },
  categoryChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 13, paddingVertical: 9, minHeight: 40, borderRadius: RADIUS.full, backgroundColor: COLORS.surfaceSubtle, borderWidth: 1.2, borderColor: COLORS.border },
  categoryChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  categoryChipText: { fontSize: 12.5, fontWeight: '700', color: COLORS.textSecondary },
  categoryChipTextActive: { color: COLORS.textInverse, fontWeight: '800' },

  priorityChip: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 10, minHeight: 42, borderRadius: RADIUS.md, backgroundColor: COLORS.surfaceSubtle, borderWidth: 1.2, borderColor: COLORS.border },
  priorityChipText: { fontSize: 12.5, fontWeight: '700', color: COLORS.textSecondary },

  ticketInput: { backgroundColor: COLORS.background, borderWidth: 1.2, borderColor: COLORS.border, borderRadius: RADIUS.lg, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, color: COLORS.text, minHeight: 46 },
  ticketInputArea: { height: 95, textAlignVertical: 'top' },

  ticketSubmitBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: COLORS.primary, paddingVertical: 14, minHeight: 50, borderRadius: RADIUS.lg, marginTop: 6, ...SHADOW.card },
  ticketSubmitBtnText: { fontSize: 15.5, fontWeight: '800', color: COLORS.textInverse },

  ticketCard: { backgroundColor: COLORS.surface, borderRadius: RADIUS.xl, padding: 15, borderWidth: 1.2, borderColor: COLORS.border, gap: 8, ...SHADOW.card },
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
