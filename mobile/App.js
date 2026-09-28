import React, { useCallback, useEffect, useRef } from 'react';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { enableScreens } from 'react-native-screens';
import { createNavigationContainerRef, NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import RootNavigator from './src/navigation/RootNavigator';
import { LanguageProvider } from './src/services/i18n';
import { checkConnectivity, startNetworkMonitor, stopNetworkMonitor } from './src/services/networkService';
import { fields, getCurrentSession, performMobileSync, subscribe } from './src/data/dataStore';
import { reportMobileActivity } from './src/services/telemetryService';
import { createMobileReference, reportMobileDiagnostic } from './src/services/clientDiagnostics';
import {
  clearLastPlannerNotificationResponse,
  getLastPlannerNotificationResponse,
  plannerNotificationData,
  subscribeToPlannerNotificationResponses,
  syncPlannerDeviceNotifications
} from './src/services/plannerNotificationService';

// Optimize native screen transitions and memory consumption on Android.
enableScreens(true);
const navigationRef = createNavigationContainerRef();

function HugpongApp() {
  const pendingPlannerDate = useRef(null);
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

  useEffect(() => {
    startNetworkMonitor();
    let previousState = AppState.currentState;
    const appStateSubscription = AppState.addEventListener('change', nextState => {
      const returnedToForeground = /inactive|background/.test(previousState || '') && nextState === 'active';
      previousState = nextState;
      if (returnedToForeground) {
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

  return (
    <LanguageProvider>
      <NavigationContainer
        ref={navigationRef}
        onReady={() => {
          if (!pendingPlannerDate.current) return;
          const plannedDate = pendingPlannerDate.current;
          pendingPlannerDate.current = null;
          navigationRef.navigate('MainTabs', {
            screen: 'Planner',
            params: { screen: 'CalcMain', params: { selectedDate: plannedDate } }
          });
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
  return <MobileErrorBoundary><HugpongApp /></MobileErrorBoundary>;
}

const styles = StyleSheet.create({
  errorScreen: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#F4F7F5' },
  errorCard: { padding: 22, borderRadius: 18, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#DDE5E0' },
  errorTitle: { color: '#17251D', fontSize: 20, fontWeight: '800' },
  errorBody: { marginTop: 10, color: '#56645C', fontSize: 14, lineHeight: 21 },
  reference: { marginTop: 12, color: '#56645C', fontSize: 12, fontFamily: 'monospace' },
  retryButton: { alignSelf: 'flex-start', marginTop: 18, borderRadius: 10, backgroundColor: '#187748', paddingHorizontal: 18, paddingVertical: 11 },
  retryText: { color: '#FFFFFF', fontWeight: '800' }
});
