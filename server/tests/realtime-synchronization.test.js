'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const express = require('express');
const { createChangeFeed, changedResources } = require('../services/changeFeed');
const { ROLES, canonicalRole, isRoleAllowedOnPlatform } = require('../schema/firestoreSchema');
const { allowedRolesForRequest } = require('../middleware/requestPermissions');
const read = file => fs.readFileSync(path.resolve(__dirname, '../..', file), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));
async function until(check) {
  for (let i = 0; i < 200; i++) { if (check()) return; await new Promise(resolve => setTimeout(resolve, 5)); }
  assert.fail('Timed out waiting for synchronization.');
}

// Test-only Firestore boundary; no credentials, production records or network DB.
function revisionDatabase() {
  const listeners = new Set();
  let revisions = {};
  let exists = false;
  const database = { failWrites: false, attaches: 0, listeners,
    collection: () => ({ doc: () => ({
      onSnapshot(next, error) {
        database.attaches++;
        const listener = { next, error };
        listeners.add(listener);
        queueMicrotask(() => { if (listeners.has(listener)) next({ exists, data: () => ({ revisions }) }); });
        return () => listeners.delete(listener);
      },
      async set(value) {
        if (database.failWrites) throw new Error('Injected database outage');
        exists = true;
        revisions = { ...revisions, ...value.revisions };
        for (const listener of listeners) listener.next({ exists, data: () => ({ revisions }) });
      }
    }) }),
    empty() { exists = false; revisions = {}; for (const listener of listeners) listener.next({ exists, data: () => ({}) }); },
    disconnect() { for (const listener of [...listeners]) listener.error(new Error('Injected listener failure')); }
  };
  return database;
}

function sink(feed) {
  const res = new EventEmitter();
  const events = [];
  Object.assign(res, { status() { return this; }, set() {}, flushHeaders() {},
    write(chunk) { events.push(JSON.parse(chunk.slice(6))); return true; },
    end() { this.emit('close'); } });
  feed.stream({ socket: { setTimeout() {} } }, res);
  return { events, close: () => res.emit('close') };
}

test('one Firestore listener per API instance fans out cross-instance revisions and empty snapshots', async t => {
  const database = revisionDatabase();
  const invalidations = [];
  const first = createChangeFeed({ database });
  const second = createChangeFeed({ database, invalidate: resources => invalidations.push(resources) });
  t.after(() => { first.stop(); second.stop(); });
  const a = sink(second), b = sink(second);
  await tick();
  assert.equal(database.attaches, 2, 'client count does not increase database listeners');
  await first.publish(['fields', 'session']);
  for (const client of [a, b]) assert.ok(client.events.some(event => event.resources?.includes('fields')));
  assert.ok(invalidations.some(resources => resources.includes('session')));
  database.empty();
  assert.ok(a.events.at(-1).resources.includes('fields'), 'empty/deleted snapshot invalidates existing replicas');
  a.close(); b.close();
});

test('a request carrying a revision unseen by its API instance invalidates stale data and authorization before routing', async t => {
  const database = revisionDatabase();
  const invalidations = [];
  const feed = createChangeFeed({ database, invalidate: resources => invalidations.push(resources) });
  t.after(() => feed.stop());
  const client = sink(feed);
  await tick();
  invalidations.length = 0;
  let routed = 0;
  feed.revalidateRequest({ headers: { 'x-hugpong-sync-revision': client.events[0].revision } }, null, () => routed++);
  assert.equal(invalidations.length, 0, 'matching revisions preserve shared caches');
  feed.revalidateRequest({ headers: { 'x-hugpong-sync-revision': 'a'.repeat(64) } }, null, () => routed++);
  assert.equal(invalidations.length, 1);
  assert.equal(invalidations[0].length, 0, 'unknown newer revision clears all scoped authorization/data replicas');
  assert.equal(routed, 2);
  client.close();
});

