'use strict';

process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-only-session-secret-that-is-longer-than-32-characters';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { hashPassword, verifyPassword, PASSWORD_HASH_FORMAT } = require('../security/password');
const { publicUser } = require('../security/userProjection');
const { buildFirebaseClaims } = require('../security/firebaseClaims');
const { issueToken } = require('../security/token');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/roleGuard');
const { issueOtp, verifyOtp, consumeVerifiedOtp, verifyAndConsumeOtp } = require('../security/otp');
const { ROLES, publicRoleLabel } = require('../schema/firestoreSchema');

function responseRecorder() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

test('passwords use salted scrypt and reject plaintext, wrong, and legacy SHA values', async () => {
  const first = await hashPassword('StrongPassword123!');
  const second = await hashPassword('StrongPassword123!');
  assert.match(first, new RegExp(`^${PASSWORD_HASH_FORMAT.replace('$', '\\$')}\\$`));
  assert.notEqual(first, second);
  assert.equal(await verifyPassword('StrongPassword123!', first), true);
  assert.equal(await verifyPassword('wrong-password', first), false);
  assert.equal(await verifyPassword('StrongPassword123!', '03f175a75a2f4b91'), false);
  assert.equal(await verifyPassword('StrongPassword123!', 'StrongPassword123!'), false);
});

test('public user projection never returns credential material', () => {
  const projected = publicUser({
    displayName: 'Safe User',
    password: 'plain',
    passwordHash: 'hash',
    salt: 'salt',
    resetToken: 'token'
  }, '04000001');
  assert.deepEqual(projected, { displayName: 'Safe User', id: '04000001' });
});

for (const role of Object.values(ROLES)) {
  test(`${role} receives its canonical Firebase role claim and passes its own API role guard`, () => {
    const user = {
      employeeId: `test-${role}`,
      name: role,
      role: publicRoleLabel(role),
      canonicalRole: role,
      roleKey: role.toLowerCase(),
      phoneVerified: true,
      requiresPasswordChange: false
    };
    const claims = buildFirebaseClaims(user);
    assert.equal(claims.role, role);
    assert.equal(claims.accountReady, true);

    const req = { session: { user } };
    const res = responseRecorder();
    let nextCalled = false;
    requireRole([role])(req, res, () => { nextCalled = true; });
    assert.equal(nextCalled, true);
    assert.equal(res.statusCode, 200);
  });
}

test('Firebase accountReady is false until phone verification and first-login password change finish', () => {
  assert.equal(buildFirebaseClaims({ canonicalRole: ROLES.MEMBER_FARMER, roleKey: 'member', phoneVerified: false, requiresPasswordChange: false }).accountReady, false);
  assert.equal(buildFirebaseClaims({ canonicalRole: ROLES.MEMBER_FARMER, roleKey: 'member', phoneVerified: true, requiresPasswordChange: true }).accountReady, false);
});

test('missing and forged bearer credentials are rejected', () => {
  for (const authorization of ['', 'Bearer forged.value.here']) {
    const req = { headers: { authorization }, session: {} };
    const res = responseRecorder();
    let nextCalled = false;
    requireAuth(req, res, () => { nextCalled = true; });
    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.code, 'UNAUTHENTICATED');
  }
});

test('a server-issued bearer authenticates but cannot cross a role guard', () => {
  const user = {
    employeeId: '04000001',
    name: 'Member',
    role: 'Member Farmer',
    roleKey: 'member',
    phoneVerified: true,
    requiresPasswordChange: false
  };
  const req = { headers: { authorization: `Bearer ${issueToken(user, 'member')}` }, session: {} };
  const authRes = responseRecorder();
  let authenticated = false;
  requireAuth(req, authRes, () => { authenticated = true; });
  assert.equal(authenticated, true);

  const roleRes = responseRecorder();
  let authorized = false;
  requireRole([ROLES.SUPER_ADMIN])(req, roleRes, () => { authorized = true; });
  assert.equal(authorized, false);
  assert.equal(roleRes.statusCode, 403);
  assert.equal(roleRes.body.code, 'FORBIDDEN');
});

test('OTP values remain server-side, enforce matching context, and are single-use', () => {
  const subject = `registration-${Date.now()}`;
  const challenge = issueOtp('registration', subject, '09171234567');
  assert.equal(verifyOtp('registration', subject, '09170000000', challenge.code).success, false);
  assert.equal(verifyOtp('registration', subject, '09171234567', '000000').success, false);
  assert.equal(verifyOtp('registration', subject, '09171234567', challenge.code).success, true);
  assert.equal(consumeVerifiedOtp('registration', subject, '09171234567'), true);
  assert.equal(consumeVerifiedOtp('registration', subject, '09171234567'), false);

  const loginSubject = `first-login-${Date.now()}`;
  const loginChallenge = issueOtp('first-login', loginSubject, '09181234567');
  assert.equal(verifyAndConsumeOtp('first-login', loginSubject, '09181234567', loginChallenge.code).success, true);
  assert.equal(verifyAndConsumeOtp('first-login', loginSubject, '09181234567', loginChallenge.code).success, false);
});

test('Firestore rules deny all client access to credentials and deny unmatched collections', () => {
  const rules = fs.readFileSync(path.resolve(__dirname, '../../firestore.rules'), 'utf8');
  assert.match(rules, /match \/user_credentials\/\{userId\}[\s\S]*?allow read, write: if false;/);
  assert.match(rules, /request\.auth\.token\.accountReady == true/);
  assert.match(rules, /request\.auth\.uid == userId \|\| staff\(\)/);
  assert.match(rules, /resource\.data\.memberUserId == request\.auth\.uid/);
  assert.match(rules, /match \/\{document=\*\*\}[\s\S]*?allow read, write: if false;/);
});
