'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { randomUUID } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { androidPushConfiguration } = require('../../mobile/scripts/androidPushConfiguration.cjs');
const root = path.resolve(__dirname, '../..');
const tick = () => new Promise(resolve => setTimeout(resolve, 5));
async function until(condition) {
  for (let attempt = 0; attempt < 400; attempt++) { if (condition()) return; await tick(); }
  assert.fail('Expected asynchronous notification transition did not complete.');
}

function runtime({ baseline = true, permission = true, override = null, nativeFailure = false, timers = {}, legacyInbox = [], pendingNative = [], displayedNative = [] } = {}) {
  let session = { employeeId: 'MEMBER-1', phoneVerified: true, requiresPasswordChange: false, authVersion: 1,
    notificationStartedAt: '2026-01-01T00:00:00.000Z' };
  let online = true, dataCallback, cloudCallback, networkCallback, appCallback, handler;
  const records = new Map(baseline ? [['@hugpong_system_alerts_v2_MEMBER-1', []]] : []);
  records.set('@hugpong_system_inbox_MEMBER-1', legacyInbox);
  const cancelled = [], dismissed = []; let unregistered = 0;
  const scheduled = [], channels = [], refreshes = [], requests = [], callbacks = [];
  let events = [{ id: 'PRICE-NEW', type: 'price', title: 'SRA price updated', body: 'Test-only message', resources: ['prices'], createdAt: new Date().toISOString() }];
  const native = {
    AndroidImportance: { HIGH: 4 }, setNotificationChannelAsync: async (id, options) => {
      channels.push({ id, options });
      if (nativeFailure) throw new Error('Native push unavailable');
    },
    getAllScheduledNotificationsAsync: async () => pendingNative,
    cancelScheduledNotificationAsync: async id => { cancelled.push(id); },
    dismissNotificationAsync: async id => { dismissed.push(id); },
    unregisterForNotificationsAsync: async () => { unregistered++; },
    getPresentedNotificationsAsync: async () => displayedNative, getPermissionsAsync: async () => ({ status: permission ? 'granted' : 'denied' }),
    scheduleNotificationAsync: async value => scheduled.push(value), getLastNotificationResponseAsync: async () => null,
    addNotificationReceivedListener: callback => { callbacks[0] = callback; return { remove() {} }; },
    addNotificationResponseReceivedListener: callback => { callbacks[1] = callback; return { remove() {} }; }
  };
  const context = {
    AppState: { currentState: 'active', addEventListener: (_event, callback) => { appCallback = callback; return { remove() {} }; } }, Platform: { OS: 'android' },
    getItem: async (key, fallback) => records.has(key) ? records.get(key) : fallback,
    saveItem: async (key, value) => { records.set(key, structuredClone(value)); return true; },
    getApplicationNotificationModule: () => native,
    getRecoveryPushToken: async () => permission ? 'ExpoPushToken[client-token]' : null,
    requestApplicationNotificationPermission: async () => ({ granted: permission }),
    setSystemNotificationHandler: callback => { handler = callback; },
    getNetworkStatus: () => online,
    subscribeToNetwork: callback => { networkCallback = callback; return () => {}; },
    authenticatedRequest: async (url, options) => {
      requests.push(url);
      const replacement = override?.(url, options); if (replacement) return replacement;
      if (url.startsWith('/api/notifications/inbox')) return { success: true, data: structuredClone(events), page: {} };
      if (url === '/api/notifications/state/query') return { success: true, data: [] };
      return { success: true };
    },
    setTimeout, clearTimeout, console, ...timers
  };
  vm.createContext(context);
  const source = fs.readFileSync(path.join(root, 'mobile/src/services/systemNotificationService.js'), 'utf8')
    .replace(/^import .*;\r?\n/gm, '').replace(/export /g, '');
  vm.runInContext(source, context);
  context.getSystemNotifications = vm.runInContext('getSystemNotifications', context);
  const stop = context.startSystemNotifications({ getSession: () => session,
    subscribe: callback => { dataCallback = callback; return () => {}; },
    subscribeToCloudChanges: callback => { cloudCallback = callback; return () => {}; },
    refreshResources: async value => refreshes.push([...value]), onChange() {}, onOpen() {} });
  return { records, scheduled, channels, refreshes, requests, stop, cancelled, dismissed, unregistered: () => unregistered,
    inbox: () => context.getSystemNotifications(session),
    cloud: event => cloudCallback(event), setEvents: value => { events = value.map(event => ({ createdAt: new Date().toISOString(), ...event })); },
    switchAccount(id) { session = { ...session, employeeId: id }; dataCallback(); },
    network(value) { online = value; networkCallback(value); },
    foreground() { appCallback('active'); },
    present: data => handler({ request: { content: { data } } }) };
}

