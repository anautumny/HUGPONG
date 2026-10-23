'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { memoryFirestore } = require('./helpers/memoryFirestore');
const { COLLECTIONS } = require('../schema/firestoreSchema');
const root = path.resolve(__dirname, '../..');
const mobileRequire = createRequire(path.join(root, 'mobile/package.json'));
const babel = mobileRequire('@babel/core');

function load(relative, mocks) {
  const filename = path.join(root, relative);
  const compiled = babel.transformSync(fs.readFileSync(filename, 'utf8'), {
    filename, configFile: false, babelrc: false,
    plugins: [mobileRequire.resolve('@babel/plugin-transform-react-jsx'), mobileRequire.resolve('@babel/plugin-transform-modules-commonjs')],
  }).code;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', compiled)(name => {
    if (name in mocks) return mocks[name];
    throw new Error(`Unexpected dependency: ${name}`);
  }, module, module.exports);
  return module.exports;
}

function apiFixture() {
  const db = memoryFirestore();
  const firebasePath = require.resolve('../firebase-admin');
  const routePath = require.resolve('../routes/notifications');
  const previous = require.cache[firebasePath];
  require.cache[firebasePath] = { id: firebasePath, filename: firebasePath, loaded: true, exports: { db } };
  delete require.cache[routePath];
  const router = require('../routes/notifications');
  if (previous) require.cache[firebasePath] = previous;
  else delete require.cache[firebasePath];
  const request = async (userId, route, body) => {
    const res = { statusCode: 200, status(value) { this.statusCode = value; return this; }, json(value) { this.body = value; return this; } };
    const req = { body, authorizationVerified: true, authUser: { employeeId: userId }, session: { user: { employeeId: userId } } };
    const handlers = router.stack.find(layer => layer.route?.path === route).route.stack;
    const invoke = index => handlers[index].handle(req, res, () => invoke(index + 1));
    await invoke(0);
    return res;
  };
  return { db, request };
}

test('notification read/dismiss state survives new sessions, stays account-owned and never regresses on retries', async () => {
  const { db, request } = apiFixture();
  const body = { expectedUserId: 'A', ids: ['notif-price-1', 'notif-draft'] };
  assert.equal((await request('A', '/state', { ...body, action: 'read' })).statusCode, 200);
  await Promise.all([
    request('A', '/state', { ...body, action: 'dismiss' }),
    request('A', '/state', { ...body, action: 'read' }),
  ]);
  assert.deepEqual((await request('A', '/state/query', body)).body.data, body.ids.map(id => ({ id, read: true, dismissed: true })));
  assert.deepEqual((await request('B', '/state/query', { ...body, expectedUserId: 'B' })).body.data, body.ids.map(id => ({ id, read: false, dismissed: false })));
  assert.equal(db.records.size, 2);
  assert.ok([...db.records.keys()].every(key => key.startsWith(`${COLLECTIONS.NOTIFICATION_STATES}/`)));
  assert.equal((await request('B', '/state', { ...body, action: 'dismiss' })).statusCode, 409, 'late account A request cannot write under B credentials');
  assert.equal((await request('', '/state', { ...body, action: 'read' })).statusCode, 401);
  assert.equal((await request('A', '/state', { ...body, action: 'unread' })).statusCode, 400);
  assert.equal((await request('A', '/state', { ...body, ids: new Array(101).fill('id'), action: 'read' })).statusCode, 400);
  assert.equal((await request('A', '/state/query', { ...body, ids: [''] })).statusCode, 400);
});

const createClient = () => load('mobile/src/services/notificationStateService.js', { './authService': {}, './storageService': {} }).createNotificationStateClient;

