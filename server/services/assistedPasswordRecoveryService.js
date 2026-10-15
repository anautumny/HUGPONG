'use strict';

const crypto = require('crypto');
const { sessionSecret } = require('../config');
const { COLLECTIONS, canonicalRole } = require('../schema/firestoreSchema');
const { authVersionOf, nextAuthVersion } = require('../security/accountSecurity');
const { queueAuditEvent } = require('./auditWriter');

const REVIEW_REQUEST_TTL_MS = 24 * 60 * 60 * 1000;
const REVIEW_APPROVAL_TTL_MS = 15 * 60 * 1000;
const REVIEW_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

function recoveryReviewError(message, status = 400, code = 'RECOVERY_REVIEW_INVALID') {
  return Object.assign(new Error(message), { status, code });
}

function createReviewId() {
  return `PRR-${crypto.randomBytes(10).toString('hex').toUpperCase()}`;
}

function createClaimToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function claimDigest(reviewId, token) {
  return crypto.createHmac('sha256', sessionSecret)
    .update(`assisted-password-recovery:${reviewId}:${String(token || '')}`)
    .digest('hex');
}

function secureMatch(expected, supplied) {
  if (!/^[a-f0-9]{64}$/i.test(String(expected || '')) || !/^[a-f0-9]{64}$/i.test(String(supplied || ''))) return false;
  return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(supplied, 'hex'));
}

function validReviewId(value) {
  return /^PRR-[A-F0-9]{20}$/.test(String(value || '').trim());
}

function statusMessage(status) {
  if (status === 'APPROVED') return 'Identity review approved. Create your new password before the authorization expires.';
  if (status === 'REJECTED') return 'The recovery request was not approved. Contact your authorized administrator in person.';
  if (status === 'EXPIRED') return 'This recovery request expired. Start a new request if you still need help.';
  if (status === 'REPLACED') return 'A newer recovery request replaced this one. Continue from the newest request.';
  if (status === 'USED') return 'This recovery authorization has already been used.';
  return 'The recovery request is awaiting authorized identity review.';
}

async function createAssistedRecoveryRequest(database, { userId, user, mobilePushToken = null, now = Date.now() }) {
  if (!database || !userId || !user || user.status !== 'ACTIVE') return null;
  const reviewId = createReviewId();
  const claimToken = createClaimToken();
  const requestedAt = new Date(now).toISOString();
  const expiresAtMs = now + REVIEW_REQUEST_TTL_MS;
  const prior = await database.collection(COLLECTIONS.PASSWORD_RECOVERY_REVIEWS)
    .where('userId', '==', String(userId))
    .limit(50)
    .get();
  const batch = database.batch();
  prior.docs.forEach(document => {
    if (['PENDING', 'APPROVED'].includes(String(document.data()?.status || ''))) {
      batch.update(document.ref, {
        status: 'REPLACED',
        mobilePushToken: null,
        notificationStatus: 'NOT_REQUESTED',
        updatedAt: requestedAt
      });
    }
  });
  batch.create(database.collection(COLLECTIONS.PASSWORD_RECOVERY_REVIEWS).doc(reviewId), {
    userId: String(userId),
    displayName: String(user.displayName || '').trim(),
    registeredPhone: String(user.phone || '').trim(),
    role: canonicalRole(user.role),
    blockFarmId: String(user.affiliatedBlockFarmId || user.requestedBlockFarmId || '').trim().toUpperCase() || null,
    accountAuthVersion: authVersionOf(user),
    status: 'PENDING',
    mobilePushToken: mobilePushToken || null,
    notificationStatus: mobilePushToken ? 'READY' : 'NOT_REQUESTED',
    notificationAttemptedAt: null,
    notificationTicketId: null,
    notificationErrorCode: null,
    claimantDigest: claimDigest(reviewId, claimToken),
    requestedAt,
    expiresAt: new Date(expiresAtMs).toISOString(),
    expiresAtMs,
    approvedAt: null,
    approvedByUserId: null,
    approvalExpiresAt: null,
    approvalExpiresAtMs: null,
    rejectedAt: null,
    rejectedByUserId: null,
    reviewReasonCode: null,
    reviewReason: null,
    usedAt: null,
    updatedAt: requestedAt,
    deleteAfter: new Date(now + REVIEW_RETENTION_MS),
    deleteAfterMs: now + REVIEW_RETENTION_MS
  });
  await batch.commit();
  return { reviewId, claimToken, expiresAt: new Date(expiresAtMs).toISOString() };
}

async function assistedRecoveryStatus(database, { reviewId, claimToken, now = Date.now() }) {
  const normalizedId = String(reviewId || '').trim();
  if (!database || !validReviewId(normalizedId) || !claimToken) return { status: 'PENDING' };
  const snapshot = await database.collection(COLLECTIONS.PASSWORD_RECOVERY_REVIEWS).doc(normalizedId).get();
  if (!snapshot.exists) return { status: 'PENDING' };
  const review = snapshot.data();
  if (!secureMatch(review.claimantDigest, claimDigest(normalizedId, claimToken))) return { status: 'PENDING' };
  if (Number(review.expiresAtMs || 0) <= now && review.status === 'PENDING') {
    return { status: 'EXPIRED', reviewId: normalizedId, message: statusMessage('EXPIRED') };
  }
  if (review.status === 'APPROVED' && Number(review.approvalExpiresAtMs || 0) <= now) {
    return { status: 'EXPIRED', reviewId: normalizedId, message: statusMessage('EXPIRED') };
  }
  const status = String(review.status || 'PENDING');
  return {
    status,
    reviewId: normalizedId,
    requestedAt: review.requestedAt || null,
    expiresAt: review.status === 'APPROVED' ? review.approvalExpiresAt : review.expiresAt,
    message: statusMessage(status)
  };
}

