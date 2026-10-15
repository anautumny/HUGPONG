'use strict';

process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-only-session-secret-that-is-longer-than-32-characters';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  createAssistedRecoveryRequest,
  assistedRecoveryStatus,
  decideAssistedRecovery,
  completeAssistedRecovery,
  _test
} = require('../services/assistedPasswordRecoveryService');

function memoryFirestore(seed = {}) {
  const records = new Map(Object.entries(seed).map(([key, value]) => [key, structuredClone(value)]));

  function document(collectionName, id) {
    const key = `${collectionName}/${id}`;
    const ref = { id, key, path: key, async get() { return snapshot(ref); } };
    return ref;
  }

  function snapshot(ref) {
    return {
      exists: records.has(ref.key),
      ref,
      id: ref.id,
      data: () => structuredClone(records.get(ref.key))
    };
  }

  function applyCreate(ref, value) {
    if (records.has(ref.key)) throw new Error('already exists');
    records.set(ref.key, structuredClone(value));
  }

  function applyUpdate(ref, value) {
    if (!records.has(ref.key)) throw new Error('missing document');
    records.set(ref.key, { ...records.get(ref.key), ...structuredClone(value) });
  }

  function applySet(ref, value, options = {}) {
    records.set(ref.key, options.merge
      ? { ...(records.get(ref.key) || {}), ...structuredClone(value) }
      : structuredClone(value));
  }

  const database = {
    collection(name) {
      return {
        doc: id => document(name, id),
        where(field, operator, expected) {
          assert.equal(operator, '==');
          let maximum = Infinity;
          return {
            limit(value) { maximum = value; return this; },
            async get() {
              const docs = [];
              for (const [key, value] of records.entries()) {
                if (!key.startsWith(`${name}/`) || value[field] !== expected) continue;
                docs.push(snapshot(document(name, key.slice(name.length + 1))));
                if (docs.length >= maximum) break;
              }
              return { docs };
            }
          };
        }
      };
    },
    batch() {
      const operations = [];
      return {
        create(ref, value) { operations.push(() => applyCreate(ref, value)); },
        update(ref, value) { operations.push(() => applyUpdate(ref, value)); },
        async commit() { operations.forEach(operation => operation()); }
      };
    },
    async runTransaction(work) {
      const transaction = {
        get: ref => ref.get(),
        create: applyCreate,
        update: applyUpdate,
        set: applySet
      };
      return work(transaction);
    },
    _records: records
  };
  return database;
}

const reason = {
  code: 'ID_AND_SIM_IN_PERSON',
  summary: 'The reviewer met the account holder and checked valid identification and the registered SIM.'
};

test('assisted recovery keeps the claimant token secret and completes an approved reset once', async () => {
  const now = Date.parse('2026-10-15T01:00:00.000Z');
  const user = {
    displayName: 'Test Member',
    phone: '09171234567',
    role: 'MEMBER_FARMER',
    affiliatedBlockFarmId: 'BF-TEST',
    status: 'ACTIVE',
    authVersion: 3
  };
  const database = memoryFirestore({
    'users/04000001': user,
    'user_credentials/04000001': { passwordHash: 'old-hash' }
  });
  const mobilePushToken = 'ExpoPushToken[test_device_token_123]';
  const request = await createAssistedRecoveryRequest(database, { userId: '04000001', user, mobilePushToken, now });
  const stored = database._records.get(`password_recovery_reviews/${request.reviewId}`);

  assert.equal(_test.validReviewId(request.reviewId), true);
  assert.equal(stored.registeredPhone, '09171234567');
  assert.equal(stored.status, 'PENDING');
  assert.equal(stored.mobilePushToken, mobilePushToken);
  assert.equal(stored.notificationStatus, 'READY');
  assert.notEqual(stored.claimantDigest, request.claimToken);
  assert.equal(JSON.stringify(stored).includes(request.claimToken), false);
  assert.equal((await assistedRecoveryStatus(database, {
    reviewId: request.reviewId,
    claimToken: 'incorrect-token',
    now
  })).status, 'PENDING');

  const decision = await decideAssistedRecovery(database, {
    reviewId: request.reviewId,
    actorUserId: '02000001',
    approve: true,
    reason,
    now: now + 1000
  });
  assert.equal(decision.mobilePushToken, mobilePushToken);
  assert.equal(database._records.get(`password_recovery_reviews/${request.reviewId}`).notificationStatus, 'PENDING');
  const approved = await assistedRecoveryStatus(database, {
    reviewId: request.reviewId,
    claimToken: request.claimToken,
    now: now + 2000
  });
  assert.equal(approved.status, 'APPROVED');

  const completed = await completeAssistedRecovery(database, {
    reviewId: request.reviewId,
    claimToken: request.claimToken,
    passwordHash: 'new-scrypt-hash',
    now: now + 3000
  });
  assert.equal(completed.userId, '04000001');
  assert.equal(database._records.get('users/04000001').authVersion, 4);
  assert.equal(database._records.get('user_credentials/04000001').passwordHash, 'new-scrypt-hash');
  assert.equal(database._records.get(`password_recovery_reviews/${request.reviewId}`).status, 'USED');
  assert.equal(Array.from(database._records.keys()).some(key => key.startsWith('audit_logs/')), true);

  await assert.rejects(
    completeAssistedRecovery(database, {
      reviewId: request.reviewId,
      claimToken: request.claimToken,
      passwordHash: 'attacker-hash',
      now: now + 4000
    }),
    /invalid or expired/i
  );
  assert.equal(database._records.get('user_credentials/04000001').passwordHash, 'new-scrypt-hash');
});