test('listener errors close streams and reattach; failed revision writes retry without losing later resources', async t => {
  const database = revisionDatabase();
  const feed = createChangeFeed({ database, retryMs: 5, logger: { warn() {} } });
  t.after(() => feed.stop());
  const client = sink(feed);
  await tick();
  database.disconnect();
  await until(() => database.attaches === 2);
  const client2 = sink(feed);
  database.failWrites = true;
  await assert.rejects(feed.publish(['fields']));
  await assert.rejects(feed.publish(['users']));
  database.failWrites = false;
  await until(() => client2.events.some(event => event.resources?.includes('fields') && event.resources.includes('users')));
  client.close(); client2.close();
});

test('successful mutations publish after commit; failures and token refreshes do not create change loops', async t => {
  const feed = createChangeFeed({ database: revisionDatabase() });
  t.after(() => feed.stop());
  const client = sink(feed);
  for (const [method, url, expected] of [
    ['POST', '/api/fields', true], ['PATCH', '/api/fields/FIELD-1', true],
    ['POST', '/api/fields/FIELD-1/archive', true], ['DELETE', '/api/users/USER-1', true],
    ['POST', '/api/audit-reports/AUD-1/submit', true], ['POST', '/auth/register', true],
    ['POST', '/auth/mobile-session', false], ['POST', '/api/audit-reports/qr/verify', false],
    ['POST', '/api/notifications/state/query', false], ['GET', '/api/fields', false]
  ]) assert.equal(changedResources({ method, originalUrl: url }).length > 0, expected, `${method} ${url}`);
  const response = { statusCode: 200, json(body) { this.body = body; return this; } };
  feed.mutationMiddleware({ method: 'POST', originalUrl: '/api/fields' }, response, () => {});
  response.json({ success: true, data: { id: 'FIELD-1' } });
  await until(() => response.body);
  assert.ok(client.events.some(event => event.resources?.includes('fields')));
  const count = client.events.length;
  const rejected = { statusCode: 403, json(body) { this.body = body; } };
  feed.mutationMiddleware({ method: 'PATCH', originalUrl: '/api/fields/FIELD-1' }, rejected, () => {});
  rejected.json({ success: false });
  await tick();
  assert.equal(client.events.length, count);
  client.close();
});

test('committed writes wait for durable notification before success and acknowledge automatically when persistence recovers', async t => {
  const database = revisionDatabase();
  database.failWrites = true;
  const feed = createChangeFeed({ database, retryMs: 5, logger: { warn() {} } });
  t.after(() => feed.stop());
  const response = { statusCode: 200, json(body) { this.body = body; } };
  feed.mutationMiddleware({ method: 'POST', originalUrl: '/api/logs' }, response, () => {});
  response.json({ success: true, data: { id: 'OP-COMMITTED' } });
  await tick();
  assert.equal(response.body, undefined, 'no premature success or false rejection for a committed record');
  database.failWrites = false;
  await until(() => response.body);
  assert.equal(response.body.success, true);
});

function transport() {
  const context = { AbortController, TextDecoder, setTimeout, clearTimeout, Math };
  vm.createContext(context);
  vm.runInContext(read('web/react-app/src/services/changeStream.js').replace('export function', 'function'), context);
  return context.createChangeStream;
}

test('actual HTTP streaming delivers Web/Web, Mobile/Mobile and both cross-platform directions, and resets on reconnect', async t => {
  const database = revisionDatabase();
  const feeds = [createChangeFeed({ database }), createChangeFeed({ database })];
  const app = express();
  app.get('/events/:instance', (req, res) => feeds[Number(req.params.instance)].stream(req, res));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const stops = [];
  t.after(async () => {
    stops.forEach(stop => stop()); feeds.forEach(feed => feed.stop());
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  });
  const clients = ['web', 'web', 'mobile', 'mobile'].map((platform, i) => {
    const events = [];
    stops.push(transport()({ connect: signal => fetch(`${origin}/events/${i % 2}`, { signal }), onChange: event => events.push(event), retryMs: 5 }));
    return { platform, events };
  });
  await until(() => clients.every(client => client.events.some(event => event.reset)));
  for (const resource of ['fields', 'users', 'logs', 'audit-reports']) {
    await feeds[0].publish([resource]);
    await until(() => clients.every(client => client.events.some(event => event.resources?.includes(resource))));
  }
  database.disconnect();
  await feeds[0].publish(['offline-change']);
  await until(() => clients.every(client => client.events.some(event => event.resources?.includes('offline-change'))
    || client.events.filter(event => event.reset).length >= 2));
  assert.equal(database.attaches, 4, 'two instances each restart one listener');
});