test('offline read/delete are immediate and survive logout, then synchronize before hydration on another login', async () => {
  const { request } = apiFixture();
  const storage = new Map();
  let online = false, current = 'A';
  const clientFactory = createClient();
  const make = userId => {
    let latest;
    const client = clientFactory({ userId, isCurrent: () => current === userId,
      readCache: async () => storage.get(userId), writeCache: async value => { storage.set(userId, structuredClone(value)); return true; },
      request: async (url, body) => {
        if (!online) throw new Error('Offline');
        const result = await request(current, url.replace('/api/notifications', ''), body);
        if (result.statusCode !== 200) throw new Error('Request denied');
        return result.body;
      },
      onChange: state => { latest = state; },
    });
    return { client, latest: () => latest };
  };
  const first = make('A');
  await first.client.mark(['notif-price-1'], 'read');
  await first.client.mark(['notif-draft'], 'dismiss');
  await first.client.refresh(['notif-price-1', 'notif-draft'], { force: true });
  assert.deepEqual(first.latest(), { read: ['notif-price-1', 'notif-draft'], dismissed: ['notif-draft'] });
  assert.deepEqual(storage.get('A').pendingDismissed, ['notif-draft']);
  current = 'B';
  const other = make('B'); await other.client.ready;
  assert.deepEqual(other.latest(), { read: [], dismissed: [] });
  await first.client.mark(['should-not-write'], 'read');
  assert.equal(storage.get('A').read.includes('should-not-write'), false);
  current = 'A'; online = true;
  const restored = make('A');
  await restored.client.refresh(['notif-price-1', 'notif-draft'], { force: true });
  assert.deepEqual(restored.latest(), first.latest());
  assert.deepEqual(storage.get('A').pendingRead, []);
  assert.deepEqual(storage.get('A').pendingDismissed, []);
  const freshDevice = clientFactory({ userId: 'A', isCurrent: () => true,
    readCache: async () => null, writeCache: async () => true,
    request: async (url, body) => (await request('A', url.replace('/api/notifications', ''), body)).body,
    onChange: state => { current = state; },
  });
  await freshDevice.refresh(['notif-price-1', 'notif-draft']);
  assert.deepEqual(current, first.latest(), 'server restores acknowledged state on another device');
});

test('mark-read responds while server refresh is stalled; late unread responses cannot undo local actions', async () => {
  let release, latest, saved;
  const client = createClient()({ userId: 'A', isCurrent: () => true,
    readCache: async () => null, writeCache: async value => { saved = value; return true; },
    onChange: state => { latest = state; },
    request: async (url, body) => {
      if (url.endsWith('/query')) return new Promise(resolve => { release = () => resolve({ success: true, data: [{ id: 'n', read: false, dismissed: false }] }); });
      return { success: true, data: body.ids.map(id => ({ id, read: true, dismissed: body.action === 'dismiss' })) };
    },
  });
  await client.ready;
  const refreshing = client.refresh(['n']);
  await new Promise(resolve => setImmediate(resolve));
  await client.mark(['n'], 'dismiss');
  assert.deepEqual(latest.dismissed, ['n']);
  assert.deepEqual(saved.pendingDismissed, ['n']);
  release(); await refreshing;
  assert.deepEqual(latest.dismissed, ['n']);
});

test('a malformed server acknowledgement retains notification intents for retry', async () => {
  let saved, valid = false;
  const client = createClient()({ userId: 'A', isCurrent: () => true,
    readCache: async () => null, writeCache: async value => { saved = value; return true; },
    request: async (_url, body) => ({ success: true, data: valid ? body.ids.map(id => ({ id, read: true, dismissed: true })) : [] }),
  });
  await client.mark(['n'], 'dismiss');
  await client.refresh(['n'], { force: true });
  assert.deepEqual(saved.pendingDismissed, ['n']);
  valid = true;
  await client.refresh(['n'], { force: true });
  assert.deepEqual(saved.pendingDismissed, []);
});

test('first-launch native permission handles Android denied-but-requestable status without repeated automatic prompts', async () => {
  const storage = new Map(), calls = [];
  const appState = { currentState: 'background' };
  let granted = false;
  const mocks = {
    'react-native': { AppState: appState, Platform: { OS: 'android' } },
    'expo-constants': { appOwnership: 'standalone' },
    './storageService': { STORAGE_KEYS: { NOTIFICATION_PERMISSION_REQUESTED: 'asked' }, getItem: async key => storage.get(key), saveItem: async (key, value) => storage.set(key, value) },
    'expo-notifications': {
      setNotificationHandler() {}, AndroidImportance: { HIGH: 4 }, AndroidNotificationPriority: { HIGH: 2 },
      setNotificationChannelAsync: async () => calls.push('channel'),
      getPermissionsAsync: async () => ({ status: granted ? 'granted' : 'denied', canAskAgain: true }),
      requestPermissionsAsync: async () => { calls.push('prompt'); return { status: granted ? 'granted' : 'denied', canAskAgain: true }; },
    },
  };
  let service = load('mobile/src/services/recoveryNotificationService.js', mocks);
  assert.equal((await service.requestApplicationNotificationPermission()).reason, 'APP_INACTIVE');
  assert.equal(calls.length, 0);
  appState.currentState = 'active';
  await Promise.all([service.requestApplicationNotificationPermission(), service.requestApplicationNotificationPermission()]);
  assert.deepEqual(calls, ['channel', 'prompt']);
  service = load('mobile/src/services/recoveryNotificationService.js', mocks); // restart application
  await service.requestApplicationNotificationPermission();
  assert.equal(calls.filter(value => value === 'prompt').length, 1);
  await service.requestApplicationNotificationPermission({ userInitiated: true });
  assert.equal(calls.filter(value => value === 'prompt').length, 2);
  granted = true;
  assert.equal((await service.requestApplicationNotificationPermission()).granted, true);
  assert.equal(calls.filter(value => value === 'prompt').length, 2);
});

