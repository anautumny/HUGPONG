'use strict';

process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-only-session-secret-that-is-longer-than-32-characters';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const { hashPassword, verifyPassword, PASSWORD_HASH_FORMAT } = require('../security/password');
const { publicUser } = require('../security/userProjection');
const { buildFirebaseClaims } = require('../security/firebaseClaims');
const { issueToken } = require('../security/token');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/roleGuard');
const { issueOtp, verifyOtp, consumeVerifiedOtp, verifyAndConsumeOtp } = require('../security/otp');
const { ROLES, publicRoleLabel } = require('../schema/firestoreSchema');
const { assertDevelopmentBootstrapAllowed } = require('../services/developmentBootstrap');

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

test('web role routing uses exact canonical mappings without substring collisions', async () => {
  const webAuthRouting = await import(pathToFileURL(path.resolve(__dirname, '../../web/react-app/src/services/roleRouting.js')).href);
  const aliases = {
    'Super Admin': 'superadmin',
    SUPER_ADMIN: 'superadmin',
    'super-admin': 'superadmin',
    'SRA Admin': 'admin',
    SRA_ADMIN: 'admin',
    'sra-admin': 'admin',
    'Farm Manager': 'manager',
    FARM_MANAGER: 'manager',
    'Member Farmer': 'member',
    MEMBER_FARMER: 'member'
  };
  for (const [input, expected] of Object.entries(aliases)) {
    assert.equal(webAuthRouting.normalizeRole(input), expected);
  }
  assert.equal(webAuthRouting.roleKeyFromUser({ canonicalRole: 'SUPER_ADMIN', role: 'SRA Admin' }), 'superadmin');
  assert.equal(webAuthRouting.workspacePath('superadmin'), '/workspace/super-admin');
  assert.equal(webAuthRouting.workspacePath('admin'), '/workspace/sra-admin');
  assert.equal(webAuthRouting.workspacePath('manager'), '/workspace/farm-manager');
  assert.equal(webAuthRouting.workspacePath('member'), '/workspace/member');
});