test('stream role policy preserves platform restrictions instead of expanding Member Web or Super Admin Mobile access', () => {
  const roles = allowedRolesForRequest('GET', '/api/sync/events');
  assert.deepEqual(new Set(roles), new Set(Object.values(ROLES)));
  assert.equal(isRoleAllowedOnPlatform(ROLES.MEMBER_FARMER, 'web'), false);
  assert.equal(isRoleAllowedOnPlatform(ROLES.SUPER_ADMIN, 'mobile'), false);
  for (const role of [ROLES.FARM_MANAGER, ROLES.SRA_ADMIN]) {
    assert.equal(isRoleAllowedOnPlatform(role, 'web'), true);
    assert.equal(isRoleAllowedOnPlatform(role, 'mobile'), true);
  }
});

function webRuntime(fetchImpl, overrides = {}) {
  const window = new EventTarget();
  class CustomEvent extends Event { constructor(type, options = {}) { super(type); this.detail = options.detail; } }
  const context = { window, CustomEvent, navigator: { onLine: true }, document: { visibilityState: 'visible' },
    fetch: fetchImpl, AbortController, setTimeout, clearTimeout, setInterval, clearInterval,
    crypto: require('node:crypto').webcrypto, assertWebOnline() {}, fetchOperationPages: null, ...overrides };
  vm.createContext(context);
  const source = read('web/react-app/src/services/apiClient.js')
    .replace(/^import .*;\r?\n/gm, '').replaceAll('import.meta.env.VITE_APP_VERSION', "'test'")
    .replace(/export default \{[\s\S]*?\};/, '').replace(/export /g, '');
  vm.runInContext(source, context);
  return context;
}

test('reading notification state does not recursively refresh the inbox; actual changes still refresh it', async t => {
  const calls = [];
  const runtime = webRuntime(async (url, options) => {
    calls.push({ url, options });
    if (calls.length > 8) throw new Error('notification refresh loop');
    return { ok: true, json: async () => ({ success: true, data: [{ id: 'NOTICE-1' }] }) };
  });
  const pending = [];
  const stop = runtime.subscribeToAuthenticatedResource('/api/notifications/inbox?limit=50', {
    onData: () => pending.push(runtime.authenticatedRequest('/api/notifications/state/query', {
      method: 'POST', body: { ids: ['NOTICE-1'], expectedUserId: '01000001' }
    }))
  });
  t.after(stop);
  await tick(); await tick();
  assert.equal(calls.length, 2, 'one inbox read and one state query, without feedback');
  assert.equal(JSON.parse(calls[1].options.body)._mutation, undefined);
  await runtime.authenticatedRequest('/api/notifications/state', { method: 'POST', body: { ids: ['NOTICE-1'], action: 'read' } });
  await tick(); await Promise.all(pending);
  assert.equal(calls.filter(call => call.url.includes('/inbox')).length, 2);
  assert.ok(JSON.parse(calls.find(call => call.url === '/api/notifications/state').options.body)._mutation);
});

test('notification read throttling cannot pause submissions; real write throttling still does', async () => {
  const runtime = webRuntime(async () => ({ ok: false, status: 429,
    headers: { get: () => '265' }, json: async () => ({ success: false, error: 'Too many requests.' }) }));
  let pauseEvents = 0;
  runtime.window.addEventListener('hugpong:mutation-rate-limited', () => pauseEvents++);
  await assert.rejects(runtime.authenticatedRequest('/api/notifications/state/query', { method: 'POST', body: { ids: ['N'] } }), { status: 429, retryAfterMs: 265000 });
  assert.equal(pauseEvents, 0);
  assert.equal(runtime.getMutationCooldownRemainingSeconds(), 0);
  await assert.rejects(runtime.authenticatedRequest('/api/notifications/state', { method: 'POST', body: { ids: ['N'], action: 'read' } }), { status: 429 });
  assert.equal(pauseEvents, 1);
  assert.ok(runtime.getMutationCooldownRemainingSeconds() > 0);
});

