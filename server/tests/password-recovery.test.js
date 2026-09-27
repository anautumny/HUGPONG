'use strict';

process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-only-session-secret-that-is-longer-than-32-characters';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  createPasswordRecoveryChallenge,
  dispatchPasswordRecoveryChallenge,
  verifyPasswordRecoveryCode,
  completePasswordRecovery,
  _test
} = require('../services/passwordRecoveryService');

function memoryFirestore(seed = {}) {
  const records = new Map(Object.entries(seed).map(([key, value]) => [key, structuredClone(value)]));

  function snapshot(key, ref) {
    return {
      exists: records.has(key),
      ref,
      id: key.split('/').pop(),
      data: () => structuredClone(records.get(key))
    };
  }

  function document(collectionName, id) {
    const key = `${collectionName}/${id}`;
    const ref = {
      id,
      key,
      async get() { return snapshot(key, ref); },
      async create(value) {
        if (records.has(key)) throw new Error('already exists');
        records.set(key, structuredClone(value));
      },
      async set(value, options = {}) {
        records.set(key, options.merge
          ? { ...(records.get(key) || {}), ...structuredClone(value) }
          : structuredClone(value));
      }
    };
    return ref;
  }

  const database = {
    collection(name) {
      return { doc: id => document(name, id) };
    },
    async runTransaction(work) {
      const transaction = {
        get: ref => ref.get(),
        create(ref, value) {
          if (records.has(ref.key)) throw new Error('already exists');
          records.set(ref.key, structuredClone(value));
        },
        set(ref, value, options = {}) {
          records.set(ref.key, options.merge
            ? { ...(records.get(ref.key) || {}), ...structuredClone(value) }
            : structuredClone(value));
        },
        update(ref, value) {
          if (!records.has(ref.key)) throw new Error('missing document');
          records.set(ref.key, { ...records.get(ref.key), ...structuredClone(value) });
        }
      };
      return work(transaction);
    },
    _records: records
  };
  return database;
}

test('password recovery secrets are random, well-formed, and never stored in plaintext', async () => {
  const database = memoryFirestore({
    'users/04000001': { status: 'ACTIVE', authVersion: 1, phone: '09171234567' }
  });
  const now = Date.parse('2026-09-27T00:00:00.000Z');
  const challenge = await createPasswordRecoveryChallenge(database, {
    userId: '04000001',
    authVersion: 1,
    now
  });
  const stored = database._records.get(`password_recovery_challenges/${challenge.recoveryId}`);

  assert.equal(_test.validRecoveryId(challenge.recoveryId), true);
  assert.match(challenge.code, /^\d{6}$/);
  assert.notEqual(stored.codeDigest, challenge.code);
  assert.equal(JSON.stringify(stored).includes(challenge.code), false);
  assert.equal(stored.status, 'PENDING');
  assert.equal(stored.expiresAtMs > now, true);
});

test('missing, inactive, and invalid-phone accounts never dispatch an SMS code', async () => {
  let deliveryCount = 0;
  const sendCode = async () => { deliveryCount += 1; };
  const cases = [
    { user: null, phone: '' },
    { user: { id: '04000001', status: 'DISABLED', authVersion: 1 }, phone: '09171234567' },
    { user: { id: '04000001', status: 'ACTIVE', authVersion: 1 }, phone: 'not-a-phone' }
  ];

  for (const entry of cases) {
    const result = await dispatchPasswordRecoveryChallenge(null, { ...entry, sendCode });
    assert.equal(result, null);
  }
  assert.equal(deliveryCount, 0);
});