test('permanently denied permission is not requested again and Expo Go never initializes native notifications', async () => {
  let prompts = 0;
  const mocks = {
    'react-native': { AppState: { currentState: 'active' }, Platform: { OS: 'ios' } },
    'expo-constants': { appOwnership: 'standalone' },
    './storageService': { STORAGE_KEYS: {}, getItem: async () => false },
    'expo-notifications': { setNotificationHandler() {}, getPermissionsAsync: async () => ({ status: 'denied', canAskAgain: false }), requestPermissionsAsync: async () => prompts++ },
  };
  assert.equal((await load('mobile/src/services/recoveryNotificationService.js', mocks).requestApplicationNotificationPermission()).canAskAgain, false);
  assert.equal(prompts, 0);
  mocks['expo-constants'] = { appOwnership: 'expo' };
  delete mocks['expo-notifications'];
  assert.equal((await load('mobile/src/services/recoveryNotificationService.js', mocks).requestApplicationNotificationPermission()).reason, 'EXPO_GO');
});

test('initial unknown network and fresh login do not announce restored; a real offline/online transition does', async () => {
  const network = load('mobile/src/services/networkService.js', {
    './authService': { probeServerConnectivity: async () => true },
    '../config/apiConfig': { logApiDiagnostic() {} },
    '@react-native-community/netinfo': { fetch: async () => ({ isConnected: null, isInternetReachable: null }) },
  });
  const events = [], reconnects = [];
  network.setOnReconnectCallback(async reason => { reconnects.push(reason); return { remainingCount: 0 }; });
  network.subscribeToReconnectStatus(status => events.push(status.phase));
  await network.checkConnectivity();
  assert.equal(network.getNetworkStatus(), true);
  assert.deepEqual(events, ['IDLE']);
  network.setNetworkStatus(false); network.setNetworkStatus(true);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(events, ['IDLE', 'RECONNECTING', 'COMPLETE']);
  assert.deepEqual(reconnects, ['NETWORK_RESTORED']);
  const loginEvents = [];
  network.subscribeToReconnectStatus(status => loginEvents.push(status.phase));
  await network.checkConnectivity();
  assert.deepEqual(loginEvents, ['IDLE'], 'new login cannot replay the previous completed reconnect');
});

test('Mobile navigation ignores a reconnect without a witnessed offline period in the current screen session', () => {
  const source = fs.readFileSync(path.join(root, 'mobile/src/navigation/RootNavigator.js'), 'utf8');
  const start = source.indexOf('  React.useEffect(() => {', source.indexOf('function MainTabs('));
  const ending = '}, [navigation]);';
  const end = source.indexOf(ending, start) + ending.length;
  assert.ok(start > 0 && end > start);
  let networkListener, reconnectListener;
  const notices = [], timers = [];
  const dependencies = {
    React: { useEffect: callback => callback() },
    subscribe: () => () => {},
    getCurrentSession: () => ({ role: 'Farm Member' }),
    subscribeToNetwork: callback => { networkListener = callback; callback(true, { status: 'ONLINE' }); return () => {}; },
    subscribeToReconnectStatus: callback => { reconnectListener = callback; callback({ phase: 'COMPLETE' }); return () => {}; },
    CONNECTIVITY_STATUS: { CHECKING: 'CHECKING' },
    observedOfflineRef: { current: false }, hasShownOfflineNoticeRef: { current: false }, reconnectStartedAtRef: { current: 0 },
    setRole() {}, setIsOnline() {}, setConnectivityStatus() {}, setShowOfflineNotice() {},
    setReconnectNotice: value => notices.push(value.phase),
    navigation: { navigate() {} }, setTimeout: callback => { timers.push(callback); return timers.length; }, clearTimeout() {},
  };
  new Function(...Object.keys(dependencies), source.slice(start, end))(...Object.values(dependencies));
  reconnectListener({ phase: 'RECONNECTING' }); reconnectListener({ phase: 'COMPLETE' });
  assert.deepEqual(notices, []);
  networkListener(false, { status: 'NO_INTERNET' });
  networkListener(true, { status: 'ONLINE' });
  reconnectListener({ phase: 'RECONNECTING' }); reconnectListener({ phase: 'COMPLETE' });
  timers.forEach(callback => callback());
  assert.deepEqual(notices, ['RECONNECTING', 'COMPLETE']);
});

