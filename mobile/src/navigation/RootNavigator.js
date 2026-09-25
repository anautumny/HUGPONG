import React from 'react';
import { View, Text, Modal, TouchableOpacity, StyleSheet } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SHADOW } from '../theme';
import { getCurrentSession, subscribe, logoutUser } from '../data/dataStore';

import SplashScreen from '../screens/auth/SplashScreen';
import LanguageSelectScreen from '../screens/auth/LanguageSelectScreen';
import OnboardingScreen from '../screens/auth/OnboardingScreen';
import LoginScreen from '../screens/auth/LoginScreen';
import RegisterScreen from '../screens/auth/RegisterScreen';
import ForgotPasswordScreen from '../screens/auth/ForgotPasswordScreen';

import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from '../services/i18n';

import AdminOfflineBarrier from '../components/AdminOfflineBarrier';
import {
  subscribeToNetwork,
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

const TAB_ICONS = {
  Home: { active: 'home', inactive: 'home-outline' },
  Planner: { active: 'construct', inactive: 'construct-outline' },
  'Field Ops': { active: 'book', inactive: 'book-outline' },
  Profile: { active: 'person', inactive: 'person-outline' },
};

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
    backgroundColor: '#FFF',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    ...SHADOW.float,
  },
  iconWrap: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#FEF3C7',
    borderWidth: 1.5,
    borderColor: '#FDE68A',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
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
    fontSize: 14,
    fontWeight: '800',
    color: '#FFF',
  },
});

function MainTabs({ navigation }) {
  const [role, setRole] = React.useState(getCurrentSession()?.role || 'Farm Member');
  const [isOnline, setIsOnline] = React.useState(getNetworkStatus());
  const [connectivityStatus, setConnectivityStatus] = React.useState(getConnectivityDetails().status);
  const [showOfflineNotice, setShowOfflineNotice] = React.useState(false);
  const hasShownOfflineNoticeRef = React.useRef(false);
  const adminOfflineLogoutRef = React.useRef(false);
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const bottomInset = insets.bottom > 0 ? Math.min(insets.bottom, 16) : 0;

  React.useEffect(() => {
    const unsubSession = subscribe(() => {
      setRole(getCurrentSession()?.role || 'Farm Member');
    });
    const unsubNet = subscribeToNetwork((online, details) => {
      setIsOnline(online);
      setConnectivityStatus(details.status);
      if (online) {
        adminOfflineLogoutRef.current = false;
        hasShownOfflineNoticeRef.current = false;
        setShowOfflineNotice(false);
      } else if (details.status !== CONNECTIVITY_STATUS.CHECKING) {
        const activeSession = getCurrentSession();
        if (activeSession?.role === 'SRA Admin') {
          if (!adminOfflineLogoutRef.current) {
            adminOfflineLogoutRef.current = true;
            setShowOfflineNotice(false);
            const sessionNotice = details.status === CONNECTIVITY_STATUS.NO_INTERNET
              ? 'SRA Admin was signed out because there is no internet connection. Reconnect before signing in again.'
              : 'SRA Admin was signed out because the HUGPONG server is unavailable. Try again when the service is reachable.';
            logoutUser({ skipRemote: true })
              .finally(() => navigation.reset({
                index: 0,
                routes: [{ name: 'Login', params: { sessionNotice } }]
              }));
          }
          return;
        }
        if (!hasShownOfflineNoticeRef.current) {
          setShowOfflineNotice(true);
          hasShownOfflineNoticeRef.current = true;
        }
        if (navigation?.navigate) {
          navigation.navigate('MainTabs', { screen: 'Field Ops' });
        }
      }
    });
    return () => {
      unsubSession();
      unsubNet();
    };
  }, [navigation]);

  const handleDismissOfflineNotice = () => {
    setShowOfflineNotice(false);
    if (!isOnline && navigation?.navigate) {
      navigation.navigate('MainTabs', { screen: 'Field Ops' });
    }
  };

  const screenOptions = React.useCallback(({ route }) => {
    const isTabDisabled = !isOnline && (route.name === 'Home' || route.name === 'Profile');
    const cfg = TAB_ICONS[route.name];

    return {
      headerShown: false,
      tabBarShowLabel: false,
      tabBarActiveTintColor: COLORS.primary,
      tabBarInactiveTintColor: isTabDisabled ? '#A8B3A2' : COLORS.textMuted,
      tabBarStyle: {
        backgroundColor: COLORS.surface,
        borderTopColor: COLORS.border,
        borderTopWidth: 1,
        height: 52 + bottomInset,
        paddingTop: 4,
        paddingBottom: bottomInset > 0 ? bottomInset : 4,
        ...SHADOW.float,
      },
      tabBarItemStyle: {
        justifyContent: 'center',
        alignItems: 'center',
        height: 44,
        opacity: isTabDisabled ? 0.35 : 1,
      },
      tabBarIcon: ({ focused }) => {
        const activeColor = isTabDisabled ? '#A8B3A2' : COLORS.primary;
        const inactiveColor = isTabDisabled ? '#A8B3A2' : COLORS.textMuted;
        const iconColor = focused && !isTabDisabled ? activeColor : inactiveColor;
        const iconName = focused && !isTabDisabled ? cfg.active : cfg.inactive;

        return (
          <View style={{
            alignItems: 'center',
            justifyContent: 'center',
            width: 44,
            height: 28,
            borderRadius: 14,
            backgroundColor: focused && !isTabDisabled ? '#E2EED9' : 'transparent',
          }}>
            <Ionicons
              name={iconName}
              size={22}
              color={iconColor}
            />
          </View>
        );
      },
    };
  }, [bottomInset, isOnline]);

  // Strict Offline Barrier for SRA Admin to protect audit integrity
  if (!isOnline && role === 'SRA Admin') {
    return (
      <AdminOfflineBarrier
        session={getCurrentSession()}
        connectivityStatus={connectivityStatus}
        onRetry={(online) => setIsOnline(online)}
      />
    );
  }

  return (
    <>
      <Tab.Navigator
        initialRouteName={!isOnline ? 'Field Ops' : 'Home'}
        screenOptions={screenOptions}
      >
        <Tab.Screen
          name="Home"
          component={HomeNavigator}
          listeners={{
            tabPress: (e) => {
              if (!isOnline) {
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
              if (!isOnline) {
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
                ? 'No internet connection'
                : 'HUGPONG server unavailable'}
            </Text>

            <Text style={modalStyles.desc}>
              {connectivityStatus === CONNECTIVITY_STATUS.SERVER_UNAVAILABLE
                ? 'Your internet connection is active, but the HUGPONG server cannot be reached. Cached work remains available and queued changes will sync automatically when service returns.'
                : role === 'Farm Manager'
                ? 'Navigating directly to Field Operations. In offline mode, only your own personal field plot can be accessed. Managed block farm plots and Manager Takeover are disabled until an internet connection is restored.'
                : role === 'Farm Member'
                ? 'You have offline access to your Planner and assigned field plot. Any recorded operations will be saved locally and synced once connection is restored.'
                : 'You are currently in offline mode. Cached records and operations are accessible.'}
            </Text>

            <TouchableOpacity
              style={modalStyles.btn}
              onPress={handleDismissOfflineNotice}
              activeOpacity={0.85}
            >
              <Text style={modalStyles.btnText}>
                {role === 'Farm Manager' ? 'Proceed to My Field' : 'Proceed to My Plot'}
              </Text>
              <Ionicons name="arrow-forward" size={16} color="#FFF" />
            </TouchableOpacity>
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
