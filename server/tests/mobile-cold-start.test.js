'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = file => fs.readFileSync(path.resolve(__dirname, '../..', file), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));

// Run the actual encrypted storage, hydration, persistence and restoration
// functions across fresh JavaScript runtimes backed by persistent device maps.
// Firebase/network boundaries stay isolated: no production account is changed.
function runtime({ device, gate, failSecureRead = false, role = 'Farm Member', online = false, rejected = false, refreshError = null } = {}) {
  const account = { employeeId: '01000001', id: '01000001', name: 'Saved account', role,
    phoneVerified: true, blockFarmId: 'FARM-1', requiresPasswordChange: false };
  const ordinary = device?.ordinary || new Map([
    ['@hugpong_fields', JSON.stringify([{ id: 'FIELD-1', memberUserId: account.employeeId, blockFarmId: 'FARM-1' }])],
    ['@hugpong_block_farms', JSON.stringify([{ id: 'FARM-1' }])],
    ['@hugpong_drafts:01000001', JSON.stringify([{ id: 'DRAFT-1', createdByUserId: account.employeeId }])],
    ['@hugpong_outbox:01000001', JSON.stringify([{ mutationId: 'PENDING-1' }])]
  ]);
  const secure = device?.secure || new Map([['hugpong_session', JSON.stringify(account)], ['hugpong_auth_token', JSON.stringify('opaque-token')]]);
  const timers = new Map(), removals = [], writes = [];
  let hydrationCalls = 0, refreshCalls = 0;
  const context = { console: { warn() {}, info() {} }, setTimeout: fn => { const id = {}; timers.set(id, fn); return id; }, clearTimeout: id => timers.delete(id),
    AsyncStorage: {
      getItem: async key => ordinary.get(key) ?? null,
      setItem: async (key, value) => ordinary.set(key, value),
      removeItem: async key => { removals.push(key); ordinary.delete(key); },
      multiGet: async keys => { hydrationCalls++; if (gate) await gate; return keys.map(key => [key, ordinary.get(key) ?? null]); },
      multiSet: async pairs => { for (const [key, value] of pairs) ordinary.set(key, value); },
      multiRemove: async keys => { for (const key of keys) { removals.push(key); ordinary.delete(key); } }
    },
    SecureStore: {
      AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 'device-only',
      getItemAsync: async key => { if (context.failSecureRead && key === 'hugpong_session') throw new Error('Device temporarily locked'); return secure.get(key) ?? null; },
      setItemAsync: async (key, value) => { writes.push(key); secure.set(key, value); },
      deleteItemAsync: async key => { removals.push(key); secure.delete(key); }
    }, failSecureRead,
    CURRENT_SESSION: { name: '', role: 'Farm Member', employeeId: '' }, DEFAULT_GUEST_SESSION: { name: '', role: 'Farm Member', employeeId: '' }, IS_SYNCED: true,
    normalizeSessionUser: value => ({ ...value }), canonicalRole: value => ({ 'Farm Member': 'MEMBER_FARMER', 'Farm Manager': 'FARM_MANAGER', 'SRA Admin': 'SRA_ADMIN' }[value] || value),
    ROLES: { SRA_ADMIN: 'SRA_ADMIN' }, SECURITY_PREFERENCES: {},
    auth: { currentUser: { uid: account.employeeId }, authStateReady: async () => {} }, onAuthStateChanged() {},
    initSyncEngine: async () => {}, stopActiveCloudSync() {}, resetMobileTelemetryState() {},
    clearAuthSessionStorage: async () => context.removeItems(['@hugpong_auth_token', '@hugpong_session']),
    clearSharedAccountCache: async () => context.removeItems(['@hugpong_fields', '@hugpong_block_farms']),
    logoutFromServer: async () => {}, clearOutbox: async () => { throw new Error('must not remove queued work'); },
    clearCanonicalRuntimeData() {}, applySraOfflineSnapshot() {},
    getNetworkStatus: () => online, getPendingSyncCount: () => 0, getOutboxCount: () => 0,
    getOutboxStorageState: () => ({ ready: true }),
    restartCloudSyncIfReady: async () => true, reportMobileActivity: async () => {}, publishTerminalTelemetry: async () => {},
    canReportAgriculturalSyncTelemetry: () => false, performMobileSync: async () => {},
    refreshMobileSessionFromFirebase: async () => { refreshCalls++; if (refreshError) throw refreshError; if (rejected) throw Object.assign(new Error('Rejected'), { status: 401 }); return { user: account }; },
    uniqueRecordsById: value => value, fromBlockFarmDocument: (_id, value) => value,
    currentDraftKey: () => context.CURRENT_SESSION.employeeId ? '@hugpong_drafts:' + context.CURRENT_SESSION.employeeId : null,
    currentActorId: () => context.CURRENT_SESSION.employeeId,
    recoverAbandonedDraftClaims: value => value, persistCurrentUserDrafts: async () => {}, mergeActiveFields: value => value
  };
  for (const key of ['fields', 'blockFarms', 'cropCycles', 'users', 'operationLogs', 'draftLogs', 'archivedFields', 'supportTickets', 'priceHistory', 'pendingUsers', 'auditReports', 'systemHistory']) context[key] = [];
  vm.createContext(context);
  vm.runInContext(read('mobile/src/services/storageService.js').replace(/^import .*;\r?\n/gm, '').replace(/export /g, ''), context);
  const store = read('mobile/src/data/dataStore.js');
  const persistence = store.slice(store.indexOf('let listeners = []'), store.indexOf('export const notifyDataUpdate = notify;')).replace(/export /g, '');
  const hydration = store.slice(store.indexOf('let offlineStoragePromise ='), store.indexOf('// Auto-invoke hydration on bundle load')).replace(/export /g, '');
  const restoration = store.slice(store.indexOf('let sessionRestorePromise ='), store.indexOf('export const logoutUser =')).replace(/export /g, '');
  const loading = store.slice(store.indexOf('const INITIAL_CLOUD_DATA_STATUS'), store.indexOf('const cloudChangeListeners')).replace(/export const /g, 'var ');
  vm.runInContext(persistence + '\n' + loading + '\n' + hydration + '\n' + restoration, context);
  return { context, account, device: { secure, ordinary }, writes, removals,
    start: () => vm.runInContext('initializeOfflineStorage()', context), restore: () => vm.runInContext('restoreSessionFromToken()', context),
    notify: () => vm.runInContext('notify()', context), hydrationCalls: () => hydrationCalls, refreshCalls: () => refreshCalls,
    flush: async () => { for (const [id, callback] of [...timers]) { timers.delete(id); await callback(); } } };
}

