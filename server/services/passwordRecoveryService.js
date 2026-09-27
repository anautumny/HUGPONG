'use strict';

const crypto = require('crypto');
const { sessionSecret } = require('../config');
const { COLLECTIONS } = require('../schema/firestoreSchema');
const { authVersionOf, nextAuthVersion } = require('../security/accountSecurity');
const { queueAuditEvent } = require('./auditWriter');

const RECOVERY_CODE_TTL_MS = 10 * 60 * 1000;
const RESET_GRANT_TTL_MS = 5 * 60 * 1000;
const RECOVERY_RETENTION_MS = 24 * 60 * 60 * 1000;
const MAX_RECOVERY_ATTEMPTS = 5;
const INVALID_RECOVERY_MESSAGE = 'The recovery code or reset session is invalid or expired.';

function recoveryError(message = INVALID_RECOVERY_MESSAGE, code = 'PASSWORD_RECOVERY_INVALID') {
  const error = new Error(message);
  error.code = code;
  error.status = 400;
  return error;
}

function createRecoveryId() {
  return crypto.randomBytes(32).toString('base64url');
}

function createRecoveryCode() {
  return String(crypto.randomInt(100000, 1000000));
}

function createResetToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function secretDigest(kind, recoveryId, secret) {
  return crypto
    .createHmac('sha256', sessionSecret)
    .update(`${kind}:${recoveryId}:${String(secret || '')}`)
    .digest('hex');
}

function secureDigestMatch(expected, supplied) {
  if (!/^[a-f0-9]{64}$/i.test(String(expected || '')) || !/^[a-f0-9]{64}$/i.test(String(supplied || ''))) {
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(supplied, 'hex'));
}

function validRecoveryId(value) {
  return /^[A-Za-z0-9_-]{40,100}$/.test(String(value || '').trim());
}

async function createPasswordRecoveryChallenge(database, {
  userId,
  authVersion,
  channel = 'SMS',
  now = Date.now()
}) {
  if (!database || !userId) throw new Error('Password recovery storage is unavailable.');
  const recoveryId = createRecoveryId();
  const code = createRecoveryCode();
  const expiresAtMs = now + RECOVERY_CODE_TTL_MS;
  const ref = database.collection(COLLECTIONS.PASSWORD_RECOVERY_CHALLENGES).doc(recoveryId);
  await ref.create({
    userId: String(userId),
    accountAuthVersion: Number(authVersion || 1),
    channel,
    purpose: 'PASSWORD_RESET',
    status: 'PENDING',
    codeDigest: secretDigest('code', recoveryId, code),
    attemptCount: 0,
    maxAttempts: MAX_RECOVERY_ATTEMPTS,
    expiresAt: new Date(expiresAtMs).toISOString(),
    expiresAtMs,
    // Firestore TTL policies require an actual timestamp value.
    deleteAfter: new Date(now + RECOVERY_RETENTION_MS),
    deleteAfterMs: now + RECOVERY_RETENTION_MS,
    createdAt: new Date(now).toISOString(),
    updatedAt: new Date(now).toISOString()
  });
  return { recoveryId, code, expiresAt: new Date(expiresAtMs).toISOString() };
}

async function revokePasswordRecoveryChallenge(database, recoveryId, now = Date.now()) {
  if (!database || !validRecoveryId(recoveryId)) return;
  await database.collection(COLLECTIONS.PASSWORD_RECOVERY_CHALLENGES).doc(recoveryId).set({
    status: 'REVOKED',
    codeDigest: null,
    grantDigest: null,
    updatedAt: new Date(now).toISOString()
  }, { merge: true });
}

function isPasswordRecoveryEligible(user, phone) {
  return Boolean(user && user.status === 'ACTIVE' && /^09\d{9}$/.test(String(phone || '')));
}

async function dispatchPasswordRecoveryChallenge(database, {
  user,
  phone,
  sendCode,
  now = Date.now()
}) {
  if (!isPasswordRecoveryEligible(user, phone)) return null;
  if (typeof sendCode !== 'function') throw new Error('Password recovery delivery is unavailable.');
  const challenge = await createPasswordRecoveryChallenge(database, {
    userId: user.id,
    authVersion: authVersionOf(user),
    now
  });
  try {
    await sendCode(challenge.code);
    return challenge;
  } catch (error) {
    await revokePasswordRecoveryChallenge(database, challenge.recoveryId, now).catch(() => {});
    throw error;
  }
}

