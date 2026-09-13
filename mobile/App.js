import React, { useEffect } from 'react';
import { enableScreens } from 'react-native-screens';
import { NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import RootNavigator from './src/navigation/RootNavigator';
import { LanguageProvider } from './src/services/i18n';
import { startNetworkMonitor, stopNetworkMonitor } from './src/services/networkService';

// Optimize native screen transitions and memory consumption on Android & iOS
enableScreens(true);

export default function App() {
  useEffect(() => {
    startNetworkMonitor(20000);
    return () => {
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