test('rejected and replaced requests remain visible only to their claimant', async () => {
  const now = Date.parse('2026-10-15T02:00:00.000Z');
  const user = {
    displayName: 'Test Member',
    phone: '09171234567',
    role: 'MEMBER_FARMER',
    status: 'ACTIVE',
    authVersion: 1
  };
  const database = memoryFirestore({ 'users/04000001': user });
  const first = await createAssistedRecoveryRequest(database, { userId: '04000001', user, now });
  const second = await createAssistedRecoveryRequest(database, { userId: '04000001', user, now: now + 1000 });
  assert.equal((await assistedRecoveryStatus(database, {
    reviewId: first.reviewId,
    claimToken: first.claimToken,
    now: now + 2000
  })).status, 'REPLACED');

  await decideAssistedRecovery(database, {
    reviewId: second.reviewId,
    actorUserId: '03000001',
    approve: false,
    reason,
    now: now + 3000
  });
  assert.equal((await assistedRecoveryStatus(database, {
    reviewId: second.reviewId,
    claimToken: second.claimToken,
    now: now + 4000
  })).status, 'REJECTED');
  assert.equal((await assistedRecoveryStatus(database, {
    reviewId: second.reviewId,
    claimToken: 'not-the-claimant',
    now: now + 4000
  })).status, 'PENDING');
});

test('Smart/TNT assisted recovery has server-authoritative Web and Mobile parity', () => {
  const root = path.resolve(__dirname, '..', '..');
  const route = fs.readFileSync(path.join(root, 'server/routes/auth.js'), 'utf8');
  const reviewRoute = fs.readFileSync(path.join(root, 'server/routes/recoveryReviews.js'), 'utf8');
  const web = fs.readFileSync(path.join(root, 'web/react-app/src/components/auth/AccountRecoveryModal.jsx'), 'utf8');
  const mobileService = fs.readFileSync(path.join(root, 'mobile/src/services/authService.js'), 'utf8');
  const mobile = fs.readFileSync(path.join(root, 'mobile/src/screens/auth/ForgotPasswordScreen.js'), 'utf8');
  const rules = fs.readFileSync(path.join(root, 'firestore.rules'), 'utf8');

  for (const endpoint of ['request', 'status', 'complete']) {
    assert.match(route, new RegExp(`'/password-recovery-review/${endpoint}'`));
    assert.match(web, new RegExp(`/auth/password-recovery-review/${endpoint}`));
    assert.match(mobileService, new RegExp(`/auth/password-recovery-review/${endpoint}`));
  }
  assert.match(reviewRoute, /assertPhoneVerificationAuthority/);
  assert.match(reviewRoute, /ID_AND_SIM_IN_PERSON|resolvePhoneVerificationReason/);
  assert.match([web, mobile].join('\n'), /Smart\/TNT/);
  assert.match(rules, /match \/password_recovery_reviews\/\{documentId\}[\s\S]*allow read, write: if false/);
});