async function verifyPasswordRecoveryCode(database, { recoveryId, code, now = Date.now() }) {
  const normalizedId = String(recoveryId || '').trim();
  const normalizedCode = String(code || '').trim();
  if (!database || !validRecoveryId(normalizedId) || !/^\d{6}$/.test(normalizedCode)) {
    throw recoveryError();
  }

  const resetToken = createResetToken();
  const challengeRef = database.collection(COLLECTIONS.PASSWORD_RECOVERY_CHALLENGES).doc(normalizedId);
  const result = await database.runTransaction(async transaction => {
    const challengeSnapshot = await transaction.get(challengeRef);
    if (!challengeSnapshot.exists) return { success: false };
    const challenge = challengeSnapshot.data();
    const userRef = database.collection(COLLECTIONS.USERS).doc(String(challenge.userId || ''));
    const userSnapshot = await transaction.get(userRef);
    const accountIsCurrent = userSnapshot.exists
      && userSnapshot.data().status === 'ACTIVE'
      && authVersionOf(userSnapshot.data()) === Number(challenge.accountAuthVersion || 1);
    const attemptCount = Number(challenge.attemptCount || 0);
    const challengeIsActive = challenge.status === 'PENDING'
      && Number(challenge.expiresAtMs || 0) > now
      && attemptCount < MAX_RECOVERY_ATTEMPTS
      && accountIsCurrent;

    if (!challengeIsActive) {
      if (challenge.status === 'PENDING') {
        transaction.update(challengeRef, {
          status: 'EXPIRED',
          codeDigest: null,
          updatedAt: new Date(now).toISOString()
        });
      }
      return { success: false };
    }

    const suppliedDigest = secretDigest('code', normalizedId, normalizedCode);
    if (!secureDigestMatch(challenge.codeDigest, suppliedDigest)) {
      const nextAttemptCount = attemptCount + 1;
      transaction.update(challengeRef, {
        attemptCount: nextAttemptCount,
        status: nextAttemptCount >= MAX_RECOVERY_ATTEMPTS ? 'LOCKED' : 'PENDING',
        ...(nextAttemptCount >= MAX_RECOVERY_ATTEMPTS ? { codeDigest: null } : {}),
        updatedAt: new Date(now).toISOString()
      });
      return { success: false };
    }

    const grantExpiresAtMs = now + RESET_GRANT_TTL_MS;
    transaction.update(challengeRef, {
      status: 'VERIFIED',
      codeDigest: null,
      grantDigest: secretDigest('grant', normalizedId, resetToken),
      grantExpiresAt: new Date(grantExpiresAtMs).toISOString(),
      grantExpiresAtMs,
      verifiedAt: new Date(now).toISOString(),
      updatedAt: new Date(now).toISOString()
    });
    return { success: true, resetToken, expiresAt: new Date(grantExpiresAtMs).toISOString() };
  });

  if (!result.success) throw recoveryError();
  return result;
}

async function completePasswordRecovery(database, {
  recoveryId,
  resetToken,
  passwordHash,
  now = Date.now()
}) {
  const normalizedId = String(recoveryId || '').trim();
  const normalizedToken = String(resetToken || '').trim();
  if (!database || !validRecoveryId(normalizedId) || !validRecoveryId(normalizedToken) || !passwordHash) {
    throw recoveryError();
  }

  const challengeRef = database.collection(COLLECTIONS.PASSWORD_RECOVERY_CHALLENGES).doc(normalizedId);
  const suppliedGrantDigest = secretDigest('grant', normalizedId, normalizedToken);
  const completedAt = new Date(now).toISOString();
  const result = await database.runTransaction(async transaction => {
    const challengeSnapshot = await transaction.get(challengeRef);
    if (!challengeSnapshot.exists) return { success: false };
    const challenge = challengeSnapshot.data();
    const userId = String(challenge.userId || '');
    const userRef = database.collection(COLLECTIONS.USERS).doc(userId);
    const userSnapshot = await transaction.get(userRef);
    if (!userSnapshot.exists) return { success: false };
    const user = userSnapshot.data();
    const grantIsValid = challenge.status === 'VERIFIED'
      && Number(challenge.grantExpiresAtMs || 0) > now
      && authVersionOf(user) === Number(challenge.accountAuthVersion || 1)
      && secureDigestMatch(challenge.grantDigest, suppliedGrantDigest)
      && user.status === 'ACTIVE';
    if (!grantIsValid) return { success: false };

    const authVersion = nextAuthVersion(user);
    transaction.set(database.collection(COLLECTIONS.USER_CREDENTIALS).doc(userId), {
      passwordHash,
      credentialsUpdatedAt: completedAt,
      updatedAt: completedAt
    }, { merge: true });
    transaction.update(userRef, {
      phoneVerifiedAt: completedAt,
      requiresPasswordChange: false,
      passwordChangedAt: completedAt,
      credentialsUpdatedAt: completedAt,
      authVersion,
      updatedAt: completedAt
    });
    transaction.update(challengeRef, {
      status: 'USED',
      grantDigest: null,
      usedAt: completedAt,
      updatedAt: completedAt
    });
    queueAuditEvent(transaction, database, {
      eventType: 'USER_PASSWORD_RESET',
      actorUserId: userId,
      entityType: 'USER',
      entityId: userId,
      details: `Reset the password for account ${userId} through verified recovery. All devices were signed out.`,
      createdAt: completedAt
    });
    return { success: true, userId, authVersion, phone: user.phone || '' };
  });

  if (!result.success) throw recoveryError();
  return result;
}

module.exports = {
  RECOVERY_CODE_TTL_MS,
  RESET_GRANT_TTL_MS,
  MAX_RECOVERY_ATTEMPTS,
  INVALID_RECOVERY_MESSAGE,
  createPasswordRecoveryChallenge,
  revokePasswordRecoveryChallenge,
  isPasswordRecoveryEligible,
  dispatchPasswordRecoveryChallenge,
  verifyPasswordRecoveryCode,
  completePasswordRecovery,
  _test: {
    createRecoveryId,
    createRecoveryCode,
    createResetToken,
    secretDigest,
    secureDigestMatch,
    validRecoveryId
  }
};
