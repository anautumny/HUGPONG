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
const { issueToken, verifyToken } = require('../security/token');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/roleGuard');
const { issueOtp, verifyOtp, consumeVerifiedOtp, verifyAndConsumeOtp } = require('../security/otp');
const { _test: rateLimitTestHelpers } = require('../middleware/rateLimit');
const { ROLES, publicRoleLabel, ROLE_ALLOWED_PLATFORMS, isRoleAllowedOnPlatform } = require('../schema/firestoreSchema');
const { assertDevelopmentBootstrapAllowed } = require('../services/developmentBootstrap');
const {
  PASSWORD_SESSION_ACTIONS,
  normalizePasswordSessionAction
} = require('../security/accountSecurity');

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

test('password changes accept only the server-defined session disposition choices', () => {
  assert.equal(normalizePasswordSessionAction(), PASSWORD_SESSION_ACTIONS.KEEP_CURRENT);
  assert.equal(normalizePasswordSessionAction('keep_current'), PASSWORD_SESSION_ACTIONS.KEEP_CURRENT);
  assert.equal(normalizePasswordSessionAction('sign_out_all'), PASSWORD_SESSION_ACTIONS.SIGN_OUT_ALL);
  assert.throws(() => normalizePasswordSessionAction('keep_every_device'), /Choose whether to stay signed in/i);
});

test('password change session choice is implemented across the server, web, and mobile clients', () => {
  const serverRoute = fs.readFileSync(path.resolve(__dirname, '../routes/auth.js'), 'utf8');
  const webSettings = fs.readFileSync(path.resolve(__dirname, '../../web/react-app/src/components/settings/SecuritySettings.jsx'), 'utf8');
  const mobileSettings = fs.readFileSync(path.resolve(__dirname, '../../mobile/src/screens/SecurityScreen.js'), 'utf8');
  const mobileAuth = fs.readFileSync(path.resolve(__dirname, '../../mobile/src/services/authService.js'), 'utf8');

  assert.match(serverRoute, /sessionAction === PASSWORD_SESSION_ACTIONS\.SIGN_OUT_ALL/);
  assert.match(serverRoute, /signOutRequired: true/);
  assert.match(serverRoute, /signOutRequired: false/);
  assert.match(webSettings, /Stay signed in on this device/);
  assert.match(webSettings, /Sign out all devices/);
  assert.match(mobileSettings, /Stay signed in on this device/);
  assert.match(mobileSettings, /Sign out all devices/);
  assert.match(mobileAuth, /removeItems\(\[STORAGE_KEYS\.AUTH_TOKEN, STORAGE_KEYS\.SESSION\]\)/);
});

