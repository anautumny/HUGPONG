'use strict';

const express = require('express');
const router = express.Router();
const { db } = require('../firebase-admin');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/roleGuard');
const { COLLECTIONS, ROLES, canonicalRole, publicRoleLabel } = require('../schema/firestoreSchema');
const { assertPhoneVerificationAuthority, resolvePhoneVerificationReason } = require('../domain/phoneVerificationPolicy');
const { decideAssistedRecovery } = require('../services/assistedPasswordRecoveryService');
const { deliverRecoveryDecisionNotification } = require('../services/mobilePushService');

const REVIEW_ROLES = [ROLES.FARM_MANAGER, ROLES.SRA_ADMIN, ROLES.SUPER_ADMIN];

async function actorFarmIds(actorId) {
  const snapshot = await db.collection(COLLECTIONS.BLOCK_FARMS).where('managerUserId', '==', actorId).get();
  return new Set(snapshot.docs.map(document => document.id));
}

function canListReview(actorRole, actorId, review, managerFarms) {
  if (String(review.userId || '') === actorId) return false;
  const targetRole = canonicalRole(review.role);
  if (actorRole === ROLES.SUPER_ADMIN) return true;
  if (actorRole === ROLES.SRA_ADMIN) return [ROLES.MEMBER_FARMER, ROLES.FARM_MANAGER].includes(targetRole);
  return actorRole === ROLES.FARM_MANAGER
    && targetRole === ROLES.MEMBER_FARMER
    && managerFarms.has(String(review.blockFarmId || ''));
}

function publicReview(document) {
  const review = document.data();
  return {
    id: document.id,
    userId: review.userId,
    displayName: review.displayName || 'HUGPONG user',
    registeredPhone: review.registeredPhone || null,
    canonicalRole: canonicalRole(review.role),
    role: publicRoleLabel(review.role),
    blockFarmId: review.blockFarmId || null,
    status: review.status,
    requestedAt: review.requestedAt,
    expiresAt: review.expiresAt
  };
}

async function loadAuthorizedReview(req, reviewId) {
  const snapshot = await db.collection(COLLECTIONS.PASSWORD_RECOVERY_REVIEWS).doc(String(reviewId || '').trim()).get();
  if (!snapshot.exists) throw Object.assign(new Error('Recovery review was not found.'), { status: 404 });
  const review = snapshot.data();
  const userSnapshot = await db.collection(COLLECTIONS.USERS).doc(String(review.userId || '')).get();
  if (!userSnapshot.exists) throw Object.assign(new Error('Recovery account was not found.'), { status: 404 });
  const actorId = String(req.session.user.employeeId || '').trim();
  const actorRole = canonicalRole(req.session.user.canonicalRole || req.session.user.role);
  const user = userSnapshot.data();
  await assertPhoneVerificationAuthority(db, {
    actorId,
    actorRole,
    targetUserId: userSnapshot.id,
    targetRole: user.role,
    requestedBlockFarmId: user.requestedBlockFarmId,
    affiliatedBlockFarmId: user.affiliatedBlockFarmId,
    selectedBlockFarmId: review.blockFarmId
  });
  return { snapshot, review, userSnapshot, actorId };
}

router.get('/', requireAuth, requireRole(REVIEW_ROLES), async (req, res) => {
  try {
    if (!db) return res.status(503).json({ success: false, error: 'Database is unavailable.' });
    const actorId = String(req.session.user.employeeId || '').trim();
    const actorRole = canonicalRole(req.session.user.canonicalRole || req.session.user.role);
    const managerFarms = actorRole === ROLES.FARM_MANAGER ? await actorFarmIds(actorId) : new Set();
    const snapshot = await db.collection(COLLECTIONS.PASSWORD_RECOVERY_REVIEWS)
      .where('status', '==', 'PENDING')
      .limit(100)
      .get();
    const now = Date.now();
    const data = snapshot.docs
      .filter(document => Number(document.data().expiresAtMs || 0) > now)
      .filter(document => canListReview(actorRole, actorId, document.data(), managerFarms))
      .map(publicReview)
      .sort((left, right) => String(left.requestedAt).localeCompare(String(right.requestedAt)));
    return res.json({ success: true, count: data.length, data });
  } catch (error) {
    return res.status(error.status || 500).json({ success: false, error: error.message });
  }
});

router.post('/:reviewId/approve', requireAuth, requireRole(REVIEW_ROLES), async (req, res) => {
  try {
    if (!db) return res.status(503).json({ success: false, error: 'Database is unavailable.' });
    const { actorId } = await loadAuthorizedReview(req, req.params.reviewId);
    const reason = resolvePhoneVerificationReason({ verificationReasonCode: 'ID_AND_SIM_IN_PERSON' });
    const result = await decideAssistedRecovery(db, {
      reviewId: req.params.reviewId,
      actorUserId: actorId,
      approve: true,
      reason
    });
    const { mobilePushToken, ...publicResult } = result;
    if (mobilePushToken) {
      deliverRecoveryDecisionNotification(db, {
        reviewId: result.reviewId,
        expoPushToken: mobilePushToken,
        status: result.status
      }).catch(() => console.warn('[HUGPONG Recovery] Approval notification delivery was deferred.'));
    }
    return res.json({
      success: true,
      data: publicResult,
      message: 'Recovery approved. The user has 15 minutes to create a new password.'
    });
  } catch (error) {
    return res.status(error.status || 500).json({ success: false, error: error.message, code: error.code || 'RECOVERY_REVIEW_APPROVAL_FAILED' });
  }
});

router.post('/:reviewId/reject', requireAuth, requireRole(REVIEW_ROLES), async (req, res) => {
  try {
    if (!db) return res.status(503).json({ success: false, error: 'Database is unavailable.' });
    const { actorId } = await loadAuthorizedReview(req, req.params.reviewId);
    const reason = resolvePhoneVerificationReason({
      verificationReasonCode: 'OTHER_DOCUMENTED_CHECK',
      verificationReasonDetails: 'Identity could not be verified by the authorized reviewer.'
    });
    const result = await decideAssistedRecovery(db, {
      reviewId: req.params.reviewId,
      actorUserId: actorId,
      approve: false,
      reason
    });
    const { mobilePushToken, ...publicResult } = result;
    if (mobilePushToken) {
      deliverRecoveryDecisionNotification(db, {
        reviewId: result.reviewId,
        expoPushToken: mobilePushToken,
        status: result.status
      }).catch(() => console.warn('[HUGPONG Recovery] Rejection notification delivery was deferred.'));
    }
    return res.json({ success: true, data: publicResult, message: 'Recovery request rejected.' });
  } catch (error) {
    return res.status(error.status || 500).json({ success: false, error: error.message, code: error.code || 'RECOVERY_REVIEW_REJECTION_FAILED' });
  }
});

module.exports = router;
