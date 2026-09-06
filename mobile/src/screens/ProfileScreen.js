import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Modal, Dimensions, Alert, Switch, TextInput, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS, SHADOW } from '../theme';
import AppHeader from '../components/AppHeader';
import { subscribe, getIsSynced, getCurrentSession, setSynced, requestFieldAssignment, fields, operationLogs, draftLogs, supportTickets, submitSupportTicket, resetLocalCache, authenticateUser, performMobileSync } from '../data/dataStore';
import { useTranslation, LANGUAGES } from '../services/i18n';

const { height } = Dimensions.get('window');

export default function ProfileScreen({ navigation }) {
  const { t, language, setLanguage, formatSyncTime } = useTranslation();
  const [session, setSessionState] = useState(getCurrentSession());
  const [synced, setSyncedState] = useState(getIsSynced());
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState('Today, 8:05 AM');
  const [langExpanded, setLangExpanded] = useState(false);
  const [autoSync, setAutoSync] = useState(true);
  const [showTicketsModal, setShowTicketsModal] = useState(false);
  const [ticketTab, setTicketTab] = useState('submit');
  const [ticketForm, setTicketForm] = useState({ title: '', category: 'Offline Sync', priority: 'Normal', details: '' });
  const [ticketsList, setTicketsList] = useState(supportTickets);

  useEffect(() => {
    const unsubscribe = subscribe(() => {
      const sess = getCurrentSession();
      setSessionState({ ...sess });
      setSyncedState(getIsSynced());
    });
    return unsubscribe;
  }, []);

  const doSync = async () => {
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
          { text: t('signout_btn_anyway', 'Sign Out Anyway'), style: 'destructive', onPress: () => navigation.replace('Login') },
          { text: t('btn_cancel', 'Cancel'), style: 'cancel' },
        ]
      );
    } else {
      Alert.alert(
        t('signout_confirm_title', 'Sign Out'),
        t('signout_confirm_msg', 'Are you sure you want to sign out?'),
        [
          { text: t('btn_cancel', 'Cancel'), style: 'cancel' },
          { text: t('profile_logout', 'Sign Out'), style: 'destructive', onPress: () => navigation.replace('Login') },
        ]
      );
    }
  };

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <AppHeader />

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* ── Identity Card ── */}
        <View style={[s.card, s.identityCard]}>
          <View style={s.avatarWrap}>
            <Text style={s.avatarText}>
              {session.name ? session.name.split(' ').map(n => n[0]).join('').slice(0, 2) : 'U'}
            </Text>
          </View>
          <View style={s.identityInfo}>
            <Text style={s.identityName}>{session.name}</Text>
            <View style={s.roleBadge}>
              <Text style={s.roleText}>
                {session.role === 'Member' ? t('role_member', 'Sugarcane Block Farm Member') : (session.role === 'Farm Manager' ? t('role_manager', 'Block Farm Manager') : t('role_sra', 'SRA Administrator'))}
              </Text>
            </View>
            <Text style={s.identityId}>ID: {session.employeeId}</Text>
          </View>
        </View>

        {/* ── Operational Assignment ── */}
        <View style={s.card}>
          <Text style={s.cardTitle}>
            {session.role === 'SRA (Admin)' ? t('profile_admin_jurisdiction', 'Administrative Jurisdiction') : t('profile_op_assignment', 'Operational Assignment')}
          </Text>
          {[
            { 
              key: 'farm_agency',
              icon: 'business', 
              label: session.role === 'SRA (Admin)' ? t('profile_regulatory_agency', 'Regulatory Agency') : (session.role === 'Farm Manager' ? t('profile_supervising_farm', 'Supervising Farm') : t('profile_block_farm', 'Block Farm Location')), 
              value: session.role === 'SRA (Admin)' ? 'Sugar Regulatory Administration (SRA)' : (session.farm || 'Nacayao Block Farm')
            },
            { 
              key: 'field_scope',
              icon: 'map', 
              label: session.role === 'SRA (Admin)' 
                ? t('profile_admin_jurisdiction', 'Jurisdiction') 
                : (session.role === 'Farm Manager' ? t('profile_supervised_scope', 'Supervised Scope') : t('my_fields', 'My Field(s)')), 
              value: (() => {
                if (session.role === 'SRA (Admin)') {
                  return 'District 3 · Silay City, Negros Occidental';
                }
                if (session.role === 'Farm Manager') {
                  const totalPlots = fields.length || 5;
                  const totalHa = fields.reduce((s, f) => s + (Number(f.ha) || 0), 0) || 15.25;
                  return `${session.farm || 'Nacayao Block Farm'} (${totalPlots} Plots · ${totalHa.toFixed(1)} Ha)`;
                }
                // Member Role: Show assigned plots
                const memberPlots = fields.filter(f => 
                  f.member === session.name || 
                  f.memberId === session.employeeId || 
                  f.id === session.fieldId
                );
                if (memberPlots.length > 0) {
                  return memberPlots.map(f => `${f.id} (${f.ha} Ha)`).join(', ');
                }
                return session.fieldId || 'FLD-NCY-001 (1.5 Ha)';
              })()
            },
            { key: 'mobile_contact', icon: 'call', label: t('profile_mobile_contact', 'Mobile Contact'), value: session.mobile || session.contact || '0919 444 8888' },
          ].map(r => (
            <View key={r.key} style={s.infoRow}>
              <Ionicons name={r.icon} size={16} color={COLORS.primaryLight} style={{ width: 24 }} />
              <Text style={s.infoLabel}>{r.label}</Text>
              <Text style={s.infoValue}>{r.value}</Text>
            </View>
          ))}
        </View>

        {/* ── SRA Regulatory Status (SRA Admin only) ── */}
        {session.role === 'SRA (Admin)' && (
          <View style={s.card}>
            <View style={s.syncHeader}>
              <Text style={s.cardTitle}>{t('profile_sra_status', 'SRA Regulatory System Status')}</Text>
              <View style={[s.syncStatusDot, { backgroundColor: COLORS.success }]} />
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#F0F2EC', marginTop: 4 }}>
              <Text style={{ fontSize: 11, color: COLORS.textMuted }}>{t('profile_district_cert', 'District Certification:')}</Text>
              <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.success }}>{t('profile_sra_certified', 'Silay SRA Certified')}</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#F0F2EC' }}>
              <Text style={{ fontSize: 11, color: COLORS.textMuted }}>{t('profile_sra_circular', 'SRA Circular Version:')}</Text>
              <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.primary }}>Circular #104 (Active)</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#F0F2EC' }}>
              <Text style={{ fontSize: 11, color: COLORS.textMuted }}>{t('profile_central_node', 'Cloud Central Node:')}</Text>
              <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.text }}>{t('profile_operational_uptime', 'Operational (100% Uptime)')}</Text>
            </View>
          </View>
        )}

        {/* ── Auto Sync Option ── */}
        <View style={s.card}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 2 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, marginRight: 8 }}>
              <View style={{ width: 36, height: 36, borderRadius: RADIUS.sm, backgroundColor: COLORS.primaryBg, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="cloud-upload-outline" size={18} color={COLORS.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13.5, fontWeight: '800', color: COLORS.text }}>{t('profile_auto_sync', 'Automatic Cloud Sync')}</Text>
                <Text style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 1 }}>Sync records automatically when online</Text>
              </View>
            </View>
            <Switch
              value={autoSync}
              onValueChange={setAutoSync}
              trackColor={{ false: COLORS.border, true: COLORS.primaryLight }}
              thumbColor={autoSync ? COLORS.primary : '#f4f3f4'}
            />
          </View>
        </View>

        {/* ── Language ── */}
        <TouchableOpacity style={[s.card, s.expandRow]} onPress={() => setLangExpanded(e => !e)}>
          <Ionicons name="language-outline" size={18} color={COLORS.textSecondary} />
          <Text style={s.expandLabel}>{t('profile_language', 'Language / Wika')}</Text>
          <Text style={s.expandCurrent}>{(LANGUAGES.find(l => l.key === language) || LANGUAGES[0])?.native}</Text>
          <Ionicons name={langExpanded ? 'chevron-up' : 'chevron-down'} size={16} color={COLORS.textMuted} />
        </TouchableOpacity>

        {langExpanded && (
          <View style={s.card}>
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

        {/* ── Settings & Security ── */}
        <View style={s.card}>
          <Text style={s.cardTitle}>{t('profile_settings_mgmt', 'Settings & Management')}</Text>
          {[
            { icon: 'help-buoy-outline', label: t('profile_support', 'Help & Support Desk'), color: COLORS.accent, onPress: () => setShowTicketsModal(true) },
            { icon: 'shield-outline', label: t('profile_security', 'Security & Password'), color: COLORS.primary, onPress: () => navigation.navigate('Security') },
            ...(session.role === 'Farm Manager' ? [{ 
              icon: 'cloud-upload-outline', 
              label: t('profile_sync_monitor', 'Member Sync Telemetry Monitor'), 
              color: COLORS.blue, 
              onPress: () => navigation.navigate('SyncMonitor') 
            }] : (session.role === 'Member' ? [{
              icon: 'cloud-upload-outline', 
              label: t('action_sync_hub', 'Sync Status & Diagnostics'), 
              color: COLORS.blue, 
              onPress: () => navigation.navigate('SyncMonitor') 
            }] : [])),
            { icon: 'trash-outline', label: t('profile_cache', 'Clear Local Cache'), color: COLORS.accent, onPress: clearCache },
          ].map(item => (
            <TouchableOpacity key={item.label} style={s.settingRow} onPress={item.onPress}>
              <View style={[s.settingIcon, { backgroundColor: item.color + '18' }]}>
                <Ionicons name={item.icon} size={17} color={item.color} />
              </View>
              <Text style={s.settingLabel}>{item.label}</Text>
              <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Sign Out ── */}
        <TouchableOpacity style={s.signOutBtn} onPress={signOut}>
          <Ionicons name="log-out-outline" size={18} color="#D9534F" />
          <Text style={s.signOutText}>{t('profile_logout', 'Sign Out')}</Text>
        </TouchableOpacity>

        <Text style={s.footerNote}>{t('profile_footer', 'v1.0.0 · HUGPONG Agricultural Platform\nData is encrypted and stored securely.')}</Text>
      </ScrollView>

      {/* ── Support & Tickets Modal ── */}
      <Modal visible={showTicketsModal} transparent animationType="slide">
        <View style={s.ticketOverlay}>
          <SafeAreaView style={s.ticketContainer}>
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
                      placeholder="e.g. Cannot sync FLD-NCY-001 logs"
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
        </View>
      </Modal>

    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  iconBtn: { padding: 8 },
  scroll: { padding: SPACING.lg, gap: SPACING.md, paddingBottom: 16 },
  card: { backgroundColor: '#fff', borderRadius: RADIUS.lg, padding: SPACING.lg, ...SHADOW.card },

  // Identity
  identityCard: { flexDirection: 'row', alignItems: 'center', gap: SPACING.lg },
  avatarWrap: { width: 64, height: 64, borderRadius: 32, backgroundColor: COLORS.primary, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  avatarText: { fontSize: 22, fontWeight: '800', color: '#fff' },
  identityInfo: { flex: 1, gap: 4 },
  identityName: { fontSize: 18, fontWeight: '800', color: COLORS.text },
  roleBadge: { backgroundColor: COLORS.primaryBg, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 3, alignSelf: 'flex-start' },
  roleText: { fontSize: 11, fontWeight: '700', color: COLORS.primary },
  identityId: { fontSize: 11, color: COLORS.textMuted },

  // Info rows
  cardTitle: { fontSize: 14, fontWeight: '700', color: COLORS.text, marginBottom: SPACING.md },
  infoRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SPACING.sm, paddingVertical: 10, borderTopWidth: 1, borderTopColor: COLORS.border },
  infoLabel: { fontSize: 12, color: COLORS.textMuted, flex: 1, paddingRight: 8 },
  infoValue: { fontSize: 13, fontWeight: '600', color: COLORS.text, textAlign: 'right', flexShrink: 0 },
  formInput: { borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.sm, paddingHorizontal: 12, fontSize: 14, color: COLORS.text, backgroundColor: '#FAFAFA' },

  // Sync
  syncHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.md },
  syncStatusDot: { width: 10, height: 10, borderRadius: 5 },
  syncStats: { flexDirection: 'row', backgroundColor: COLORS.background, borderRadius: RADIUS.md, padding: SPACING.md, marginBottom: SPACING.md },
  syncStat: { flex: 1, alignItems: 'center', gap: 2 },
  syncStatNum: { fontSize: 22, fontWeight: '800', color: COLORS.text },
  syncStatLabel: { fontSize: 10, color: COLORS.textMuted },
  syncStatDivider: { width: 1, backgroundColor: COLORS.border },
  lastSyncText: { fontSize: 11, color: COLORS.textMuted, marginBottom: SPACING.md },
  pendingTitle: { fontSize: 12, fontWeight: '700', color: COLORS.textSecondary, marginBottom: 8 },
  pendingRow: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.sm, paddingVertical: 8, borderTopWidth: 1, borderTopColor: COLORS.border },
  pendingDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: COLORS.accent, marginTop: 4, flexShrink: 0 },
  pendingBody: { flex: 1, gap: 1 },
  pendingType: { fontSize: 11, fontWeight: '700', color: COLORS.textSecondary },
  pendingDesc: { fontSize: 12, color: COLORS.text },
  pendingTime: { fontSize: 10, color: COLORS.textMuted },
  emptySyncState: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, backgroundColor: '#F2FBF2', borderRadius: RADIUS.md, borderWidth: 1, borderColor: '#E8F5E8', marginTop: 4, marginBottom: SPACING.md },
  emptySyncText: { fontSize: 13, fontWeight: '600', color: '#267326' },
  syncBtn: { backgroundColor: COLORS.primary, borderRadius: RADIUS.md, paddingVertical: 13, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: SPACING.md },
  syncBtnDisabled: { opacity: 0.6 },
  syncBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: SPACING.md, borderTopWidth: 1, borderTopColor: COLORS.border, marginTop: SPACING.sm },
  toggleLabel: { flex: 1, fontSize: 13, color: COLORS.textSecondary, fontWeight: '500' },

  // Language
  expandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  expandLabel: { flex: 1, fontSize: 14, fontWeight: '600', color: COLORS.text },
  expandCurrent: { fontSize: 13, color: COLORS.primary, fontWeight: '600' },
  langRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 13, borderTopWidth: 1, borderTopColor: COLORS.border },
  langLabel: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  langSub: { fontSize: 11, color: COLORS.textMuted },

  // Settings
  settingRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, paddingVertical: 11, borderTopWidth: 1, borderTopColor: COLORS.border },
  settingIcon: { width: 34, height: 34, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  settingLabel: { flex: 1, fontSize: 14, color: COLORS.text, fontWeight: '500' },

  // Sign Out
  signOutBtn: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, backgroundColor: '#FFF0F0', borderRadius: RADIUS.md, paddingVertical: 14, borderWidth: 1, borderColor: '#FCCAC8' },
  signOutText: { fontSize: 14, fontWeight: '700', color: '#D9534F' },
  footerNote: { fontSize: 10, color: COLORS.textMuted, textAlign: 'center', lineHeight: 16 },

  // Tickets Modal Styles
  ticketOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  ticketContainer: { backgroundColor: '#fff', borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl, maxHeight: '92%', height: '92%' },
  ticketHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  ticketTitle: { fontSize: 16, fontWeight: '800', color: COLORS.text },
  ticketSub: { fontSize: 11, color: COLORS.textMuted, marginTop: 1 },
  ticketTabBtn: { flex: 1, paddingVertical: 8, borderRadius: RADIUS.md, alignItems: 'center', backgroundColor: '#fff', borderWidth: 1, borderColor: COLORS.border },
  ticketTabBtnActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  ticketTabText: { fontSize: 12, fontWeight: '700', color: COLORS.text },
  ticketTabTextActive: { color: '#fff' },
  formLabel: { fontSize: 12, fontWeight: '700', color: COLORS.text, marginBottom: 2 },
  categoryChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: '#F0F2EC', borderWidth: 1, borderColor: '#E2E6DC' },
  categoryChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  categoryChipText: { fontSize: 11, fontWeight: '600', color: COLORS.text },
  categoryChipTextActive: { color: '#fff' },
  priorityChip: { flex: 1, paddingVertical: 7, borderRadius: RADIUS.sm, alignItems: 'center', backgroundColor: '#F0F2EC', borderWidth: 1, borderColor: '#E2E6DC' },
  priorityChipActive: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  priorityChipText: { fontSize: 11, fontWeight: '700', color: COLORS.text },
  priorityChipTextActive: { color: '#fff' },
  ticketInput: { backgroundColor: '#F9FAF7', borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, paddingHorizontal: 12, paddingVertical: 8, fontSize: 13, color: COLORS.text },
  ticketSubmitBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: COLORS.primary, paddingVertical: 12, borderRadius: RADIUS.md, marginTop: 4, ...SHADOW.card },
  ticketSubmitBtnText: { fontSize: 13, fontWeight: '700', color: '#fff' },
  ticketCard: { backgroundColor: '#fff', borderRadius: RADIUS.md, padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border, gap: 4 },
  ticketIdBadge: { backgroundColor: '#F0F2EC', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  ticketIdText: { fontSize: 10, fontWeight: '800', color: COLORS.textSecondary },
  ticketStatusBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  ticketStatusText: { fontSize: 10, fontWeight: '800' },
  ticketCardTitle: { fontSize: 13, fontWeight: '800', color: COLORS.text, marginTop: 2 },
  ticketCardDetails: { fontSize: 12, color: COLORS.textSecondary, lineHeight: 16 },
});
