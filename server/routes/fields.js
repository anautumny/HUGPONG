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
  createCycleId,
  nowIso,
  requiredString,
  optionalString,
  nullableId,
  finiteNumber,
  integer
} = require('../schema/firestoreSchema');

async function assertManagerScope(blockFarmId, user) {
  const role = canonicalRole(user.role || user.roleKey);
  if (role === ROLES.SUPER_ADMIN) return;
  const userId = String(user.employeeId || user.userId || '').trim();
  const farm = await db.collection(COLLECTIONS.BLOCK_FARMS).doc(blockFarmId).get();
  if (!farm.exists || farm.data().managerUserId !== userId) {
    throw new Error('Farm Managers may change fields only in their assigned block farm.');
  }
}

router.get('/', requireAuth, async (req, res) => {
  try {
    if (!db) return res.status(503).json({ success: false, error: 'Database is unavailable.' });
    const actorId = String(req.session.user.employeeId || req.session.user.userId || '').trim();
    const role = canonicalRole(req.session.user.role || req.session.user.roleKey);
    let query = db.collection(COLLECTIONS.FIELDS);
    if (role === ROLES.MEMBER_FARMER) {
      query = query.where('memberUserId', '==', actorId);
    } else if (role === ROLES.FARM_MANAGER) {
      const farms = await db.collection(COLLECTIONS.BLOCK_FARMS).where('managerUserId', '==', actorId).get();
      const farmIds = farms.docs.map(doc => doc.id);
      if (!farmIds.length) return res.json({ success: true, count: 0, data: [] });
      if (farmIds.length > 10) return res.status(409).json({ success: false, error: 'Manager farm scope exceeds the Firestore query limit.' });
      query = query.where('blockFarmId', 'in', farmIds);
    } else if (role !== ROLES.SRA_ADMIN && role !== ROLES.SUPER_ADMIN) {
      return res.status(403).json({ success: false, error: 'Role is not authorized to list fields.' });
    }
    const snapshot = await query.get();
    return res.json({ success: true, count: snapshot.size, data: snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/', requireAuth, requireRole([ROLES.FARM_MANAGER, ROLES.SUPER_ADMIN]), async (req, res) => {
  try {
    if (!db) return res.status(503).json({ success: false, error: 'Database is unavailable.' });
    const fieldId = requiredString(req.body.id, 'id', { max: 80 }).toUpperCase();
    if (!/^[A-Z0-9_-]{3,80}$/.test(fieldId)) throw new Error('id contains unsupported characters.');
    const blockFarmId = requiredString(req.body.blockFarmId, 'blockFarmId', { max: 80 }).toUpperCase();
    await assertManagerScope(blockFarmId, req.session.user);
    const farm = await db.collection(COLLECTIONS.BLOCK_FARMS).doc(blockFarmId).get();
    if (!farm.exists || farm.data().status !== 'ACTIVE') throw new Error('blockFarmId must reference an ACTIVE block farm.');

    const memberUserId = nullableId(req.body.memberUserId);
    if (memberUserId) {
      const member = await db.collection(COLLECTIONS.USERS).doc(memberUserId).get();
      if (!member.exists || canonicalRole(member.data().role) !== ROLES.MEMBER_FARMER) {
        throw new Error('memberUserId must reference a Member Farmer.');
      }
    }

    const now = nowIso();
    const cycleId = createCycleId(fieldId, 1);
    const field = {
      blockFarmId,
      memberUserId,
      areaHa: finiteNumber(req.body.areaHa, 'areaHa', { min: 0.01, max: 500 }),
      variety: optionalString(req.body.variety, { max: 120 }),
      soilType: optionalString(req.body.soilType, { max: 120 }),
      currentCycleId: cycleId,
      status: 'ACTIVE',
      customStages: Array.isArray(req.body.customStages) ? req.body.customStages : [],
      customOperations: req.body.customOperations && typeof req.body.customOperations === 'object' ? req.body.customOperations : {},
      createdAt: now,
      updatedAt: now,
      archivedAt: null
    };
    const cycle = {
      fieldId,
      sequenceNumber: 1,
      cropType: optionalString(req.body.cropType, { max: 120 }),
      cropYear: optionalString(req.body.cropYear, { max: 40 }),
      currentStageNumber: integer(req.body.currentStageNumber == null ? 1 : req.body.currentStageNumber, 'currentStageNumber', { min: 1, max: 6 }),
      elapsedMonths: finiteNumber(req.body.elapsedMonths == null ? 0 : req.body.elapsedMonths, 'elapsedMonths', { min: 0, max: 36 }),
      batchNumber: integer(req.body.batchNumber == null ? 1 : req.body.batchNumber, 'batchNumber', { min: 1, max: 9999 }),
      status: 'ACTIVE',
      startedAt: now,
      updatedAt: now,
      archivedAt: null,
      archivedByUserId: null
    };
    const batch = db.batch();
    batch.create(db.collection(COLLECTIONS.FIELDS).doc(fieldId), field);
    batch.create(db.collection(COLLECTIONS.CROP_CYCLES).doc(cycleId), cycle);
    await batch.commit();
    return res.status(201).json({ success: true, data: { field: { id: fieldId, ...field }, cycle: { id: cycleId, ...cycle } } });
  } catch (error) {
    const status = /already exists/i.test(error.message) ? 409 : 400;
    return res.status(status).json({ success: false, error: error.message });
  }
});

router.put('/:id/custom-operations', requireAuth, requireRole([ROLES.FARM_MANAGER, ROLES.SUPER_ADMIN]), async (req, res) => {
  try {
    const fieldId = String(req.params.id || '').trim().toUpperCase();
    const ref = db.collection(COLLECTIONS.FIELDS).doc(fieldId);
    const snapshot = await ref.get();
    if (!snapshot.exists) return res.status(404).json({ success: false, error: 'Field not found.' });
    await assertManagerScope(snapshot.data().blockFarmId, req.session.user);
    const customOperations = req.body.customOperations;
    if (!customOperations || typeof customOperations !== 'object' || Array.isArray(customOperations)) {
      return res.status(400).json({ success: false, error: 'customOperations must be an object keyed by stage number.' });
    }
    const updatedAt = nowIso();
    await ref.update({ customOperations, updatedAt });
    return res.json({ success: true, data: { id: fieldId, customOperations, updatedAt } });
  } catch (error) {
    return res.status(400).json({ success: false, error: error.message });
  }
});

router.put('/:id/custom-stages', requireAuth, requireRole([ROLES.FARM_MANAGER, ROLES.SUPER_ADMIN]), async (req, res) => {
  try {
    const fieldId = String(req.params.id || '').trim().toUpperCase();
    const ref = db.collection(COLLECTIONS.FIELDS).doc(fieldId);
    const snapshot = await ref.get();
    if (!snapshot.exists) return res.status(404).json({ success: false, error: 'Field not found.' });
    await assertManagerScope(snapshot.data().blockFarmId, req.session.user);
    if (!Array.isArray(req.body.customStages)) {
      return res.status(400).json({ success: false, error: 'customStages must be an array.' });
    }
    const updatedAt = nowIso();
    await ref.update({ customStages: req.body.customStages, updatedAt });
    return res.json({ success: true, data: { id: fieldId, customStages: req.body.customStages, updatedAt } });
  } catch (error) {
    return res.status(400).json({ success: false, error: error.message });
  }
});

module.exports = router;
