import React from 'react';
import { View, Modal, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SHADOW } from '../theme';
import { activateSraOfflineSnapshot, getCurrentSession, subscribe } from '../data/dataStore';
import { useTranslation } from '../services/i18n';

import SplashScreen from '../screens/auth/SplashScreen';
import LanguageSelectScreen from '../screens/auth/LanguageSelectScreen';
import OnboardingScreen from '../screens/auth/OnboardingScreen';
import LoginScreen from '../screens/auth/LoginScreen';
import RegisterScreen from '../screens/auth/RegisterScreen';
import ForgotPasswordScreen from '../screens/auth/ForgotPasswordScreen';

import CustomBottomTabBar from '../components/CustomBottomTabBar';
import { AppText as Text } from '../components/Typography';
import {
  subscribeToNetwork,
  subscribeToReconnectStatus,
  getNetworkStatus,
  getConnectivityDetails,
  CONNECTIVITY_STATUS
} from '../services/networkService';

const Root = createNativeStackNavigator();
const Tab = createBottomTabNavigator();
const HomeStack = createNativeStackNavigator();
const CalcStack = createNativeStackNavigator();
const SchedStack = createNativeStackNavigator();
const ProfileStack = createNativeStackNavigator();

const getHomeScreen = () => require('../screens/HomeScreen').default;
const getAnalyticsScreen = () => require('../screens/AnalyticsScreen').default;
const getPlannerScreen = () => require('../screens/PlannerScreen').default;
const getFieldOpsScreen = () => require('../screens/FieldOpsScreen').default;
const getProfileScreen = () => require('../screens/ProfileScreen').default;
const getSecurityScreen = () => require('../screens/SecurityScreen').default;
const getSyncMonitorScreen = () => require('../screens/SyncMonitorScreen').default;


function HomeNavigator() {
  return (
    <HomeStack.Navigator screenOptions={{ headerShown: false }}>
      <HomeStack.Screen name="HomeMain" getComponent={getHomeScreen} />
      <HomeStack.Screen name="FieldOps" getComponent={getFieldOpsScreen} options={{ animation: 'slide_from_right' }} />
      <HomeStack.Screen name="Analytics" getComponent={getAnalyticsScreen} options={{ animation: 'slide_from_right' }} />
      <HomeStack.Screen name="SyncMonitor" getComponent={getSyncMonitorScreen} options={{ animation: 'slide_from_right' }} />
    </HomeStack.Navigator>
  );
}

function CalcNavigator() {
  return (
    <CalcStack.Navigator screenOptions={{ headerShown: false }}>
      <CalcStack.Screen name="CalcMain" getComponent={getPlannerScreen} />
      <CalcStack.Screen name="SyncMonitor" getComponent={getSyncMonitorScreen} options={{ animation: 'slide_from_right' }} />
    </CalcStack.Navigator>
  );
}

function SchedNavigator() {
  return (
    <SchedStack.Navigator screenOptions={{ headerShown: false }}>
      <SchedStack.Screen name="SchedMain" getComponent={getFieldOpsScreen} />
      <SchedStack.Screen name="Analytics" getComponent={getAnalyticsScreen} options={{ animation: 'slide_from_right' }} />
      <SchedStack.Screen name="SyncMonitor" getComponent={getSyncMonitorScreen} options={{ animation: 'slide_from_right' }} />
    </SchedStack.Navigator>
  );
}

function ProfileNavigator() {
  return (
    <ProfileStack.Navigator screenOptions={{ headerShown: false }}>
      <ProfileStack.Screen name="ProfileMain" getComponent={getProfileScreen} />
      <ProfileStack.Screen name="Security" getComponent={getSecurityScreen} options={{ animation: 'slide_from_right' }} />
      <ProfileStack.Screen name="SyncMonitor" getComponent={getSyncMonitorScreen} options={{ animation: 'slide_from_right' }} />
    </ProfileStack.Navigator>
  );
}

const modalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    ...SHADOW.float,
  },
  iconWrap: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: COLORS.warningBg,
    borderWidth: 1.5,
    borderColor: '#FDE68A',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  reconnectLoading: {
    backgroundColor: '#EEF7FF',
    borderColor: '#BFDBFE',
  },
  reconnectSuccess: {
    backgroundColor: '#E9F8EC',
    borderColor: '#BBE4C2',
  },
  title: {
    fontSize: 18,
    fontWeight: '900',
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: 8,
  },
  desc: {
    fontSize: 13,
    lineHeight: 19,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: 22,
  },
  btn: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.primary,
    paddingVertical: 13,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  btnText: {
    flexShrink: 1,
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.textInverse,
    textAlign: 'center',
  },
  secondaryBtn: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
    marginTop: 8,
  },
  secondaryBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.textSecondary,
  },
});

function MainTabs({ navigation }) {
  const { t } = useTranslation();
  const [role, setRole] = React.useState(getCurrentSession()?.role || 'Farm Member');
  const [isOnline, setIsOnline] = React.useState(getNetworkStatus());
  const [connectivityStatus, setConnectivityStatus] = React.useState(getConnectivityDetails().status);
  const [showOfflineNotice, setShowOfflineNotice] = React.useState(false);
  const [reconnectNotice, setReconnectNotice] = React.useState(null);
  const hasShownOfflineNoticeRef = React.useRef(false);
  const reconnectStartedAtRef = React.useRef(0);
  React.useEffect(() => {
    let reconnectTimer = null;
    const unsubSession = subscribe(() => {
      setRole(getCurrentSession()?.role || 'Farm Member');
    });
    const unsubNet = subscribeToNetwork((online, details) => {
      setIsOnline(online);
      setConnectivityStatus(details.status);
      if (online) {
        hasShownOfflineNoticeRef.current = false;
        setShowOfflineNotice(false);
      } else if (details.status !== CONNECTIVITY_STATUS.CHECKING) {
        const activeSession = getCurrentSession();
        if (activeSession?.role === 'SRA Admin') {
          activateSraOfflineSnapshot().catch(error => {
            console.warn('[Navigation] The cached SRA snapshot could not be restored.');
          });
        }
        if (!hasShownOfflineNoticeRef.current) {
          setShowOfflineNotice(true);
          hasShownOfflineNoticeRef.current = true;
        }
        if (activeSession?.role !== 'SRA Admin' && navigation?.navigate) {
          navigation.navigate('MainTabs', { screen: 'Field Ops' });
        }
      }
    });
    const unsubReconnect = subscribeToReconnectStatus(status => {
      if (!status || status.phase === 'IDLE') return;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      if (status.phase === 'RECONNECTING') {
        reconnectStartedAtRef.current = Date.now();
        setReconnectNotice(status);
        return;
      }
      const minimumLoadingMs = 700;
      const elapsed = Date.now() - reconnectStartedAtRef.current;
      reconnectTimer = setTimeout(() => {
        setReconnectNotice(status);
        reconnectTimer = null;
      }, Math.max(0, minimumLoadingMs - elapsed));
    });
    return () => {
      unsubSession();
      unsubNet();
      unsubReconnect();
      if (reconnectTimer) clearTimeout(reconnectTimer);
    };
  }, [navigation]);

  const handleDismissOfflineNotice = () => {
    setShowOfflineNotice(false);
    if (!isOnline && role !== 'SRA Admin' && navigation?.navigate) {
      navigation.navigate('MainTabs', { screen: 'Field Ops' });
    }
  };

  const handleOpenSyncMonitor = () => {
    setReconnectNotice(null);
    navigation.navigate('MainTabs', {
      screen: 'Home',
      params: { screen: 'SyncMonitor' }
    });
  };

  const reconnectPhase = reconnectNotice?.phase || 'IDLE';
  const reconnectResult = reconnectNotice?.result || {};
  const reconnectRemaining = Math.max(0, Number(reconnectResult.remainingCount || 0));
  const reconnectNeedsManualSync = reconnectPhase === 'MANUAL_REQUIRED' && reconnectRemaining > 0;
  const reconnectIncomplete = reconnectPhase === 'COMPLETE' && reconnectRemaining > 0;

  return (
    <>
      <Tab.Navigator
        initialRouteName={!isOnline ? 'Field Ops' : 'Home'}
        detachInactiveScreens
        tabBar={(props) => (
          <CustomBottomTabBar
            {...props}
            isOnline={isOnline}
          />
        )}
        screenOptions={{
          headerShown: false,
          lazy: true,
          freezeOnBlur: true,
        }}
      >
        <Tab.Screen
          name="Home"
          component={HomeNavigator}
          listeners={{
            tabPress: (e) => {
              if (!isOnline && role !== 'SRA Admin') {
                e.preventDefault();
              }
            }
          }}
        />
        {role === 'Farm Member' ? (
          <Tab.Screen name="Planner" component={CalcNavigator} />
        ) : (
          isOnline && role !== 'SRA Admin' && (
            <Tab.Screen name="Planner" component={CalcNavigator} />
          )
        )}
        <Tab.Screen name="Field Ops" component={SchedNavigator} />
        <Tab.Screen
          name="Profile"
          component={ProfileNavigator}
          listeners={{
            tabPress: (e) => {
              if (!isOnline && role !== 'SRA Admin') {
                e.preventDefault();
              }
            }
          }}
        />
      </Tab.Navigator>

      {/* Modal: Offline Notice on App Open for Authenticated Users */}
      <Modal
        visible={showOfflineNotice}
        transparent
        animationType="fade"
        onRequestClose={handleDismissOfflineNotice}
      >
        <View style={modalStyles.overlay}>
          <View style={modalStyles.card}>
            <View style={modalStyles.iconWrap}>
              <Ionicons name="cloud-offline" size={30} color="#D97706" />
            </View>

            <Text style={modalStyles.title}>
              {connectivityStatus === CONNECTIVITY_STATUS.NO_INTERNET
                ? t('offline_no_internet_title', 'No internet connection')
                : t('offline_server_unavailable_title', 'HUGPONG server unavailable')}
            </Text>

            <Text style={modalStyles.desc}>
              {connectivityStatus === CONNECTIVITY_STATUS.SERVER_UNAVAILABLE
                ? role === 'SRA Admin'
                  ? t('offline_sra_server_desc')
                  : t('offline_field_server_desc')
                : role === 'SRA Admin'
                ? t('offline_sra_nointernet_desc')
                : role === 'Farm Manager'
                ? t('offline_manager_nointernet_desc')
                : role === 'Farm Member'
                ? t('offline_member_nointernet_desc')
                : t('offline_generic_desc')}
            </Text>

            <TouchableOpacity
              style={modalStyles.btn}
              onPress={handleDismissOfflineNotice}
              activeOpacity={0.85}
            >
              <Text style={modalStyles.btnText}>
                {role === 'SRA Admin'
                  ? t('offline_continue_sra')
                  : role === 'Farm Manager'
                  ? t('offline_proceed_field')
                  : t('offline_proceed_plot')}
              </Text>
              <Ionicons name="arrow-forward" size={16} color="#FFF" />
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={Boolean(reconnectNotice)}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (reconnectPhase !== 'RECONNECTING') setReconnectNotice(null);
        }}
      >
        <View style={modalStyles.overlay}>
          <View style={modalStyles.card}>
            <View style={[
              modalStyles.iconWrap,
              reconnectPhase === 'RECONNECTING' ? modalStyles.reconnectLoading : modalStyles.reconnectSuccess
            ]}>
              {reconnectPhase === 'RECONNECTING' ? (
                <ActivityIndicator size="large" color={COLORS.primary} />
              ) : (
                <Ionicons
                  name={reconnectPhase === 'FAILED' || reconnectIncomplete ? 'alert-circle' : 'cloud-done'}
                  size={30}
                  color={reconnectPhase === 'FAILED' || reconnectIncomplete ? '#D97706' : COLORS.success}
                />
              )}
            </View>

            <Text style={modalStyles.title}>
              {reconnectPhase === 'RECONNECTING'
                ? t('reconnect_checking_title', 'Restoring Connection')
                : reconnectPhase === 'FAILED' || reconnectIncomplete
                  ? t('reconnect_attention_title', 'Connection Restored — Sync Needs Attention')
                  : t('connection_restored', 'Connection Restored')}
            </Text>

            <Text style={modalStyles.desc}>
              {reconnectPhase === 'RECONNECTING'
                ? t('reconnect_checking_msg', 'HUGPONG is checking the server and preparing your saved changes.')
                : reconnectNeedsManualSync
                  ? t('reconnect_manual_msg', 'Automatic sync is off. Open Sync Monitor and tap Sync Now to upload your saved changes.')
                  : reconnectPhase === 'MANUAL_REQUIRED'
                    ? t('reconnect_no_pending_msg', 'Automatic sync is off, and there are no saved changes waiting to sync.')
                    : reconnectPhase === 'FAILED'
                      ? t('reconnect_failed_msg', 'The connection is back, but synchronization could not finish. Open Sync Monitor and tap Sync Now to try again.')
                      : reconnectIncomplete
                        ? `${reconnectRemaining} ${t('reconnect_waiting_msg', 'saved change(s) are still waiting. Open Sync Monitor to review and retry them.')}`
                        : t('reconnect_synced_msg', 'Automatic sync is on. Synchronization is complete and your saved changes are up to date.')}
            </Text>

            {reconnectPhase !== 'RECONNECTING' && (reconnectNeedsManualSync || reconnectIncomplete || reconnectPhase === 'FAILED') ? (
              <>
                <TouchableOpacity style={modalStyles.btn} onPress={handleOpenSyncMonitor} activeOpacity={0.85}>
                  <Ionicons name="sync" size={17} color="#FFF" />
                  <Text style={modalStyles.btnText}>{t('reconnect_open_sync', 'Open Sync Monitor')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={modalStyles.secondaryBtn} onPress={() => setReconnectNotice(null)} activeOpacity={0.8}>
                  <Text style={modalStyles.secondaryBtnText}>{t('reconnect_later', 'Later')}</Text>
                </TouchableOpacity>
              </>
            ) : reconnectPhase !== 'RECONNECTING' ? (
              <TouchableOpacity style={modalStyles.btn} onPress={() => setReconnectNotice(null)} activeOpacity={0.85}>
                <Text style={modalStyles.btnText}>{t('btn_ok', 'OK')}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      </Modal>
    </>
  );
}

export default function RootNavigator() {
  return (
    <Root.Navigator screenOptions={{ headerShown: false, animation: 'fade' }}>
      <Root.Screen name="Splash" component={SplashScreen} />
      <Root.Screen name="LanguageSelect" component={LanguageSelectScreen} options={{ animation: 'fade' }} />
      <Root.Screen name="Onboarding" component={OnboardingScreen} options={{ animation: 'slide_from_right' }} />
      <Root.Screen name="Login" component={LoginScreen} options={{ animation: 'slide_from_right' }} />
      <Root.Screen name="Register" component={RegisterScreen} options={{ animation: 'slide_from_right' }} />
      <Root.Screen name="ForgotPassword" component={ForgotPasswordScreen} options={{ animation: 'slide_from_right' }} />
      <Root.Screen name="MainTabs" component={MainTabs} options={{ animation: 'fade' }} />
    </Root.Navigator>
  );
}
