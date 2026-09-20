import React from 'react';
import { View, Text, Modal, TouchableOpacity, StyleSheet } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SHADOW } from '../theme';
import { getCurrentSession, subscribe } from '../data/dataStore';

import SplashScreen from '../screens/auth/SplashScreen';
import LanguageSelectScreen from '../screens/auth/LanguageSelectScreen';
import OnboardingScreen from '../screens/auth/OnboardingScreen';
import LoginScreen from '../screens/auth/LoginScreen';
import RegisterScreen from '../screens/auth/RegisterScreen';
import ForgotPasswordScreen from '../screens/auth/ForgotPasswordScreen';

import HomeScreen from '../screens/HomeScreen';
import AnalyticsScreen from '../screens/AnalyticsScreen';
import PlannerScreen from '../screens/PlannerScreen';
import FieldOpsScreen from '../screens/FieldOpsScreen';
import ProfileScreen from '../screens/ProfileScreen';
import SecurityScreen from '../screens/SecurityScreen';
import SyncMonitorScreen from '../screens/SyncMonitorScreen';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from '../services/i18n';

import AdminOfflineBarrier from '../components/AdminOfflineBarrier';
import { subscribeToNetwork, getNetworkStatus } from '../services/networkService';

const Root = createNativeStackNavigator();
const Tab = createBottomTabNavigator();
const HomeStack = createNativeStackNavigator();
const CalcStack = createNativeStackNavigator();
const SchedStack = createNativeStackNavigator();
const ProfileStack = createNativeStackNavigator();

const TAB_ICONS = {
  Home: { active: 'home', inactive: 'home-outline' },
  Planner: { active: 'construct', inactive: 'construct-outline' },
  'Field Ops': { active: 'book', inactive: 'book-outline' },
  Profile: { active: 'person', inactive: 'person-outline' },
};

function HomeNavigator() {
  return (
    <HomeStack.Navigator screenOptions={{ headerShown: false }}>
      <HomeStack.Screen name="HomeMain" component={HomeScreen} />
      <HomeStack.Screen name="FieldOps" component={FieldOpsScreen} options={{ animation: 'slide_from_right' }} />
      <HomeStack.Screen name="Analytics" component={AnalyticsScreen} options={{ animation: 'slide_from_right' }} />
      <HomeStack.Screen name="SyncMonitor" component={SyncMonitorScreen} options={{ animation: 'slide_from_right' }} />
    </HomeStack.Navigator>
  );
}

function CalcNavigator() {
  return (
    <CalcStack.Navigator screenOptions={{ headerShown: false }}>
      <CalcStack.Screen name="CalcMain" component={PlannerScreen} />
    </CalcStack.Navigator>
  );
}

function SchedNavigator() {
  return (
    <SchedStack.Navigator screenOptions={{ headerShown: false }}>
      <SchedStack.Screen name="SchedMain" component={FieldOpsScreen} />
      <SchedStack.Screen name="Analytics" component={AnalyticsScreen} options={{ animation: 'slide_from_right' }} />
      <SchedStack.Screen name="SyncMonitor" component={SyncMonitorScreen} options={{ animation: 'slide_from_right' }} />
    </SchedStack.Navigator>
  );
}

function ProfileNavigator() {
  return (
    <ProfileStack.Navigator screenOptions={{ headerShown: false }}>
      <ProfileStack.Screen name="ProfileMain" component={ProfileScreen} />
      <ProfileStack.Screen name="Security" component={SecurityScreen} options={{ animation: 'slide_from_right' }} />
      <ProfileStack.Screen name="SyncMonitor" component={SyncMonitorScreen} options={{ animation: 'slide_from_right' }} />
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
  const [role, setRole] = React.useState(getCurrentSession()?.role || 'Member Farmer');
  const [isOnline, setIsOnline] = React.useState(getNetworkStatus());
  const [showOfflineNotice, setShowOfflineNotice] = React.useState(!getNetworkStatus());
  const hasShownOfflineNoticeRef = React.useRef(!getNetworkStatus());
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const bottomInset = insets.bottom > 0 ? Math.min(insets.bottom, 16) : 0;

  React.useEffect(() => {
    const unsubSession = subscribe(() => {
      setRole(getCurrentSession()?.role || 'Member Farmer');
    });
    const unsubNet = subscribeToNetwork((online) => {
      setIsOnline(online);
      if (!online) {
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
        {role === 'Member Farmer' ? (
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
              You are currently in offline mode
            </Text>

            <Text style={modalStyles.desc}>
              {role === 'Farm Manager'
                ? 'Navigating directly to Field Operations. In offline mode, only your own personal field plot can be accessed. Managed block farm plots and supervisory takeover are disabled until an internet connection is restored.'
                : role === 'Member Farmer'
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
