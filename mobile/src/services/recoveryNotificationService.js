import { Platform } from 'react-native';
import Constants from 'expo-constants';

const CHANNEL_ID = 'account-recovery';
const MANAGED_TYPE = 'password-recovery-review';
const TOKEN_TIMEOUT_MS = 10_000;
let notificationModule = null;
let notificationHandlerReady = false;

const isExpoGo = Constants.appOwnership === 'expo';

function getNotificationModule() {
  if (isExpoGo) return null;
  if (!notificationModule) notificationModule = require('expo-notifications');
  if (!notificationHandlerReady) {
    notificationModule.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
        priority: notificationModule.AndroidNotificationPriority.HIGH
      })
    });
    notificationHandlerReady = true;
  }
  return notificationModule;
}

async function withTimeout(promise, timeoutMs) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('Push token request timed out.')), timeoutMs);
      })
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export async function getRecoveryPushToken() {
  const Notifications = getNotificationModule();
  if (!Notifications) return null;
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
        name: 'Account recovery',
        description: 'Time-sensitive updates for password recovery requests.',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 150, 250],
        showBadge: true
      });
    }
    const permission = await Notifications.getPermissionsAsync();
    if (permission.status !== 'granted') return null;
    const projectId = Constants?.expoConfig?.extra?.eas?.projectId || Constants?.easConfig?.projectId;
    if (!projectId) return null;
    const result = await withTimeout(
      Notifications.getExpoPushTokenAsync({ projectId }),
      TOKEN_TIMEOUT_MS
    );
    return /^(?:Exponent|Expo)PushToken\[[A-Za-z0-9_-]{6,200}\]$/.test(String(result?.data || ''))
      ? result.data
      : null;
  } catch {
    return null;
  }
}

export async function requestApplicationNotificationPermission() {
  const Notifications = getNotificationModule();
  if (!Notifications) return { supported: false, granted: false, reason: 'EXPO_GO' };
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
        name: 'Account recovery',
        description: 'Time-sensitive updates for password recovery requests.',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 150, 250],
        showBadge: true
      });
    }
    let permission = await Notifications.getPermissionsAsync();
    if (permission.status === 'undetermined') {
      permission = await Notifications.requestPermissionsAsync();
    }
    return { supported: true, granted: permission.status === 'granted', status: permission.status };
  } catch {
    return { supported: true, granted: false, reason: 'PERMISSION_UNAVAILABLE' };
  }
}

export function recoveryNotificationData(response) {
  const data = response?.notification?.request?.content?.data || {};
  return data.hugpongType === MANAGED_TYPE ? data : null;
}

export function subscribeToRecoveryNotificationResponses(listener) {
  const Notifications = getNotificationModule();
  if (!Notifications) return { remove() {} };
  return Notifications.addNotificationResponseReceivedListener(listener);
}

export async function getLastRecoveryNotificationResponse() {
  const Notifications = getNotificationModule();
  if (!Notifications) return null;
  return Notifications.getLastNotificationResponseAsync();
}

export async function clearLastRecoveryNotificationResponse() {
  const Notifications = getNotificationModule();
  if (!Notifications) return;
  return Notifications.clearLastNotificationResponseAsync();
}
