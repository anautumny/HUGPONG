import React from 'react';
import { View, Text, Modal, TouchableOpacity, StyleSheet } from 'react-native';
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
    flexShrink: 1,
    fontSize: 14,
    fontWeight: '800',
    color: '#FFF',
    textAlign: 'center',
  },
});

function MainTabs({ navigation }) {
  const { t } = useTranslation();
  const [role, setRole] = React.useState(getCurrentSession()?.role || 'Farm Member');
  const [isOnline, setIsOnline] = React.useState(getNetworkStatus());
  const [connectivityStatus, setConnectivityStatus] = React.useState(getConnectivityDetails().status);
  const [showOfflineNotice, setShowOfflineNotice] = React.useState(false);
  const hasShownOfflineNoticeRef = React.useRef(false);
  React.useEffect(() => {
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
            console.warn('[Navigation] Unable to restore the cached SRA snapshot:', error?.message || error);
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
    return () => {
      unsubSession();
      unsubNet();
    };
  }, [navigation]);

  const handleDismissOfflineNotice = () => {
    setShowOfflineNotice(false);
    if (!isOnline && role !== 'SRA Admin' && navigation?.navigate) {
      navigation.navigate('MainTabs', { screen: 'Field Ops' });
    }
  };

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