test('resource and loader subscriptions respect Retry-After even on focus, reconnect and invalidation', async () => {
  for (const useLoader of [false, true]) {
    const timers = new Map();
    let count = 0;
    const runtime = webRuntime(async () => {
      count++;
      return { ok: false, status: 429, headers: { get: () => '265' },
        json: async () => ({ success: false, error: 'Too many requests.' }) };
    }, { setTimeout: (callback, delay) => { const id = {}; timers.set(id, { callback, delay }); return id; }, clearTimeout: id => timers.delete(id) });
    const stop = useLoader
      ? runtime.subscribeToAuthenticatedLoader(({ force }) => runtime.authenticatedRead('/api/notifications/inbox', { force }), { resources: ['notifications'] })
      : runtime.subscribeToAuthenticatedResource('/api/notifications/inbox');
    try {
      await tick();
      assert.equal(count, 1);
      assert.ok([...timers.values()].some(timer => timer.delay >= 264000));
      runtime.window.dispatchEvent(new Event('focus'));
      runtime.announceConnectionRestored();
      runtime.invalidateAuthenticatedResources(['notifications']);
      await tick();
      assert.equal(count, 1, 'events cannot bypass the server retry deadline');
    } finally { stop(); }
    assert.equal(timers.size, 0);
  }
});

test('empty notification inboxes do not request account state', async () => {
  const context = { calls: 0, authenticatedRequest: () => { context.calls++; }, Promise };
  vm.createContext(context);
  vm.runInContext(read('web/react-app/src/services/notificationService.js').replace(/^import .*;\r?\n/gm, '').replace(/export /g, ''), context);
  const result = await context.fetchNotificationState('01000001', []);
  assert.equal(result.success, true);
  assert.equal(result.data.length, 0);
  assert.equal(context.calls, 0);
});

test('Web shared reads deduplicate; remote changes during loads supersede stale responses and empty results remove rows', async t => {
  let resolveOld;
  let calls = 0;
  const runtime = webRuntime(async () => {
    calls++;
    if (calls === 1) return new Promise(resolve => { resolveOld = () => resolve({ ok: true, json: async () => ({ success: true, data: [{ id: 'STALE' }] }) }); });
    return { ok: true, json: async () => ({ success: true, data: [] }) };
  });
  const seenA = [], seenB = [];
  const a = runtime.subscribeToAuthenticatedResource('/api/fields', { onData: value => seenA.push(value) });
  const b = runtime.subscribeToAuthenticatedLoader(({ force }) => runtime.authenticatedRead('/api/fields', { force }), {
    resources: ['fields'], onData: value => seenB.push(value)
  });
  t.after(() => { a(); b(); });
  assert.equal(calls, 1);
  runtime.invalidateAuthenticatedResources(['fields']);
  resolveOld();
  await until(() => seenA.length && seenB.length);
  assert.equal(calls, 2, 'one follow-up read shared across both subscription types');
  assert.equal(seenA.at(-1).data.length, 0);
  assert.equal(seenB.at(-1).data.length, 0);
  assert.equal(runtime.peekAuthenticatedRead('/api/fields').data.length, 0);
});

test('Android notification queries do not trigger refresh; business mutations still do', async () => {
  const calls = [], mutations = [];
  const context = {
    auth: { currentUser: { uid: '01000001' } }, STORAGE_KEYS: { AUTH_TOKEN: 'token' },
    getItem: async () => 'existing-token', getMobileClientInstanceId: async () => 'existing-device',
    mobileHeaders: () => ({}), parseResponse: async value => value,
    fetchFromApi: async (url, options) => { calls.push({ url, options }); return { success: true, data: [] }; },
    mutationListeners: new Set([url => mutations.push(url)])
  };
  vm.createContext(context);
  const source = read('mobile/src/services/authService.js');
  vm.runInContext(source.slice(source.indexOf('export async function authenticatedRequest('),
    source.indexOf('export async function loginWithServer(')).replace('export ', ''), context);
  await context.authenticatedRequest('/api/notifications/state/query', { method: 'POST', body: { ids: ['NOTICE-1'], expectedUserId: '01000001' } });
  assert.equal(calls.length, 1);
  assert.equal(mutations.length, 0);
  assert.equal(JSON.parse(calls[0].options.body).expectedUserId, '01000001');
  await context.authenticatedRequest('/api/prices', { method: 'POST', body: { price: 100 } });
  assert.deepEqual(mutations, ['/api/prices']);
});