test('verified recovery is single-use, updates credentials atomically, and advances authVersion', async () => {
  const database = memoryFirestore({
    'users/04000001': { status: 'ACTIVE', authVersion: 4, phone: '09171234567' },
    'user_credentials/04000001': { passwordHash: 'old-hash' }
  });
  const issuedAt = Date.parse('2026-09-27T01:00:00.000Z');
  const challenge = await createPasswordRecoveryChallenge(database, {
    userId: '04000001',
    authVersion: 4,
    now: issuedAt
  });

  await assert.rejects(
    verifyPasswordRecoveryCode(database, { recoveryId: challenge.recoveryId, code: '000000', now: issuedAt + 1000 }),
    /invalid or expired/i
  );
  assert.equal(database._records.get(`password_recovery_challenges/${challenge.recoveryId}`).attemptCount, 1);

  const verified = await verifyPasswordRecoveryCode(database, {
    recoveryId: challenge.recoveryId,
    code: challenge.code,
    now: issuedAt + 2000
  });
  const verifiedRecord = database._records.get(`password_recovery_challenges/${challenge.recoveryId}`);
  assert.equal(verifiedRecord.status, 'VERIFIED');
  assert.equal(verifiedRecord.codeDigest, null);
  assert.notEqual(verifiedRecord.grantDigest, verified.resetToken);

  const completed = await completePasswordRecovery(database, {
    recoveryId: challenge.recoveryId,
    resetToken: verified.resetToken,
    passwordHash: 'new-scrypt-hash',
    now: issuedAt + 3000
  });
  assert.equal(completed.userId, '04000001');
  assert.equal(database._records.get('users/04000001').authVersion, 5);
  assert.equal(database._records.get('users/04000001').phoneVerifiedAt, new Date(issuedAt + 3000).toISOString());
  assert.equal(database._records.get('user_credentials/04000001').passwordHash, 'new-scrypt-hash');
  assert.equal(database._records.get(`password_recovery_challenges/${challenge.recoveryId}`).status, 'USED');
  assert.equal(Array.from(database._records.keys()).some(key => key.startsWith('audit_logs/')), true);

  await assert.rejects(
    completePasswordRecovery(database, {
      recoveryId: challenge.recoveryId,
      resetToken: verified.resetToken,
      passwordHash: 'attacker-hash',
      now: issuedAt + 4000
    }),
    /invalid or expired/i
  );
  assert.equal(database._records.get('user_credentials/04000001').passwordHash, 'new-scrypt-hash');
});

test('a password change invalidates every older recovery challenge', async () => {
  const database = memoryFirestore({
    'users/04000001': { status: 'ACTIVE', authVersion: 2, phone: '09171234567' },
    'user_credentials/04000001': { passwordHash: 'old-hash' }
  });
  const issuedAt = Date.parse('2026-09-27T02:00:00.000Z');
  const first = await createPasswordRecoveryChallenge(database, { userId: '04000001', authVersion: 2, now: issuedAt });
  const older = await createPasswordRecoveryChallenge(database, { userId: '04000001', authVersion: 2, now: issuedAt + 1 });
  const verified = await verifyPasswordRecoveryCode(database, { recoveryId: first.recoveryId, code: first.code, now: issuedAt + 1000 });
  await completePasswordRecovery(database, {
    recoveryId: first.recoveryId,
    resetToken: verified.resetToken,
    passwordHash: 'new-hash',
    now: issuedAt + 2000
  });

  await assert.rejects(
    verifyPasswordRecoveryCode(database, { recoveryId: older.recoveryId, code: older.code, now: issuedAt + 3000 }),
    /invalid or expired/i
  );
});

test('recovery is exposed as one server-authoritative flow on Web and Mobile', () => {
  const route = fs.readFileSync(path.resolve(__dirname, '../routes/auth.js'), 'utf8');
  const web = fs.readFileSync(path.resolve(__dirname, '../../web/react-app/src/components/auth/AccountRecoveryModal.jsx'), 'utf8');
  const mobileService = fs.readFileSync(path.resolve(__dirname, '../../mobile/src/services/authService.js'), 'utf8');
  const mobileScreen = fs.readFileSync(path.resolve(__dirname, '../../mobile/src/screens/auth/ForgotPasswordScreen.js'), 'utf8');

  for (const endpoint of ['request', 'verify', 'complete']) {
    assert.match(route, new RegExp(`'/password-recovery/${endpoint}'`));
    assert.match(web, new RegExp(`/auth/password-recovery/${endpoint}`));
    assert.match(mobileService, new RegExp(`/auth/password-recovery/${endpoint}`));
  }
  assert.match(route, /If an active account matches that information/);
  assert.match(route, /passwordRecoveryIpRateLimit, resolvePasswordRecoveryAccount, passwordRecoveryAccountRateLimit/);
  assert.match(route, /VERIFICATION_CODE_SEND_LIMIT = 3/);
  assert.match(route, /VERIFICATION_CODE_RESEND_DELAY_MS = 60 \* 1000/);
  assert.match(route, /VERIFICATION_CODE_WINDOW_MS = 60 \* 60 \* 1000/);
  assert.match(route, /revokeFirebaseSessions\(result\.userId\)/);
  assert.match(web, /Hourly limit reached/);
  assert.match(mobileScreen, /t\('recovery_limit_reached'\)/);
  assert.match(mobileScreen, /t\('recovery_complete_msg'\)/);
  assert.doesNotMatch([web, mobileScreen].join('\n'), /Self-service password reset is (?:not enabled|temporarily unavailable)/i);
});
