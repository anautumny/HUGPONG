'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const { memoryFirestore } = require('./helpers/memoryFirestore');
const { publishSraPrice } = require('../services/priceService');
const { notificationInbox } = require('../services/systemNotificationService');
const { COLLECTIONS, ROLES } = require('../schema/firestoreSchema');
const read = file => fs.readFileSync(path.resolve(__dirname, '../..', file), 'utf8');
const plain = source => source.replace(/^import[\s\S]*?;\r?$/gm, '').replace(/^export \{[^}]*\};?\r?$/gm, '').replace(/\bexport (?=(?:async )?(?:function|const|let))/g, '');
const tick = () => new Promise(resolve => setImmediate(resolve));
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }
const input = { effectiveDate: '2026-11-14', weekLabel: 'Week 2 November', sugarPricePerLkg: 2500,
  molassesPricePerMetricTon: 8000, circularNumber: 'LOCAL-REGRESSION', source: 'Isolated test fixture' };

function authRuntime() {
  const token = new Map([['AUTH_TOKEN', 'token-A'], ['CLIENT_INSTANCE_ID', 'LOCAL-DEVICE']]);
  const requests = [];
  const context = {
    console, setTimeout, clearTimeout, AbortController,
    auth: { currentUser: { uid: 'A', getIdToken: async () => 'firebase-A' } },
    signInWithCustomToken: async (auth, custom) => { auth.currentUser = { uid: custom.slice(9), getIdToken: async () => custom }; },
    signOut: async auth => { auth.currentUser = null; },
    STORAGE_KEYS: { AUTH_TOKEN: 'AUTH_TOKEN', SESSION: 'SESSION', CLIENT_INSTANCE_ID: 'CLIENT_INSTANCE_ID' },
    getItem: async key => token.get(key), saveItem: async (key, value) => { token.set(key, value); return true; },
    removeItem: async key => token.delete(key), removeItems: async keys => keys.forEach(key => token.delete(key)),
    Constants: { expoConfig: { version: 'local-test' } }, Platform: { OS: 'android', Version: 'test', constants: {} },
    API_REQUEST_TIMEOUT_MS: 10000, API_STARTUP_TIMEOUT_MS: 75000, API_BASE_URL: 'https://local.test', getApiBaseUrl: () => 'https://local.test',
    friendlyErrorMessage: (_code, text) => text, logApiDiagnostic() {}, createClientRecordId: () => 'LOCAL-ID',
    fetch: async (url, options) => {
      const pending = deferred(); requests.push({ url, options, pending }); return pending.promise;
    }
  };
  vm.createContext(context); vm.runInContext(plain(read('mobile/src/services/authService.js')), context);
  const respond = (request, body, status = 200) => request.pending.resolve({ ok: status < 400, status, headers: { get: () => null }, json: async () => body });
  return { context, requests, token, respond };
}

test('a delayed Mobile Firebase refresh cannot replace a later login, including login to the same account', async () => {
  for (const owner of ['B', 'A']) {
    const runtime = authRuntime(), { context, requests, respond } = runtime;
    const old = context.refreshMobileSessionFromFirebase();
    const rejected = assert.rejects(old, { code: 'AUTH_CONTEXT_CHANGED' });
    await tick();
    const login = context.loginWithServer(owner, 'local-password', true); await tick();
    respond(requests[1], { success: true, token: `new-${owner}`, firebaseCustomToken: `firebase-${owner}`, user: { employeeId: owner } });
    await login;
    respond(requests[0], { success: true, token: 'stale-A', user: { employeeId: 'A' } });
    await rejected;
    assert.equal(runtime.token.get('AUTH_TOKEN'), `new-${owner}`);
    assert.equal(context.auth.currentUser.uid, owner);
  }
});

test('delayed Mobile session refresh and 401 responses cannot sign out a new account', async () => {
  for (const status of [200, 401]) {
    const runtime = authRuntime(), { context, requests, respond } = runtime;
    const old = context.refreshServerSession('token-A');
    const rejected = assert.rejects(old); await tick();
    const login = context.loginWithServer('B', 'local-password', true); await tick();
    respond(requests[1], { success: true, token: 'token-B', firebaseCustomToken: 'firebase-B' }); await login;
    respond(requests[0], status === 200 ? { success: true, token: 'stale-A', firebaseCustomToken: 'firebase-A' } : { success: false, error: 'Expired' }, status);
    await rejected;
    assert.equal(runtime.token.get('AUTH_TOKEN'), 'token-B'); assert.equal(context.auth.currentUser.uid, 'B');
  }
});