test('Web logout blocks old authenticated reads and disposed subscriptions receive no further updates', async () => {
  let resolve;
  const runtime = webRuntime(() => new Promise(done => { resolve = () => done({ ok: true, json: async () => ({ success: true, data: ['PRIVATE'] }) }); }));
  let updates = 0;
  const stop = runtime.subscribeToAuthenticatedResource('/api/users', { onData: () => updates++ });
  runtime.clearAuthenticatedReadState();
  stop(); resolve(); await tick();
  assert.equal(updates, 0);
  assert.equal(runtime.peekAuthenticatedRead('/api/users'), null);
});

test('a delayed Web 401 cannot revoke the account signed in after that request started', async () => {
  let resolve;
  const runtime = webRuntime(() => new Promise(done => { resolve = () => done({ ok: false, status: 401,
    json: async () => ({ success: false, code: 'SESSION_REVOKED', error: 'Old session expired' }) }); }));
  let revoked = 0;
  runtime.window.addEventListener('hugpong:session-revoked', () => revoked++);
  const request = runtime.authenticatedRead('/api/users');
  runtime.clearAuthenticatedReadState();
  resolve();
  await assert.rejects(request, { code: 'AUTH_CONTEXT_CHANGED' });
  assert.equal(revoked, 0);
});

test('Web and Android stream parser implementations stay identical and ignore heartbeats / fragmented frames', async () => {
  assert.equal(read('mobile/src/services/changeStream.js'), read('web/react-app/src/services/changeStream.js'));
  let writer;
  const body = new ReadableStream({ start(controller) { writer = controller; } });
  const events = [];
  const stop = transport()({ connect: async () => ({ ok: true, body }), onChange: event => events.push(event) });
  const encoder = new TextEncoder();
  writer.enqueue(encoder.encode('data: {"heart'));
  writer.enqueue(encoder.encode('beat":true}\n\ndata: {"resources":["fields"]}\n\n'));
  await until(() => events.length);
  stop();
  assert.equal(events.length, 1);
  assert.equal(events[0].resources[0], 'fields');
});

