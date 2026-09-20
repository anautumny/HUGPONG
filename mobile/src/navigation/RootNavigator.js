import React from 'react';
import { View } from 'react-native';
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

function MainTabs() {
  const [role, setRole] = React.useState(getCurrentSession()?.role || 'Member Farmer');
  const [isOnline, setIsOnline] = React.useState(getNetworkStatus());
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const bottomInset = insets.bottom > 0 ? Math.min(insets.bottom, 16) : 0;

  React.useEffect(() => {
    const unsubSession = subscribe(() => {
      setRole(getCurrentSession()?.role || 'Member Farmer');
    });
    const unsubNet = subscribeToNetwork((online) => {
      setIsOnline(online);
    });
    return () => {
      unsubSession();
      unsubNet();
    };
  }, []);

  const screenOptions = React.useCallback(({ route }) => ({
    headerShown: false,
    tabBarShowLabel: false,
    tabBarActiveTintColor: COLORS.primary,
    tabBarInactiveTintColor: COLORS.textMuted,
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
    },
    tabBarIcon: ({ focused }) => {
      const cfg = TAB_ICONS[route.name];
      return (
        <View style={{
          alignItems: 'center',
          justifyContent: 'center',
          width: 44,
          height: 28,
          borderRadius: 14,
          backgroundColor: focused ? '#E2EED9' : 'transparent',
        }}>
          <Ionicons
            name={focused ? cfg.active : cfg.inactive}
            size={22}
            color={focused ? COLORS.primary : COLORS.textMuted}
          />
        </View>
      );
    },
  }), [bottomInset]);

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
    <Tab.Navigator screenOptions={screenOptions}>
      <Tab.Screen name="Home" component={HomeNavigator} />
      {role !== 'SRA Admin' && (
        <Tab.Screen name="Planner" component={CalcNavigator} />
      )}
      <Tab.Screen name="Field Ops" component={SchedNavigator} />
      <Tab.Screen name="Profile" component={ProfileNavigator} />
    </Tab.Navigator>
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
