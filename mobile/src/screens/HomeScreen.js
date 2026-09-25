import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Modal, Dimensions, TextInput, Platform, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS, SHADOW } from '../theme';
import { currentPrice, currentMarketObservation, priceAnalytics, subscribe, getIsSynced, getCurrentSession, fields, cropCycles, blockFarms, performMobileSync, getSortedPrices, operationLogs, draftLogs, publishSraPrice, calculateSRAWeekLabel, getPendingSyncCount } from '../data/dataStore';
import { useTranslation } from '../services/i18n';
import AppHeader from '../components/AppHeader';
import OfflineBanner from '../components/OfflineBanner';
import {
  subscribeToNetwork,
  getNetworkStatus,
  getConnectivityDetails,
  checkConnectivity,
  CONNECTIVITY_STATUS
} from '../services/networkService';
import { getItem, saveItem, STORAGE_KEYS } from '../services/storageService';
import { safeAlert } from '../utils/dialogs';
import { sortNewestFirst } from '../utils/dataHelpers';

import MemberHomeView from './member/MemberHomeView';
import ManagerHomeView from './manager/ManagerHomeView';
import SRAHomeView from './sra/SRAHomeView';
import PublishPriceModal from '../components/PublishPriceModal';

const { width } = Dimensions.get('window');
const BAR_COLORS = ['#B8D4A0', '#8FBF6A', '#6BA045', '#4A7C2F', '#2D5016'];
const MAX_PRICE = 3000;
const MIN_PRICE = 1000;

const generateDynamicNotifications = (session, customDrafts, customLogs, readIds = new Set(), dismissedIds = new Set()) => {
  const notifs = [];
  const sortedPrices = getSortedPrices();
  const allLogs = customLogs || operationLogs || [];
  const allDrafts = customDrafts || draftLogs || [];

  const userRole = session?.role || 'Farm Member';
  const userId = session?.employeeId || session?.id || '';
  const managedFarmIds = new Set(blockFarms.filter(farm => farm.managerUserId === userId).map(farm => farm.id));
  const managerFieldIds = fields.filter(field => managedFarmIds.has(field.blockFarmId)).map(field => field.id);

  // 1. Offline Logs Alert (Pending Cloud Sync - Scoped by Role, strictly excluding past cycle/archived)
  let scopedLogs = allLogs.filter(l => {
    if (!l) return false;
    return l.status === 'ACTIVE' && l.isDraft !== true;
  });

  if (userRole === 'Farm Member') {
    const memberFieldIds = new Set(fields.filter(field => field.memberUserId === userId).map(field => field.id));
    scopedLogs = scopedLogs.filter(log => memberFieldIds.has(log.fieldId));
  } else if (userRole === 'Farm Manager') {
    scopedLogs = scopedLogs.filter(log => managerFieldIds.includes(log.fieldId));
  }

  const offlineLogsCount = getPendingSyncCount(session);
  if (offlineLogsCount > 0 && !dismissedIds.has('notif-offline-sync')) {
    const latestPending = sortNewestFirst(scopedLogs.filter(log => log.synced === false || log.isOffline === true), ['createdAt', 'localCreatedAt', 'timestamp'])[0];
    notifs.push({
      id: 'notif-offline-sync',
      type: 'sync',
      icon: 'cloud-offline-outline',
      color: '#D97706',
      title: 'Unsynced Operations',
      msg: `${offlineLogsCount} field operation log(s) for your block farm are stored locally on your device. Connect to internet and tap to synchronize to Cloud Firestore.`,
      time: 'Ready to sync',
      createdAt: latestPending?.createdAt || latestPending?.localCreatedAt || latestPending?.timestamp || null,
      badgeText: 'Tap to Sync',
      unread: !readIds.has('notif-offline-sync'),
      actionType: 'sync'
    });
  }

  // 2. New SRA Price Circular Notification
  if (sortedPrices.length > 0) {
    const latest = sortedPrices[0];
    const prev = sortedPrices[1];
    const diff = prev ? (Number(latest.sugarPricePerLkg) - Number(prev.sugarPricePerLkg)) : 0;
    const diffStr = diff !== 0 ? ` (${diff > 0 ? '+' : ''}₱${diff.toLocaleString()} vs previous)` : '';
    const priceNotifId = `notif-price-${latest.id || latest.effectiveDate || 'latest'}`;

    if (!dismissedIds.has(priceNotifId)) {
      notifs.push({
        id: priceNotifId,
        type: 'price',
        icon: 'trending-up',
        color: '#267326',
        title: 'New SRA Price Circular Broadcast',
        msg: `HPCo Silay: Raw Sugar is ₱${Number(latest.sugarPricePerLkg).toLocaleString()}/Lkg${diffStr}, Molasses at ₱${Number(latest.molassesPricePerMetricTon).toLocaleString()}/MT (${latest.weekLabel}).`,
        time: latest.effectiveDate,
        createdAt: latest.effectiveDate,
        unread: !readIds.has(priceNotifId),
      });
    }
  }

  // 3. Unsubmitted Drafts Alert (Only for Member and their Farm Manager)
  if (userRole === 'Farm Member' || userRole === 'Farm Manager') {
    const scopedDrafts = userRole === 'Farm Member'
      ? allDrafts.filter(d => fields.some(field => field.memberUserId === userId && field.id === d.fieldId))
      : allDrafts.filter(d => managerFieldIds.includes(d.fieldId) || d.authorName === session?.name);

    if (scopedDrafts.length > 0 && !dismissedIds.has('notif-unsubmitted-drafts')) {
      const latestDraft = sortNewestFirst(scopedDrafts, ['createdAt', 'timestamp', 'date'])[0];
      notifs.push({
        id: 'notif-unsubmitted-drafts',
        type: 'draft',
        icon: 'document-text-outline',
        color: '#0284C7',
        title: 'Unsubmitted Field Drafts',
        msg: `You have ${scopedDrafts.length} unsubmitted draft log(s) for ${userRole === 'Farm Member' ? 'your assigned plot(s)' : 'your managed block farm'}. Tap to review, edit, and record operations.`,
        time: `${scopedDrafts.length} draft${scopedDrafts.length !== 1 ? 's' : ''}`,
        createdAt: latestDraft?.createdAt || latestDraft?.timestamp || latestDraft?.date || null,
        badgeText: 'Review Drafts',
        unread: !readIds.has('notif-unsubmitted-drafts'),
        actionType: 'drafts'
      });
    }
  }

  return sortNewestFirst(notifs, ['createdAt']);
};

