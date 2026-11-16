'use strict';

process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-only-session-secret-that-is-longer-than-32-characters';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createScopedReadCache } = require('../services/scopedReadCache');

function source(relativePath) {
  return fs.readFileSync(path.resolve(__dirname, relativePath), 'utf8');
}

function response() {
  return {
    statusCode: 200,
    headers: {},
    payload: undefined,
    set(name, value) {
      this.headers[name] = value;
      return this;
    },
    status(value) {
      this.statusCode = value;
      return this;
    },
    json(value) {
      this.payload = value;
      return this;
    }
  };
}

function request(employeeId, url = '/api/fields') {
  return {
    method: 'GET',
    originalUrl: url,
    headers: { 'x-client-platform': 'mobile' },
    authUser: { employeeId, canonicalRole: 'FARM_MANAGER' }
  };
}

function webRequest(employeeId, url = '/api/fields') {
  const value = request(employeeId, url);
  value.headers['x-client-platform'] = 'web';
  value.authUser.platform = 'web';
  return value;
}

test('scoped read cache reuses successful reads only within the authenticated actor scope', () => {
  const cache = createScopedReadCache({ ttlMs: 60_000, maxEntries: 10 });
  const first = response();
  let firstContinued = false;
  cache.middleware(request('FM-001'), first, () => { firstContinued = true; });
  assert.equal(firstContinued, true);
  first.json({ success: true, data: [{ id: 'FIELD-001' }] });
  assert.equal(first.headers['X-HUGPONG-Read-Cache'], 'MISS');

  const hit = response();
  let hitContinued = false;
  cache.middleware(request('FM-001'), hit, () => { hitContinued = true; });
  assert.equal(hitContinued, false);
  assert.equal(hit.headers['X-HUGPONG-Read-Cache'], 'HIT');
  assert.deepEqual(hit.payload, { success: true, data: [{ id: 'FIELD-001' }] });

  const sameActorOtherClient = response();
  let otherClientContinued = false;
  cache.middleware(webRequest('FM-001'), sameActorOtherClient, () => { otherClientContinued = true; });
  assert.equal(otherClientContinued, false, 'web and mobile may share the same authorized representation');
  assert.equal(sameActorOtherClient.headers['X-HUGPONG-Read-Cache'], 'HIT');

  const otherActor = response();
  let otherActorContinued = false;
  cache.middleware(request('FM-002'), otherActor, () => { otherActorContinued = true; });
  assert.equal(otherActorContinued, true);

  cache.invalidate();
  const afterMutation = response();
  let afterMutationContinued = false;
  cache.middleware(request('FM-001'), afterMutation, () => { afterMutationContinued = true; });
  assert.equal(afterMutationContinued, true);
});

test('cache invalidation prevents an older in-flight read from restoring stale data', () => {
  const cache = createScopedReadCache({ ttlMs: 60_000, maxEntries: 10 });
  const stale = response();
  cache.middleware(request('FM-001'), stale, () => {});
  cache.invalidate();
  stale.json({ success: true, data: [{ id: 'STALE' }] });

  const fresh = response();
  let continued = false;
  cache.middleware(request('FM-001'), fresh, () => { continued = true; });
  assert.equal(continued, true);
  assert.equal(fresh.headers['X-HUGPONG-Read-Cache'], undefined);
});

test('server cache is mounted after live API authorization and cleared by successful mutations', () => {
  const server = source('../server.js');
  const authorization = "app.use('/api', requireAuth, createAuthenticatedApiRateLimit(), requireAccountReady, requireApiPermission);";
  assert.ok(server.indexOf(authorization) < server.indexOf("app.use('/api', scopedReadCache.middleware);"));
  assert.match(server, /scopedReadCache\.invalidate\(resources\)/);
  assert.doesNotMatch(server, /scopedReadCache\.invalidate\(\)/);
  assert.match(server, /app\.use\(changeFeed\.mutationMiddleware\)/);
});

test('concurrent authorized reads share one handler and unrelated mutations preserve it', async () => {
  const cache = createScopedReadCache(); let queries = 0;
  const first = response(), second = response();
  cache.middleware(request('FM-1'), first, () => queries++);
  const waiting = cache.middleware(webRequest('FM-1'), second, () => queries++);
  cache.invalidate(['prices']);
  first.json({ success: true, data: ['FIELD-1'] });
  await waiting;
  assert.equal(queries, 1);
  assert.deepEqual(second.payload, first.payload);
  assert.equal(second.headers['X-HUGPONG-Read-Cache'], 'HIT');
});

