import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { getOperationCapabilities } from '../domain/operationAuthorization';
import { collectPlannerEntries, plannerReminderMessage } from '../domain/plannerNotifications';

const CHANNEL_ID = 'planner-reminders';
const MANAGED_TYPE = 'planner-reminder';
let lastFingerprint = '';
let activeSync = null;
let notificationModule = null;
let notificationHandlerReady = false;

const isExpoGo = Constants.appOwnership === 'expo';

function getNotificationModule() {
  // Importing expo-notifications itself initializes Android push-token support,
  // which intentionally throws in Expo Go as of SDK 53. Local reminders remain
  // enabled in development and production builds where the native module exists.
  if (isExpoGo) return null;
  if (!notificationModule) notificationModule = require('expo-notifications');
  if (!notificationHandlerReady) {
    notificationModule.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
        priority: notificationModule.AndroidNotificationPriority.DEFAULT
      })
    });
    notificationHandlerReady = true;
  }
  return notificationModule;
}


const notificationDate = (dateKey, hour) => {
  const date = new Date(`${dateKey}T12:00:00`);
  date.setHours(hour, 0, 0, 0);
  return date;
};

const uniqueFields = entries => [...new Set(entries.map(entry => entry.fieldId).filter(Boolean))];

async function ensurePermission(Notifications, requestPermission) {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Farm work reminders',
      description: 'Reminders for scheduled HUGPONG farm work.',
      importance: Notifications.AndroidImportance.DEFAULT,
      sound: 'default',
      vibrationPattern: [0, 250, 150, 250],
      showBadge: true
    });
  }
  let permission = await Notifications.getPermissionsAsync();
  if (permission.status !== 'granted' && requestPermission) permission = await Notifications.requestPermissionsAsync();
  return permission.status === 'granted';
}

async function cancelManagedNotifications(Notifications) {
  const requests = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(requests
    .filter(request => request.content?.data?.hugpongType === MANAGED_TYPE)
    .map(request => Notifications.cancelScheduledNotificationAsync(request.identifier)));
}

function eligiblePlannerEntries(fields, session) {
  return collectPlannerEntries((fields || []).filter(field => getOperationCapabilities(session, field).canPlan))
    .filter(entry => !entry.completedOperationLogId);
}

async function runSync(fields, session, requestPermission) {
  const Notifications = getNotificationModule();
  if (!Notifications) return { scheduled: 0, unsupported: true, reason: 'EXPO_GO' };
  const entries = eligiblePlannerEntries(fields, session);
  const userId = String(session?.employeeId || session?.userId || session?.id || '');
  const fingerprint = `${userId}:${entries.map(entry => `${entry.id}:${entry.plannedDate}`).sort().join('|')}`;
  if (!requestPermission && fingerprint === lastFingerprint) return { scheduled: 0, unchanged: true };

  const granted = await ensurePermission(Notifications, requestPermission);
  if (!granted) return { scheduled: 0, permissionGranted: false };

  await cancelManagedNotifications(Notifications);
  lastFingerprint = fingerprint;
  if (!userId || entries.length === 0) return { scheduled: 0, permissionGranted: true };

  const now = new Date();
  const byDate = entries.reduce((groups, entry) => {
    (groups[entry.plannedDate] ||= []).push(entry);
    return groups;
  }, {});
  let scheduled = 0;

  for (const [dateKey, dateEntries] of Object.entries(byDate)) {
    const dayOf = notificationDate(dateKey, 7);
    const dayBefore = new Date(dayOf);
    dayBefore.setDate(dayBefore.getDate() - 1);
    dayBefore.setHours(18, 0, 0, 0);
    const fieldsForDate = uniqueFields(dateEntries);
    const baseData = {
      hugpongType: MANAGED_TYPE,
      plannedDate: dateKey,
      fieldIds: fieldsForDate.join(',')
    };

    if (dayBefore > now) {
      await Notifications.scheduleNotificationAsync({
        identifier: `planner-before-${dateKey}-${userId}`,
        content: {
          title: 'Farm work planned tomorrow',
          body: plannerReminderMessage(dateEntries, 'tomorrow'),
          data: { ...baseData, timing: 'tomorrow' },
          sound: 'default'
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: dayBefore, channelId: CHANNEL_ID }
      });
      scheduled += 1;
    }

    if (dayOf > now) {
      await Notifications.scheduleNotificationAsync({
        identifier: `planner-day-${dateKey}-${userId}`,
        content: {
          title: 'Farm work scheduled today',
          body: plannerReminderMessage(dateEntries, 'today'),
          data: { ...baseData, timing: 'today' },
          sound: 'default'
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: dayOf, channelId: CHANNEL_ID }
      });
      scheduled += 1;
    }
  }
  return { scheduled, permissionGranted: true };
}

export function syncPlannerDeviceNotifications(fields, session, options = {}) {
  const start = () => runSync(fields, session, options.requestPermission === true)
    .catch(error => {
      console.warn('[Planner Notifications] Reminder refresh was deferred.');
      return { scheduled: 0, error };
    })
    .finally(() => { activeSync = null; });
  if (activeSync) return activeSync.then(start);
  activeSync = start();
  return activeSync;
}

export function subscribeToPlannerNotificationResponses(listener) {
  const Notifications = getNotificationModule();
  if (!Notifications) return { remove() {} };
  return Notifications.addNotificationResponseReceivedListener(listener);
}

export async function getLastPlannerNotificationResponse() {
  const Notifications = getNotificationModule();
  if (!Notifications) return null;
  return Notifications.getLastNotificationResponseAsync();
}

export async function clearLastPlannerNotificationResponse() {
  const Notifications = getNotificationModule();
  if (!Notifications) return;
  return Notifications.clearLastNotificationResponseAsync();
}

export function plannerNotificationData(response) {
  const data = response?.notification?.request?.content?.data || {};
  return data.hugpongType === MANAGED_TYPE ? data : null;
}
