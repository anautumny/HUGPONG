'use strict';

process.env.SESSION_SECRET ||= 'test-only-login-session-secret-at-least-32-characters';
const test = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const { memoryFirestore } = require('./helpers/memoryFirestore');
const { hashPassword } = require('../security/password');
const { normalizeLoginIdentifier, loginIdentifierInput } = require('../domain/loginIdentifier');
const { COLLECTIONS, ROLES } = require('../schema/firestoreSchema');

// Only in-memory records and a stubbed Firebase token issuer; no cloud calls.
const db = memoryFirestore();
let firebaseTokens = 0;
const firebasePath = require.resolve('../firebase-admin');
const previous = require.cache[firebasePath];
require.cache[firebasePath] = { id: firebasePath, filename: firebasePath, loaded: true, exports: {
  db, admin: {}, auth: { async createCustomToken() { firebaseTokens++; return 'TEST-FIREBASE-TOKEN'; } }
} };
const router = require('../routes/auth');
if (previous) require.cache[firebasePath] = previous; else delete require.cache[firebasePath];
const stack = router.stack.find(layer => layer.route?.path === '/login').route.stack;
const password = 'TestOnlyPassword123!';
const passwordHash = hashPassword(password);

async function fixture(role = ROLES.FARM_MANAGER, account = {}) {
  db.records.clear();
  firebaseTokens = 0;
  db.records.set(`${COLLECTIONS.USERS}/03000001`, {
    displayName: 'Login Test Account', role, status: 'ACTIVE', phone: '09170000003',
    phoneVerifiedAt: '2026-01-01T00:00:00.000Z', ...account
  });
  db.records.set(`${COLLECTIONS.USER_CREDENTIALS}/03000001`, { passwordHash: await passwordHash });
  return async (body = {}, platform = 'web') => {
    let regenerations = 0;
    const req = {
      body: { contactNumber: '03000001', password, clientPlatform: platform, ...body },
      headers: { 'x-client-platform': platform }, ip: 'login-test-client',
      session: { regenerate(done) { regenerations++; req.session = {}; done(); } }
    };
    const res = { statusCode: 200, locals: {}, headers: {},
      set(name, value) { this.headers[name] = value; return this; },
      status(code) { this.statusCode = code; return this; },
      json(body) { this.body = body; return this; } };
    const invoke = index => stack[index].handle(req, res, () => invoke(index + 1));
    await invoke(0);
    return { ...res, session: req.session, regenerations, firebaseTokens };
  };
}

function assertNoSession(result) {
  assert.equal(result.regenerations, 0);
  assert.equal(result.session.user, undefined);
  assert.equal(result.firebaseTokens, 0);
  for (const field of ['user', 'token', 'firebaseCustomToken', 'roleKey']) assert.equal(result.body[field], undefined);
}

test('server, Web and Android agree on numeric identifiers, leading zeroes, and safe input edits', async () => {
  const implementations = [{ normalizeLoginIdentifier, loginIdentifierInput }];
  for (const relative of ['web/react-app/src/domain/loginIdentifier.js', 'mobile/src/domain/loginIdentifier.js']) {
    implementations.push(await import(pathToFileURL(path.resolve(__dirname, '../..', relative))));
  }
  for (const rules of implementations) {
    for (const id of ['01000001', '02000001', '03000001', '04000001']) assert.equal(rules.normalizeLoginIdentifier(id), id);
    for (const phone of ['09170000003', '639170000003', '+63 (917) 000-0003']) assert.equal(rules.normalizeLoginIdentifier(phone), '09170000003');
    for (const invalid of ['abc09170000003', '03000001abc', '0300000e1', 'user', '123', '091700000030', '05000001', 3000001, null]) {
      assert.equal(rules.normalizeLoginIdentifier(invalid), '', String(invalid));
    }
    assert.equal(rules.loginIdentifierInput('03000001a', '03000001'), '03000001');
    assert.equal(rules.loginIdentifierInput('abc09170000003', ''), '');
    assert.equal(rules.loginIdentifierInput('+63 (917) 000-0003'), '639170000003');
    assert.equal(rules.loginIdentifierInput(''), '');
    assert.equal(rules.loginIdentifierInput('0917000000300', '09'), '09', 'reject overlong input instead of truncating into a different account');
  }
});

test('malformed API identifiers are rejected before lookup, throttles or session creation', async () => {
  const request = await fixture();
  for (const contactNumber of ['abc09170000003', '03000001letters', 'admin', '091700000030', 3000001]) {
    const result = await request({ contactNumber, sessionAcknowledged: true });
    assert.equal(result.statusCode, 400);
    assert.equal(result.body.code, 'INVALID_LOGIN_IDENTIFIER');
    assertNoSession(result);
  }
  assert.equal(db.records.size, 2, 'no account, session, telemetry or throttle writes for malformed identifiers');
});

