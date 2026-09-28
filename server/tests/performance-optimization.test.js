'use strict';

process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-only-session-secret-that-is-longer-than-32-characters';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const FirestoreSessionStore = require('../services/firestoreSessionStore');

function source(relativePath) {
  return fs.readFileSync(path.resolve(__dirname, relativePath), 'utf8');
}

test('parallel API requests share one in-flight Firestore session read', async () => {
  let getCount = 0;
  const future = Date.now() + 60_000;
  const document = {
    async get() {
      getCount += 1;
      await Promise.resolve();
      return {
        exists: true,
        data: () => ({
          session: { cookie: {}, user: { employeeId: '03000001' } },
          expiresAtMs: future,
          updatedAt: new Date().toISOString()
        }),
        ref: { delete: async () => {} }
      };
    },
    async set() {},
    async delete() {}
  };
  const store = new FirestoreSessionStore({
    collection: () => ({ doc: () => document })
  });
  const read = () => new Promise((resolve, reject) => store.get('same-session', (error, value) => (
    error ? reject(error) : resolve(value)
  )));

  const sessions = await Promise.all([read(), read(), read(), read(), read()]);

  assert.equal(getCount, 1);
  assert.equal(sessions.length, 5);
  assert.notEqual(sessions[0], sessions[1]);
});

test('session touches are coalesced while explicit session saves remain durable', async () => {
  let setCount = 0;
  const document = {
    async set() { setCount += 1; },
    async delete() {}
  };
  const store = new FirestoreSessionStore({
    collection: () => ({ doc: () => document })
  }, { touchIntervalMs: 60_000 });
  const session = { cookie: { expires: new Date(Date.now() + 60_000) }, user: { employeeId: '03000001' } };
  const save = () => new Promise((resolve, reject) => store.set('session', session, error => error ? reject(error) : resolve()));
  const touch = () => new Promise((resolve, reject) => store.touch('session', session, error => error ? reject(error) : resolve()));

  await save();
  await Promise.all([touch(), touch(), touch()]);

  assert.equal(setCount, 1);
});

test('Firestore-heavy background work is bounded and coalesced across clients and server', () => {
  const webApi = source('../../web/react-app/src/services/apiClient.js');
  const dashboard = source('../../web/react-app/src/services/dashboardService.js');
  const mobileStore = source('../../mobile/src/data/dataStore.js');
  const mobileStorage = source('../../mobile/src/services/storageService.js');
  const mobileTelemetry = source('../../mobile/src/services/telemetryService.js');
  const diagnostics = source('../routes/systemDiagnostics.js');
  const prices = source('../routes/prices.js');
  const auth = source('../middleware/auth.js');
  const serverTelemetry = source('../services/telemetryService.js');
  const server = source('../server.js');
  const syncContext = source('../../web/react-app/src/context/SyncContext.jsx');

  assert.match(webApi, /READ_CACHE_TTL_MS = 60 \* 1000/);
  assert.match(webApi, /DEFAULT_REFRESH_INTERVAL_MS = 5 \* 60 \* 1000/);
  assert.match(dashboard, /\/api\/prices\?limit=2/);
  assert.match(mobileStore, /CLOUD_REFRESH_INTERVAL_MS = 5 \* 60 \* 1000/);
  assert.match(mobileStore, /CLOUD_REFRESH_FRESHNESS_MS = 2 \* 60 \* 1000/);
  assert.match(mobileStorage, /serializedCache\.get\(key\) === jsonValue/);
  assert.match(mobileTelemetry, /UNCHANGED_SYNC_REPORT_MS = 15 \* 60 \* 1000/);
  assert.match(diagnostics, /collection\(COLLECTIONS\.FIELDS\)\.count\(\)\.get\(\)/);
  assert.match(diagnostics, /collection\(COLLECTIONS\.CROP_CYCLES\)\.count\(\)\.get\(\)/);
  assert.doesNotMatch(diagnostics, /collection\(COLLECTIONS\.FIELDS\)\.get\(\)/);
  assert.match(prices, /orderBy\('effectiveDate', 'desc'\)\.limit\(requestedLimit\)/);
  assert.match(auth, /inFlightAccountReads/);
  assert.doesNotMatch(serverTelemetry, /const current = await ref\.get\(\)/);
  assert.ok(server.indexOf("app.get('/health'") < server.indexOf('app.use(session({'));
  assert.match(syncContext, /setInterval\(probeApi, 2 \* 60 \* 1000\)/);
});