test('five-account navigation burst runs one scoped query per owner', async () => {
  const cache = createScopedReadCache(); let queries = 0, documents = 0;
  const responses = [], work = [];
  for (let owner = 1; owner <= 5; owner++) for (let repeat = 0; repeat < 20; repeat++) {
    const res = response(); responses.push({ owner, res });
    work.push(cache.middleware(request(`OWNER-${owner}`), res, async () => {
      queries++; documents += 50;
      await Promise.resolve(); res.json({ success: true, owner });
    }));
  }
  await Promise.all(work);
  assert.equal(queries, 5); assert.equal(documents, 250, '100 duplicate handler queries would otherwise read 5,000 fixture documents');
  assert.ok(responses.every(({ owner, res }) => res.payload.owner === owner));
});

test('operation and ticket presentation reuse persisted names while still resolving legacy rows', async () => {
  const { memoryFirestore } = require('./helpers/memoryFirestore');
  const { listOperationRecords } = require('../services/operationQueryService');
  const { ROLES, canonicalRole } = require('../schema/firestoreSchema');
  const counts = [], database = memoryFirestore({
    'operation_logs/LOG-1': { id: 'LOG-1', amendments: [{ amendedByUserId: 'USER-1', amendedByName: 'Recorded name', amendedByRole: 'FARM_MANAGER' }] },
    'users/USER-1': { displayName: 'Current name', role: 'FARM_MANAGER' }
  }, { readCounts: counts });
  await listOperationRecords(database, { role: ROLES.SRA_ADMIN });
  assert.equal(counts.filter(read => read.collection === 'users').length, 0);
  database.records.get('operation_logs/LOG-1').amendments[0].amendedByName = '';
  const operations = await listOperationRecords(database, { role: ROLES.SRA_ADMIN });
  assert.equal(operations[0].amendments[0].amendedByName, 'Current name');
  assert.equal(counts.filter(read => read.collection === 'users').length, 1);
  counts.length = 0;
  const code = source('../routes/tickets.js');
  const present = new Function('db', 'COLLECTIONS', 'canonicalRole',
    code.slice(code.indexOf('async function presentTickets'), code.indexOf('function assertCanRead')) + ';return presentTickets;')(
    database, { USERS: 'users' }, canonicalRole);
  const tickets = await present([
    { id: 'NEW', createdByUserId: 'USER-1', requesterName: 'Recorded name', requesterRole: 'FARM_MANAGER' },
    { id: 'LEGACY', createdByUserId: 'USER-1' }
  ]);
  assert.equal(tickets[0].requesterName, 'Recorded name'); assert.equal(tickets[1].requesterName, 'Current name');
  assert.equal(counts.filter(read => read.collection === 'users').length, 1);
});

test('affected mutations release waiting reads without publishing the older response', async () => {
  const cache = createScopedReadCache(); let queries = 0;
  const old = response(), waitingResponse = response();
  cache.middleware(request('FM-1'), old, () => queries++);
  const waiting = cache.middleware(request('FM-1'), waitingResponse, () => {
    queries++; waitingResponse.json({ success: true, data: ['NEW'] });
  });
  cache.invalidate(['fields']); await waiting;
  old.json({ success: true, data: ['OLD'] });
  const fresh = response(); cache.middleware(request('FM-1'), fresh, () => assert.fail('fresh result should be cached'));
  assert.equal(queries, 2); assert.deepEqual(fresh.payload.data, ['NEW']);
});

test('failed and aborted coalesced reads release waiters; account scopes never share a pending read', async () => {
  const { EventEmitter } = require('node:events');
  for (const abort of [false, true]) {
    const cache = createScopedReadCache(); let queries = 0;
    const first = Object.assign(new EventEmitter(), response()), second = response();
    cache.middleware(request('FM-1'), first, () => queries++);
    const waiting = cache.middleware(request('FM-1'), second, () => { queries++; second.json({ success: true, data: ['RECOVERED'] }); });
    if (abort) first.emit('close'); else first.status(503).json({ success: false });
    await waiting; assert.equal(queries, 2); assert.deepEqual(second.payload.data, ['RECOVERED']);
    const changed = request('FM-1'); changed.authUser.blockFarmId = 'OTHER-FARM';
    const scoped = response(); cache.middleware(changed, scoped, () => { queries++; scoped.json({ success: true }); });
    assert.equal(queries, 3);
  }
});