function mobileRuntime(role = ROLES.MEMBER_FARMER, requestOverride) {
  let onChange, appChange, networkChange;
  let online = true;
  const requests = [];
  const owner = role === ROLES.MEMBER_FARMER ? 'MEMBER-1' : 'MANAGER-1';
  const session = { employeeId: owner, role, phoneVerified: true, fieldId: '', blockFarmId: 'FARM-1' };
  const data = {
    '/api/block-farms': [{ id: 'FARM-1', managerUserId: owner }],
    '/api/fields': [{ id: 'FIELD-1', memberUserId: owner, blockFarmId: 'FARM-1', status: 'ACTIVE', currentCycleId: 'CYCLE-1', updatedAt: 'SERVER-V1' }],
    '/api/crop-cycles': [{ id: 'CYCLE-1', fieldId: 'FIELD-1' }],
    '/api/logs': [], '/api/prices?limit=52': [], '/api/tickets': [], '/api/tickets?view=history&limit=20': [],
    '/api/users?limit=50': [], '/api/audit-reports?view=manager&limit=50': [], '/api/audit-reports?view=inbox&limit=20': [],
    '/api/audit-reports?view=history&limit=50': [], '/api/audit-events?limit=50': []
  };
  const queue = [];
  const context = { console: { warn() {} }, Date, Map, Set, Promise, setTimeout, clearTimeout,
    CURRENT_SESSION: session, IS_SYNCED: true, ROLES, canonicalRole,
    activeCloudRefresh: null, auth: { currentUser: { uid: owner } },
    getCurrentSession: () => context.CURRENT_SESSION,
    STORAGE_KEYS: new Proxy({}, { get: (_obj, key) => key }), getCachedItem: () => ({}), getItem: async () => 'TOKEN',
    saveItem: async () => true, multiSave: async () => true, removeItems: async () => true,
    getNetworkStatus: () => online, getOutboxQueue: () => queue, getOutboxCount: () => queue.length,
    getPendingSyncCount: () => queue.length, notify: () => { context.notifications++; }, notifications: 0,
    AppState: { currentState: 'active', addEventListener: (_name, callback) => { appChange = callback; return { remove() {} }; } },
    subscribeToNetwork: callback => { networkChange = callback; return () => {}; },
    subscribeToServerMutations: () => () => {}, setServerReadRevision() {},
    startRealtimeSync: callback => { onChange = callback; return () => {}; },
    normalizeSessionUser: value => value,
    cleanupDuplicateLogs: value => value, sortOperationsNewestFirst: value => value, sortNewestFirst: value => value,
    uniqueRecordsById: value => value, SUPPORT_TICKET_STATUS: { PENDING_SUBMISSION: 'PENDING_SUBMISSION' },
    sessionDistrictId: () => '', SRA_OFFLINE_SNAPSHOT_SCHEMA_VERSION: 1, sraOfflineSnapshotStorageKey: value => value,
    userDirectoryNextCursor: null, userDirectoryHasMore: false, auditEventsNextCursor: null, auditEventsHasMore: false,
    performMobileSync: async () => {},
    authenticatedRequest: async url => {
      requests.push(url);
      if (requestOverride) { const override = requestOverride(url); if (override) return override; }
      if (url === '/auth/session') return { success: true, user: { ...session } };
      return { success: true, data: structuredClone(data[url] || []), page: {} };
    },
    fetchOperationPages: request => request('/api/logs')
  };
  for (const name of ['blockFarms', 'fields', 'cropCycles', 'archivedFields', 'operationLogs', 'priceHistory', 'supportTickets', 'users', 'pendingUsers', 'auditReports', 'systemHistory', 'sraCertifiedAuditHistory']) context[name] = [];
  for (const entity of ['BlockFarm', 'Field', 'Cycle', 'OperationLog', 'Price', 'SupportTicket', 'User', 'AuditReport']) {
    context[`from${entity}Document`] = (id, value) => ({ ...value, id });
  }
  vm.createContext(context);
  vm.runInContext(read('mobile/src/domain/pendingFieldReplica.js').replace('export function', 'function'), context);
  const store = read('mobile/src/data/dataStore.js');
  const source = store.slice(store.indexOf('const responseRecords ='), store.indexOf('let activeCloudSyncStop ='))
    .replace(/export const /g, 'var ');
  vm.runInContext(source, context);
  const stop = context.listenToCloudSync();
  return { context, data, queue, requests, stop, change: event => onChange(event),
    network(value) { online = value; networkChange(value); }, app(value) { appChange(value); } };
}

for (const role of [ROLES.MEMBER_FARMER, ROLES.FARM_MANAGER, ROLES.SRA_ADMIN]) {
  test(`Android canonical store refreshes assignments, secondary lists and deletions for ${role}`, async t => {
    const device = mobileRuntime(role);
    t.after(() => device.stop());
    await device.stop.initialRefresh;
    assert.equal(device.context.fields.length, 1);
    device.data['/api/fields'] = [];
    device.data['/api/tickets'] = [{ id: 'TICKET-NEW', status: 'OPEN' }];
    device.change({ resources: ['fields', 'tickets', 'session'] });
    await until(() => device.context.fields.length === 0 && device.context.supportTickets.length === 1);
    assert.equal(device.context.CURRENT_SESSION.fieldId, '');
    assert.equal(device.queue.length, 0);
  });
}

