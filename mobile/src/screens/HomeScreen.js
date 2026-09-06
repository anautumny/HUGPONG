import React, { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Modal, Dimensions, TextInput, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS, SHADOW } from '../theme';
import { currentPrice, currentMarketObservation, priceAnalytics, subscribe, getIsSynced, getCurrentSession, fields, performMobileSync, getSortedPrices, operationLogs, draftLogs, publishSraPrice, calculateSRAWeekLabel } from '../data/dataStore';
import { getOutboxCount } from '../services/syncEngine';
import { useTranslation } from '../services/i18n';
import AppHeader from '../components/AppHeader';

// Role-Specific Modular Views
import MemberHomeView from './member/MemberHomeView';
import ManagerHomeView from './manager/ManagerHomeView';
import SRAHomeView from './sra/SRAHomeView';

const { width } = Dimensions.get('window');
const BAR_COLORS = ['#B8D4A0', '#8FBF6A', '#6BA045', '#4A7C2F', '#2D5016'];
const MAX_PRICE = 3000;
const MIN_PRICE = 1000;

const generateDynamicNotifications = (session, customDrafts, customLogs, readIds = new Set(), dismissedIds = new Set()) => {
  const notifs = [];
  const outboxCount = getOutboxCount();
  const sortedPrices = getSortedPrices();
  const allLogs = customLogs || operationLogs || [];
  const allDrafts = customDrafts || draftLogs || [];

  const userRole = session?.role || 'Member';
  const managerBlockFarm = (session?.blockFarm || 'Nacayao Block Farm').toLowerCase();
  
  // Resolve fields belonging to this manager's block farm
  const managerFieldIds = fields.filter(f => {
    const fFarm = (f.blockFarm || 'Nacayao Block Farm').toLowerCase();
    return fFarm.includes(managerBlockFarm) || managerBlockFarm.includes(fFarm);
  }).map(f => f.id);

  // 1. Offline Logs Alert (Pending Cloud Sync - Scoped by Role)
  let scopedLogs = allLogs;
  if (userRole === 'Member') {
    const userFieldId = session?.fieldId || 'FLD-NCY-001';
    scopedLogs = allLogs.filter(l => l.fieldId === userFieldId || l.authorName === session?.name || (l.loggedBy && l.loggedBy.includes(session?.name)));
  } else if (userRole === 'Farm Manager') {
    scopedLogs = allLogs.filter(l => managerFieldIds.includes(l.fieldId) || (l.loggedBy && l.loggedBy.includes(session?.name)));
  }

  const offlineLogsCount = scopedLogs.filter(l => l.isOffline || l.synced === false).length + (userRole !== 'SRA (Admin)' ? outboxCount : 0);
  if (offlineLogsCount > 0 && !dismissedIds.has('notif-offline-sync')) {
    notifs.push({
      id: 'notif-offline-sync',
      type: 'sync',
      icon: 'cloud-offline-outline',
      color: '#D97706',
      title: 'Offline Logs Pending Sync',
      msg: `${offlineLogsCount} field operation log(s) for your block farm are stored locally on your device. Connect to internet and tap to synchronize to Cloud Firestore.`,
      time: 'Ready to sync',
      badgeText: 'Tap to Sync',
      unread: !readIds.has('notif-offline-sync'),
      actionType: 'sync'
    });
  }

  // 2. New SRA Price Circular Notification
  if (sortedPrices.length > 0) {
    const latest = sortedPrices[0];
    const prev = sortedPrices[1];
    const diff = prev ? (Number(latest.price) - Number(prev.price)) : 0;
    const diffStr = diff !== 0 ? ` (${diff > 0 ? '+' : ''}₱${diff.toLocaleString()} vs previous)` : '';
    const priceNotifId = `notif-price-${latest.id || latest.date || 'latest'}`;

    if (!dismissedIds.has(priceNotifId)) {
      notifs.push({
        id: priceNotifId,
        type: 'price',
        icon: 'trending-up',
        color: '#267326',
        title: 'New SRA Price Circular Broadcast',
        msg: `HPCo Silay benchmark: Raw Sugar is ₱${Number(latest.price || 2950).toLocaleString()}/Lkg${diffStr}, Molasses at ₱${Number(latest.molasses || 4400).toLocaleString()}/MT (${latest.week || 'Current Circular'}).`,
        time: latest.date || 'Live Circular',
        unread: !readIds.has(priceNotifId),
      });
    }
  }

  // 3. Unsubmitted Drafts Alert (Only for Member and their Block Farm Manager)
  if (userRole === 'Member' || userRole === 'Farm Manager') {
    const scopedDrafts = userRole === 'Member'
      ? allDrafts.filter(d => (session?.fieldId && d.fieldId === session.fieldId) || d.authorName === session?.name)
      : allDrafts.filter(d => managerFieldIds.includes(d.fieldId) || d.authorName === session?.name);

    if (scopedDrafts.length > 0 && !dismissedIds.has('notif-unsubmitted-drafts')) {
      notifs.push({
        id: 'notif-unsubmitted-drafts',
        type: 'draft',
        icon: 'document-text-outline',
        color: '#0284C7',
        title: 'Unsubmitted Field Drafts',
        msg: `You have ${scopedDrafts.length} unsubmitted draft log(s) for ${userRole === 'Member' ? (session?.fieldId || 'your plot') : (session?.blockFarm || 'Nacayao Block Farm')}. Tap to review, edit, and record operations.`,
        time: `${scopedDrafts.length} draft${scopedDrafts.length !== 1 ? 's' : ''}`,
        badgeText: 'Review Drafts',
        unread: !readIds.has('notif-unsubmitted-drafts'),
        actionType: 'drafts'
      });
    }
  }

  return notifs;
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
  
  // Consolidated Dynamic SRA Price State
  const [priceData, setPriceData] = useState({
    livePrice: currentPrice.value,
    liveMol: currentMarketObservation.value,
    liveDate: currentPrice.lastUpdated || 'No records',
    liveChange: currentPrice.change || 0,
    liveWeek: currentPrice.week || 'No circular',
  });
  const { livePrice, liveMol, liveDate, liveChange, liveWeek } = priceData;

  const [showPriceModal, setShowPriceModal] = useState(false);
  const [inputWeek, setInputWeek] = useState(() => calculateSRAWeekLabel(new Date()));
  const [inputEffectiveDate, setInputEffectiveDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [inputBag, setInputBag] = useState('2950');
  const [inputMol, setInputMol] = useState('4400');
  const [inputCircular, setInputCircular] = useState('SRA Circular #105 (Official SRA Millsite Notice)');
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncTimeStr, setSyncTimeStr] = useState('Just now');

  const pendingSyncCount = React.useMemo(() => {
    return operationLogs.filter(l => l.isOffline || l.synced === false).length + getOutboxCount();
  }, [operationLogs, synced]);

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
        liveWeek: currentPrice.week || 'No circular',
      });
    });
    return unsubscribe;
  }, [readNotifIds, dismissedNotifIds]);

  const handleDismissNotif = React.useCallback((id) => {
    setDismissedNotifIds(prev => new Set([...prev, id]));
    setNotifs(prev => prev.filter(n => n.id !== id));
  }, []);

  const handleClearAllNotifs = () => {
    if (notifs.length === 0) return;
    Alert.alert(
      'Clear All Notifications',
      'Are you sure you want to dismiss all notifications?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Clear All', 
          style: 'destructive', 
          onPress: () => {
            setDismissedNotifIds(prev => new Set([...prev, ...notifs.map(n => n.id)]));
            setNotifs([]);
          } 
        }
      ]
    );
  };

  const handleMarkAllRead = () => {
    const allIds = notifs.map(n => n.id);
    setReadNotifIds(prev => new Set([...prev, ...allIds]));
    setNotifs(prev => prev.map(n => ({ ...n, unread: false })));
  };

  const openNotifs = () => setShowNotifs(true);
  const closeNotifs = () => setShowNotifs(false);

  const handleNotifPress = (notif) => {
    setShowNotifs(false);
    // Mark this notification as read so the badge count clears immediately
    setReadNotifIds(prev => new Set([...prev, notif.id]));
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
      await performMobileSync();
      setSyncTimeStr('Just now');
      Alert.alert('Sync Successful', 'Your local field logs and records are synchronized with Cloud Firestore.');
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
    if (session.role === 'SRA (Admin)') {
      const today = new Date().toISOString().split('T')[0];
      const autoWeek = calculateSRAWeekLabel(today);
      setInputBag(livePrice.toString());
      setInputMol(liveMol.toString());
      setInputWeek(autoWeek);
      setInputEffectiveDate(today);
      setInputCircular('SRA Circular #105 (Official SRA Millsite Notice)');
      setShowPriceModal(true);
    }
  };

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <AppHeader right={
        <TouchableOpacity style={s.notifBtn} onPress={openNotifs}>
          <Ionicons name="notifications-outline" size={22} color={COLORS.text} />
          {unreadCount > 0 && <View style={s.badge}><Text style={s.badgeText}>{unreadCount}</Text></View>}
        </TouchableOpacity>
      } />

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* ── 1. Top HPCo · Silay Price Card ── */}
        <TouchableOpacity
          style={[s.card, s.priceCard]}
          activeOpacity={session.role === 'SRA (Admin)' ? 0.7 : 1}
          onPress={handleOpenPriceModal}
        >
          <View style={s.priceCardHeader}>
            <View style={s.priceSourceRow}>
              <View style={[s.sourceDot, !synced && { backgroundColor: COLORS.accent }]} />
              <Text style={s.priceSource}>HPCo · Silay</Text>
            </View>
            <Text style={[s.priceUpdated, !synced && { color: COLORS.accent, fontWeight: '600' }]}>
              {synced ? `Official: ${liveWeek} · ${liveDate}` : 'Offline: Cached'}
            </Text>
          </View>

          <View style={s.pricePairRow}>
            {/* B — Sugarcane/Lkg */}
            <View style={s.pricePairItem}>
              <Text style={s.pricePairTag}>Sugar (B)</Text>
              <Text style={s.pricePairValue} numberOfLines={1} adjustsFontSizeToFit>
                ₱{livePrice.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </Text>
              <View style={s.priceChangeRow}>
                <Ionicons name="caret-up" size={11} color={COLORS.success} />
                <Text style={s.priceChangeTxt}>+{Number(liveChange).toFixed(2)}</Text>
              </View>
              <Text style={s.pricePairUnit}>{t('unit_per_lkg', 'per Lkg')}</Text>
            </View>

            <View style={s.pricePairDivider} />

            {/* Mol — Molasses/MT */}
            <View style={s.pricePairItem}>
              <Text style={s.pricePairTag}>{t('molasses_short', 'Molasses')}</Text>
              <Text style={s.pricePairValue} numberOfLines={1} adjustsFontSizeToFit>
                ₱{liveMol.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </Text>
              <View style={s.priceChangeRow}>
                <Ionicons name="caret-up" size={11} color={COLORS.success} />
                <Text style={s.priceChangeTxt}>+{Number(currentMarketObservation.change || 100).toFixed(2)}</Text>
              </View>
              <Text style={s.pricePairUnit}>{t('unit_per_mt', 'per MT')}</Text>
            </View>
          </View>

          {session.role === 'SRA (Admin)' && (
            <View style={s.sraEditHint}>
              <Ionicons name="create-outline" size={13} color={COLORS.primary} />
              <Text style={s.sraEditText}>{t('tap_to_broadcast', 'Tap to broadcast new official SRA weekly price')}</Text>
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
            {synced ? `Last synced: May 21, 2026 · 6:30 PM ✓ Cached` : t('sync_cached_stamp', 'Last synced: Cached')}
          </Text>

          {/* Bar Chart with Dynamic Headroom Scaling & Overflow Protection */}
          {(() => {
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
          {chartMode === 'weekly' ? (
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
          )}

          {/* Stats Row */}
          <View style={s.statsRow}>
            <View style={s.statBox}>
              <Text style={s.statLabel}>{t('stat_monthly_avg', 'Monthly Avg')}</Text>
              <Text style={s.statValue}>₱{Number(priceAnalytics.monthlyAvg || 2845).toLocaleString()}</Text>
            </View>
            <View style={s.statDivider} />
            <View style={s.statBox}>
              <Text style={s.statLabel}>{t('stat_crop_year_peak', 'Crop Year Peak')}</Text>
              <Text style={s.statValue}>₱{Number(priceAnalytics.cropYearPeak || 2950).toLocaleString()}</Text>
            </View>
            <View style={s.statDivider} />
            <View style={s.statBox}>
              <Text style={s.statLabel}>{t('stat_trend', 'Trend')}</Text>
              <Text style={[s.statValue, { color: COLORS.success }]}>↑ 3.2%</Text>
            </View>
          </View>

          {/* View Full Analytics Link */}
          <TouchableOpacity style={s.analyticsBtn} onPress={() => navigation.navigate('Analytics')}>
            <Text style={s.analyticsBtnText}>{t('view_full_analytics', 'View Full Analytics')}</Text>
            <Ionicons name="chevron-forward" size={15} color={COLORS.primary} />
          </TouchableOpacity>
        </View>

        {/* ── 2. Sleek Compact Sync Dashboard ── */}
        <View style={s.syncCard}>
          <View style={s.syncHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: synced && pendingSyncCount === 0 ? '#DCFCE7' : '#FEF3C7', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name={synced && pendingSyncCount === 0 ? "cloud-done" : "cloud-offline"} size={16} color={synced && pendingSyncCount === 0 ? COLORS.success : '#D97706'} />
              </View>
              <Text style={s.syncTitle}>Cloud &amp; Device Sync</Text>
            </View>
            <View style={[s.syncBadge, { backgroundColor: synced && pendingSyncCount === 0 ? '#DCFCE7' : '#FEF3C7' }]}>
              <View style={[s.syncDot, { backgroundColor: synced && pendingSyncCount === 0 ? COLORS.success : '#D97706' }]} />
              <Text style={[s.syncBadgeText, { color: synced && pendingSyncCount === 0 ? '#15803D' : '#B45309' }]}>
                {synced && pendingSyncCount === 0 ? 'Fully Synced' : `${pendingSyncCount} Pending`}
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
              <Text style={[s.syncMetricVal, { color: synced ? COLORS.success : '#D97706' }]}>
                {synced ? 'Online' : 'Offline'}
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

        {/* ── 3. Role-Specific Modular Views ── */}
        {session.role === 'Member' && (
          <MemberHomeView
            session={session}
            myFields={fields.filter(f => f.member === session.name || f.id === session.fieldId)}
            navigation={navigation}
            onManualSync={handleManualSync}
          />
        )}
        {session.role === 'Farm Manager' && (
          <ManagerHomeView
            session={session}
            fields={fields}
            navigation={navigation}
            onManualSync={handleManualSync}
          />
        )}
        {session.role === 'SRA (Admin)' && (
          <SRAHomeView
            session={session}
            fields={fields}
            navigation={navigation}
          />
        )}

      </ScrollView>

      {/* ── SRA Price Edit Modal (Web Aligned) ── */}
      <Modal visible={showPriceModal} transparent animationType="fade">
        <View style={s.modalOverlay}>
          <View style={s.modalCard}>
            {/* Header with Regulatory Badge */}
            <View style={s.modalHeader}>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <View style={s.modalBadge}>
                  <Text style={s.modalBadgeText}>{t('sra_publish_badge', 'SRA REGULATORY BROADCAST')}</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                  <Ionicons name="trending-up" size={18} color={COLORS.primary} />
                  <Text style={s.modalTitle}>{t('sra_publish_title', 'Post Official Weekly Millsite Price')}</Text>
                </View>
                <Text style={s.modalSub}>
                  {t('sra_publish_sub', 'Publish official SRA circular price records to synchronize all block farms & mobile apps.')}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setShowPriceModal(false)} style={{ padding: 4 }}>
                <Ionicons name="close" size={22} color={COLORS.textMuted} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingVertical: 4 }}>
              {/* Row: Week Label (Auto-detected) & Effective Date */}
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <Text style={[s.inputLabel, { marginTop: 0, marginBottom: 0 }]}>
                      {t('sra_circ_week', 'Week Label')} <Text style={{ color: COLORS.danger }}>*</Text>
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: '#EBF3E8', paddingHorizontal: 5, paddingVertical: 1.5, borderRadius: 4 }}>
                      <Text style={{ fontSize: 9, fontWeight: '700', color: COLORS.primary }}>Auto</Text>
                    </View>
                  </View>
                  <TextInput
                    style={s.input}
                    value={inputWeek}
                    onChangeText={setInputWeek}
                    placeholder="e.g. Week 1 Sep"
                  />
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={[s.inputLabel, { marginTop: 0, marginBottom: 4 }]}>
                    {t('sra_effective_date', 'Effective Date')} <Text style={{ color: COLORS.danger }}>*</Text>
                  </Text>
                  <TextInput
                    style={s.input}
                    value={inputEffectiveDate}
                    onChangeText={(val) => {
                      setInputEffectiveDate(val);
                      if (val && val.length >= 8) {
                        setInputWeek(calculateSRAWeekLabel(val));
                      }
                    }}
                    placeholder="YYYY-MM-DD"
                  />
                </View>
              </View>

              {/* Side-by-Side: Raw Sugar & Molasses */}
              <View style={s.priceBoxContainer}>
                {/* Raw Sugar */}
                <View style={s.priceBoxItem}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <Text style={{ fontSize: 11, fontWeight: '800', color: COLORS.text }}>{t('sra_raw_sugar_price', 'Raw Sugar Price')}</Text>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: COLORS.primary }}>₱ / Lkg</Text>
                  </View>
                  <View style={s.priceInputWrap}>
                    <Text style={s.currencySymbol}>₱</Text>
                    <TextInput
                      style={s.priceInput}
                      value={inputBag}
                      onChangeText={setInputBag}
                      keyboardType="numeric"
                      placeholder="2950"
                    />
                  </View>
                  {(() => {
                    const b = parseFloat(inputBag) || 0;
                    const prev = currentPrice.value || 0;
                    const diff = b - prev;
                    return (
                      <Text style={s.priceDeltaText}>
                        {diff === 0 ? 'Steady (₱0 / Lkg)' : `${diff > 0 ? '+' : ''}₱${diff.toLocaleString()} / Lkg`}
                      </Text>
                    );
                  })()}
                </View>

                {/* Molasses */}
                <View style={s.priceBoxItem}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <Text style={{ fontSize: 11, fontWeight: '800', color: COLORS.text }}>{t('sra_molasses_price', 'Molasses Price')}</Text>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: COLORS.success }}>₱ / MT</Text>
                  </View>
                  <View style={s.priceInputWrap}>
                    <Text style={s.currencySymbol}>₱</Text>
                    <TextInput
                      style={s.priceInput}
                      value={inputMol}
                      onChangeText={setInputMol}
                      keyboardType="numeric"
                      placeholder="4400"
                    />
                  </View>
                  {(() => {
                    const m = parseFloat(inputMol) || 0;
                    const prevM = currentMarketObservation.value || 0;
                    const diffM = m - prevM;
                    return (
                      <Text style={s.priceDeltaText}>
                        {diffM === 0 ? 'Steady (₱0 / MT)' : `${diffM > 0 ? '+' : ''}₱${diffM.toLocaleString()} / MT`}
                      </Text>
                    );
                  })()}
                </View>
              </View>

              {/* Official Source / Circular Reference */}
              <Text style={s.inputLabel}>
                {t('sra_circ_source', 'Official Source / Circular Reference')} <Text style={{ color: COLORS.danger }}>*</Text>
              </Text>
              <TextInput
                style={s.input}
                value={inputCircular}
                onChangeText={setInputCircular}
                placeholder="e.g. SRA Circular #105 (Official SRA Millsite Notice)"
              />

              {/* Informational Sync Banner */}
              <View style={s.noticeBox}>
                <Ionicons name="information-circle-outline" size={16} color={COLORS.primary} style={{ marginTop: 1 }} />
                <Text style={s.noticeText}>
                  {t('sra_publish_notice', 'Publishing updates the live SRA official price ledger, syncs with Firestore cloud instantly, and updates all mobile app price cards in real time.')}
                </Text>
              </View>
            </ScrollView>

            {/* Action Buttons: Cancel + Publish Weekly Price */}
            <View style={s.modalActionRow}>
              <TouchableOpacity
                onPress={() => setShowPriceModal(false)}
                style={s.cancelBtn}
              >
                <Text style={s.cancelBtnText}>{t('btn_cancel', 'Cancel')}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={s.publishBtn}
                onPress={() => {
                  const b = parseFloat(inputBag);
                  const m = parseFloat(inputMol);
                  if (isNaN(b) || isNaN(m)) {
                    Alert.alert(t('error_title', 'Error'), t('invalid_numbers_error', 'Please enter valid numbers'));
                    return;
                  }

                  Alert.alert(
                    'Publish SRA Sugar & Molasses Price?',
                    `You are about to broadcast the official SRA Circular prices for ${inputWeek || 'Current Week'} (Effective: ${inputEffectiveDate}):\n\n• Raw Sugar: ₱${b.toLocaleString()}/Lkg\n• Molasses: ₱${m.toLocaleString()}/MT\n\nThis will update market benchmarks across all cooperative dashboards and mobile applications.`,
                    [
                      { text: t('btn_cancel', 'Cancel'), style: 'cancel' },
                      {
                        text: 'Publish Official Circular',
                        onPress: async () => {
                          try {
                            const newPost = await publishSraPrice({
                              price: b,
                              molasses: m,
                              week: inputWeek || 'Current Week',
                              circular: inputCircular || 'SRA Circular #105',
                              source: inputCircular || 'SRA Circular #105 (Official SRA Millsite Notice)',
                              effectiveDate: inputEffectiveDate
                            });

                            setPriceData({
                              livePrice: b,
                              liveMol: m,
                              liveWeek: inputWeek || 'Current Week',
                              liveDate: newPost.date,
                              liveChange: b - (currentPrice.value || b)
                            });

                            setShowPriceModal(false);
                            Alert.alert(
                              'Price Posted ✓',
                              `Official SRA benchmark for ${inputWeek || 'Current Week'} updated to ₱${b.toLocaleString()}/Lkg and broadcasted to all cooperative portals & mobile apps.`
                            );
                          } catch (err) {
                            console.warn('[HomeScreen] Error posting price:', err);
                            Alert.alert('Broadcast Error', 'Could not broadcast price update.');
                          }
                        }
                      }
                    ]
                  );
                }}
              >
                <Ionicons name="checkmark-circle-outline" size={15} color="#fff" />
                <Text style={s.publishBtnText}>{t('sra_btn_publish', 'Publish Weekly Price')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

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
  }
});
