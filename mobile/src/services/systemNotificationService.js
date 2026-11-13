import { AppState, Platform } from 'react-native';
import { authenticatedRequest } from './authService';
import { getItem, saveItem } from './storageService';
import { subscribeToNetwork, getNetworkStatus } from './networkService';
import { getApplicationNotificationModule, getRecoveryPushToken, requestApplicationNotificationPermission, setSystemNotificationHandler } from './recoveryNotificationService';

let inboxOwner = '';
let inbox = [];
const userIdOf = session => String(session?.employeeId || session?.id || '');
export const getSystemNotifications = session => userIdOf(session) === inboxOwner ? inbox : [];

// One application owner uses the existing change feed/native module. No polling.
export function startSystemNotifications({ getSession, subscribe, subscribeToCloudChanges, refreshResources, onChange, onOpen }) {
  const Notifications = getApplicationNotificationModule();
  let stopped = false, timer = null, retry = 0, running = false, queued = false;
  let generation = 0, owner = '', identity = '', binding = '', seen = new Set(), loaded = false, baselineKnown = false;
  const scheduled = new Set();
  const current = (id, version) => !stopped && owner === id && generation === version && userIdOf(getSession()) === id;
  const schedule = (delay = 100) => { clearTimeout(timer); if (!stopped) timer = setTimeout(sync, delay); };
  const persistSeen = id => saveItem(`@hugpong_system_alerts_${id}`, [...seen].slice(-500));
  async function hydrate(id, version) {
    const [cached, presented] = await Promise.all([getItem(`@hugpong_system_inbox_${id}`, []), getItem(`@hugpong_system_alerts_${id}`, null)]);
    if (!current(id, version)) return;
    inbox = Array.isArray(cached) ? cached : [];
    seen = new Set(Array.isArray(presented) ? presented : []);
    baselineKnown = Array.isArray(presented);
    loaded = true; onChange();
  }
  function checkOwner() {
    const session = getSession(), id = userIdOf(session);
    const next = `${id}:${session?.authVersion || ''}:${session?.phoneVerified}:${session?.requiresPasswordChange}`;
    if (next === identity) return;
    identity = next; generation++; owner = id; inboxOwner = id;
    inbox = []; seen = new Set(); loaded = false; scheduled.clear(); binding = '';
    if (id) void hydrate(id, generation).then(() => schedule());
  }
  async function sync() {
    if (stopped || !owner || !getNetworkStatus() || AppState.currentState !== 'active') return;
    if (running) { queued = true; return; }
    running = true;
    const id = owner, version = generation;
    try {
      if (!loaded) await hydrate(id, version);
      if (!current(id, version)) return;
      if (Notifications) try {
        if (Platform.OS === 'android') await Notifications.setNotificationChannelAsync('system-updates', {
          name: 'Prices and account verification', importance: Notifications.AndroidImportance.HIGH,
          description: 'Official prices and authorized account-verification updates.', sound: 'default'
        });
        await requestApplicationNotificationPermission();
        const token = await getRecoveryPushToken();
        if (!current(id, version)) return;
        if (token && binding !== `${id}:${token}`) {
          await authenticatedRequest('/auth/push-device', { method: 'POST', body: { token } });
          if (!current(id, version)) return;
          binding = `${id}:${token}`;
        }
      } catch { binding = ''; /* Native push configuration must not block the durable in-app inbox. */ }
      const session = getSession();
      if (session?.phoneVerified !== true || session?.requiresPasswordChange === true) return;
      const events = [];
      let cursor = null;
      do {
        const result = await authenticatedRequest(`/api/notifications/inbox?limit=50${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
        if (!current(id, version)) return;
        events.push(...result.data);
        cursor = result.page?.hasMore ? result.page.nextCursor : null;
      } while (cursor && events.length < 50);
      inbox = events.slice(0, 50);
      // First installation establishes an inbox baseline, without playing a
      // month of old alerts. Later reconnects alert only unseen events.
      if (!baselineKnown) { inbox.forEach(event => seen.add(event.id)); baselineKnown = true; await persistSeen(id); }
      await saveItem(`@hugpong_system_inbox_${id}`, inbox);
      if (!current(id, version)) return;
      onChange();
      if (Notifications && inbox.length) {
        const [displayed, state] = await Promise.all([
          Notifications.getPresentedNotificationsAsync(),
          authenticatedRequest('/api/notifications/state/query', { method: 'POST', body: { expectedUserId: id, ids: inbox.map(event => event.id) } })
        ]);
        if (!current(id, version)) return;
        for (const item of displayed) {
          const data = item.request?.content?.data || {};
          if (data.recipientUserId === id && data.notificationId) seen.add(data.notificationId);
        }
        const read = new Set((state.data || []).filter(item => item.read || item.dismissed).map(item => item.id));
        const permission = await Notifications.getPermissionsAsync();
        if (permission.status === 'granted') for (const event of inbox) {
          if (!current(id, version)) return;
          if (seen.has(event.id) || scheduled.has(event.id) || read.has(event.id)) continue;
          scheduled.add(event.id);
          try {
            await Notifications.scheduleNotificationAsync({ identifier: event.id,
              content: { title: event.title, body: event.body, sound: 'default',
                data: { hugpongType: 'system-update', notificationId: event.id, recipientUserId: id, resources: event.resources } },
              trigger: Platform.OS === 'android' ? { channelId: 'system-updates' } : null });
          } catch (error) { scheduled.delete(event.id); throw error; }
        }
        await persistSeen(id);
      }
      retry = 0;
    } catch {
      if (current(id, version)) schedule(Math.min(30000, 1000 * 2 ** Math.min(retry++, 5)));
    } finally {
      running = false;
      if (queued) { queued = false; schedule(); }
    }
  }
  async function received(notification, opened = false) {
    const data = notification?.request?.content?.data || {};
    if (data.hugpongType !== 'system-update' || data.recipientUserId !== userIdOf(getSession())) return false;
    const id = owner, version = generation;
    if (!loaded) await hydrate(id, version);
    if (!current(id, version)) return false;
    const show = !seen.has(data.notificationId);
    seen.add(data.notificationId);
    await persistSeen(id);
    if (!current(id, version)) return false;
    Promise.resolve(refreshResources(data.resources || [])).catch(() => {});
    schedule();
    if (opened) onOpen?.(data);
    return show;
  }
  setSystemNotificationHandler(notification => received(notification));
  const receiveSub = Notifications?.addNotificationReceivedListener(notification => { void received(notification); });
  const responseSub = Notifications?.addNotificationResponseReceivedListener(response => { void received(response.notification, true); });
  const tokenSub = Notifications?.addPushTokenListener?.(() => { binding = ''; schedule(); });
  Notifications?.getLastNotificationResponseAsync().then(response => { if (response) void received(response.notification, true); }).catch(() => {});
  const stopData = subscribe(checkOwner);
  const stopCloud = subscribeToCloudChanges(event => {
    if (event.reset || event.resources?.some(resource => ['prices', 'users', 'notifications'].includes(resource))) schedule();
  });
  const stopNetwork = subscribeToNetwork(online => {
    if (online) { binding = ''; schedule(); Promise.resolve(refreshResources(['prices', 'session'])).catch(() => {}); }
  });
  const foreground = AppState.addEventListener('change', state => {
    if (state === 'active') { binding = ''; checkOwner(); schedule(); }
  });
  checkOwner();
  return () => {
    stopped = true; generation++; clearTimeout(timer); setSystemNotificationHandler(null);
    stopData(); stopCloud(); stopNetwork(); foreground.remove(); receiveSub?.remove(); responseSub?.remove(); tokenSub?.remove();
    inboxOwner = ''; inbox = [];
  };
}
