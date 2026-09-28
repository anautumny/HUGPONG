'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  createEarlyAbuseProtection,
  createAuthenticatedApiRateLimit,
  _test: { BoundedWindowStore, applyPolicies, isKnownPath }
} = require('../middleware/abuseProtection');
const {
  shouldAggregateDiagnostic,
  _test: { endpointGroup }
} = require('../services/abuseEventAggregator');

const root = path.resolve(__dirname, '..', '..');

function responseDouble() {
  return {
    locals: {},
    headers: {},
    statusCode: 200,
    payload: null,
    set(name, value) { this.headers[name] = value; return this; },
    status(value) { this.statusCode = value; return this; },
    json(value) { this.payload = value; return this; }
  };
}

function requestDouble(overrides = {}) {
  return {
    method: 'GET',
    originalUrl: '/health',
    ip: '203.0.113.10',
    socket: {},
    headers: {},
    ...overrides
  };
}

test('bounded window counters reject excess traffic and expire without an unbounded map', () => {
  const store = new BoundedWindowStore(2);
  const policy = { max: 2, windowMs: 1000 };
  assert.equal(store.consume('one', policy, 100).accepted, true);
  assert.equal(store.consume('one', policy, 101).accepted, true);
  assert.equal(store.consume('one', policy, 102).accepted, false);
  store.consume('two', policy, 200);
  store.consume('three', policy, 200);
  assert.ok(store.entries.size <= 2);
  assert.equal(store.consume('one', policy, 1200).accepted, true);
});

test('early protection blocks bursts before route work with a safe generic response', () => {
  const store = new BoundedWindowStore();
  const permissive = { max: 100, windowMs: 60000 };
  const middleware = createEarlyAbuseProtection({
    store,
    now: () => 1000,
    limits: {
      burst: { max: 2, windowMs: 10000 },
      sustained: permissive,
      mutation: permissive,
      authentication: permissive,
      backupUpload: permissive,
      unknownPath: permissive
    }
  });
  let accepted = 0;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const res = responseDouble();
    middleware(requestDouble(), res, () => { accepted += 1; });
    if (attempt === 2) {
      assert.equal(res.statusCode, 429);
      assert.equal(res.payload.code, 'GLOBAL_RATE_LIMITED');
      assert.equal(res.payload.error, 'Too many requests. Please try again later.');
      assert.equal(res.locals.aggregateDiagnostic, true);
      assert.equal(Object.hasOwn(res.payload, 'retryAfterSeconds'), false);
    }
  }
  assert.equal(accepted, 2);
});

test('declared oversized bodies are rejected before JSON parsing', () => {
  const middleware = createEarlyAbuseProtection();
  const res = responseDouble();
  let continued = false;
  middleware(requestDouble({
    method: 'POST',
    originalUrl: '/auth/login',
    headers: { 'content-length': String((1024 * 1024) + 1) }
  }), res, () => { continued = true; });
  assert.equal(continued, false);
  assert.equal(res.statusCode, 413);
  assert.equal(res.payload.code, 'REQUEST_TOO_LARGE');
});

test('authenticated budgets bind both the account and its network address', () => {
  const store = new BoundedWindowStore();
  const limits = {
    readUser: { max: 2, windowMs: 1000 },
    readUserAndIp: { max: 2, windowMs: 1000 },
    mutationUser: { max: 1, windowMs: 1000 },
    mutationUserAndIp: { max: 1, windowMs: 1000 }
  };
  const middleware = createAuthenticatedApiRateLimit({ store, limits, now: () => 500 });
  const req = requestDouble({
    method: 'POST',
    originalUrl: '/api/logs',
    authUser: { employeeId: '01000001' }
  });
  let accepted = 0;
  middleware(req, responseDouble(), () => { accepted += 1; });
  const blocked = responseDouble();
  middleware(req, blocked, () => { accepted += 1; });
  assert.equal(accepted, 1);
  assert.equal(blocked.statusCode, 429);
  assert.equal(blocked.payload.code, 'USER_RATE_LIMITED');
});

test('known routes avoid the scanner budget while unknown paths are grouped safely', () => {
  assert.equal(isKnownPath('/api/logs'), true);
  assert.equal(isKnownPath('/backups'), true);
  assert.equal(isKnownPath('/wp-admin.php'), false);
  assert.equal(endpointGroup(requestDouble({ originalUrl: '/api/logs/secret-document-id?x=1' })), '/api/logs/*');
  assert.equal(endpointGroup(requestDouble({ originalUrl: '/wp-admin.php' })), '/unknown');
});

test('routine bot-noise responses are aggregated instead of persisted one by one', () => {
  assert.equal(shouldAggregateDiagnostic(401, 'UNAUTHENTICATED'), true);
  assert.equal(shouldAggregateDiagnostic(404, ''), true);
  assert.equal(shouldAggregateDiagnostic(429, 'GLOBAL_RATE_LIMITED'), true);
  assert.equal(shouldAggregateDiagnostic(413, 'REQUEST_TOO_LARGE'), true);
  assert.equal(shouldAggregateDiagnostic(500, 'DATABASE_FAILED'), false);
});

test('server installs cheap protection before parsing and user budgets after authentication', () => {
  const server = fs.readFileSync(path.join(root, 'server', 'server.js'), 'utf8');
  const early = server.indexOf('app.use(createEarlyAbuseProtection())');
  const parser = server.indexOf("app.use(express.json({ limit: '1mb' }))");
  const apiBoundary = server.indexOf("app.use('/api', requireAuth, createAuthenticatedApiRateLimit()");
  assert.ok(early > 0 && early < parser);
  assert.ok(apiBoundary > parser);

  const auth = fs.readFileSync(path.join(root, 'server', 'routes', 'auth.js'), 'utf8');
  assert.match(auth, /loginIpRateLimit/);
  assert.match(auth, /loginAccountRateLimit/);
  assert.match(auth, /loginIpRateLimit, loginAccountRateLimit, loginRateLimit/);

  const backups = fs.readFileSync(path.join(root, 'server', 'routes', 'backups.js'), 'utf8');
  assert.match(backups, /backupExportRateLimit/);
  assert.match(backups, /backupValidationRateLimit/);
  assert.match(backups, /backupRestoreRateLimit/);
});

test('web and mobile continue to receive centralized safe retry-later errors', () => {
  const web = fs.readFileSync(path.join(root, 'web', 'react-app', 'src', 'services', 'apiClient.js'), 'utf8');
  const mobile = fs.readFileSync(path.join(root, 'mobile', 'src', 'services', 'authService.js'), 'utf8');
  assert.match(web, /result\.nextAction/);
  assert.match(web, /result\.referenceId/);
  assert.match(mobile, /referenceId/);
  assert.match(mobile, /nextAction/);
});
