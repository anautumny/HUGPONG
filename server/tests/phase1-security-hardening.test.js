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

test('server password policy rejects passwords without both letters and numbers', () => {
  assert.throws(() => validatePassword('abcdefgh'), /letter and one number/);
  assert.throws(() => validatePassword('12345678'), /letter and one number|less predictable/);
  assert.doesNotThrow(() => validatePassword('StrongPassword123!'));
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