export default function HomeScreen({ navigation }) {
  const { t } = useTranslation();
  const [chartMode, setChartMode] = useState('weekly');
  const [showNotifs, setShowNotifs] = useState(false);
  const [session, setSessionState] = useState(getCurrentSession());
  const [synced, setSyncedState] = useState(getIsSynced());
  const [fieldsState, setFieldsState] = useState([...fields]);
  const [readNotifIds, setReadNotifIds] = useState(new Set());
  const [dismissedNotifIds, setDismissedNotifIds] = useState(new Set());
  const [notifs, setNotifs] = useState(() => generateDynamicNotifications(getCurrentSession(), draftLogs, operationLogs));
  
  const [isOnline, setIsOnline] = useState(getNetworkStatus());
  const [priceData, setPriceData] = useState({
    livePrice: currentPrice.value,
    liveMol: currentMarketObservation.value,
    liveDate: currentPrice.lastUpdated || 'No records',
    liveChange: currentPrice.change || 0,
    liveWeek: currentPrice.weekLabel || 'No circular',
  });
  const { livePrice, liveMol, liveDate, liveChange, liveWeek } = priceData;

  const [showPriceModal, setShowPriceModal] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isCheckingNet, setIsCheckingNet] = useState(false);
  const [syncTimeStr, setSyncTimeStr] = useState('Just now');

  // Hydrate persistent read and dismissed notification states from AsyncStorage
  useEffect(() => {
    (async () => {
      try {
        const [savedRead, savedDismissed] = await Promise.all([
          getItem(STORAGE_KEYS.READ_NOTIF_IDS, []),
          getItem(STORAGE_KEYS.DISMISSED_NOTIF_IDS, [])
        ]);
        const readSet = new Set(Array.isArray(savedRead) ? savedRead : []);
        const dismissedSet = new Set(Array.isArray(savedDismissed) ? savedDismissed : []);
        setReadNotifIds(readSet);
        setDismissedNotifIds(dismissedSet);
        setNotifs(generateDynamicNotifications(getCurrentSession(), draftLogs, operationLogs, readSet, dismissedSet));
      } catch (e) {
        console.warn('[HomeScreen] Failed loading persisted notifications state:', e);
      }
    })();
  }, []);

  const handleCheckNetConnection = async () => {
    if (isCheckingNet) return;
    setIsCheckingNet(true);
    try {
      const online = await checkConnectivity({ force: true });
      if (online) {
        try {
          await performMobileSync('MANUAL_SYNC');
        } catch (_) {}
        safeAlert(
          t('connection_restored', 'Connection Restored'),
          t('connection_restored_msg', 'Connected to the internet! The dashboard, live price circulars, and weather telemetry are now active.')
        );
      } else {
        const serverUnavailable = getConnectivityDetails().status === CONNECTIVITY_STATUS.SERVER_UNAVAILABLE;
        safeAlert(
          serverUnavailable ? 'HUGPONG Server Unavailable' : t('offline_status', 'Still Offline'),
          serverUnavailable
            ? 'Your internet connection is active, but HUGPONG is temporarily unavailable. Field operations and the Growth Stage Planner remain available offline.'
            : t('offline_recheck_msg', 'Could not establish an internet connection. Field operations and the Growth Stage Planner remain available offline.')
        );
      }
    } catch (e) {
      safeAlert(
        t('connection_notice', 'Connection Check'),
        t('connection_check_err', 'Unable to reach the network. Offline tools remain ready.')
      );
    } finally {
      setIsCheckingNet(false);
    }
  };

  const pendingSyncCount = React.useMemo(() => {
    return getPendingSyncCount(session);
  }, [operationLogs, synced, session]);

  const unreadCount = React.useMemo(() => notifs.filter(n => n.unread && !readNotifIds.has(n.id)).length, [notifs, readNotifIds]);

  React.useEffect(() => {
    const unsubscribe = subscribe(() => {
      const sess = getCurrentSession();
      setSyncedState(getIsSynced());
      setSessionState(sess);
      setFieldsState(fields);
      setNotifs(generateDynamicNotifications(sess, draftLogs, operationLogs, readNotifIds, dismissedNotifIds));
      setPriceData({
        livePrice: currentPrice.value,
        liveMol: currentMarketObservation.value,
        liveDate: currentPrice.lastUpdated || 'No records',
        liveChange: currentPrice.change || 0,
        liveWeek: currentPrice.weekLabel || 'No circular',
      });
    });
    const unsubNet = subscribeToNetwork((online) => {
      setIsOnline(online);
    });
    return () => {
      unsubscribe();
      unsubNet();
    };
  }, [readNotifIds, dismissedNotifIds]);

  const handleDismissNotif = React.useCallback((id) => {
    setDismissedNotifIds(prev => {
      const next = new Set([...prev, id]);
      saveItem(STORAGE_KEYS.DISMISSED_NOTIF_IDS, Array.from(next));
      return next;
    });
    setNotifs(prev => prev.filter(n => n.id !== id));
  }, []);

  const handleClearAllNotifs = () => {
    if (notifs.length === 0) return;
    safeAlert(
      'Clear All Notifications',
      'Are you sure you want to dismiss all notifications?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Clear All', 
          style: 'destructive', 
          onPress: () => {
            const allIds = notifs.map(n => n.id);
            setDismissedNotifIds(prev => {
              const next = new Set([...prev, ...allIds]);
              saveItem(STORAGE_KEYS.DISMISSED_NOTIF_IDS, Array.from(next));
              return next;
            });
            setNotifs([]);
          } 
        }
      ]
    );
  };

  const handleMarkAllRead = () => {
    const allIds = notifs.map(n => n.id);
    setReadNotifIds(prev => {
      const next = new Set([...prev, ...allIds]);
      saveItem(STORAGE_KEYS.READ_NOTIF_IDS, Array.from(next));
      return next;
    });
    setNotifs(prev => prev.map(n => ({ ...n, unread: false })));
  };

  const openNotifs = () => setShowNotifs(true);
  const closeNotifs = () => setShowNotifs(false);

  const handleNotifPress = (notif) => {
    setShowNotifs(false);
    // Mark this notification as read and persist to storage
    setReadNotifIds(prev => {
      const next = new Set([...prev, notif.id]);
      saveItem(STORAGE_KEYS.READ_NOTIF_IDS, Array.from(next));
      return next;
    });
    setNotifs(prev => prev.map(n => n.id === notif.id ? { ...n, unread: false } : n));

    if (notif.actionType === 'sync') {
      handleHomeSync();
    } else if (notif.actionType === 'drafts') {
      navigation.navigate('Field Ops', { screen: 'SchedMain', params: { openDrafts: true, tab: 'drafts', initialTab: 'drafts', returnTo: 'Home' } });
    } else if (notif.actionType === 'price') {
      navigation.navigate('Analytics');
    }
  };

  const handleHomeSync = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      const result = await performMobileSync('MANUAL_SYNC');
      setSyncTimeStr('Just now');
      if (result.remainingCount === 0) {
        Alert.alert('Sync Successful', `${result.processedCount || 0} queued record(s) synchronized. No records remain.`);
      } else {
        Alert.alert('Sync Incomplete', `${result.processedCount || 0} synchronized, ${result.failedCount || 0} failed, and ${result.remainingCount} remain queued.`);
      }
    } catch (e) {
      console.warn('Sync error:', e);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleManualSync = () => {
    handleHomeSync();
  };

  const handleOpenPriceModal = () => {
    if (session?.role === 'SRA Admin') {
      if (!synced) {
        Alert.alert('Offline Mode', 'You are currently offline. Please connect to the internet to broadcast official SRA weekly benchmark circulars.');
        return;
      }
      setShowPriceModal(true);
    }
  };

  const isFieldRole = session?.role === 'Farm Member' || session?.role === 'Farm Manager';

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <AppHeader right={
        <TouchableOpacity style={s.notifBtn} onPress={openNotifs}>
          <Ionicons name="notifications-outline" size={22} color={COLORS.text} />
          {unreadCount > 0 && <View style={s.badge}><Text style={s.badgeText}>{unreadCount}</Text></View>}
        </TouchableOpacity>
      } />

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {!isOnline ? (
          <View style={s.offlineGateContainer}>
            <View style={s.offlineGateCard}>
              <View style={s.offlineIconCircle}>
                <Ionicons name="cloud-offline-outline" size={44} color="#B45309" />
              </View>
              <Text style={s.offlineGateTitle}>Dashboard Unavailable Offline</Text>
              <Text style={s.offlineGateSubtitle}>
                Live market analytics, price circular broadcasts, weather radar, and cluster telemetry require an active internet connection.
              </Text>

              <View style={s.offlineAvailableBox}>
                <Text style={s.offlineAvailableTitle}>AVAILABLE OFFLINE SERVICES</Text>

                <TouchableOpacity
                  style={s.offlineActionBtn}
                  onPress={() => navigation.navigate('Field Ops')}
                  activeOpacity={0.8}
                >
                  <View style={s.offlineActionIconWrap}>
                    <Ionicons name="book" size={20} color={COLORS.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={s.offlineActionBtnText}>Field Operations</Text>
                      <View style={s.activeOfflineBadge}>
                        <Text style={s.activeOfflineText}>ACTIVE OFFLINE</Text>
                      </View>
                    </View>
                    <Text style={s.offlineActionBtnSub}>Record field activities, stage work & manage plots locally</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={COLORS.primary} />
                </TouchableOpacity>

                {session?.role !== 'SRA Admin' && (
                  <TouchableOpacity
                    style={[s.offlineActionBtn, { marginTop: 10 }]}
                    onPress={() => navigation.navigate('Planner')}
                    activeOpacity={0.8}
                  >
                    <View style={s.offlineActionIconWrap}>
                      <Ionicons name="construct" size={20} color={COLORS.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={s.offlineActionBtnText}>Growth Stage Planner</Text>
                        <View style={s.activeOfflineBadge}>
                          <Text style={s.activeOfflineText}>ACTIVE OFFLINE</Text>
                        </View>
                      </View>
                      <Text style={s.offlineActionBtnSub}>Calculate split doses, crop timeline & estimated budget</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={COLORS.primary} />
                  </TouchableOpacity>
                )}
              </View>

              <TouchableOpacity
                style={[s.offlineRetryBtn, isCheckingNet && { opacity: 0.75 }]}
                onPress={handleCheckNetConnection}
                disabled={isCheckingNet}
                activeOpacity={0.8}
              >
                {isCheckingNet ? (
                  <>
                    <ActivityIndicator size="small" color="#FFFFFF" />
                    <Text style={s.offlineRetryBtnText}>Checking Connection...</Text>
                  </>
                ) : (
                  <>
                    <Ionicons name="refresh" size={16} color="#FFFFFF" />
                    <Text style={s.offlineRetryBtnText}>Check Internet Connection</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <>
            {/* ── 1. Top HPCo · Silay Price Card ── */}
            <TouchableOpacity
              style={[s.card, s.priceCard]}
              activeOpacity={session?.role === 'SRA Admin' ? 0.7 : 1}
              onPress={handleOpenPriceModal}
            >
          <View style={s.priceCardHeader}>
            <View style={s.priceSourceRow}>
              <View style={[s.sourceDot, (!isOnline && isFieldRole) && { backgroundColor: COLORS.accent }]} />
              <Text style={s.priceSource}>{currentPrice.mill ? `${currentPrice.mill} · ${currentPrice.location}` : 'HPCo · Silay'}</Text>
            </View>
            <Text style={[s.priceUpdated, (!isOnline && isFieldRole) && { color: COLORS.accent, fontWeight: '600' }]}>
              {liveWeek !== 'No records' && liveDate !== 'No records' 
                ? (isOnline ? `Official: ${liveWeek} · ${liveDate}` : (isFieldRole ? 'Offline: Cached' : `Official: ${liveWeek} · ${liveDate}`))
                : 'No official broadcast records'}
            </Text>
          </View>

          <View style={s.pricePairRow}>
            {/* B — Sugarcane/Lkg */}
            <View style={s.pricePairItem}>
              <Text style={s.pricePairTag}>Sugar (B)</Text>
              <Text style={s.pricePairValue} numberOfLines={1} adjustsFontSizeToFit>
                {livePrice == null ? '—' : `₱${livePrice.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              </Text>
              <View style={s.priceChangeRow}>
                {livePrice != null && liveChange != null && liveChange !== 0 && (
                  <Ionicons name={liveChange > 0 ? "caret-up" : "caret-down"} size={11} color={liveChange > 0 ? COLORS.success : COLORS.danger} />
                )}
                <Text style={[s.priceChangeTxt, liveChange < 0 && { color: COLORS.danger }, liveChange === 0 && { color: COLORS.textMuted }]}>
                  {livePrice == null ? 'No official price' : (liveChange > 0 ? `+${Number(liveChange).toFixed(2)}` : (liveChange < 0 ? Number(liveChange).toFixed(2) : 'Steady'))}
                </Text>
              </View>
              <Text style={s.pricePairUnit}>{t('unit_per_lkg', 'per Lkg')}</Text>
            </View>

            <View style={s.pricePairDivider} />

            {/* Mol — Molasses/MT */}
            <View style={s.pricePairItem}>
              <Text style={s.pricePairTag}>{t('molasses_short', 'Molasses')}</Text>
              <Text style={s.pricePairValue} numberOfLines={1} adjustsFontSizeToFit>
                {liveMol == null ? '—' : `₱${liveMol.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              </Text>
              <View style={s.priceChangeRow}>
                {liveMol != null && currentMarketObservation.change != null && currentMarketObservation.change !== 0 && (
                  <Ionicons name={currentMarketObservation.change > 0 ? "caret-up" : "caret-down"} size={11} color={currentMarketObservation.change > 0 ? COLORS.success : COLORS.danger} />
                )}
                <Text style={[s.priceChangeTxt, currentMarketObservation.change < 0 && { color: COLORS.danger }, currentMarketObservation.change === 0 && { color: COLORS.textMuted }]}>
                  {liveMol == null ? 'No official price' : (currentMarketObservation.change > 0 ? `+${Number(currentMarketObservation.change).toFixed(2)}` : (currentMarketObservation.change < 0 ? Number(currentMarketObservation.change).toFixed(2) : 'Steady'))}
                </Text>
              </View>
              <Text style={s.pricePairUnit}>{t('unit_per_mt', 'per MT')}</Text>
            </View>
          </View>

          {session?.role === 'SRA Admin' && (
            <View style={s.sraEditHint}>
              <Ionicons name="create-outline" size={13} color={COLORS.primary} />
              <Text style={s.sraEditText}>Post Official SRA Price</Text>
            </View>
          )}
        </TouchableOpacity>

        {/* ── 2. SRA Weekly Price Monitor (Directly Under Price Card) ── */}
        <View style={s.card}>
          <View style={s.chartHeader}>
            <Text style={s.sectionTitle}>{t('analytics_price_monitor', 'SRA Weekly Price Monitor')}</Text>
            <View style={s.chartModeRow}>
              {['weekly', 'monthly'].map(m => (
                <TouchableOpacity key={m} style={[s.modeChip, chartMode === m && s.modeChipActive]} onPress={() => setChartMode(m)}>
                  <Text style={[s.modeChipText, chartMode === m && s.modeChipTextActive]}>
                    {m === 'weekly' ? t('time_week', 'Week') : t('time_month', 'Month')}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          <Text style={s.syncStamp}>
            {synced ? `Official SRA Broadcast · ${liveDate}` : (isFieldRole ? t('sync_cached_stamp', 'Last synced: Cached') : `Official SRA Broadcast · ${liveDate}`)}
          </Text>

          {/* Bar Chart with Dynamic Headroom Scaling & Overflow Protection */}
          {!priceAnalytics.hasData ? (
            <View style={{ paddingVertical: 28, alignItems: 'center' }}>
              <Text style={{ color: COLORS.textMuted, fontSize: 12 }}>No official price circulars available.</Text>
            </View>
          ) : (() => {
            const allVals = [];
            if (Array.isArray(priceAnalytics.weeks)) {
              priceAnalytics.weeks.forEach(wk => {
                if (Array.isArray(wk)) {
                  wk.forEach(v => {
                    const num = Number(v);
                    if (!isNaN(num) && num > 0) allVals.push(num);
                  });
                }
              });
            }
            const highest = allVals.length > 0 ? Math.max(...allVals) : 3000;
            const lowest = allVals.length > 0 ? Math.min(...allVals) : 1000;
            
            const dynamicMax = Math.max(3000, Math.ceil((highest * 1.12) / 500) * 500);
            const dynamicMin = Math.max(0, Math.floor((Math.min(lowest, 1000) * 0.7) / 500) * 500);
            const priceRange = dynamicMax - dynamicMin || 1;
            const step = priceRange / 3;

            const yLabels = [
              dynamicMax >= 10000 ? `${Math.round(dynamicMax / 1000)}k` : `${Math.round(dynamicMax).toLocaleString()}`,
              (dynamicMin + step * 2) >= 10000 ? `${Math.round((dynamicMin + step * 2) / 1000)}k` : `${Math.round(dynamicMin + step * 2).toLocaleString()}`,
              (dynamicMin + step * 1) >= 10000 ? `${Math.round((dynamicMin + step * 1) / 1000)}k` : `${Math.round(dynamicMin + step * 1).toLocaleString()}`,
              dynamicMin >= 10000 ? `${Math.round(dynamicMin / 1000)}k` : `${Math.round(dynamicMin).toLocaleString()}`,
            ];

            return (
              <View style={[s.chartWrap, { overflow: 'hidden' }]}>
                <View style={s.chartYAxis}>
                  {yLabels.map((v, i) => <Text key={i} style={s.yLabel}>{v}</Text>)}
                </View>
                <View style={[s.chartPlotArea, { overflow: 'hidden' }]}>
                  <View style={[s.chartBarsRow, { overflow: 'hidden' }]}>
                    {priceAnalytics.months.map((month, mi) => (
                      <View key={mi} style={[s.barGroup, { overflow: 'hidden', height: 110, justifyContent: 'flex-end' }]}>
                        {chartMode === 'weekly' ? (
                          priceAnalytics.weeks.map((wk, wi) => {
                            const val = Number(wk[mi]) || 0;
                            const rawH = ((val - dynamicMin) / priceRange) * 105;
                            const h = Math.min(105, Math.max(6, Math.round(rawH)));
                            return <View key={wi} style={[s.bar, { height: h, backgroundColor: BAR_COLORS[wi] }]} />;
                          })
                        ) : (
                          (() => {
                            const avg = priceAnalytics.weeks.reduce((sum, wk) => sum + (Number(wk[mi]) || 0), 0) / (priceAnalytics.weeks.length || 1);
                            const rawH = ((avg - dynamicMin) / priceRange) * 105;
                            const h = Math.min(105, Math.max(6, Math.round(rawH)));
                            return <View style={[s.bar, { width: 14, height: h, backgroundColor: COLORS.primary }]} />;
                          })()
                        )}
                      </View>
                    ))}
                  </View>
                  <View style={s.chartXAxisRow}>
                    {priceAnalytics.months.map((month, mi) => (
                      <View key={mi} style={s.chartXAxisCol}>
                        <Text style={s.xLabel}>{month}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              </View>
            );
          })()}

          {/* Legend (Weeks 1 to 4) */}
          {priceAnalytics.hasData && (chartMode === 'weekly' ? (
            <View style={s.legendRow}>
              {['Week 1', 'Week 2', 'Week 3', 'Week 4'].map((l, i) => (
                <View key={i} style={s.legendItem}>
                  <View style={[s.legendDot, { backgroundColor: BAR_COLORS[i] }]} />
                  <Text style={s.legendText}>{l}</Text>
                </View>
              ))}
            </View>
          ) : (
            <View style={s.legendRow}>
              <View style={s.legendItem}>
                <View style={[s.legendDot, { backgroundColor: COLORS.primary }]} />
                <Text style={s.legendText}>{t('monthly_avg_label', 'Monthly Average')}</Text>
              </View>
            </View>
          ))}

          {/* Stats Row */}
          <View style={s.statsRow}>
            <View style={s.statBox}>
              <Text style={s.statLabel}>{t('stat_monthly_avg', 'Monthly Avg')}</Text>
              <Text style={s.statValue}>
                {priceAnalytics.monthlyAvg > 0 ? `₱${Number(priceAnalytics.monthlyAvg).toLocaleString()}` : '—'}
              </Text>
            </View>
            <View style={s.statDivider} />
            <View style={s.statBox}>
              <Text style={s.statLabel}>{t('stat_crop_year_peak', 'Crop Year Cycle Peak')}</Text>
              <Text style={s.statValue}>
                {priceAnalytics.cropYearPeak > 0 ? `₱${Number(priceAnalytics.cropYearPeak).toLocaleString()}` : '—'}
              </Text>
            </View>
            <View style={s.statDivider} />
            <View style={s.statBox}>
              <Text style={s.statLabel}>{t('stat_trend', 'Trend')}</Text>
              {(() => {
                const sorted = getSortedPrices();
                if (sorted.length < 2) return <Text style={s.statValue}>—</Text>;
                const latest = sorted[0].sugarPricePerLkg;
                const prev = sorted[sorted.length - 1].sugarPricePerLkg;
                const pct = prev > 0 ? (((latest - prev) / prev) * 100).toFixed(1) : null;
                if (!pct) return <Text style={s.statValue}>—</Text>;
                const up = parseFloat(pct) >= 0;
                return <Text style={[s.statValue, { color: up ? COLORS.success : COLORS.danger }]}>{up ? '↑' : '↓'} {Math.abs(pct)}%</Text>;
              })()}
            </View>
          </View>

          {/* View Full Analytics Link */}
          <TouchableOpacity style={s.analyticsBtn} onPress={() => navigation.navigate('Analytics')}>
            <Text style={s.analyticsBtnText}>{t('view_full_analytics', 'View Full Analytics')}</Text>
            <Ionicons name="chevron-forward" size={15} color={COLORS.primary} />
          </TouchableOpacity>
        </View>

        {/* ── 2. Sleek Compact Sync Dashboard (Field Operations Only) ── */}
        {isFieldRole && (
          <View style={s.syncCard}>
            <View style={s.syncHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: isOnline && synced && pendingSyncCount === 0 ? '#E8F5E8' : '#FEF3C7', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name={isOnline && synced && pendingSyncCount === 0 ? "cloud-done" : (isOnline ? "cloud-upload" : "cloud-offline")} size={16} color={isOnline && synced && pendingSyncCount === 0 ? COLORS.success : '#D97706'} />
                </View>
                <Text style={s.syncTitle}>Cloud &amp; Device Sync</Text>
              </View>
              <View style={[s.syncBadge, { backgroundColor: isOnline && synced && pendingSyncCount === 0 ? '#E8F5E8' : '#FEF3C7' }]}>
                <View style={[s.syncDot, { backgroundColor: isOnline && synced && pendingSyncCount === 0 ? COLORS.success : '#D97706' }]} />
                <Text style={[s.syncBadgeText, { color: isOnline && synced && pendingSyncCount === 0 ? '#15803D' : '#B45309' }]}>
                  {isOnline && synced && pendingSyncCount === 0 ? 'Synced' : `${pendingSyncCount} Unsynced`}
                </Text>
              </View>
            </View>

            <View style={s.syncMetricsRow}>
              <View style={s.syncMetricCol}>
                <Text style={s.syncMetricLabel}>Pending</Text>
                <Text style={[s.syncMetricVal, pendingSyncCount > 0 && { color: '#D97706' }]}>{pendingSyncCount}</Text>
              </View>
              <View style={s.syncMetricDivider} />
              <View style={s.syncMetricCol}>
                <Text style={s.syncMetricLabel}>Last Synced</Text>
                <Text style={s.syncMetricVal}>{syncTimeStr}</Text>
              </View>
              <View style={s.syncMetricDivider} />
              <View style={s.syncMetricCol}>
                <Text style={s.syncMetricLabel}>Status</Text>
                <Text style={[s.syncMetricVal, { color: isOnline ? COLORS.success : '#D97706' }]}>
                  {isOnline ? 'Online' : 'Offline'}
                </Text>
              </View>
            </View>

            <TouchableOpacity 
              style={[s.syncBtnCompact, isSyncing && { opacity: 0.6 }]} 
              onPress={handleHomeSync}
              disabled={isSyncing}
              activeOpacity={0.8}
            >
              <Ionicons name={isSyncing ? "refresh" : "cloud-upload-outline"} size={15} color="#fff" />
              <Text style={s.syncBtnTextCompact}>{isSyncing ? 'Syncing...' : 'Sync Now'}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── 3. Role-Specific Modular Views ── */}
        {session?.role === 'Farm Member' && (
          <MemberHomeView
            session={session}
            myFields={fields.filter(field => field.memberUserId === (session?.employeeId || session?.id))}
            navigation={navigation}
            onManualSync={handleManualSync}
          />
        )}
        {session?.role === 'Farm Manager' && (
          <ManagerHomeView
            session={session}
            fields={fields}
            cropCycles={cropCycles}
            blockFarms={blockFarms}
            navigation={navigation}
            onManualSync={handleManualSync}
          />
        )}
        {session?.role === 'SRA Admin' && (
          <SRAHomeView
            session={session}
            fields={fields}
            navigation={navigation}
          />
        )}
          </>
        )}

      </ScrollView>

      {/* ── Post Official SRA Price Modal (Web Parity) ── */}
      <PublishPriceModal
        visible={showPriceModal}
        onClose={() => setShowPriceModal(false)}
        latestPrice={{
          sugarPricePerLkg: livePrice || currentPrice?.value,
          molassesPricePerMetricTon: liveMol || currentMarketObservation?.value
        }}
        onPublished={(newPost) => {
          setPriceData({
            livePrice: newPost.sugarPricePerLkg,
            liveMol: newPost.molassesPricePerMetricTon,
            liveWeek: newPost.weekLabel,
            liveDate: newPost.effectiveDate,
            liveChange: newPost.sugarPriceChange || (newPost.sugarPricePerLkg - (livePrice || currentPrice?.value || newPost.sugarPricePerLkg))
          });
        }}
      />

      {/* ── Notifications Modal (Full Screen) ── */}
      <Modal visible={showNotifs} animationType="slide" onRequestClose={closeNotifs}>
        <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.border }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 18, fontWeight: '800', color: COLORS.text }}>{t('notif_title', 'System Notifications')}</Text>
              <Text style={{ fontSize: 12, color: COLORS.textMuted, marginTop: 2 }}>{t('notif_sub', 'District 3 & Sugar Central Updates')}</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {unreadCount > 0 && (
                <TouchableOpacity
                  onPress={handleMarkAllRead}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6, paddingHorizontal: 10, backgroundColor: '#E0F2FE', borderRadius: RADIUS.sm }}
                >
                  <Ionicons name="checkmark-done" size={14} color="#0284C7" />
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#0284C7' }}>{t('btn_mark_read', 'Read All')}</Text>
                </TouchableOpacity>
              )}
              {notifs.length > 0 && (
                <TouchableOpacity
                  onPress={handleClearAllNotifs}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6, paddingHorizontal: 10, backgroundColor: '#FEE2E2', borderRadius: RADIUS.sm }}
                >
                  <Ionicons name="trash-outline" size={14} color={COLORS.danger} />
                  <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.danger }}>{t('btn_clear_all', 'Clear')}</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={closeNotifs} style={{ padding: 4 }}>
                <Ionicons name="close" size={24} color={COLORS.text} />
              </TouchableOpacity>
            </View>
          </View>

          {notifs.length === 0 ? (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.xl, gap: 12 }}>
              <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="notifications-off-outline" size={32} color={COLORS.textMuted} />
              </View>
              <Text style={{ fontSize: 16, fontWeight: '800', color: COLORS.text }}>{t('notif_empty', 'No Notifications')}</Text>
              <Text style={{ fontSize: 13, color: COLORS.textMuted, textAlign: 'center', maxWidth: 260 }}>
                {t('notif_caught_up', "You're all caught up on all district advisories and central updates.")}
              </Text>
            </View>
          ) : (
            <ScrollView contentContainerStyle={{ padding: SPACING.md, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
              {notifs.map(n => (
                <TouchableOpacity
                  key={n.id}
                  style={[s.notifItem, { backgroundColor: n.unread ? '#FAFAF9' : '#fff', padding: 12, borderRadius: RADIUS.md, borderWidth: 1, borderColor: n.unread ? n.color + '40' : COLORS.border, marginBottom: 8 }]}
                  onPress={() => handleNotifPress(n)}
                  activeOpacity={0.8}
                >
                  <View style={[s.notifIconBox, { backgroundColor: n.color + '18' }]}>
                    <Ionicons name={n.icon} size={20} color={n.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                        <Text style={s.notifTitle}>{n.title}</Text>
                        {n.unread && <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: n.color }} />}
                      </View>
                      <TouchableOpacity
                        onPress={(e) => {
                          e.stopPropagation();
                          handleDismissNotif(n.id);
                        }}
                        style={{ padding: 4, marginRight: -4, marginTop: -4 }}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Ionicons name="close" size={16} color={COLORS.textMuted} />
                      </TouchableOpacity>
                    </View>
                    <Text style={[s.notifMsg, { marginTop: 4, lineHeight: 17 }]}>{n.msg}</Text>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                      <Text style={s.notifTime}>{n.time}</Text>
                      {n.badgeText && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: n.color + '15', paddingHorizontal: 8, paddingVertical: 3, borderRadius: RADIUS.sm }}>
                          <Text style={{ fontSize: 11, fontWeight: '800', color: n.color }}>{n.badgeText}</Text>
                          <Ionicons name="chevron-forward" size={12} color={n.color} />
                        </View>
                      )}
                    </View>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  scroll: { padding: SPACING.md, gap: SPACING.md, paddingBottom: SPACING.xl * 2 },
  notifBtn: { position: 'relative', padding: 6 },
  badge: {
    position: 'absolute', top: 2, right: 2,
    backgroundColor: COLORS.danger, width: 16, height: 16,
    borderRadius: 8, alignItems: 'center', justifyContent: 'center'
  },
  badgeText: { color: '#FFF', fontSize: 9, fontWeight: '800' },
  card: {
    backgroundColor: '#FFF',
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    ...SHADOW.card
  },

  // HPCo Silay unified card
  priceCard: { borderWidth: 1, borderColor: COLORS.border },
  priceCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.md },
  priceSourceRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sourceDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.success },
  priceSource: { fontSize: 13, fontWeight: '700', color: COLORS.text },
  priceUpdated: { fontSize: 10, color: COLORS.textMuted, flexShrink: 1, textAlign: 'right' },
  pricePairRow: { flexDirection: 'row', alignItems: 'flex-start' },
  pricePairItem: { flex: 1, gap: 2 },
  pricePairTag: { fontSize: 11, fontWeight: '700', color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  pricePairValue: { fontSize: 26, fontWeight: '800', color: COLORS.text, letterSpacing: -0.5 },
  priceChangeRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  priceChangeTxt: { fontSize: 12, fontWeight: '700', color: COLORS.success },
  pricePairUnit: { fontSize: 11, color: COLORS.textMuted },
  pricePairDivider: { width: 1, backgroundColor: COLORS.border, marginHorizontal: SPACING.md, alignSelf: 'stretch' },
  sraEditHint: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 12, paddingTop: 8, borderTopWidth: 1, borderTopColor: COLORS.border },
  sraEditText: { fontSize: 11, color: COLORS.primary, fontWeight: '600', flex: 1 },

  // Chart
  chartHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.xs },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  chartModeRow: { flexDirection: 'row', backgroundColor: COLORS.background, borderRadius: 10, padding: 3, gap: 2 },
  modeChip: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 8 },
  modeChipActive: { backgroundColor: '#fff', ...SHADOW.card },
  modeChipText: { fontSize: 12, color: COLORS.textMuted, fontWeight: '500' },
  modeChipTextActive: { color: COLORS.primary, fontWeight: '700' },
  syncStamp: { fontSize: 10, color: COLORS.textMuted, marginBottom: SPACING.sm },
  chartWrap: { flexDirection: 'row', height: 140, marginBottom: SPACING.sm },
  chartYAxis: { justifyContent: 'space-between', marginRight: 6, height: 110 },
  yLabel: { fontSize: 9, color: COLORS.textMuted },
  chartPlotArea: { flex: 1 },
  chartBarsRow: { flex: 1, flexDirection: 'row', alignItems: 'flex-end', gap: 4, height: 110 },
  barGroup: { flex: 1, flexDirection: 'row', alignItems: 'flex-end', gap: 1 },
  bar: { flex: 1, borderRadius: 3 },
  chartXAxisRow: { flexDirection: 'row', gap: 4, marginTop: 6, height: 18 },
  chartXAxisCol: { flex: 1, alignItems: 'center' },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginVertical: SPACING.sm,
    paddingVertical: 6,
    paddingHorizontal: 14,
    backgroundColor: '#F8FAF5',
    borderRadius: 20,
    alignSelf: 'center',
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 7, height: 7, borderRadius: 3.5 },
  legendText: { fontSize: 11, fontWeight: '600', color: COLORS.textSecondary },
  statsRow: { flexDirection: 'row', marginBottom: SPACING.sm },
  statBox: { flex: 1, alignItems: 'center', paddingHorizontal: 2 },
  statDivider: { width: 1, backgroundColor: COLORS.border },
  statLabel: { fontSize: 10, color: COLORS.textMuted, marginBottom: 2, textAlign: 'center' },
  statValue: { fontSize: 13, fontWeight: '700', color: COLORS.text },
  analyticsBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingTop: SPACING.sm, borderTopWidth: 1, borderTopColor: COLORS.border, marginTop: SPACING.sm },
  analyticsBtnText: { fontSize: 13, fontWeight: '600', color: COLORS.primaryLight },

  // Modals
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: SPACING.md },
  modalCard: { backgroundColor: '#FFF', borderRadius: RADIUS.xl, padding: SPACING.lg, maxHeight: '92%', ...SHADOW.lg },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingBottom: SPACING.sm, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  modalBadge: { alignSelf: 'flex-start', backgroundColor: '#EBF3E8', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 12, marginBottom: 4 },
  modalBadgeText: { fontSize: 9.5, fontWeight: '900', color: COLORS.primary, textTransform: 'uppercase', letterSpacing: 0.5 },
  modalTitle: { fontSize: 16, fontWeight: '800', color: COLORS.text },
  modalSub: { fontSize: 11, color: COLORS.textMuted, marginTop: 2, lineHeight: 15 },
  inputLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', color: COLORS.textMuted, marginTop: 8, marginBottom: 4 },
  input: { borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, paddingHorizontal: 12, paddingVertical: 8, fontSize: 13, color: COLORS.text, backgroundColor: '#FFF' },
  priceBoxContainer: { flexDirection: 'row', gap: 10, backgroundColor: '#F8FAF5', padding: 12, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.border, marginTop: 4 },
  priceBoxItem: { flex: 1 },
  priceInputWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, paddingHorizontal: 8 },
  currencySymbol: { fontSize: 13, fontWeight: '700', color: COLORS.textMuted, marginRight: 2 },
  priceInput: { flex: 1, paddingVertical: 8, fontSize: 13, fontWeight: '700', color: COLORS.text },
  priceDeltaText: { fontSize: 10.5, fontWeight: '600', color: COLORS.textMuted, marginTop: 4 },
  noticeBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: '#EBF3E8', padding: 10, borderRadius: RADIUS.md, borderWidth: 1, borderColor: '#C8E6C9', marginTop: 4 },
  noticeText: { fontSize: 11, color: COLORS.primary, flex: 1, lineHeight: 15 },
  modalActionRow: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 10, marginTop: SPACING.md, paddingTop: SPACING.sm, borderTopWidth: 1, borderTopColor: COLORS.border },
  cancelBtn: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border },
  cancelBtnText: { fontSize: 12, fontWeight: '700', color: COLORS.textSecondary },
  publishBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: COLORS.primary, paddingVertical: 10, paddingHorizontal: 16, borderRadius: RADIUS.md },
  publishBtnText: { color: '#FFF', fontSize: 12, fontWeight: '800' },
  saveModalBtn: { backgroundColor: COLORS.primary, paddingVertical: 12, borderRadius: RADIUS.lg, alignItems: 'center', marginTop: SPACING.lg },
  saveModalBtnText: { color: '#FFF', fontSize: 13, fontWeight: '800' },
  notifItem: { flexDirection: 'row', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  notifIconBox: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  notifTitle: { fontSize: 13, fontWeight: '700', color: COLORS.text },
  notifMsg: { fontSize: 11, color: COLORS.textSecondary, marginTop: 2 },
  notifTime: { fontSize: 10, color: COLORS.textMuted, marginTop: 2 },

  // Compact Sync Dashboard
  syncCard: {
    backgroundColor: '#fff',
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOW.xs
  },
  syncHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10
  },
  syncTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.text
  },
  syncBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADIUS.full
  },
  syncDot: {
    width: 6,
    height: 6,
    borderRadius: 3
  },
  syncBadgeText: {
    fontSize: 10.5,
    fontWeight: '800'
  },
  syncMetricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAF5',
    borderRadius: RADIUS.md,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: COLORS.border + '60'
  },
  syncMetricCol: {
    flex: 1,
    alignItems: 'center'
  },
  syncMetricDivider: {
    width: 1,
    height: 22,
    backgroundColor: COLORS.border
  },
  syncMetricLabel: {
    fontSize: 9.5,
    color: COLORS.textMuted,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginBottom: 2
  },
  syncMetricVal: {
    fontSize: 12.5,
    fontWeight: '800',
    color: COLORS.text
  },
  syncBtnCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: COLORS.primary,
    paddingVertical: 9,
    borderRadius: RADIUS.md,
    minHeight: 38
  },
  syncBtnTextCompact: {
    color: '#fff',
    fontSize: 12.5,
    fontWeight: '800'
  },

  // Offline Dashboard Gate
  offlineGateContainer: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 24
  },
  offlineGateCard: {
    backgroundColor: '#fff',
    borderRadius: RADIUS.xl,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#FEF0D0',
    ...SHADOW.card
  },
  offlineIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#FFFBEB',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    borderWidth: 2,
    borderColor: '#FEF0D0'
  },
  offlineGateTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: 8
  },
  offlineGateSubtitle: {
    fontSize: 13,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 20
  },
  offlineAvailableBox: {
    width: '100%',
    backgroundColor: '#F8FAF5',
    borderRadius: RADIUS.lg,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 20
  },
  offlineAvailableTitle: {
    fontSize: 10.5,
    fontWeight: '800',
    color: COLORS.primary,
    letterSpacing: 0.8,
    marginBottom: 12
  },
  offlineActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: RADIUS.md,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 12,
    ...SHADOW.xs
  },
  offlineActionIconWrap: {
    width: 38,
    height: 38,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.primaryBg,
    alignItems: 'center',
    justifyContent: 'center'
  },
  activeOfflineBadge: {
    backgroundColor: '#E8F5E8',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 4
  },
  activeOfflineText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#15803D'
  },
  offlineActionBtnText: {
    fontSize: 13.5,
    fontWeight: '800',
    color: COLORS.text
  },
  offlineActionBtnSub: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 2
  },
  offlineRetryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.primary,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: RADIUS.md,
    width: '100%'
  },
  offlineRetryBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '800'
  }
});
