import React, { useState, useEffect, useRef } from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity, Animated, Easing } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../theme';
import { subscribe, getIsSynced, getCurrentSession, performMobileSync, getPendingSyncCount } from '../data/dataStore';
import {
  subscribeToNetwork,
  getNetworkStatus,
  getConnectivityDetails,
  checkConnectivity,
  CONNECTIVITY_STATUS
} from '../services/networkService';
import { useTranslation } from '../services/i18n';
import { safeAlert } from '../utils/dialogs';
import { useNavigation } from '@react-navigation/native';
import { syncResultMessage } from '../domain/syncPresentation';

const LOGO = require('../../assets/HUGPONG LOGO.png');

/**
 * AppHeader — shared header brand row used across all main tab screens.
 * Features a dynamic sync indicator button on the right that turns green when online and fully synced,
 * and yellow when offline or when pending unsynced records exist.
 */
function AppHeader({ right }) {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const [session, setSessionState] = useState(getCurrentSession());
  const [synced, setSyncedState] = useState(getIsSynced());
  const [isOnline, setIsOnline] = useState(getNetworkStatus());
  const [pendingCount, setPendingCount] = useState(getPendingSyncCount(getCurrentSession()));
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatusText, setSyncStatusText] = useState('');
  const spinValue = useRef(new Animated.Value(0)).current;
  const loopAnimRef = useRef(null);

  useEffect(() => {
    const unsubscribeSession = subscribe(() => {
      const cur = getCurrentSession();
      setSessionState(cur);
      setSyncedState(getIsSynced());
      setPendingCount(getPendingSyncCount(cur));
    });
    const unsubscribeNetwork = subscribeToNetwork((online) => {
      setIsOnline(online);
    });
    return () => {
      unsubscribeSession();
      unsubscribeNetwork();
      if (loopAnimRef.current) loopAnimRef.current.stop();
    };
  }, []);

  const startSpinAnimation = () => {
    spinValue.setValue(0);
    loopAnimRef.current = Animated.loop(
      Animated.timing(spinValue, {
        toValue: 1,
        duration: 900,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    loopAnimRef.current.start();
  };

  const stopSpinAnimation = () => {
    if (loopAnimRef.current) {
      loopAnimRef.current.stop();
      loopAnimRef.current = null;
    }
    spinValue.setValue(0);
  };

  const handleCheckConnection = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    setSyncStatusText(t('checking_network', 'Checking...'));
    startSpinAnimation();

    try {
      const online = await checkConnectivity({ force: true });
      if (online) {
        setSyncStatusText(t('syncing_progress', 'Syncing...'));
        const result = await performMobileSync('MANUAL_SYNC');
        const remaining = Number(result.remainingCount || 0);
        setSyncedState(remaining === 0);
        setPendingCount(remaining);
        safeAlert(
          remaining === 0 ? t('sync_status_synced', 'Online & Synced') : 'Sync Incomplete',
          syncResultMessage(result),
          remaining > 0 && (session?.role === 'Farm Member' || session?.role === 'Farm Manager') ? [
            { text: 'View Sync Details', onPress: () => navigation.navigate('SyncMonitor') },
            { text: 'Try Again', onPress: () => handleSync() },
            { text: 'Close', style: 'cancel' }
          ] : undefined
        );
      } else {
        const serverUnavailable = getConnectivityDetails().status === CONNECTIVITY_STATUS.SERVER_UNAVAILABLE;
        safeAlert(
          serverUnavailable ? 'HUGPONG Server Unavailable' : t('offline_status', 'Still Offline'),
          serverUnavailable
            ? 'Your internet connection is active, but HUGPONG is temporarily unavailable. Your records remain safe in local storage.'
            : t('offline_recheck_msg', 'Could not establish an internet connection. Your sugarcane logs remain safe and intact in local device storage.')
        );
      }
    } catch (err) {
      safeAlert(
        t('connection_notice', 'Connection Check'),
        t('connection_check_err', 'Unable to reach the network. Field operations continue to work offline seamlessly.')
      );
    } finally {
      stopSpinAnimation();
      setIsSyncing(false);
      setSyncStatusText('');
    }
  };

  const handleSync = async () => {
    if (isSyncing) return;
    const safeCount = Math.max(0, Number(pendingCount || 0));

    if (!isOnline) {
      safeAlert(
        'Offline Mode Active',
        safeCount > 0
          ? `${safeCount} sugarcane operation(s) are stored securely in local device storage. They will automatically sync to Cloud Firestore when internet connectivity is re-established.`
          : 'You are currently offline. Field operations and the Growth Stage Planner are fully available locally on your device.',
        [
          { text: 'Check Connection', onPress: () => handleCheckConnection() },
          { text: 'OK', style: 'cancel' }
        ]
      );
      return;
    }

    if (synced && safeCount === 0) {
      safeAlert(
        t('synced', 'Synced'),
        t('sync_toast_synced', 'Your sugarcane records are fully synchronized with the HUGPONG cloud. Safe to work offline.'),
        [
          { text: 'Check Connection', onPress: () => handleCheckConnection() },
          { text: 'OK', style: 'cancel' }
        ]
      );
      return;
    }

    setIsSyncing(true);
    setSyncStatusText(t('syncing_progress', 'Syncing...'));
    startSpinAnimation();

    try {
      const result = await performMobileSync('MANUAL_SYNC');
      const remaining = Number(result.remainingCount || 0);
      setSyncedState(remaining === 0);
      setPendingCount(remaining);
      safeAlert(
        remaining === 0 ? t('sync_status_synced', 'Sync Successful') : 'Sync Incomplete',
        syncResultMessage(result),
        remaining > 0 && (session?.role === 'Farm Member' || session?.role === 'Farm Manager') ? [
          { text: 'View Sync Details', onPress: () => navigation.navigate('SyncMonitor') },
          { text: 'Try Again', onPress: () => handleSync() },
          { text: 'Close', style: 'cancel' }
        ] : undefined
      );
    } catch (err) {
      safeAlert('Sync Notice', 'Failed to synchronize all records. Will retry when connection stabilizes.');
    } finally {
      stopSpinAnimation();
      setIsSyncing(false);
      setSyncStatusText('');
    }
  };

  const spin = spinValue.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const isFieldRole = session?.role === 'Farm Member' || session?.role === 'Farm Manager';
  const liveCount = getPendingSyncCount(session);
  const safeCount = Math.max(0, Number(pendingCount !== undefined ? pendingCount : liveCount));
  const isFullySynced = isOnline && safeCount === 0;

  return (
    <View style={s.header}>
      <View style={s.brand}>
        <Image source={LOGO} style={s.logoImg} resizeMode="contain" />
        <Text style={s.logoText}>HUGPONG</Text>
      </View>
      <View style={s.rightActions}>
        {isFieldRole && (
          <TouchableOpacity
            style={[
              s.syncPill,
              isFullySynced ? s.syncPillGreen : s.syncPillYellow,
              isSyncing && s.syncPillSyncing
            ]}
            onPress={handleSync}
            disabled={isSyncing}
            activeOpacity={0.75}
          >
            <Animated.View style={isSyncing ? { transform: [{ rotate: spin }] } : {}}>
              <Ionicons
                name={isSyncing ? "sync-outline" : (isFullySynced ? "cloud-done" : (isOnline ? "cloud-upload" : "cloud-offline"))}
                size={16}
                color={isSyncing ? '#1A6B9A' : (isFullySynced ? '#267326' : '#C97A00')}
              />
            </Animated.View>
            <Text style={[s.syncText, isSyncing ? s.syncTextSyncing : (isFullySynced ? s.syncTextGreen : s.syncTextYellow)]}>
              {isSyncing
                ? (syncStatusText || t('syncing_progress', 'Syncing...'))
                : (isFullySynced
                  ? t('synced', 'Synced')
                  : (!isOnline
                    ? (safeCount > 0 ? `Offline (${safeCount})` : 'Offline')
                    : `${t('btn_sync_now', 'Sync')} (${safeCount})`))}
            </Text>
          </TouchableOpacity>
        )}

        {right ? <View style={s.right}>{right}</View> : <View style={s.rightPlaceholder} />}
      </View>
    </View>
  );
}

export default React.memo(AppHeader);

const s = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#DCE8CC',
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  logoImg: {
    width: 32,
    height: 32,
  },
  logoText: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.primary,
    letterSpacing: 1.5,
  },
  rightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  rightPlaceholder: {
    width: 0,
  },
  syncPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
    borderWidth: 1.5,
  },
  syncPillGreen: {
    backgroundColor: '#F2FBF2',
    borderColor: '#E8F5E8',
  },
  syncPillYellow: {
    backgroundColor: '#FFFBF0',
    borderColor: '#FEF0D0',
  },
  syncPillSyncing: {
    backgroundColor: '#F0F8FF',
    borderColor: '#DFF0FB',
  },
  syncText: {
    fontSize: 11,
    fontWeight: '700',
  },
  syncTextGreen: {
    color: '#267326',
  },
  syncTextYellow: {
    color: '#C97A00',
  },
  syncTextSyncing: {
    color: '#1A6B9A',
  },
});