test('Android catches missed events on reconnect and presents each unseen event once', async t => {
  const client = runtime(); t.after(client.stop);
  await until(() => client.scheduled.length === 1);
  assert.equal(client.inbox()[0].id, 'PRICE-NEW');
  assert.equal(client.scheduled[0].trigger.channelId, 'system-updates');
  assert.equal(client.channels[0].id, 'system-updates');
  assert.equal(Object.hasOwn(client.channels[0].options, 'sound'), false, 'Android channel must not resolve default as a custom sound file');
  assert.equal(client.scheduled[0].content.sound, 'default', 'notification content retains its valid default-sound option');
  client.network(false);
  client.setEvents([{ id: 'PRICE-LATER', title: 'New price', body: 'Test', resources: ['prices'] }, ...client.inbox()]);
  client.network(true);
  await until(() => client.scheduled.length === 2);
  client.cloud({ resources: ['notifications'] });
  await new Promise(resolve => setTimeout(resolve, 150));
  assert.equal(client.scheduled.length, 2);
  assert.ok(client.refreshes.some(resources => resources.includes('prices')));
});

test('native notification state reads include only unseen alert candidates and skip unchanged inboxes', async t => {
  const stateQueries = [];
  const client = runtime({ override: (url, options) => {
    if (url === '/api/notifications/state/query') stateQueries.push([...options.body.ids]);
  } }); t.after(client.stop);
  await until(() => client.scheduled.length === 1);
  client.cloud({ resources: ['notifications'] });
  await until(() => client.requests.filter(url => url.startsWith('/api/notifications/inbox')).length === 2);
  assert.deepEqual(stateQueries, [['PRICE-NEW']]);
  client.setEvents([{ id: 'NEXT-PRICE', resources: ['prices'] }, ...client.inbox()]);
  client.cloud({ resources: ['notifications'] });
  await until(() => client.scheduled.length === 2);
  assert.deepEqual(stateQueries, [['PRICE-NEW'], ['NEXT-PRICE']]);
});

test('Android deduplicates native foreground alerts and rejects a different account recipient', async t => {
  const client = runtime(); t.after(client.stop);
  await until(() => client.inbox().length === 1);
  const data = { hugpongType: 'system-update', notificationId: 'NATIVE-1', recipientUserId: 'MEMBER-1', createdAt: new Date().toISOString(), resources: ['prices'] };
  assert.equal(await client.present(data), true);
  assert.equal(await client.present(data), false);
  assert.equal(await client.present({ ...data, recipientUserId: 'OTHER-MEMBER', notificationId: 'OTHER' }), false);
  assert.ok(client.records.get('@hugpong_system_alerts_v2_MEMBER-1').includes('NATIVE-1'));
});

test('historical native events and legacy inbox caches cannot enter a new account inbox', async t => {
  const client = runtime({ legacyInbox: [{ id: 'OLD-CACHED-PRICE', createdAt: '2025-01-01T00:00:00.000Z' }] });
  t.after(client.stop);
  client.setEvents([{ id: 'BEFORE-LOGIN', createdAt: '2025-01-01T00:00:00.000Z' }]);
  await until(() => client.requests.some(url => url.startsWith('/api/notifications/inbox')));
  assert.equal(client.inbox().length, 0);
  assert.equal(client.scheduled.length, 0);
  assert.equal(await client.present({ hugpongType: 'system-update', recipientUserId: 'MEMBER-1', notificationId: 'HISTORICAL', createdAt: '2025-01-01T00:00:00.000Z' }), false);
  assert.equal(await client.present({ hugpongType: 'system-update', recipientUserId: 'MEMBER-1', notificationId: 'UNDATED' }), false);
});