test('same-account refresh still saves a valid token; a current 401 still revokes credentials', async () => {
  const runtime = authRuntime(), { context, requests, respond } = runtime;
  const refresh = context.refreshServerSession('token-A'); await tick();
  respond(requests[0], { success: true, token: 'fresh-A', firebaseCustomToken: 'firebase-A' }); await refresh;
  assert.equal(runtime.token.get('AUTH_TOKEN'), 'fresh-A');
  const expired = context.authenticatedRequest('/api/fields'); const rejected = assert.rejects(expired, { status: 401 }); await tick();
  respond(requests[1], { success: false, error: 'Revoked' }, 401); await rejected;
  assert.equal(runtime.token.has('AUTH_TOKEN'), false); assert.equal(context.auth.currentUser, null);
});

test('clearing Mobile cache preserves both accounts drafts, outboxes, uncertain intents and secure credentials', async () => {
  const ordinary = new Map(), secure = new Map();
  const context = { console, setTimeout, clearTimeout,
    AsyncStorage: { getAllKeys: async () => [...ordinary.keys()], getItem: async key => ordinary.get(key) ?? null,
      setItem: async (key, value) => ordinary.set(key, value), removeItem: async key => ordinary.delete(key), multiRemove: async keys => keys.forEach(key => ordinary.delete(key)) },
    SecureStore: { AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 'local', setItemAsync: async (key, value) => secure.set(key, value),
      getItemAsync: async key => secure.get(key) ?? null, deleteItemAsync: async key => secure.delete(key) }
  };
  vm.createContext(context); vm.runInContext(plain(read('mobile/src/services/storageService.js')), context);
  const preserved = ['@hugpong_drafts:A', '@hugpong_drafts:B', '@hugpong_outbox:A', '@hugpong_outbox:B', '@hugpong_enrollment_prices_B_pending', '@hugpong_pending_audit_reference', '@hugpong_future_pending_key'];
  for (const key of preserved) await context.saveItem(key, [{ id: key }]);
  await context.saveItem('@hugpong_auth_token', 'saved-token'); await context.saveItem('@hugpong_session', { employeeId: 'A' });
  await context.saveItem('@hugpong_fields', [{ id: 'replaceable' }]);
  const before = new Map([...ordinary, ...secure]);
  assert.equal(await context.clearHugpongStorage(), true);
  assert.equal(ordinary.has('@hugpong_fields'), false);
  for (const key of preserved) assert.equal(ordinary.get(key), before.get(key));
  assert.equal(await context.getItem('@hugpong_auth_token'), 'saved-token');
  assert.equal((await context.getItem('@hugpong_session')).employeeId, 'A');
  const store = read('mobile/src/data/dataStore.js');
  const reset = store.slice(store.indexOf('export const resetLocalCache'), store.indexOf('//', store.indexOf('export const resetLocalCache'))).replace('export const ', 'var ');
  vm.runInContext(reset, Object.assign(context, { CURRENT_SESSION: { employeeId: 'A' }, getPendingSyncCount: () => 2, notify() {}, IS_SYNCED: true }));
  await context.resetLocalCache(); assert.equal(context.IS_SYNCED, false);
});

test('server price receipts replay one publication despite a regenerated record ID, and reject changed payloads', async () => {
  const db = memoryFirestore();
  const context = { publishedByUserId: 'SRA-A', mutation: { idempotencyKey: 'MUT-PRICE-TEST' } };
  const first = await publishSraPrice(db, { ...input, id: 'PRICE-A' }, context);
  const replay = await publishSraPrice(db, { ...input, id: 'PRICE-B' }, context);
  assert.equal(replay.data.id, first.data.id); assert.equal(replay.created, false);
  for (const collection of [COLLECTIONS.SRA_PRICES, COLLECTIONS.AUDIT_LOGS, COLLECTIONS.NOTIFICATION_EVENTS, COLLECTIONS.MUTATION_RECEIPTS]) {
    assert.equal([...db.records.keys()].filter(key => key.startsWith(`${collection}/`)).length, 1, collection);
  }
  await assert.rejects(publishSraPrice(db, { ...input, sugarPricePerLkg: 2600 }, context), { status: 409 });
  const other = await publishSraPrice(db, input, { ...context, publishedByUserId: 'SRA-B' });
  assert.equal(other.created, true, 'receipt identity is actor scoped');
});

