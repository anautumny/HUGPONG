import React, { useCallback, useEffect, useRef } from 'react';
import { AppState, LogBox, Pressable, StyleSheet, View } from 'react-native';

LogBox.ignoreAllLogs();
import { useFonts } from 'expo-font';
import * as ExpoSplashScreen from 'expo-splash-screen';
import { Inter_300Light } from '@expo-google-fonts/inter/300Light';
import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_400Regular_Italic } from '@expo-google-fonts/inter/400Regular_Italic';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { Inter_700Bold } from '@expo-google-fonts/inter/700Bold';
import { Inter_800ExtraBold } from '@expo-google-fonts/inter/800ExtraBold';
import { Inter_900Black } from '@expo-google-fonts/inter/900Black';
import { PlusJakartaSans_400Regular } from '@expo-google-fonts/plus-jakarta-sans/400Regular';
import { PlusJakartaSans_500Medium } from '@expo-google-fonts/plus-jakarta-sans/500Medium';
import { PlusJakartaSans_600SemiBold } from '@expo-google-fonts/plus-jakarta-sans/600SemiBold';
import { PlusJakartaSans_700Bold } from '@expo-google-fonts/plus-jakarta-sans/700Bold';
import { PlusJakartaSans_800ExtraBold } from '@expo-google-fonts/plus-jakarta-sans/800ExtraBold';
import { enableScreens } from 'react-native-screens';
import { createNavigationContainerRef, NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import RootNavigator from './src/navigation/RootNavigator';
import { LanguageProvider } from './src/services/i18n';
import { checkConnectivity, startNetworkMonitor, stopNetworkMonitor } from './src/services/networkService';
import { fields, getCurrentSession, performMobileSync, subscribe } from './src/data/dataStore';
import { reportMobileActivity } from './src/services/telemetryService';
import { createMobileReference, reportMobileDiagnostic } from './src/services/clientDiagnostics';
import { COLORS } from './src/theme';
import { AppText as Text } from './src/components/Typography';
import {
  clearLastPlannerNotificationResponse,
  getLastPlannerNotificationResponse,
  plannerNotificationData,
  subscribeToPlannerNotificationResponses,
  syncPlannerDeviceNotifications
} from './src/services/plannerNotificationService';
import {
  clearLastRecoveryNotificationResponse,
  getLastRecoveryNotificationResponse,
  recoveryNotificationData,
  requestApplicationNotificationPermission,
  subscribeToRecoveryNotificationResponses
} from './src/services/recoveryNotificationService';

// Optimize native screen transitions and memory consumption on Android.
enableScreens(true);
const navigationRef = createNavigationContainerRef();

ExpoSplashScreen.preventAutoHideAsync().catch(() => {});

const MOBILE_FONTS = {
  Inter_300Light,
  Inter_400Regular,
  Inter_400Regular_Italic,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
  Inter_900Black,
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
};

function HugpongApp() {
  const pendingPlannerDate = useRef(null);
  const pendingRecoveryReview = useRef(false);
  const openPlannerReminder = useCallback((response) => {
    const data = plannerNotificationData(response);
    if (!data?.plannedDate) return;
    if (!navigationRef.isReady()) {
      pendingPlannerDate.current = data.plannedDate;
      return;
    }
    navigationRef.navigate('MainTabs', {
      screen: 'Planner',
      params: { screen: 'CalcMain', params: { selectedDate: data.plannedDate } }
    });
  }, []);

  const openRecoveryReview = useCallback((response) => {
    if (!recoveryNotificationData(response)) return;
    if (!navigationRef.isReady() || navigationRef.getCurrentRoute()?.name === 'Splash') {
      pendingRecoveryReview.current = true;
      return;
    }
    navigationRef.navigate('ForgotPassword', { checkRecoveryReview: true });
  }, []);

  useEffect(() => {
    startNetworkMonitor();
    requestApplicationNotificationPermission().catch(() => {});
    let previousState = AppState.currentState;
    const appStateSubscription = AppState.addEventListener('change', nextState => {
      const returnedToForeground = /inactive|background/.test(previousState || '') && nextState === 'active';
      previousState = nextState;
      if (returnedToForeground) {
        requestApplicationNotificationPermission().catch(() => {});
        reportMobileActivity('FOREGROUND').catch(() => {});
        checkConnectivity()
          .then(online => online && performMobileSync('APP_FOREGROUND'))
          .catch(() => {});
      }
    });
    return () => {
      appStateSubscription.remove();
      stopNetworkMonitor();
    };
  }, []);

  useEffect(() => {
    const refreshReminders = () => syncPlannerDeviceNotifications(fields, getCurrentSession());
    refreshReminders();
    const unsubscribeData = subscribe(refreshReminders);
    const responseSubscription = subscribeToPlannerNotificationResponses(response => {
      openPlannerReminder(response);
      clearLastPlannerNotificationResponse().catch(() => {});
    });
    getLastPlannerNotificationResponse().then(response => {
      if (!plannerNotificationData(response)) return;
      openPlannerReminder(response);
      clearLastPlannerNotificationResponse().catch(() => {});
    }).catch(() => {});
    return () => {
      unsubscribeData();
      responseSubscription.remove();
    };
  }, [openPlannerReminder]);

  useEffect(() => {
    const responseSubscription = subscribeToRecoveryNotificationResponses(response => {
      openRecoveryReview(response);
      clearLastRecoveryNotificationResponse().catch(() => {});
    });
    getLastRecoveryNotificationResponse().then(response => {
      if (!recoveryNotificationData(response)) return;
      openRecoveryReview(response);
      clearLastRecoveryNotificationResponse().catch(() => {});
    }).catch(() => {});
    return () => responseSubscription.remove();
  }, [openRecoveryReview]);

  return (
    <LanguageProvider>
      <NavigationContainer
        ref={navigationRef}
        onReady={() => {
          requestApplicationNotificationPermission().catch(() => {});
          if (pendingRecoveryReview.current && navigationRef.getCurrentRoute()?.name !== 'Splash') {
            pendingRecoveryReview.current = false;
            navigationRef.navigate('ForgotPassword', { checkRecoveryReview: true });
            return;
          }
          if (!pendingPlannerDate.current) return;
          const plannedDate = pendingPlannerDate.current;
          pendingPlannerDate.current = null;
          navigationRef.navigate('MainTabs', {
            screen: 'Planner',
            params: { screen: 'CalcMain', params: { selectedDate: plannedDate } }
          });
        }}
        onStateChange={() => {
          if (!pendingRecoveryReview.current || navigationRef.getCurrentRoute()?.name === 'Splash') return;
          pendingRecoveryReview.current = false;
          navigationRef.navigate('ForgotPassword', { checkRecoveryReview: true });
        }}
      >
        <StatusBar style="auto" />
        <RootNavigator />
      </NavigationContainer>
    </LanguageProvider>
  );
}

class MobileErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, referenceId: '' };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    const referenceId = createMobileReference();
    this.setState({ referenceId });
    if (__DEV__) {
      console.error('[HUGPONG Render Error]', error?.stack || error?.message || error, info?.componentStack || '');
    }
    reportMobileDiagnostic({
      referenceId,
      module: 'MOBILE',
      message: `${error?.name || 'RenderError'}: ${error?.message || 'Mobile application render failed.'} ${info?.componentStack || ''}`,
      errorCode: 'MOBILE_RENDER_FAILURE'
    });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <View style={styles.errorScreen}>
        <View style={styles.errorCard}>
          <Text style={styles.errorTitle}>HUGPONG could not display this screen</Text>
          <Text style={styles.errorBody}>Try opening the screen again. If the problem continues, contact support with the reference ID.</Text>
          {!!this.state.referenceId && <Text style={styles.reference}>Reference ID: {this.state.referenceId}</Text>}
          <Pressable style={styles.retryButton} onPress={() => this.setState({ error: null, referenceId: '' })}>
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      </View>
    );
  }
}

export default function App() {
  const [fontsLoaded, fontError] = useFonts(MOBILE_FONTS);

  useEffect(() => {
    if (!fontsLoaded && !fontError) return;
    ExpoSplashScreen.hideAsync().catch(() => {});
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return <MobileErrorBoundary><HugpongApp /></MobileErrorBoundary>;
}

const styles = StyleSheet.create({
  errorScreen: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: COLORS.background },
  errorCard: { padding: 22, borderRadius: 18, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  errorTitle: { color: COLORS.text, fontSize: 20, fontWeight: '800' },
  errorBody: { marginTop: 10, color: COLORS.textSecondary, fontSize: 14, lineHeight: 21 },
  reference: { marginTop: 12, color: COLORS.textSecondary, fontSize: 12, fontFamily: 'monospace' },
  retryButton: { alignSelf: 'flex-start', marginTop: 18, borderRadius: 10, backgroundColor: COLORS.primary, paddingHorizontal: 18, paddingVertical: 11 },
  retryText: { color: COLORS.textInverse, fontWeight: '800' }
});