test('phone changes verify the proposed number before replacing the registered number on every client', () => {
  const serverRoute = fs.readFileSync(path.resolve(__dirname, '../routes/auth.js'), 'utf8');
  const webSettings = fs.readFileSync(path.resolve(__dirname, '../../web/react-app/src/components/settings/ProfileSettings.jsx'), 'utf8');
  const mobileSettings = fs.readFileSync(path.resolve(__dirname, '../../mobile/src/screens/SecurityScreen.js'), 'utf8');
  const mobileStore = fs.readFileSync(path.resolve(__dirname, '../../mobile/src/data/dataStore.js'), 'utf8');
  const mobileAuth = fs.readFileSync(path.resolve(__dirname, '../../mobile/src/services/authService.js'), 'utf8');

  assert.match(serverRoute, /issueOtp\('change-phone', employeeId, phone\)/);
  assert.match(serverRoute, /verifyAndConsumeOtp\('change-phone', employeeId, phone, code\)/);
  assert.match(serverRoute, /router\.post\('\/change-phone\/verify'/);
  assert.match(serverRoute, /phoneVerifiedAt: now/);
  assert.match(serverRoute, /pendingFirstLoginVerification: false/);
  assert.match(webSettings, /Your current number remains registered until the SMS code sent to the new number is verified/);
  assert.match(webSettings, /\/auth\/change-phone\/verify/);
  assert.match(mobileSettings, /current number stays registered until a code sent to the new number is successfully verified/);
  assert.match(mobileSettings, /Verify &amp; Update Number/);
  assert.match(mobileStore, /confirmUserMobileNumberChange/);
  assert.match(mobileAuth, /verifyPhoneChangeWithServer/);
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

test('missing and forged bearer credentials are rejected', async () => {
  for (const authorization of ['', 'Bearer forged.value.here']) {
    const req = { headers: { authorization }, session: {} };
    const res = responseRecorder();
    let nextCalled = false;
    await requireAuth(req, res, () => { nextCalled = true; });
    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.code, 'UNAUTHENTICATED');
  }
});

test('a server-issued bearer is verifiable but cannot cross a role guard', () => {
  const user = {
    employeeId: '04000001',
    name: 'Member',
    role: 'Farm Member',
    roleKey: 'member',
    phoneVerified: true,
    requiresPasswordChange: false
  };
  const verified = verifyToken(issueToken(user, 'member'));
  assert.equal(verified.employeeId, user.employeeId);
  const req = { session: { user } };

  const roleRes = responseRecorder();
  let authorized = false;
  requireRole([ROLES.SUPER_ADMIN])(req, roleRes, () => { authorized = true; });
  assert.equal(authorized, false);
  assert.equal(roleRes.statusCode, 403);
  assert.equal(roleRes.body.code, 'FORBIDDEN');
});

test('web role routing uses exact canonical mappings without substring collisions', async () => {
  const webAuthRouting = await import(pathToFileURL(path.resolve(__dirname, '../../web/react-app/src/utils/authRouting.js')).href);
  const aliases = {
    'Super Admin': 'superadmin',
    SUPER_ADMIN: 'superadmin',
    'super-admin': 'superadmin',
    'SRA Admin': 'admin',
    SRA_ADMIN: 'admin',
    'sra-admin': 'admin',
    'Farm Manager': 'manager',
    FARM_MANAGER: 'manager',
    'Farm Member': 'member',
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

test('React routes wait for session resolution and use the exact role guard', () => {
  const appSource = fs.readFileSync(path.resolve(__dirname, '../../web/react-app/src/App.jsx'), 'utf8');
  const authSource = fs.readFileSync(path.resolve(__dirname, '../../web/react-app/src/context/AuthContext.jsx'), 'utf8');
  assert.match(appSource, /function RoleRoute\(\{ allowed, children \}\)/);
  assert.match(appSource, /if \(isLoading\) return null/);
  assert.match(appSource, /allowed\.includes\(roleKey\)/);
  assert.match(appSource, /<AuthProvider>/);
  assert.match(authSource, /roleKeyFromUser\(/);
  assert.match(authSource, /refreshSession/);
  assert.doesNotMatch(appSource, /roleLower\.includes\(/);
});

test('production login surfaces cannot manufacture development sessions or seed farm data', () => {
  const webLogin = fs.readFileSync(path.resolve(__dirname, '../../web/react-app/src/views/LoginView.jsx'), 'utf8');
  const webApp = fs.readFileSync(path.resolve(__dirname, '../../web/react-app/src/App.jsx'), 'utf8');
  const mobileLogin = fs.readFileSync(path.resolve(__dirname, '../../mobile/src/screens/auth/LoginScreen.js'), 'utf8');
  const mobileStore = fs.readFileSync(path.resolve(__dirname, '../../mobile/src/data/dataStore.js'), 'utf8');
  const mobileSyncMonitor = fs.readFileSync(path.resolve(__dirname, '../../mobile/src/screens/SyncMonitorScreen.js'), 'utf8');
  const runtime = [webLogin, webApp, mobileLogin, mobileStore, mobileSyncMonitor].join('\n');

  assert.doesNotMatch(runtime, /dev-mock-session-token|Development Role Preview|fastLoginRole|handleQuickRoleSwitch/);
  assert.doesNotMatch(runtime, /DEV-FLD-001|DEV-BF-001/);
  assert.doesNotMatch(webApp, /ComponentShowcaseView|path="\/showcase"/);
});

test('server-scoped users subscription updates the directory but never the authenticated identity', () => {
  const usersService = fs.readFileSync(path.resolve(__dirname, '../../web/react-app/src/services/usersService.js'), 'utf8');
  assert.match(usersService, /subscribeToAuthenticatedResource\('\/api\/users'/);
  assert.match(usersService, /onUpdate\(\{ users: active, pendingUsers,/);
  assert.doesNotMatch(usersService, /hugpong_user|setUser\(|saveSession\(|localStorage/);
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

test('verification-code send budgets allow three codes per hour with a persistent resend cooldown', () => {
  const now = Date.parse('2026-09-28T00:00:00.000Z');
  const policy = { max: 3, windowMs: 60 * 60 * 1000, minIntervalMs: 60 * 1000 };
  const first = rateLimitTestHelpers.evaluateRateLimitState({}, { now, ...policy });
  assert.equal(first.accepted, true);
  assert.equal(first.count, 1);
  assert.equal(first.remaining, 2);
  assert.equal(first.retryAfterSeconds, 60);

  const storedFirst = {
    count: first.count,
    windowEndsAtMs: first.windowEndsAtMs,
    lastAcceptedAtMs: first.lastAcceptedAtMs
  };
  const earlyRetry = rateLimitTestHelpers.evaluateRateLimitState(storedFirst, { now: now + 1000, ...policy });
  assert.equal(earlyRetry.accepted, false);
  assert.equal(earlyRetry.reason, 'COOLDOWN');
  assert.equal(earlyRetry.count, 1);

  const second = rateLimitTestHelpers.evaluateRateLimitState(storedFirst, { now: now + 60 * 1000, ...policy });
  assert.equal(second.accepted, true);
  assert.equal(second.remaining, 1);
  const third = rateLimitTestHelpers.evaluateRateLimitState({
    count: second.count,
    windowEndsAtMs: second.windowEndsAtMs,
    lastAcceptedAtMs: second.lastAcceptedAtMs
  }, { now: now + 120 * 1000, ...policy });
  assert.equal(third.accepted, true);
  assert.equal(third.count, 3);
  assert.equal(third.remaining, 0);
  assert.equal(third.retryAfterSeconds, 60 * 60);

  const hourlyBlock = rateLimitTestHelpers.evaluateRateLimitState({
    count: third.count,
    windowEndsAtMs: third.windowEndsAtMs,
    lastAcceptedAtMs: third.lastAcceptedAtMs
  }, { now: now + 180 * 1000, ...policy });
  assert.equal(hourlyBlock.accepted, false);
  assert.equal(hourlyBlock.reason, 'WINDOW_LIMIT');
  assert.equal(hourlyBlock.retryAfterSeconds, 59 * 60);

  const nextHour = rateLimitTestHelpers.evaluateRateLimitState({
    count: third.count,
    windowEndsAtMs: third.windowEndsAtMs,
    lastAcceptedAtMs: third.lastAcceptedAtMs
  }, { now: now + (2 * 60 * 1000) + policy.windowMs, ...policy });
  assert.equal(nextHour.accepted, true);
  assert.equal(nextHour.count, 1);
  assert.equal(nextHour.remaining, 2);
});

test('login attempt budget starts a 15-minute lock on the fifth reserved attempt', () => {
  const startedAt = Date.parse('2026-09-28T00:00:00.000Z');
  const policy = { max: 5, windowMs: 15 * 60 * 1000 };
  let stored = {};
  let fifth;

  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const evaluated = rateLimitTestHelpers.evaluateRateLimitState(stored, {
      now: startedAt + attempt,
      ...policy
    });
    assert.equal(evaluated.accepted, true);
    assert.equal(evaluated.count, attempt);
    stored = {
      count: evaluated.count,
      windowEndsAtMs: evaluated.windowEndsAtMs,
      lastAcceptedAtMs: evaluated.lastAcceptedAtMs
    };
    fifth = evaluated;
  }

  assert.equal(fifth.remaining, 0);
  assert.equal(fifth.retryAfterSeconds, 15 * 60);
  const blocked = rateLimitTestHelpers.evaluateRateLimitState(stored, {
    now: startedAt + 1000,
    ...policy
  });
  assert.equal(blocked.accepted, false);
  assert.equal(blocked.reason, 'WINDOW_LIMIT');

  const afterLock = rateLimitTestHelpers.evaluateRateLimitState(stored, {
    now: fifth.windowEndsAtMs + 1,
    ...policy
  });
  assert.equal(afterLock.accepted, true);
  assert.equal(afterLock.count, 1);
  assert.equal(afterLock.remaining, 4);
});

test('mobile first-login keeps the code-entry modal available during a resend lock', () => {
  const mobileLogin = fs.readFileSync(path.resolve(__dirname, '../../mobile/src/screens/auth/LoginScreen.js'), 'utf8');
  assert.match(mobileLogin, /request\.code === 'RESEND_COOLDOWN'/);
  assert.match(mobileLogin, /request\.code === 'HOURLY_CODE_LIMIT'/);
  assert.match(mobileLogin, /setShowPhoneVerificationModal\(true\)/);
  assert.match(mobileLogin, /phoneVerificationResendSeconds > 0/);
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

test('Firestore rules deny all client database access and deny unmatched collections', () => {
  const rules = fs.readFileSync(path.resolve(__dirname, '../../firestore.rules'), 'utf8');
  for (const collection of ['users', 'user_credentials', 'account_identifiers', 'block_farms', 'fields', 'crop_cycles', 'operation_logs', 'audit_reports', 'audit_logs', 'sra_prices', 'support_tickets', 'terminal_diagnostics', 'diagnostic_events', 'backup_operations', 'server_sessions', 'security_rate_limits', 'password_recovery_challenges']) {
    assert.match(rules, new RegExp(`match \/${collection}\/\\{documentId\\}[\\s\\S]*?allow read, write: if false;`));
  }
  assert.doesNotMatch(rules, /allow\s+(?:read|write|create|update|delete)(?:\s*,\s*(?:read|write|create|update|delete))*\s*:\s*if\s+(?!false\b)/);
  assert.match(rules, /match \/\{document=\*\*\}[\s\S]*?allow read, write: if false;/);
});

test('canonical Firestore collections deny every client read and write', () => {
  const rules = fs.readFileSync(path.resolve(__dirname, '../../firestore.rules'), 'utf8');
  for (const collection of ['account_identifiers', 'users', 'block_farms', 'fields', 'crop_cycles', 'operation_logs', 'audit_reports', 'audit_logs', 'sra_prices', 'support_tickets', 'terminal_diagnostics']) {
    const block = new RegExp(`match \/${collection}\/\\{[^}]+\\}[\\s\\S]*?allow read, write: if false;`);
    assert.match(rules, block, `${collection} must be server-only`);
  }
});

test('official SRA price publication remains SRA-admin-only and writes the audit ledger', () => {
  const route = fs.readFileSync(path.resolve(__dirname, '../routes/prices.js'), 'utf8');
  const service = fs.readFileSync(path.resolve(__dirname, '../services/priceService.js'), 'utf8');
  assert.match(route, /router\.post\('\/', requireAuth, requireRole\(\[ROLES\.SRA_ADMIN\]\)/);
  assert.match(service, /database\.runTransaction/);
  assert.match(service, /eventType:\s*'SRA_PRICE_PUBLISHED'/);
  assert.match(service, /queueAuditEvent\(transaction/);
});

test('administrator-provisioned accounts verify their own phone and replace the temporary password on first login', () => {
  const userRoute = fs.readFileSync(path.resolve(__dirname, '../routes/users.js'), 'utf8');
  const webForm = fs.readFileSync(path.resolve(__dirname, '../../web/react-app/src/components/users/UserFormModal.jsx'), 'utf8');
  const webUsersService = fs.readFileSync(path.resolve(__dirname, '../../web/react-app/src/services/usersService.js'), 'utf8');
  const webLogin = fs.readFileSync(path.resolve(__dirname, '../../web/react-app/src/views/LoginView.jsx'), 'utf8');
  const mobileLogin = fs.readFileSync(path.resolve(__dirname, '../../mobile/src/screens/auth/LoginScreen.js'), 'utf8');

  assert.match(userRoute, /phoneVerifiedAt: null/);
  assert.match(userRoute, /requiresPasswordChange: true/);
  assert.match(userRoute, /passwordChangedAt: null/);
  assert.doesNotMatch(userRoute, /req\.body\.phoneVerified|personnel-phone|\/phone-verification\/request|\/phone-verification\/verify/);
  assert.doesNotMatch(webForm, /Verify SIM|phoneVerified:|verifyPhoneOtp|requestPhoneVerification/);
  assert.doesNotMatch(webUsersService, /\/api\/users\/phone-verification/);
  assert.match(webForm, /account owner will receive and enter the verification code on first login/i);
  assert.ok(webLogin.indexOf('result.needsVerification') < webLogin.indexOf('result.needsPasswordChange'));
  assert.ok(mobileLogin.indexOf('pendingFirstLoginVerification') < mobileLogin.indexOf('res.requiresPasswordChange'));
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

test('governance and support reads use server-scoped APIs instead of client collection reads', () => {
  const apiClient = fs.readFileSync(path.resolve(__dirname, '../../web/react-app/src/services/apiClient.js'), 'utf8');
  const ticketsService = fs.readFileSync(path.resolve(__dirname, '../../web/react-app/src/services/ticketsService.js'), 'utf8');
  const maintenanceService = fs.readFileSync(path.resolve(__dirname, '../../web/react-app/src/services/maintenanceService.js'), 'utf8');
  const telemetryService = fs.readFileSync(path.resolve(__dirname, '../../web/react-app/src/services/telemetryService.js'), 'utf8');
  const usersService = fs.readFileSync(path.resolve(__dirname, '../../web/react-app/src/services/usersService.js'), 'utf8');
  const mobileStore = fs.readFileSync(path.resolve(__dirname, '../../mobile/src/data/dataStore.js'), 'utf8');

  assert.match(apiClient, /subscribeToAuthenticatedResource/);
  assert.match(ticketsService, /subscribeToAuthenticatedResource\('\/api\/tickets'/);
  assert.match(maintenanceService, /subscribeToAuthenticatedResource\('\/api\/audit-events'/);
  assert.match(maintenanceService, /authenticatedRequest\('\/api\/system-diagnostics'/);
  assert.match(telemetryService, /subscribeToAuthenticatedResource\('\/api\/terminal-diagnostics'/);
  assert.match(usersService, /subscribeToAuthenticatedResource\('\/api\/users'/);
  assert.doesNotMatch([ticketsService, maintenanceService, telemetryService, usersService].join('\n'), /onSnapshot|collection\(db/);
  for (const endpoint of ['/api/block-farms', '/api/fields', '/api/crop-cycles', '/api/logs', '/api/prices', '/api/tickets', '/api/users', '/api/audit-reports', '/api/audit-events']) {
    assert.match(mobileStore, new RegExp(`authenticatedRequest\\('${endpoint}'`));
  }
  assert.doesNotMatch(mobileStore, /firebase\/firestore|onSnapshot|collection\(db|doc\(db/);
});

test('governance API routes enforce role-scoped read boundaries', () => {
  const auditEvents = fs.readFileSync(path.resolve(__dirname, '../routes/auditEvents.js'), 'utf8');
  const telemetry = fs.readFileSync(path.resolve(__dirname, '../routes/telemetry.js'), 'utf8');
  const diagnostics = fs.readFileSync(path.resolve(__dirname, '../routes/systemDiagnostics.js'), 'utf8');
  const server = fs.readFileSync(path.resolve(__dirname, '../server.js'), 'utf8');

  assert.match(auditEvents, /router\.get\('\/', requireAuth, requireRole\(\[ROLES\.FARM_MANAGER, ROLES\.SRA_ADMIN, ROLES\.SUPER_ADMIN\]\)/);
  assert.match(auditEvents, /\.where\('actorUserId', '==', identity\.userId\)/);
  assert.match(auditEvents, /\.where\('blockFarmId', 'in', farmIds\.slice\(index, index \+ 10\)\)/);
  assert.match(telemetry, /const AGRICULTURAL_ROLES = \[ROLES\.MEMBER_FARMER, ROLES\.FARM_MANAGER\]/);
  assert.match(telemetry, /const MONITOR_ROLES = \[\.\.\.AGRICULTURAL_ROLES, ROLES\.SUPER_ADMIN\]/);
  assert.match(telemetry, /router\.get\('\/', requireAuth, requireRole\(MONITOR_ROLES\)/);
  assert.match(telemetry, /router\.post\('\/sync', requireAuth, requireRole\(AGRICULTURAL_ROLES\)/);
  assert.doesNotMatch(telemetry, /MONITOR_ROLES[^\n]*ROLES\.SRA_ADMIN/);
  assert.match(diagnostics, /router\.get\('\/', requireAuth, requireRole\(\[ROLES\.SUPER_ADMIN\]\)/);
  assert.match(server, /app\.use\('\/api\/system-diagnostics', systemDiagnosticsRoutes\)/);
});

test('role platforms are enforced by auth for both web and mobile', () => {
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
    /!isRoleAllowedOnPlatform\(sessionUser\.canonicalRole, clientPlatform\)/,
    'auth /login and /session must enforce the canonical platform matrix'
  );
  assert.match(
    authRouteSource,
    /Super Admin access is restricted to the Web Management Console\./,
    'auth routes must return the exact restriction message'
  );
  assert.match(
    authRouteSource,
    /Farm Member accounts are restricted to the HUGPONG mobile application\./,
    'auth routes must reject MEMBER_FARMER on the web'
  );

  const webAuthSource = fs.readFileSync(path.resolve(__dirname, '../../web/react-app/src/context/AuthContext.jsx'), 'utf8');
  const webApiSource = fs.readFileSync(path.resolve(__dirname, '../../web/react-app/src/services/apiClient.js'), 'utf8');
  const appShellSource = fs.readFileSync(path.resolve(__dirname, '../../web/react-app/src/components/layout/AppShell.jsx'), 'utf8');
  assert.match(webApiSource, /webClientHeaders[\s\S]*'x-client-platform': 'web'/);
  assert.match(webAuthSource, /webClientHeaders\(\)/);
  assert.match(appShellSource, /await logout\(\)[\s\S]*navigate\('\/login', \{ replace: true \}\)/);
});