async function decideAssistedRecovery(database, {
  reviewId,
  actorUserId,
  approve,
  reason,
  now = Date.now()
}) {
  const normalizedId = String(reviewId || '').trim();
  if (!database || !validReviewId(normalizedId)) throw recoveryReviewError('Recovery review reference is invalid.');
  const ref = database.collection(COLLECTIONS.PASSWORD_RECOVERY_REVIEWS).doc(normalizedId);
  const decidedAt = new Date(now).toISOString();
  let mobilePushToken = null;
  await database.runTransaction(async transaction => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) throw recoveryReviewError('Recovery review was not found.', 404, 'RECOVERY_REVIEW_NOT_FOUND');
    const review = snapshot.data();
    mobilePushToken = review.mobilePushToken || null;
    if (review.status !== 'PENDING' || Number(review.expiresAtMs || 0) <= now) {
      throw recoveryReviewError('Recovery review is no longer pending.', 409, 'RECOVERY_REVIEW_NOT_PENDING');
    }
    if (approve) {
      transaction.update(ref, {
        status: 'APPROVED',
        approvedAt: decidedAt,
        approvedByUserId: actorUserId,
        approvalExpiresAt: new Date(now + REVIEW_APPROVAL_TTL_MS).toISOString(),
        approvalExpiresAtMs: now + REVIEW_APPROVAL_TTL_MS,
        reviewReasonCode: reason.code,
        reviewReason: reason.summary,
        notificationStatus: mobilePushToken ? 'PENDING' : 'NOT_REQUESTED',
        updatedAt: decidedAt
      });
    } else {
      transaction.update(ref, {
        status: 'REJECTED',
        rejectedAt: decidedAt,
        rejectedByUserId: actorUserId,
        reviewReasonCode: reason.code,
        reviewReason: reason.summary,
        notificationStatus: mobilePushToken ? 'PENDING' : 'NOT_REQUESTED',
        updatedAt: decidedAt
      });
    }
    queueAuditEvent(transaction, database, {
      eventType: approve ? 'PASSWORD_RECOVERY_REVIEW_APPROVED' : 'PASSWORD_RECOVERY_REVIEW_REJECTED',
      actorUserId,
      entityType: 'USER',
      entityId: review.userId,
      blockFarmId: review.blockFarmId,
      details: `${approve ? 'Approved' : 'Rejected'} assisted password recovery for account ${review.userId} after authorized identity review.`,
      createdAt: decidedAt
    });
  });
  return { reviewId: normalizedId, status: approve ? 'APPROVED' : 'REJECTED', mobilePushToken };
}

async function completeAssistedRecovery(database, {
  reviewId,
  claimToken,
  passwordHash,
  now = Date.now()
}) {
  const normalizedId = String(reviewId || '').trim();
  if (!database || !validReviewId(normalizedId) || !claimToken || !passwordHash) throw recoveryReviewError();
  const reviewRef = database.collection(COLLECTIONS.PASSWORD_RECOVERY_REVIEWS).doc(normalizedId);
  const completedAt = new Date(now).toISOString();
  const suppliedDigest = claimDigest(normalizedId, claimToken);
  const result = await database.runTransaction(async transaction => {
    const reviewSnapshot = await transaction.get(reviewRef);
    if (!reviewSnapshot.exists) return { success: false };
    const review = reviewSnapshot.data();
    const userRef = database.collection(COLLECTIONS.USERS).doc(String(review.userId || ''));
    const userSnapshot = await transaction.get(userRef);
    if (!userSnapshot.exists) return { success: false };
    const user = userSnapshot.data();
    const valid = review.status === 'APPROVED'
      && Number(review.approvalExpiresAtMs || 0) > now
      && secureMatch(review.claimantDigest, suppliedDigest)
      && user.status === 'ACTIVE'
      && authVersionOf(user) === Number(review.accountAuthVersion || 1);
    if (!valid) return { success: false };
    const nextVersion = nextAuthVersion(user);
    transaction.set(database.collection(COLLECTIONS.USER_CREDENTIALS).doc(userSnapshot.id), {
      passwordHash,
      credentialsUpdatedAt: completedAt,
      updatedAt: completedAt
    }, { merge: true });
    transaction.update(userRef, {
      requiresPasswordChange: false,
      passwordChangedAt: completedAt,
      credentialsUpdatedAt: completedAt,
      authVersion: nextVersion,
      updatedAt: completedAt
    });
    transaction.update(reviewRef, {
      status: 'USED',
      mobilePushToken: null,
      claimantDigest: null,
      usedAt: completedAt,
      updatedAt: completedAt
    });
    queueAuditEvent(transaction, database, {
      eventType: 'USER_PASSWORD_RESET',
      actorUserId: userSnapshot.id,
      entityType: 'USER',
      entityId: userSnapshot.id,
      blockFarmId: review.blockFarmId,
      details: `Reset the password for account ${userSnapshot.id} through approved assisted recovery. All devices were signed out.`,
      createdAt: completedAt
    });
    return { success: true, userId: userSnapshot.id };
  });
  if (!result.success) throw recoveryReviewError('The recovery approval is invalid or expired.', 400, 'RECOVERY_REVIEW_INVALID');
  return result;
}

module.exports = {
  REVIEW_REQUEST_TTL_MS,
  REVIEW_APPROVAL_TTL_MS,
  createAssistedRecoveryRequest,
  assistedRecoveryStatus,
  decideAssistedRecovery,
  completeAssistedRecovery,
  _test: { createReviewId, createClaimToken, claimDigest, secureMatch, validReviewId }
};