test('wrong or unknown credentials return a credential error even with acknowledgement unchecked', async () => {
  const request = await fixture();
  for (const body of [{ password: 'wrong', sessionAcknowledged: false }, { contactNumber: '03999999', sessionAcknowledged: false }, { password: 'wrong', sessionAcknowledged: true }]) {
    const result = await request(body);
    assert.equal(result.statusCode, 401);
    assert.equal(result.body.code, 'INVALID_CREDENTIALS');
    assertNoSession(result);
  }
});

test('valid credentials require explicit boolean acknowledgement without creating any authenticated session', async () => {
  const request = await fixture();
  for (const sessionAcknowledged of [undefined, false, 'true', 1]) {
    const result = await request({ sessionAcknowledged }, 'mobile');
    assert.equal(result.statusCode, 400);
    assert.equal(result.body.code, 'SESSION_ACKNOWLEDGEMENT_REQUIRED');
    assertNoSession(result);
  }
  assert.equal([...db.records.keys()].some(key => key.startsWith(`${COLLECTIONS.TERMINAL_DIAGNOSTICS}/`)), false);
  // A failed unchecked attempt is not a reusable authentication grant.
  const changed = await request({ password: 'wrong', sessionAcknowledged: true }, 'mobile');
  assert.equal(changed.body.code, 'INVALID_CREDENTIALS');
  assertNoSession(changed);
  const accepted = await request({ sessionAcknowledged: true }, 'mobile');
  assert.equal(accepted.statusCode, 200);
  assert.equal(accepted.regenerations, 1);
  assert.equal(accepted.firebaseTokens, 1);
});

test('acknowledged login preserves every authorized role and platform combination', async () => {
  for (const [role, platforms] of [
    [ROLES.FARM_MANAGER, ['web', 'mobile']], [ROLES.SRA_ADMIN, ['web', 'mobile']],
    [ROLES.SUPER_ADMIN, ['web']], [ROLES.MEMBER_FARMER, ['mobile']]
  ]) {
    for (const platform of platforms) {
      const request = await fixture(role);
      const result = await request({ sessionAcknowledged: true }, platform);
      assert.equal(result.statusCode, 200, `${role} ${platform}: ${JSON.stringify(result.body)}`);
      assert.equal(result.body.success, true);
      assert.equal(result.regenerations, 1);
      assert.equal(result.session.user.canonicalRole, role);
      assert.equal(result.body.user.platform, platform);
      assert.ok(result.body.token);
      assert.equal(result.firebaseTokens, platform === 'mobile' ? 1 : 0);
    }
  }
});

test('registered mobile formats resolve the same account and acknowledgement gate', async () => {
  const request = await fixture();
  for (const contactNumber of ['09170000003', '639170000003', '+63 (917) 000-0003']) {
    const result = await request({ contactNumber, sessionAcknowledged: true });
    assert.equal(result.statusCode, 200);
    assert.equal(result.body.user.employeeId, '03000001');
  }
});

test('first-login setup and platform restrictions still apply after password validation', async () => {
  const pending = await fixture(ROLES.MEMBER_FARMER, { phoneVerifiedAt: null, requiresPasswordChange: true });
  assert.equal((await pending({}, 'mobile')).body.code, 'SESSION_ACKNOWLEDGEMENT_REQUIRED');
  const allowed = await pending({ sessionAcknowledged: true }, 'mobile');
  assert.equal(allowed.body.user.pendingFirstLoginVerification, true);
  assert.equal(allowed.body.user.requiresPasswordChange, true);
  for (const [role, platform] of [[ROLES.MEMBER_FARMER, 'web'], [ROLES.SUPER_ADMIN, 'mobile']]) {
    const request = await fixture(role);
    const denied = await request({ sessionAcknowledged: true }, platform);
    assert.equal(denied.statusCode, 403);
    assertNoSession(denied);
  }
});

test('inactive accounts do not bypass password validation or establish sessions', async () => {
  const request = await fixture(ROLES.FARM_MANAGER, { status: 'INACTIVE' });
  assert.equal((await request({ password: 'wrong' })).body.code, 'INVALID_CREDENTIALS');
  const inactive = await request({ sessionAcknowledged: true });
  assert.equal(inactive.statusCode, 403);
  assertNoSession(inactive);
});

test('unchecked acknowledgement does not bypass the existing five-attempt login lockout', async () => {
  const request = await fixture();
  for (let attempt = 1; attempt <= 5; attempt++) {
    const result = await request({ password: 'wrong', sessionAcknowledged: false });
    assert.equal(result.statusCode, attempt === 5 ? 429 : 401);
    assertNoSession(result);
  }
  const blocked = await request({ sessionAcknowledged: true });
  assert.equal(blocked.statusCode, 429);
  assert.equal(blocked.body.code, 'LOGIN_RATE_LIMITED');
  assertNoSession(blocked);
});
