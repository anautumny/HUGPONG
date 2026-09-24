import React, { useEffect } from 'react';
import { AppState } from 'react-native';
import { enableScreens } from 'react-native-screens';
import { NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import RootNavigator from './src/navigation/RootNavigator';
import { LanguageProvider } from './src/services/i18n';
import { checkConnectivity, startNetworkMonitor, stopNetworkMonitor } from './src/services/networkService';
import { performMobileSync } from './src/data/dataStore';

// Optimize native screen transitions and memory consumption on Android.
enableScreens(true);

export default function App() {
  useEffect(() => {
    startNetworkMonitor();
    let previousState = AppState.currentState;
    const appStateSubscription = AppState.addEventListener('change', nextState => {
      const returnedToForeground = /inactive|background/.test(previousState || '') && nextState === 'active';
      previousState = nextState;
      if (returnedToForeground) {
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

  return (
    <LanguageProvider>
      <NavigationContainer>
        <StatusBar style="auto" />
        <RootNavigator />
      </NavigationContainer>
    </LanguageProvider>
  );
}