test('Android retains offline plans and outbox conflicts while replacing cloud replicas and reads only affected resources', async t => {
  const device = mobileRuntime();
  t.after(() => device.stop());
  await device.stop.initialRefresh;
  device.queue.push({ ownerUserId: 'MEMBER-1', type: 'operation_schedule', status: 'queued',
    baseVersion: 'SERVER-V1', payload: { fieldId: 'FIELD-1', operationSchedule: [{ id: 'LOCAL-PLAN' }] } });
  device.data['/api/fields'][0].updatedAt = 'SERVER-V2';
  device.change({ resources: ['fields'] });
  await until(() => device.context.fields[0]?.operationSchedule?.length === 1);
  assert.equal(device.context.fields[0].operationSchedule[0].id, 'LOCAL-PLAN');
  assert.equal(device.context.fields[0].updatedAt, 'SERVER-V2');
  assert.equal(device.queue[0].baseVersion, 'SERVER-V1', 'version conflict remains for server review');
  const before = device.requests.length;
  device.change({ resources: ['prices'] });
  await until(() => device.requests.length > before);
  assert.deepEqual(device.requests.slice(before), ['/api/prices?limit=52']);
  device.network(false);
  assert.equal(device.context.fields[0].operationSchedule[0].id, 'LOCAL-PLAN');
  assert.equal(device.queue.length, 1);
  device.network(true);
  device.change({ reset: true });
  await until(() => device.requests.length > before + 2);
  assert.equal(device.queue.length, 1);
});

test('Android queues a change received during an in-flight read and prevents old-account responses from committing', async t => {
  let resolveFields;
  let first = true;
  const device = mobileRuntime(ROLES.MEMBER_FARMER, url => {
    if (url === '/api/fields' && first) {
      first = false;
      return new Promise(resolve => { resolveFields = resolve; });
    }
  });
  t.after(() => device.stop());
  await until(() => resolveFields);
  device.change({ resources: ['fields'] });
  resolveFields({ success: true, data: [{ id: 'OBSOLETE', status: 'ACTIVE' }] });
  await device.stop.initialRefresh;
  await until(() => device.context.fields[0]?.id === 'FIELD-1');
  assert.ok(device.requests.filter(url => url === '/api/fields').length >= 2);
  const count = device.context.notifications;
  device.context.CURRENT_SESSION = { employeeId: 'OTHER-ACCOUNT', role: ROLES.MEMBER_FARMER, phoneVerified: true };
  await device.context.activeCloudRefresh({ force: true });
  assert.equal(device.context.notifications, count);
});

test('Android discards a delayed response after account switching or listener disposal', async t => {
  let resolveFields;
  const device = mobileRuntime(ROLES.MEMBER_FARMER, url => url === '/api/fields'
    ? new Promise(resolve => { resolveFields = resolve; }) : null);
  t.after(() => device.stop());
  await until(() => resolveFields);
  device.context.CURRENT_SESSION = { employeeId: 'OTHER-ACCOUNT', role: ROLES.MEMBER_FARMER, phoneVerified: true };
  resolveFields({ success: true, data: [{ id: 'PRIVATE-OLD-ACCOUNT' }] });
  await device.stop.initialRefresh;
  assert.equal(device.context.fields.length, 0);
  assert.equal(device.context.notifications, 0);
});

test('Android preserves pending intent privately when assignment removal revokes its canonical field and audit scope', async t => {
  const device = mobileRuntime(ROLES.FARM_MANAGER);
  t.after(() => device.stop());
  await device.stop.initialRefresh;
  device.queue.push({ type: 'operation_log', status: 'queued', payload: { id: 'LOCAL-OP', fieldId: 'FIELD-1', cycleId: 'CYCLE-1' } },
    { type: 'audit_report', status: 'queued', payload: { id: 'LOCAL-AUDIT' } });
  device.context.auditReports.push({ id: 'LOCAL-AUDIT', blockFarmId: 'FARM-1' });
  device.data['/api/fields'] = [];
  device.data['/api/block-farms'] = [];
  device.change({ reset: true });
  await until(() => device.context.fields.length === 0);
  assert.equal(device.context.operationLogs.length, 0);
  assert.equal(device.context.auditReports.length, 0);
  assert.equal(device.queue.length, 2, 'revocation never deletes saved pending work');
});

test('stream authorization rejection stops retries and preserves existing replicas', async () => {
  let calls = 0;
  let rejected = 0;
  const stop = transport()({
    connect: async () => { calls++; return { status: 401 }; },
    onChange: () => assert.fail('Unauthorized stream cannot publish'),
    onUnauthorized: () => { rejected++; }, retryMs: 1
  });
  await until(() => rejected);
  await tick(); stop();
  assert.equal(calls, 1);
});