test('cold startup waits for one hydration and cannot persist an empty guest over the saved account', async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const r = runtime({ gate });
  const initialization = r.start();
  const first = r.restore(), second = r.restore();
  assert.equal(first, second, 'concurrent restorers share the same handshake');
  let restored = false; first.then(() => { restored = true; });
  r.notify(); await r.flush(); await tick();
  assert.equal(restored, false, 'no main-screen success before cached data finishes loading');
  assert.equal(r.writes.length, 0, 'startup notifications cannot overwrite encrypted account data');
  assert.equal(JSON.parse(r.device.secure.get('hugpong_session')).employeeId, r.account.employeeId);
  release(); await initialization;
  assert.equal((await first).success, true);
  assert.equal(r.hydrationCalls(), 1);
  assert.equal(r.context.CURRENT_SESSION.name, 'Saved account');
  assert.equal(r.context.fields[0].id, 'FIELD-1');
  assert.equal(r.context.draftLogs[0].id, 'DRAFT-1');
  await r.flush();
  assert.equal(JSON.parse(r.device.secure.get('hugpong_session')).employeeId, r.account.employeeId);
});

test('repeated process restarts preserve account, assignments, drafts and pending work offline', async () => {
  let device;
  for (let boot = 0; boot < 3; boot++) {
    const r = runtime({ device });
    assert.equal((await r.restore()).success, true);
    await r.flush(); device = r.device;
    assert.equal(r.context.CURRENT_SESSION.employeeId, '01000001');
    assert.equal(r.context.fields[0].memberUserId, '01000001');
    assert.equal(r.context.draftLogs.length, 1);
    assert.equal(JSON.parse(device.ordinary.get('@hugpong_outbox:01000001'))[0].mutationId, 'PENDING-1');
  }
});