test('logout clears account and legacy planner alerts, unregisters native push and rejects late notifications', async t => {
  const pendingNative = [
    { identifier: 'OWN-PLAN', content: { data: { hugpongType: 'planner-reminder', recipientUserId: 'MEMBER-1' } } },
    { identifier: 'LEGACY-PLAN', content: { data: { hugpongType: 'planner-reminder' } } },
    { identifier: 'RECOVERY', content: { data: { hugpongType: 'password-recovery-review' } } }
  ];
  const displayedNative = [{ request: { identifier: 'OWN-ALERT', content: { data: { hugpongType: 'system-update', recipientUserId: 'MEMBER-1' } } } }];
  const client = runtime({ pendingNative, displayedNative }); t.after(client.stop);
  await until(() => client.cancelled.includes('LEGACY-PLAN'));
  assert.equal(client.cancelled.includes('OWN-PLAN'), false);
  client.switchAccount('');
  await until(() => client.cancelled.includes('OWN-PLAN') && client.dismissed.includes('OWN-ALERT'));
  assert.equal(client.unregistered(), 1);
  assert.equal(client.cancelled.includes('RECOVERY'), false, 'an explicitly requested recovery is independent of application sign-in');
  assert.equal(client.inbox().length, 0);
  assert.equal(await client.present({ hugpongType: 'system-update', recipientUserId: 'MEMBER-1', notificationId: 'LATE', createdAt: new Date().toISOString() }), false);
  assert.equal(await client.present({ hugpongType: 'planner-reminder', recipientUserId: 'MEMBER-1' }), false);
});

test('disabled OS permissions or missing native configuration do not block the in-app inbox', async t => {
  for (const options of [{ permission: false }, { nativeFailure: true }]) {
    const client = runtime(options); t.after(client.stop);
    await until(() => client.inbox().length === 1);
    if (!options.permission) assert.equal(client.requests.includes('/auth/push-device'), false);
  }
});

test('Android inbox failures retain a retry deadline despite repeated change events', async t => {
  let clock = 10000;
  const timers = new Map();
  class Clock extends Date { static now() { return clock; } }
  const client = runtime({ override: url => url.startsWith('/api/notifications/inbox')
    ? Promise.reject(Object.assign(new Error('Temporary outage'), { status: 503 })) : null,
    timers: { Date: Clock, setTimeout: (callback, delay) => { const id = {}; timers.set(id, { callback, delay }); return id; }, clearTimeout: id => timers.delete(id) } });
  t.after(client.stop); await new Promise(resolve => setImmediate(resolve));
  let [id, timer] = [...timers.entries()][0]; timers.delete(id); clock += timer.delay; await timer.callback();
  assert.equal(client.requests.filter(url => url.includes('/inbox')).length, 1);
  for (let index = 0; index < 25; index++) client.cloud({ resources: ['notifications'] });
  [id, timer] = [...timers.entries()][0];
  assert.ok(timer.delay >= 1000, 'change events preserve the retry deadline');
  timers.delete(id); clock += 100; await timer.callback();
  assert.equal(client.requests.filter(url => url.includes('/inbox')).length, 1, 'even an early timer cannot bypass backoff');
  [id, timer] = [...timers.entries()][0]; timers.delete(id); clock += timer.delay; await timer.callback();
  assert.equal(client.requests.filter(url => url.includes('/inbox')).length, 2);
});

test('a fresh installation establishes a baseline without replaying old notification sounds', async t => {
  const client = runtime({ baseline: false }); t.after(client.stop);
  await until(() => client.inbox().length === 1 && client.records.has('@hugpong_system_alerts_v2_MEMBER-1'));
  assert.equal(client.scheduled.length, 0);
});

