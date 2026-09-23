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
const { ROLES, publicRoleLabel, ROLE_ALLOWED_PLATFORMS, isRoleAllowedOnPlatform } = require('../schema/firestoreSchema');
const { assertDevelopmentBootstrapAllowed } = require('../services/developmentBootstrap');
const webAuthRouting = require('../../web/shared/auth-routing');

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

test('web role routing uses exact canonical mappings without substring collisions', () => {
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
  assert.equal(webAuthRouting.dashboardPath('superadmin'), '/dashboard');
  assert.equal(webAuthRouting.dashboardPath('admin'), '/dashboard');
  assert.equal(webAuthRouting.dashboardPath('manager'), '/dashboard');
  assert.equal(webAuthRouting.dashboardPath('member'), null);
});

test('role pages wait for session resolution and use the shared exact route guard', () => {
  for (const roleDirectory of ['super-admin', 'sra-admin', 'farm-manager']) {
    const html = fs.readFileSync(path.resolve(__dirname, `../../web/roles/${roleDirectory}/dashboard.html`), 'utf8');
    const guard = fs.readFileSync(path.resolve(__dirname, `../../web/roles/${roleDirectory}/${roleDirectory}.js`), 'utf8');
    assert.match(html, /<html[^>]+class="auth-pending"/);
    assert.match(html, /auth-routing\.js/);
    assert.match(guard, /webRoleKeyFromUser\(/);
    assert.match(guard, /getWebDashboardPath\(/);
    assert.doesNotMatch(guard, /roleLower\.includes\(/);
  }
});

test('Firestore users listener updates the directory but never the authenticated identity', () => {
  const core = fs.readFileSync(path.resolve(__dirname, '../../web/shared/core.js'), 'utf8');
  const usersListenerStart = core.indexOf('// 6. Listen on Users Directory');
  const usersListenerEnd = core.indexOf('// 7. Listen on Audit Reports');
  assert.ok(usersListenerStart >= 0 && usersListenerEnd > usersListenerStart);
  const usersListener = core.slice(usersListenerStart, usersListenerEnd);
  assert.match(usersListener, /db\.users = remoteUsers/);
  assert.doesNotMatch(usersListener, /hugpong_user|activeUser\s*=|sessionUser\s*=/);
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
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules' && entry.name !== 'dist' && !entry.name.startsWith('.')) {
          visit(fullPath);
        }
      }
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
  assert.match(rules, /request\.auth\.uid == userId/);
  assert.match(rules, /fieldData\.memberUserId == request\.auth\.uid/);
  assert.match(rules, /match \/\{document=\*\*\}[\s\S]*?allow read, write: if false;/);
});

test('canonical Firestore collections deny every client write', () => {
  const rules = fs.readFileSync(path.resolve(__dirname, '../../firestore.rules'), 'utf8');
  for (const collection of ['users', 'block_farms', 'fields', 'crop_cycles', 'operation_logs', 'audit_reports', 'audit_logs', 'sra_prices', 'support_tickets', 'terminal_diagnostics']) {
    const block = new RegExp(`match \/${collection}\/\\{[^}]+\\}[\\s\\S]*?allow (?:create, update, delete|write): if false;`);
    assert.match(rules, block, `${collection} must be server-write-only`);
  }
});

test('official SRA price publication remains SRA-admin-only and writes the audit ledger', () => {
  const route = fs.readFileSync(path.resolve(__dirname, '../routes/prices.js'), 'utf8');
  assert.match(route, /router\.post\('\/', requireAuth, requireRole\(\[ROLES\.SRA_ADMIN\]\)/);
  assert.match(route, /COLLECTIONS\.AUDIT_LOGS/);
  assert.match(route, /eventType:\s*'SRA_PRICE_PUBLISHED'/);
  assert.match(route, /ensurePricePublicationAudit\(publication\)/);
});

test('web and mobile runtime source contain no direct Firestore mutation calls', () => {
  const roots = [path.resolve(__dirname, '../../web'), path.resolve(__dirname, '../../mobile/src')];
  const sourceFiles = [];
  const visit = directory => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules' && entry.name !== 'dist' && !entry.name.startsWith('.')) {
          visit(fullPath);
        }
      }
      else if (/\.(js|jsx|ts|tsx)$/.test(entry.name)) sourceFiles.push(fullPath);
    }
  };
  roots.forEach(visit);
  for (const file of sourceFiles) {
    const source = fs.readFileSync(file, 'utf8');
    assert.doesNotMatch(source, /\b(?:setDoc|addDoc|updateDoc|deleteDoc|writeBatch)\s*\(/, `direct Firestore mutation in ${file}`);
  }
});

test('Super Admin role is strictly restricted to web and rejected on mobile platform', () => {
  assert.equal(isRoleAllowedOnPlatform(ROLES.SUPER_ADMIN, 'web'), true);
  assert.equal(isRoleAllowedOnPlatform(ROLES.SUPER_ADMIN, 'mobile'), false);
  assert.deepEqual(ROLE_ALLOWED_PLATFORMS[ROLES.SUPER_ADMIN], ['web']);

  assert.equal(isRoleAllowedOnPlatform(ROLES.MEMBER_FARMER, 'mobile'), true);
  assert.equal(isRoleAllowedOnPlatform(ROLES.MEMBER_FARMER, 'web'), false);

  assert.equal(isRoleAllowedOnPlatform(ROLES.FARM_MANAGER, 'mobile'), true);
  assert.equal(isRoleAllowedOnPlatform(ROLES.FARM_MANAGER, 'web'), true);

  assert.equal(isRoleAllowedOnPlatform(ROLES.SRA_ADMIN, 'mobile'), true);
  assert.equal(isRoleAllowedOnPlatform(ROLES.SRA_ADMIN, 'web'), true);

  const authRouteSource = fs.readFileSync(path.resolve(__dirname, '../routes/auth.js'), 'utf8');
  assert.match(
    authRouteSource,
    /sessionUser\.canonicalRole === ROLES\.SUPER_ADMIN && clientPlatform === 'mobile'/,
    'auth /login and /session must reject SUPER_ADMIN on mobile platform'
  );
  assert.match(
    authRouteSource,
    /Super Admin access is restricted to the Web Management Console\./,
    'auth routes must return the exact restriction message'
  );
});