test('React waits for session resolution and applies one exact role guard', () => {
  const app = fs.readFileSync(path.resolve(__dirname, '../../web/react-app/src/App.jsx'), 'utf8');
  const page = fs.readFileSync(path.resolve(__dirname, '../../web/react-app/src/pages/WorkspacePage.jsx'), 'utf8');
  const routing = fs.readFileSync(path.resolve(__dirname, '../../web/react-app/src/services/roleRouting.js'), 'utf8');
  assert.match(app, /status === 'resolving'/);
  assert.match(page, /workspaceGuardDestination\(session\.roleKey, workspace\)/);
  assert.match(page, /<Navigate replace/);
  assert.doesNotMatch(routing, /\.includes\(/);
});

test('Firestore users listener updates the directory but never the authenticated identity', () => {
  const replica = fs.readFileSync(path.resolve(__dirname, '../../web/react-app/src/services/replicaStore.js'), 'utf8');
  const session = fs.readFileSync(path.resolve(__dirname, '../../web/react-app/src/services/sessionStore.js'), 'utf8');
  assert.match(replica, /users: 'users'/);
  assert.match(replica, /replace\(key, records\)/);
  assert.doesNotMatch(replica, /saveSession|activeUser\s*=|currentUser\s*=/);
  assert.doesNotMatch(session, /subscribeCollection|onSnapshot/);
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

test('OTP resend cooldown, expiry, and attempt cap remain enforced independently of delivery provider', () => {
  const issuedAt = Date.now();
  const cooldownSubject = `cooldown-${issuedAt}`;
  const first = issueOtp('delivery-test', cooldownSubject, '09171234567', issuedAt);
  assert.throws(
    () => issueOtp('delivery-test', cooldownSubject, '09171234567', issuedAt + 1),
    error => error.code === 'OTP_RATE_LIMITED'
  );

  const expirySubject = `expiry-${issuedAt}`;
  const expiring = issueOtp('delivery-test', expirySubject, '09171234567', issuedAt);
  assert.match(verifyOtp('delivery-test', expirySubject, '09171234567', expiring.code, expiring.expiresAt).error, /expired/i);

  const attemptsSubject = `attempts-${issuedAt}`;
  const attempted = issueOtp('delivery-test', attemptsSubject, '09171234567', issuedAt);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    assert.equal(verifyOtp('delivery-test', attemptsSubject, '09171234567', '000000', issuedAt + 10 + attempt).success, false);
  }
  assert.match(verifyOtp('delivery-test', attemptsSubject, '09171234567', attempted.code, issuedAt + 20).error, /too many/i);
  assert.equal(first.code.length, 6);
});

test('development test-account bootstrap is explicit and cannot run in production', () => {
  const safeEnv = {
    NODE_ENV: 'development',
    SMS_PROVIDER: 'console',
    ALLOW_DEVELOPMENT_TEST_ACCOUNTS: 'true',
    DEVELOPMENT_TEST_PASSWORD: 'StrongPassword123!'
  };
  assert.doesNotThrow(() => assertDevelopmentBootstrapAllowed(safeEnv));
  assert.throws(() => assertDevelopmentBootstrapAllowed({ ...safeEnv, NODE_ENV: 'production' }), /forbidden in production/i);
  assert.throws(() => assertDevelopmentBootstrapAllowed({ ...safeEnv, ALLOW_DEVELOPMENT_TEST_ACCOUNTS: 'false' }), /ALLOW_DEVELOPMENT_TEST_ACCOUNTS/i);
  assert.throws(() => assertDevelopmentBootstrapAllowed({ ...safeEnv, SMS_PROVIDER: 'semaphore' }), /SMS_PROVIDER=console/i);

  const packageJson = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../package.json'), 'utf8'));
  assert.doesNotMatch(packageJson.scripts.start, /bootstrap:dev-test-accounts/);
  assert.match(packageJson.scripts['bootstrap:dev-test-accounts'], /bootstrapDevelopmentTestAccounts/);
});

test('OTP request responses never serialize the generated challenge code', () => {
  const authRoute = fs.readFileSync(path.resolve(__dirname, '../routes/auth.js'), 'utf8');
  assert.doesNotMatch(authRoute, /res\.json\(\s*\{[\s\S]{0,300}challenge\.code/);
});

test('web and mobile runtime source contain no Semaphore credential or provider endpoint', () => {
  const roots = [path.resolve(__dirname, '../../web'), path.resolve(__dirname, '../../mobile/src')];
  const visit = directory => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== 'react-dist') visit(fullPath);
      else if (entry.isFile() && /\.(js|jsx|ts|tsx|html)$/.test(entry.name)) {
        const source = fs.readFileSync(fullPath, 'utf8');
        assert.doesNotMatch(source, /\bSEMAPHORE_(?:API_KEY|SENDER_NAME)\b|api\.semaphore\.co/i, `Semaphore material in ${fullPath}`);
      }
    }
  };
  roots.forEach(visit);
});

test('Firestore rules deny all client access to credentials and deny unmatched collections', () => {
  const rules = fs.readFileSync(path.resolve(__dirname, '../../firestore.rules'), 'utf8');
  assert.match(rules, /match \/user_credentials\/\{userId\}[\s\S]*?allow read, write: if false;/);
  assert.match(rules, /request\.auth\.token\.accountReady == true/);
  assert.match(rules, /request\.auth\.uid == userId \|\| staff\(\)/);
  assert.match(rules, /resource\.data\.memberUserId == request\.auth\.uid/);
  assert.match(rules, /match \/\{document=\*\*\}[\s\S]*?allow read, write: if false;/);
});

test('canonical Firestore collections deny every client write', () => {
  const rules = fs.readFileSync(path.resolve(__dirname, '../../firestore.rules'), 'utf8');
  for (const collection of ['users', 'block_farms', 'fields', 'crop_cycles', 'operation_logs', 'audit_reports', 'audit_logs', 'sra_prices', 'support_tickets', 'terminal_diagnostics']) {
    const block = new RegExp(`match \/${collection}\/\\{[^}]+\\}[\\s\\S]*?allow (?:create, update, delete|write): if false;`);
    assert.match(rules, block, `${collection} must be server-write-only`);
  }
});

test('web and mobile runtime source contain no direct Firestore mutation calls', () => {
  const roots = [path.resolve(__dirname, '../../web'), path.resolve(__dirname, '../../mobile/src')];
  const sourceFiles = [];
  const visit = directory => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== 'react-dist') visit(fullPath);
      else if (/\.(js|jsx|ts|tsx)$/.test(entry.name)) sourceFiles.push(fullPath);
    }
  };
  roots.forEach(visit);
  for (const file of sourceFiles) {
    const source = fs.readFileSync(file, 'utf8');
    assert.doesNotMatch(source, /\b(?:setDoc|addDoc|updateDoc|deleteDoc|writeBatch)\s*\(/, `direct Firestore mutation in ${file}`);
  }
});