test('Web and Mobile uncertain price retries retain a durable intent across a fresh runtime', async () => {
  for (const platform of ['web', 'mobile']) {
    const values = new Map(), db = memoryFirestore(); let ids = 0, loseReply = true;
    const build = () => {
      const context = { console, crypto: webcrypto, TextEncoder, CURRENT_SESSION: { employeeId: 'SRA-A' }, priceHistory: [],
        captureAuthenticatedContext: () => () => true,
        localStorage: { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) },
        getItem: async key => values.get(key), saveItem: async (key, value) => { values.set(key, value); return true; },
        removeItem: async key => values.delete(key), removeItems: async keys => keys.forEach(key => values.delete(key)),
        createClientRecordId: () => `MUT-LOCAL-PRICE-${++ids}`, createMutationContext: () => ({ mutationId: `WEB-PRICE-${++ids}`, idempotencyKey: `WEB-PRICE-${ids}`, entityKey: 'prices/new', baseVersion: null }),
        fromPriceDocument: (id, row) => ({ ...row, id }), persistCurrentPrices: async () => {}, notify() {},
        authenticatedRequest: async (_url, options) => {
          const result = await publishSraPrice(db, options.body, { publishedByUserId: 'SRA-A', mutation: options.body._mutation });
          if (loseReply) { loseReply = false; throw new Error('Lost successful response'); }
          return { success: true, ...result };
        }
      };
      context.commitExplicitMutation = async (_type, payload, options) => ({ response: await context.authenticatedRequest('/api/prices', { body: { ...payload, _mutation: options.mutation } }) });
      vm.createContext(context);
      vm.runInContext(plain(read(platform === 'web' ? 'web/react-app/src/services/enrollmentIntentService.js' : 'mobile/src/services/enrollmentIntentService.js')), context);
      const source = read(platform === 'web' ? 'web/react-app/src/services/pricesService.js' : 'mobile/src/data/dataStore.js');
      const start = source.indexOf(platform === 'web' ? 'export async function publishPrice' : 'export const publishSraPrice =');
      const end = platform === 'web' ? source.length : source.indexOf('export const setSynced', start);
      vm.runInContext(plain(source.slice(start, end)).replace('const publishSraPrice =', 'var publishSraPrice ='), context);
      return context;
    };
    let runtime = build();
    const publish = runtime => platform === 'web' ? runtime.publishPrice(input, { ownerId: 'SRA-A' }) : runtime.publishSraPrice(input);
    await assert.rejects(publish(runtime), /Lost successful response/);
    assert.equal(values.size, 1, platform);
    runtime = build(); await publish(runtime);
    assert.equal(values.size, 0); assert.equal(ids, 1, 'retry reuses saved identity');
    for (const collection of ['sra_prices', 'audit_logs', 'notification_events']) assert.equal([...db.records.keys()].filter(key => key.startsWith(`${collection}/`)).length, 1, `${platform} ${collection}`);
  }
});

test('notification inbox batches reviewer lookups and members perform no target-account reads', async () => {
  const seed = {};
  for (let index = 0; index < 50; index++) {
    seed[`notification_events/EVENT-${index}`] = { type: 'verification-request', entityId: `MEMBER-${index}`, createdAt: new Date().toISOString(), expiresAtMs: Date.now() + 10000 };
    seed[`users/MEMBER-${index}`] = { role: ROLES.MEMBER_FARMER, status: 'ACTIVE', requestedBlockFarmId: 'FARM-1' };
  }
  seed['block_farms/FARM-1'] = { managerUserId: 'FM-1' };
  const db = memoryFirestore(seed); let batches = 0, singles = 0;
  const getAll = db.getAll.bind(db), collection = db.collection.bind(db);
  db.getAll = async (...refs) => { batches++; return getAll(...refs); };
  db.collection = name => {
    const query = collection(name), doc = query.doc.bind(query);
    query.doc = id => { const ref = doc(id), get = ref.get; ref.get = async () => { singles++; return get(); }; return ref; }; return query;
  };
  const member = await notificationInbox(db, { employeeId: 'MEMBER-X', role: ROLES.MEMBER_FARMER, status: 'ACTIVE' });
  assert.equal(member.data.length, 0); assert.equal(batches, 0); assert.equal(singles, 0);
  const manager = await notificationInbox(db, { employeeId: 'FM-1', role: ROLES.FARM_MANAGER, status: 'ACTIVE' });
  assert.equal(manager.data.length, 50); assert.equal(batches, 2); assert.equal(singles, 0);
});