test('a delayed old-account inbox cannot overwrite the next account or its cache', async t => {
  let release;
  let first = true;
  const client = runtime({ override: url => {
    if (url.startsWith('/api/notifications/inbox') && first) {
      first = false; return new Promise(resolve => { release = resolve; });
    }
  } }); t.after(client.stop);
  await until(() => release);
  client.switchAccount('MEMBER-2');
  client.setEvents([{ id: 'ACCOUNT-TWO', title: 'Own update', resources: ['prices'] }]);
  release({ success: true, data: [{ id: 'PRIVATE-OLD-ACCOUNT' }], page: {} });
  await until(() => client.inbox()[0]?.id === 'ACCOUNT-TWO');
  assert.equal(client.records.has('@hugpong_system_inbox_v2_MEMBER-1'), false);
  assert.equal(client.records.get('@hugpong_system_inbox_v2_MEMBER-2')[0].id, 'ACCOUNT-TWO');
});

test('Android build configuration validates the package/project and rejects service account credentials', () => {
  const directory = path.join(root, 'tmp', 'push-config-tests');
  fs.mkdirSync(directory, { recursive: true });
  const file = path.join(directory, `${randomUUID()}.json`);
  const config = { android: { package: 'com.hugpong.app' } };
  const env = { GOOGLE_SERVICES_JSON: file, EXPO_PUBLIC_FIREBASE_PROJECT_ID: 'test-project' };
  try {
    fs.writeFileSync(file, JSON.stringify({ project_info: { project_id: 'test-project', project_number: '123' }, client: [{ client_info: { android_client_info: { package_name: 'com.hugpong.app' } } }] }));
    assert.equal(androidPushConfiguration(config, env), file);
    assert.throws(() => androidPushConfiguration({ android: { package: 'wrong.package' } }, env), /does not match/);
    assert.throws(() => androidPushConfiguration(config, { ...env, EXPO_PUBLIC_FIREBASE_PROJECT_ID: 'other-project' }), /project IDs must match/);
    fs.writeFileSync(file, JSON.stringify({ type: 'service_account', private_key: 'TEST-NOT-A-REAL-KEY' }));
    assert.throws(() => androidPushConfiguration(config, env), /private key cannot be included/);
  } finally { fs.unlinkSync(file); }
});

test('a native price update bypasses stale read caches and persists the SRA snapshot despite an unrelated refresh failure', async () => {
  const source = fs.readFileSync(path.join(root, 'mobile/src/data/dataStore.js'), 'utf8');
  const start = source.indexOf('const persistCurrentPrices =');
  const end = source.indexOf('export const notifySystemInboxChanged', start);
  const snapshot = { ownerUserId: 'SRA-1', fields: [{ id: 'KEEP-FIELD' }], certifiedAuditReports: [{ id: 'KEEP-AUDIT' }], prices: [{ id: 'OLD' }] };
  const context = {
    CURRENT_SESSION: { employeeId: 'SRA-1', role: 'SRA_ADMIN', phoneVerified: true },
    getNetworkStatus: () => true, ROLES: { SRA_ADMIN: 'SRA_ADMIN' }, canonicalRole: value => value,
    sraOfflineSnapshotStorageKey: value => value, getItem: async () => snapshot,
    saveItem: async (_key, value) => { Object.assign(snapshot, value); return true; },
    priceHistory: [{ id: 'OLD' }], responseRecords: value => value.data,
    fromPriceDocument: (_id, value) => value, sortNewestFirst: value => value, notify() {},
    authenticatedRequest: async (url, options) => {
      assert.equal(url, '/api/prices?limit=52');
      assert.equal(options.headers['Cache-Control'], 'no-cache');
      return { success: true, data: [{ id: 'NEW-PRICE', sugarPricePerLkg: 2600 }] };
    },
    activeCloudRefresh: async () => { throw new Error('Unrelated operation list is temporarily unavailable'); }
  };
  vm.createContext(context);
  vm.runInContext(source.slice(start, end).replace(/export const /g, 'var '), context);
  await assert.rejects(context.refreshFromSystemNotification(['prices']), /Unrelated operation list/);
  assert.equal(context.priceHistory[0].sugarPricePerLkg, 2600);
  assert.equal(snapshot.prices[0].id, 'NEW-PRICE');
  assert.equal(snapshot.fields[0].id, 'KEEP-FIELD');
  assert.equal(snapshot.certifiedAuditReports[0].id, 'KEEP-AUDIT');
});

