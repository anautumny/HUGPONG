'use strict';

const express = require('express');
const router = express.Router();
const { db } = require('../firebase-admin');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/roleGuard');
const {
  COLLECTIONS,
  ROLES,
  canonicalRole,
  buildOperationLog,
  createOperationLogId,
  nowIso
} = require('../schema/firestoreSchema');

async function getActorScope(user) {
  const userId = String(user.employeeId || user.userId || '').trim();
  const role = canonicalRole(user.role || user.roleKey);
  if (role === ROLES.SRA_ADMIN || role === ROLES.SUPER_ADMIN) return { role, userId, all: true };

  if (role === ROLES.FARM_MANAGER) {
    const farmSnapshot = await db.collection(COLLECTIONS.BLOCK_FARMS).where('managerUserId', '==', userId).get();
    const farmIds = farmSnapshot.docs.map(doc => doc.id);
    if (!farmIds.length) return { role, userId, fieldIds: [] };
    const fieldSnapshot = await db.collection(COLLECTIONS.FIELDS).get();
    return {
      role,
      userId,
      fieldIds: fieldSnapshot.docs.filter(doc => farmIds.includes(doc.data().blockFarmId)).map(doc => doc.id)
    };
  }

  const fieldSnapshot = await db.collection(COLLECTIONS.FIELDS).where('memberUserId', '==', userId).get();
  return { role, userId, fieldIds: fieldSnapshot.docs.map(doc => doc.id) };
}

async function assertCanRecord(fieldId, cycleId, user) {
  if (!db) throw new Error('Database is unavailable.');
  const [fieldDoc, cycleDoc] = await Promise.all([
    db.collection(COLLECTIONS.FIELDS).doc(fieldId).get(),
    db.collection(COLLECTIONS.CROP_CYCLES).doc(cycleId).get()
  ]);
  if (!fieldDoc.exists) throw new Error('The referenced field does not exist.');
  if (!cycleDoc.exists) throw new Error('The referenced crop cycle does not exist.');

  const field = fieldDoc.data();
  const cycle = cycleDoc.data();
  if (field.status !== 'ACTIVE') throw new Error('Operations can only be recorded for an ACTIVE field.');
  if (field.currentCycleId !== cycleId || cycle.fieldId !== fieldId || cycle.status !== 'ACTIVE') {
    throw new Error('cycleId must be the field\'s explicit ACTIVE crop cycle.');
  }

  const actorId = String(user.employeeId || user.userId || '').trim();
  const actorRole = canonicalRole(user.role || user.roleKey);
  if (actorRole === ROLES.MEMBER_FARMER && field.memberUserId !== actorId) {
    throw new Error('Member Farmers may record only for an assigned field.');
  }
  if (actorRole === ROLES.FARM_MANAGER) {
    const farm = await db.collection(COLLECTIONS.BLOCK_FARMS).doc(field.blockFarmId).get();
    if (!farm.exists || farm.data().managerUserId !== actorId) {
      throw new Error('Farm Managers may record only within their assigned block farm.');
    }
  }
  return { field, cycle, actorId, actorRole };
}

router.get('/', requireAuth, async (req, res) => {
  try {
    if (!db) return res.status(503).json({ success: false, error: 'Database is unavailable.' });
    const scope = await getActorScope(req.session.user);
    const snapshot = await db.collection(COLLECTIONS.OPERATION_LOGS).get();
    const data = snapshot.docs
      .filter(doc => scope.all || scope.fieldIds.includes(doc.data().fieldId))
      .map(doc => ({ id: doc.id, ...doc.data() }));
    return res.json({ success: true, count: data.length, data });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/', requireAuth, requireRole([ROLES.MEMBER_FARMER, ROLES.FARM_MANAGER]), async (req, res) => {
  try {
    const fieldId = String(req.body.fieldId || '').trim().toUpperCase();
    const cycleId = String(req.body.cycleId || '').trim().toUpperCase();
    const access = await assertCanRecord(fieldId, cycleId, req.session.user);
    const logId = req.body.id || createOperationLogId(fieldId);
    const now = nowIso();
    const payload = buildOperationLog({
      ...req.body,
      fieldId,
      cycleId,
      status: 'ACTIVE',
      archivedAt: null,
      archivedByUserId: null,
      createdAt: req.body.createdAt || now,
      updatedAt: now,
      submissionSource: access.actorRole === ROLES.FARM_MANAGER ? 'MANAGER_TAKEOVER' : 'MEMBER'
    }, { submittedByUserId: access.actorId, now });

    await db.collection(COLLECTIONS.OPERATION_LOGS).doc(logId).create(payload);
    return res.status(201).json({ success: true, data: { id: logId, ...payload } });
  } catch (error) {
    const status = /already exists/i.test(error.message) ? 409 : 400;
    return res.status(status).json({ success: false, error: error.message });
  }
});

router.patch('/:id', requireAuth, requireRole([ROLES.MEMBER_FARMER, ROLES.FARM_MANAGER]), async (req, res) => {
  try {
    if (!db) return res.status(503).json({ success: false, error: 'Database is unavailable.' });
    const ref = db.collection(COLLECTIONS.OPERATION_LOGS).doc(req.params.id);
    const snapshot = await ref.get();
    if (!snapshot.exists) return res.status(404).json({ success: false, error: 'Operation log not found.' });
    const existing = snapshot.data();
    if (existing.status !== 'ACTIVE') {
      return res.status(409).json({ success: false, error: 'ARCHIVED operation logs cannot be amended.' });
    }
    const access = await assertCanRecord(existing.fieldId, existing.cycleId, req.session.user);
    const now = nowIso();
    const amendment = req.body.amendment;
    if (!amendment || !String(amendment.reason || '').trim()) {
      return res.status(400).json({ success: false, error: 'An amendment reason is required.' });
    }
    const merged = {
      ...existing,
      ...req.body.changes,
      status: 'ACTIVE',
      fieldId: existing.fieldId,
      cycleId: existing.cycleId,
      submittedByUserId: existing.submittedByUserId,
      createdAt: existing.createdAt,
      updatedAt: now,
      amendments: [
        ...(existing.amendments || []),
        {
          amendmentId: amendment.amendmentId || `AMD-${Date.now().toString(36).toUpperCase()}`,
          amendedByUserId: access.actorId,
          reason: amendment.reason,
          amendedAt: now,
          changes: amendment.changes || {}
        }
      ]
    };
    const payload = buildOperationLog(merged, { submittedByUserId: existing.submittedByUserId, now });
    await ref.set(payload);
    return res.json({ success: true, data: { id: snapshot.id, ...payload } });
  } catch (error) {
    return res.status(400).json({ success: false, error: error.message });
  }
});

module.exports = router;
