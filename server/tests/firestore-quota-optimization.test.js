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
  assert.match(server, /scopedReadCache\.invalidate\(\[resource\]\)/);
  assert.match(server, /else \{[\s\S]{0,80}scopedReadCache\.invalidate\(\)/);
  assert.match(server, /invalidateAccountAssignments\(db\);[\s\S]{0,100}scopedReadCache\.invalidate\(\)/);
});

test('mobile uses tiered quota-aware refreshes without clearing skipped secondary data', () => {
  const mobile = source('../../mobile/src/data/dataStore.js');
  assert.match(mobile, /CLOUD_REFRESH_INTERVAL_MS = 60 \* 60 \* 1000/);
  assert.match(mobile, /CLOUD_EXTENDED_REFRESH_INTERVAL_MS = 4 \* 60 \* 60 \* 1000/);
  assert.match(mobile, /getCachedItem\(STORAGE_KEYS\.CLOUD_REFRESH_META/);
  assert.match(mobile, /saveItem\(STORAGE_KEYS\.CLOUD_REFRESH_META/);
  assert.match(mobile, /includeExtended \? authenticatedRequest\('\/api\/tickets'\) : Promise\.resolve\(null\)/);
  assert.match(mobile, /includeExtended && canReadUserDirectory \? authenticatedRequest\('\/api\/users\?limit=50'\)/);
  assert.match(mobile, /if \(includeExtended\) \{[\s\S]{0,100}supportTickets\.length = 0/);
  assert.match(mobile, /if \(includeExtended && canReadAuditEvents\) \{[\s\S]{0,100}systemHistory\.length = 0/);
  assert.match(mobile, /authenticatedRequest\('\/api\/prices\?limit=52'\)/);
});

test('price reads are bounded on the server and explicit on both clients', () => {
  const pricesRoute = source('../routes/prices.js');
  const webPrices = source('../../web/react-app/src/services/pricesService.js');
  const mobile = source('../../mobile/src/data/dataStore.js');
  assert.match(pricesRoute, /DEFAULT_PRICE_HISTORY_LIMIT = 52/);
  assert.match(pricesRoute, /orderBy\('effectiveDate', 'desc'\)[\s\S]{0,80}\.limit\(requestedLimit\)/);
  assert.match(webPrices, /subscribeToAuthenticatedResource\('\/api\/prices\?limit=52'/);
  assert.match(webPrices, /authenticatedRequest\('\/api\/prices\?limit=100'\)/);
  assert.match(mobile, /authenticatedRequest\('\/api\/prices\?limit=52'\)/);
});
