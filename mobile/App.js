import React, { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { enableScreens } from 'react-native-screens';
import { createNavigationContainerRef, NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import RootNavigator from './src/navigation/RootNavigator';
import { LanguageProvider } from './src/services/i18n';
import { checkConnectivity, startNetworkMonitor, stopNetworkMonitor } from './src/services/networkService';
import { fields, getCurrentSession, performMobileSync, subscribe } from './src/data/dataStore';
import { reportMobileActivity } from './src/services/telemetryService';
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

export default function App() {
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