test('farm area summaries read only returned farms, including complete allocations across query chunks', async () => {
  const rows = Array.from({ length: 1000 }, (_, id) => ({ id: `FOREIGN-${id}`, blockFarmId: 'FOREIGN', areaHa: 4, status: 'ACTIVE' }));
  const farms = Array.from({ length: 23 }, (_, id) => ({ id: `FARM-${id}`, declaredAreaHa: 20 }));
  rows.push(...farms.flatMap(farm => [
    { id: `${farm.id}-A`, blockFarmId: farm.id, areaHa: 2, status: 'ACTIVE' },
    { id: `${farm.id}-B`, blockFarmId: farm.id, areaHa: 3, status: 'ACTIVE' },
    { id: `${farm.id}-OLD`, blockFarmId: farm.id, areaHa: 50, status: 'ARCHIVED' }
  ]));
  let reads = 0, queries = 0;
  const database = { collection: name => {
    assert.equal(name, 'fields'); return { where(field, op, ids) {
      assert.equal(field, 'blockFarmId'); assert.equal(op, 'in'); assert.ok(ids.length <= 10);
      return { async get() { const selected = rows.filter(row => ids.includes(row.blockFarmId));
        queries++; reads += Math.max(1, selected.length); return { docs: selected.map(row => ({ id: row.id, data: () => row })) }; } };
    } };
  } };
  const code = source('../routes/blockFarms.js');
  const helper = new Function('db', 'COLLECTIONS', 'attachBlockFarmAreaSummaries',
    code.slice(code.indexOf('async function withAuthoritativeAreas'), code.indexOf("router.get('/'")) + ';return withAuthoritativeAreas;')(
    database, { FIELDS: 'fields' }, require('../domain/landArea').attachBlockFarmAreaSummaries);
  const result = await helper(farms);
  assert.equal(queries, 3); assert.equal(reads, 69, '1,000 unrelated fields incur no result reads');
  assert.ok(result.every(farm => farm.allocatedAreaHa === 5 && farm.remainingAreaHa === 15));
  await helper([]); assert.equal(queries, 3, 'empty scope issues no query');
});

test('mobile uses tiered quota-aware refreshes without clearing skipped secondary data', () => {
  const mobile = source('../../mobile/src/data/dataStore.js');
  assert.match(mobile, /startRealtimeSync\(scheduleRefresh/);
  assert.doesNotMatch(mobile, /setInterval\(refresh/);
  assert.match(mobile, /CLOUD_EXTENDED_REFRESH_INTERVAL_MS = 4 \* 60 \* 60 \* 1000/);
  assert.match(mobile, /getCachedItem\(STORAGE_KEYS\.CLOUD_REFRESH_META/);
  assert.match(mobile, /saveItem\(STORAGE_KEYS\.CLOUD_REFRESH_META/);
  assert.match(mobile, /includeExtended \? readReplica\('\/api\/tickets'\) : Promise\.resolve\(null\)/);
  assert.match(mobile, /includeExtended && canReadUserDirectory \? readReplica\('\/api\/users\?limit=50'\)/);
  assert.match(mobile, /if \(ticketsReady\) \{[\s\S]{0,100}supportTickets\.length = 0/);
  assert.match(mobile, /if \(historyReady\) \{[\s\S]{0,100}systemHistory\.length = 0/);
  assert.match(mobile, /readReplica\('\/api\/prices\?limit=52'\)/);
});

test('price reads are bounded on the server and explicit on both clients', () => {
  const pricesRoute = source('../routes/prices.js');
  const webPrices = source('../../web/react-app/src/services/pricesService.js');
  const mobile = source('../../mobile/src/data/dataStore.js');
  assert.match(pricesRoute, /DEFAULT_PRICE_HISTORY_LIMIT = 52/);
  assert.match(pricesRoute, /query\.limit\(requestedLimit \+ 1\)/);
  assert.match(pricesRoute, /pageEnvelope\(snapshot.docs, requestedLimit/);
  assert.match(webPrices, /subscribeToAuthenticatedResource\('\/api\/prices\?limit=52'/);
  assert.match(webPrices, /fetchPrices\(\{ cursor, limit = 100 \}/);
  assert.match(mobile, /readReplica\('\/api\/prices\?limit=52'\)/);
});

test('Web avoids a duplicate review subscription except for the paginated Super Admin directory', () => {
  const code = source('../../web/react-app/src/services/usersService.js').replace(/^import .*;\r?\n/gm, '').replace(/export /g, '');
  for (const role of ['FARM_MANAGER', 'SRA_ADMIN', 'SUPER_ADMIN']) {
    const subscriptions = [], updates = []; let disposed = 0;
    const subscribeToUsersData = new Function('fromUser', 'authenticatedRequest', 'subscribeToAuthenticatedResource',
      code + ';return subscribeToUsersData;')((_id, row) => row, async () => ({}), (url, handlers) => {
      subscriptions.push({ url, handlers }); return () => { disposed++; };
    });
    const stop = subscribeToUsersData({ user: { canonicalRole: role }, onUpdate: value => updates.push(value) });
    assert.equal(subscriptions.length, role === 'SUPER_ADMIN' ? 2 : 1);
    const pending = { id: '04000077', status: 'PENDING', reviewQueueEligible: true };
    subscriptions[0].handlers.onData({ data: role === 'SUPER_ADMIN' ? [] : [pending], page: {} });
    if (role === 'SUPER_ADMIN') subscriptions[1].handlers.onData({ data: [pending] });
    assert.deepEqual(updates.at(-1).pendingUsers.map(user => user.id), ['04000077']);
    stop(); assert.equal(disposed, subscriptions.length);
  }
});