test('Web notification state adapter uses the same account precondition and server endpoints', async () => {
  const calls = [];
  const service = load('web/react-app/src/services/notificationService.js', { './apiClient': { authenticatedRequest: async (...args) => calls.push(args) } });
  await service.fetchNotificationState('A', ['n']);
  await service.updateNotificationState('A', ['n'], 'read');
  await service.updateNotificationState('A', ['n'], 'dismiss');
  assert.deepEqual(calls.map(([url, options]) => [url, options.body]), [
    ['/api/notifications/state/query', { ids: ['n'], expectedUserId: 'A' }],
    ['/api/notifications/state', { ids: ['n'], action: 'read', expectedUserId: 'A' }],
    ['/api/notifications/state', { ids: ['n'], action: 'dismiss', expectedUserId: 'A' }],
  ]);
});

test('new draft/sync events get new identities without making old dismissed events reappear', () => {
  const mobile = load('mobile/src/domain/notificationIdentity.js', {}).notificationEventId;
  const web = load('web/react-app/src/domain/notificationIdentity.js', {}).notificationEventId;
  const original = [{ id: 'DFT-1', createdAt: '2026-10-01', updatedAt: '2026-10-02' }];
  const id = mobile('drafts', original);
  assert.equal(mobile('drafts', structuredClone(original)), id);
  assert.equal(web('drafts', original), id);
  assert.notEqual(mobile('drafts', [{ ...original[0], updatedAt: '2026-10-03' }]), id);
  assert.notEqual(mobile('drafts', [...original, { id: 'DFT-2' }]), id);
  assert.notEqual(mobile('sync', original), id);
});

test('pending notification acknowledgement count survives offline cache and clears on server confirmation', async () => {
  let saved, online = false;
  const pending = [];
  const factory = createClient();
  const options = { userId: 'A', isCurrent: () => true,
    readCache: async () => saved, writeCache: async value => { saved = structuredClone(value); return true; },
    onPendingChange: value => pending.push(value),
    request: async (_url, body) => {
      if (!online) throw new Error('Offline');
      return { success: true, data: body.ids.map(id => ({ id, read: true, dismissed: true })) };
    },
  };
  const first = factory(options);
  await first.mark(['n'], 'dismiss');
  assert.equal(pending.at(-1), 1);
  const restored = factory(options); await restored.ready;
  assert.equal(pending.at(-1), 1);
  online = true; await restored.refresh(['n'], { force: true });
  assert.equal(pending.at(-1), 0);
});

test('Mobile startup drops abandoned process claims without changing operation identity or draft contents', () => {
  const { recoverAbandonedDraftClaims } = load('mobile/src/domain/draftRecovery.js', {});
  const drafts = [{ id: 'DFT-1', submitting: true, submissionClaimedAt: 'yesterday', submittedOperationId: 'LOG-1', fieldId: 'FLD-1', totalCost: 50 }];
  const recovered = recoverAbandonedDraftClaims(drafts);
  assert.equal(recovered[0].submitting, false); assert.equal(recovered[0].submissionClaimedAt, null);
  assert.equal(recovered[0].submittedOperationId, 'LOG-1'); assert.equal(recovered[0].totalCost, 50);
  assert.equal(drafts[0].submitting, true);
  const source = fs.readFileSync(path.join(root, 'mobile/src/data/dataStore.js'), 'utf8');
  assert.equal((source.match(/draftLogs.push\(\.\.\.recoverAbandonedDraftClaims\(scopedDrafts\)\)/g) || []).length, 2);
});
