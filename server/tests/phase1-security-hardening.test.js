'use strict';

process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'phase-one-test-secret-that-is-longer-than-32-characters';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { validatePassword } = require('../security/password');
const { issueToken, verifyToken } = require('../security/token');
const { authVersionOf, nextAuthVersion } = require('../security/accountSecurity');

const root = path.resolve(__dirname, '../..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('account security versions are backward compatible and advance on revocation', () => {
  assert.equal(authVersionOf({}), 1);
  assert.equal(authVersionOf({ authVersion: 4 }), 4);
  assert.equal(nextAuthVersion({ authVersion: 4 }), 5);
  const token = issueToken({ employeeId: '04000001', name: 'Member', authVersion: 5 }, 'member');
  assert.equal(verifyToken(token).authVersion, 5);
});

test('server password policy consistently requires mixed case, a number, and a non-default value', () => {
  assert.throws(() => validatePassword('abcdefgh1'), /uppercase letter/);
  assert.throws(() => validatePassword('ABCDEFGH1'), /lowercase letter/);
  assert.throws(() => validatePassword('Abcdefgh'), /one number/);
  assert.throws(() => validatePassword('Hugpong2026'), /less predictable/);
  assert.doesNotThrow(() => validatePassword('StrongPassword123!'));
});

test('login cooldown is persistent and restored by both clients', () => {
  const auth = read('server/routes/auth.js');
  const webLogin = read('web/react-app/src/views/LoginView.jsx');
  const mobileLogin = read('mobile/src/screens/auth/LoginScreen.js');
  const mobileStorage = read('mobile/src/services/storageService.js');

  assert.match(auth, /LOGIN_ATTEMPT_LIMIT = 5/);
  assert.match(auth, /LOGIN_LOCKOUT_MS = 15 \* 60 \* 1000/);
  assert.match(auth, /Too many login attempts\. Please try again later\./);
  assert.match(auth, /loginRateLimit\.reset\(req\)/);
  assert.match(auth, /LOGIN_RATE_LIMITED/);
  assert.match(webLogin, /hugpong_login_lockout_until/);
  assert.match(webLogin, /applyServerLockout/);
  assert.doesNotMatch(webLogin, /Locked \(\$\{lockoutRemaining\}s\)/);
  assert.match(mobileStorage, /LOGIN_LOCKOUT_UNTIL: '@hugpong_login_lockout_until'/);
  assert.match(mobileLogin, /getItem\(STORAGE_KEYS\.LOGIN_LOCKOUT_UNTIL/);
  assert.match(mobileLogin, /applyServerLockout/);
  assert.doesNotMatch(mobileLogin, /Locked \(\$\{lockoutSeconds\}s\)/);
});

test('first-login and settings screens mirror the same password policy on Web and Mobile', () => {
  const webPolicy = read('web/react-app/src/domain/passwordPolicy.js');
  const webFirstLogin = read('web/react-app/src/components/auth/FirstLoginPasswordModal.jsx');
  const webSettings = read('web/react-app/src/components/settings/SecuritySettings.jsx');
  const mobilePolicy = read('mobile/src/domain/passwordPolicy.js');
  const mobileFirstLogin = read('mobile/src/screens/auth/LoginScreen.js');
  const mobileSettings = read('mobile/src/screens/SecurityScreen.js');

  for (const policy of [webPolicy, mobilePolicy]) {
    assert.match(policy, /hasLowercase/);
    assert.match(policy, /hasUppercase/);
    assert.match(policy, /hasNumber/);
    assert.match(policy, /hugpong2026/);
  }
  assert.match(webFirstLogin, /passwordPolicy\(newPassword\)/);
  assert.match(webSettings, /passwordPolicyError\(newPassword\)/);
  assert.match(mobileFirstLogin, /passwordPolicy\(newPassword\)/);
  assert.match(mobileSettings, /passwordPolicyError\(newPw\)/);
});

test('web authentication uses the HttpOnly session and never persists a bearer token', () => {
  const context = read('web/react-app/src/context/AuthContext.jsx');
  const apiClient = read('web/react-app/src/services/apiClient.js');
  assert.match(context, /Browser authentication is held only in the server's HttpOnly cookie/);
  assert.doesNotMatch(context, /localStorage\.setItem\('hugpong_auth_token'/);
  assert.doesNotMatch(apiClient, /localStorage\.(getItem|setItem)\('hugpong_auth_token'/);
});

test('mobile credentials use encrypted storage and shared account replicas are cleared at logout', () => {
  const storage = read('mobile/src/services/storageService.js');
  const store = read('mobile/src/data/dataStore.js');
  assert.match(storage, /from 'expo-secure-store'/);
  assert.match(storage, /SECURE_KEYS = new Set\(\[STORAGE_KEYS\.AUTH_TOKEN, STORAGE_KEYS\.SESSION\]\)/);
  assert.match(store, /await clearSharedAccountCache\(\)/);
});

test('server security boundaries use persistent throttles, sessions, and server-owned audits', () => {
  const server = read('server/server.js');
  const auth = read('server/routes/auth.js');
  const sms = read('server/routes/sms.js');
  const auditEvents = read('server/routes/auditEvents.js');
  assert.match(server, /new FirestoreSessionStore/);
  assert.match(auth, /loginRateLimit/);
  assert.match(auth, /revokeFirebaseSessions/);
  assert.match(sms, /ALERT_TEMPLATES/);
  assert.match(sms, /requireRole\(\[ROLES\.SUPER_ADMIN\]\)/);
  assert.match(auditEvents, /AUDIT_EVENTS_SERVER_MANAGED/);
});