test('the Web verification dialog rechecks an approval received during its initial session read', async () => {
  const source = fs.readFileSync(path.join(root, 'web/react-app/src/components/auth/FirstLoginVerifyModal.jsx'), 'utf8');
  const start = source.indexOf('useEffect(() => {');
  const end = source.indexOf('}, [isOpen, verificationStep, pendingUser?.employeeId, pendingUser?.id, pendingToken]);', start)
    + '}, [isOpen, verificationStep, pendingUser?.employeeId, pendingUser?.id, pendingToken]);'.length;
  let changed, release, cleanup, calls = 0, accepted = 0;
  const context = {
    useEffect: callback => { cleanup = callback(); },
    isOpen: true, verificationStep: 'review', pendingUser: { employeeId: 'SRA-1' }, pendingToken: 'TEST-TOKEN',
    verifiedCallback: { current: result => { assert.equal(result.user.employeeId, 'SRA-1'); accepted++; } },
    webClientHeaders: () => ({ 'x-client-platform': 'web' }), navigator: { onLine: true },
    window: { addEventListener() {}, removeEventListener() {} },
    document: { visibilityState: 'visible', addEventListener() {}, removeEventListener() {} },
    createChangeStream: options => { changed = options.onChange; return () => {}; },
    fetch: async () => {
      calls++;
      if (calls === 1) return new Promise(resolve => { release = () => resolve({ ok: true, json: async () => ({ success: true, user: { employeeId: 'SRA-1', phoneVerified: false } }) }); });
      return { ok: true, json: async () => ({ success: true, user: { employeeId: 'SRA-1', phoneVerified: true } }) };
    }
  };
  vm.runInNewContext(source.slice(start, end), context);
  changed({ reset: true });
  await until(() => release);
  changed({ resources: ['users'] });
  release();
  await until(() => accepted === 1);
  assert.equal(calls, 2);
  cleanup();
});

test('CI JavaScript exports stay isolated while native EAS builds still require Android push configuration', () => {
  const env = { ...process.env, CI: 'true', NODE_ENV: 'production', EAS_BUILD_PROFILE: '',
    GOOGLE_SERVICES_JSON: path.join(root, 'tmp', 'nonexistent-ci-android-config.json'),
    EXPO_PUBLIC_API_BASE_URL: 'https://hugpong.org', EXPO_PUBLIC_FIREBASE_API_KEY: 'ci-mobile-key',
    EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN: 'hugpong-ci.firebaseapp.com', EXPO_PUBLIC_FIREBASE_PROJECT_ID: 'hugpong-ci',
    EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET: 'hugpong-ci.firebasestorage.app',
    EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: '100000000001', EXPO_PUBLIC_FIREBASE_APP_ID: '1:100000000001:web:ci-mobile-app' };
  const script = "const config=require('./mobile/app.config.js')({config:{android:{package:'com.hugpong.app'}}}); process.stdout.write(JSON.stringify({nativeFileIncluded:!!config.android.googleServicesFile}));";
  const bundle = spawnSync(process.execPath, ['-e', script], { cwd: root, env, encoding: 'utf8' });
  assert.equal(bundle.status, 0, bundle.stderr);
  assert.equal(JSON.parse(bundle.stdout).nativeFileIncluded, false);
  const native = spawnSync(process.execPath, ['-e', script], { cwd: root, env: { ...env, EAS_BUILD_PROFILE: 'preview' }, encoding: 'utf8' });
  assert.notEqual(native.status, 0);
  assert.match(native.stderr, /Android Firebase google-services.json configuration file is unavailable or invalid/);
});
