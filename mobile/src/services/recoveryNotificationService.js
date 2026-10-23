import { AppState, Platform } from 'react-native';
import Constants from 'expo-constants';
import { getItem, saveItem, STORAGE_KEYS } from './storageService';

const CHANNEL_ID = 'account-recovery';
const MANAGED_TYPE = 'password-recovery-review';
const TOKEN_TIMEOUT_MS = 10_000;
let notificationModule = null;
let notificationHandlerReady = false;
let applicationPermissionRequest = null;

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

async function requestPermissionWhenActive({ userInitiated = false } = {}) {
  try {
    const Notifications = getNotificationModule();
    if (!Notifications) return { supported: false, granted: false, reason: 'EXPO_GO' };
    if (AppState.currentState !== 'active') return { supported: true, granted: false, reason: 'APP_INACTIVE' };
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
    const alreadyRequested = await getItem(STORAGE_KEYS.NOTIFICATION_PERMISSION_REQUESTED, false);
    // Android 13+ may report DENIED before the first request. canAskAgain,
    // rather than UNDETERMINED alone, determines whether a dialog is possible.
    if (permission.status !== 'granted' && permission.canAskAgain !== false && (!alreadyRequested || userInitiated)) {
      permission = await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowBadge: true, allowSound: true } });
      await saveItem(STORAGE_KEYS.NOTIFICATION_PERMISSION_REQUESTED, true);
    }
    return { supported: true, granted: permission.status === 'granted', status: permission.status, canAskAgain: permission.canAskAgain !== false };
  } catch {
    return { supported: true, granted: false, reason: 'PERMISSION_UNAVAILABLE' };
  }
}

export function requestApplicationNotificationPermission(options = {}) {
  if (!applicationPermissionRequest) {
    applicationPermissionRequest = requestPermissionWhenActive(options).finally(() => { applicationPermissionRequest = null; });
  }
  return applicationPermissionRequest;
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