test('temporary secure-storage errors remain retryable without erasing credentials or offline work', async () => {
  const r = runtime({ failSecureRead: true });
  const result = await r.restore();
  assert.equal(result.success, false);
  assert.equal(result.reason, 'LOCAL_STORAGE_HYDRATION_FAILED');
  assert.equal(r.removals.length, 0);
  assert.equal(r.device.secure.has('hugpong_session'), true);
  r.context.failSecureRead = false;
  assert.equal((await r.restore()).success, true);
  assert.equal(r.context.fields[0].id, 'FIELD-1');
});

test('restored Farm Manager and SRA sessions retain identity while online validation stays authoritative', async () => {
  for (const role of ['Farm Manager', 'SRA Admin']) {
    const r = runtime({ role, online: true });
    assert.equal((await r.restore()).success, true);
    assert.equal(r.context.CURRENT_SESSION.role, role);
    assert.equal(r.refreshCalls(), 1);
  }
  const rejected = runtime({ online: true, rejected: true });
  assert.equal((await rejected.restore()).success, false);
  assert.equal(rejected.context.CURRENT_SESSION.employeeId, '');
  assert.equal(rejected.device.ordinary.has('@hugpong_outbox:01000001'), true, 'revocation never erases pending work');
});

test('an older blank profile is repaired through server validation of the persisted Firebase identity', async () => {
  const secure = new Map([['hugpong_session', JSON.stringify({ name: '', role: 'Farm Member', employeeId: '' })], ['hugpong_auth_token', JSON.stringify('opaque-token')]]);
  const r = runtime({ online: true });
  r.device.secure.set('hugpong_session', secure.get('hugpong_session'));
  const result = await r.restore();
  assert.equal(result.success, true);
  assert.equal(r.refreshCalls(), 1);
  assert.equal(result.user.employeeId, '01000001');
  assert.equal(r.context.draftLogs[0].id, 'DRAFT-1');
  assert.equal(r.context.getCloudDataStatus().hasSavedData, true);
  assert.equal(JSON.parse(r.device.secure.get('hugpong_session')).name, 'Saved account');
});

test('empty runtime notifications cannot overwrite a successfully restored secure profile', async () => {
  const r = runtime();
  await r.restore();
  r.context.CURRENT_SESSION = { employeeId: '', name: '', role: 'Farm Member' };
  r.notify(); await r.flush();
  assert.equal(JSON.parse(r.device.secure.get('hugpong_session')).employeeId, '01000001');
});

test('online service outages preserve the last valid account, cached fields and pending work', async () => {
  const r = runtime({ online: true, refreshError: Object.assign(new Error('Service temporarily unavailable'), { status: 503 }) });
  assert.equal((await r.restore()).success, true);
  assert.equal(r.context.CURRENT_SESSION.employeeId, '01000001');
  assert.equal(r.context.fields[0].id, 'FIELD-1');
  assert.equal(r.removals.includes('hugpong_session'), false);
  assert.equal(r.device.ordinary.has('@hugpong_outbox:01000001'), true);
});

test('a complete account-owned cached snapshot is immediately usable offline even with empty field lists', async () => {
  const r = runtime();
  for (const key of ['block_farms', 'crop_cycles', 'fields', 'logs', 'prices']) r.device.ordinary.set('@hugpong_' + key, '[]');
  r.device.ordinary.set('@hugpong_cloud_refresh_meta', JSON.stringify({ ownerUserId: '01000001', refreshedAt: Date.now() }));
  await r.restore();
  assert.equal(r.context.getCloudDataStatus().hasSnapshot, true);
  assert.equal(r.context.getCloudDataStatus().phase, 'READY');
});
