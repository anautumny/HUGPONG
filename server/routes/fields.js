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
const { assertFieldScope, assertBlockFarmScope } = require('../services/resourceScope');
const { archiveFieldWithOperations } = require('../services/cropCycleOperations');
const { readMutationContext, assertBaseVersion } = require('../services/mutationContext');

async function assertManagerScope(blockFarmId, user) {
  const role = canonicalRole(user.role || user.roleKey);
  if (role === ROLES.SUPER_ADMIN) return;
  const userId = String(user.employeeId || user.userId || '').trim();
  const farm = await db.collection(COLLECTIONS.BLOCK_FARMS).doc(blockFarmId).get();
  if (!farm.exists || farm.data().managerUserId !== userId) {
    throw Object.assign(new Error('Farm Managers may change fields only in their assigned block farm.'), { status: 403 });
  }
}

async function assertMemberAssignmentScope(memberUserId, blockFarmId, excludedFieldId = null) {
  if (!memberUserId) return;
  const assignments = await db.collection(COLLECTIONS.FIELDS).where('memberUserId', '==', memberUserId).get();
  const outsideAssignment = assignments.docs.find(doc => doc.id !== excludedFieldId && doc.data().status === 'ACTIVE' && doc.data().blockFarmId !== blockFarmId);
  if (outsideAssignment) throw new Error('memberUserId already has an ACTIVE assignment outside this block farm.');
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
    readMutationContext(req);
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
      await assertMemberAssignmentScope(memberUserId, blockFarmId);
    }

    const now = nowIso();
    const cycleId = createCycleId(fieldId, 1);
    const existingField = await db.collection(COLLECTIONS.FIELDS).doc(fieldId).get();
    if (existingField.exists) {
      const current = existingField.data();
      if (current.blockFarmId === blockFarmId && current.memberUserId === memberUserId && current.currentCycleId === cycleId) {
        const currentCycle = await db.collection(COLLECTIONS.CROP_CYCLES).doc(cycleId).get();
        return res.json({ success: true, replayed: true, data: { field: { id: fieldId, ...current }, cycle: currentCycle.exists ? { id: cycleId, ...currentCycle.data() } : null } });
      }
      return res.status(409).json({ success: false, error: 'Field ID already belongs to another field.' });
    }
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
    const status = error.status || (/already exists/i.test(error.message) ? 409 : 400);
    return res.status(status).json({ success: false, error: error.message });
  }
});

router.patch('/:id', requireAuth, requireRole([ROLES.FARM_MANAGER, ROLES.SUPER_ADMIN]), async (req, res) => {
  try {
    if (!db) return res.status(503).json({ success: false, error: 'Database is unavailable.' });
    const scope = await assertFieldScope(req.params.id, req.session.user, [ROLES.FARM_MANAGER, ROLES.SUPER_ADMIN]);
    const existing = scope.field;
    const mutationContext = readMutationContext(req);
    const blockFarmId = req.body.blockFarmId === undefined
      ? existing.blockFarmId
      : requiredString(req.body.blockFarmId, 'blockFarmId', { max: 80 }).toUpperCase();
    if (blockFarmId !== existing.blockFarmId) {
      await assertBlockFarmScope(blockFarmId, req.session.user, [ROLES.FARM_MANAGER, ROLES.SUPER_ADMIN]);
    }
    const memberUserId = req.body.memberUserId === undefined ? existing.memberUserId : nullableId(req.body.memberUserId);
    if (memberUserId) {
      const member = await db.collection(COLLECTIONS.USERS).doc(memberUserId).get();
      if (!member.exists || canonicalRole(member.data().role) !== ROLES.MEMBER_FARMER || member.data().status !== 'ACTIVE') {
        throw new Error('memberUserId must reference an ACTIVE Member Farmer.');
      }
      await assertMemberAssignmentScope(memberUserId, blockFarmId, scope.fieldId);
    }
    const update = {
      blockFarmId,
      memberUserId,
      areaHa: req.body.areaHa === undefined ? existing.areaHa : finiteNumber(req.body.areaHa, 'areaHa', { min: 0.01, max: 500 }),
      variety: req.body.variety === undefined ? existing.variety : optionalString(req.body.variety, { max: 120 }),
      soilType: req.body.soilType === undefined ? existing.soilType : optionalString(req.body.soilType, { max: 120 }),
      updatedAt: nowIso()
    };
    const result = await db.runTransaction(async transaction => {
      const latestSnapshot = await transaction.get(scope.snapshot.ref);
      if (!latestSnapshot.exists) throw Object.assign(new Error('Field not found.'), { status: 404 });
      const latest = latestSnapshot.data();
      const alreadyApplied = latest.blockFarmId === update.blockFarmId
        && latest.memberUserId === update.memberUserId
        && latest.areaHa === update.areaHa
        && latest.variety === update.variety
        && latest.soilType === update.soilType;
      if (alreadyApplied) return { replayed: true, record: latest };
      assertBaseVersion(latest.updatedAt, mutationContext, scope.fieldId, { id: scope.fieldId, ...latest });
      transaction.update(scope.snapshot.ref, update);
      return { replayed: false, record: { ...latest, ...update } };
    });
    return res.json({ success: true, replayed: result.replayed, data: { id: scope.fieldId, ...result.record } });
  } catch (error) {
    return res.status(error.status || 400).json({ success: false, error: error.message, data: error.data });
  }
});

router.post('/:id/archive', requireAuth, requireRole([ROLES.FARM_MANAGER, ROLES.SUPER_ADMIN]), async (req, res) => {
  try {
    if (!db) return res.status(503).json({ success: false, error: 'Database is unavailable.' });
    const result = await archiveFieldWithOperations(db, req.params.id, req.session.user, undefined, readMutationContext(req));
    return res.json({ success: true, replayed: result.replayed, data: result.field, archivedLogCount: result.archivedLogCount });
  } catch (error) {
    return res.status(error.status || 400).json({ success: false, error: error.message, data: error.data });
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
    const mutationContext = readMutationContext(req);
    const result = await db.runTransaction(async transaction => {
      const latestSnapshot = await transaction.get(ref);
      if (!latestSnapshot.exists) throw Object.assign(new Error('Field not found.'), { status: 404 });
      const latest = latestSnapshot.data();
      if (JSON.stringify(latest.customOperations || {}) === JSON.stringify(customOperations)) {
        return { replayed: true, updatedAt: latest.updatedAt };
      }
      assertBaseVersion(latest.updatedAt, mutationContext, fieldId, { id: fieldId, ...latest });
      const updatedAt = nowIso();
      transaction.update(ref, { customOperations, updatedAt });
      return { replayed: false, updatedAt };
    });
    return res.json({ success: true, replayed: result.replayed, data: { id: fieldId, customOperations, updatedAt: result.updatedAt } });
  } catch (error) {
    return res.status(error.status || 400).json({ success: false, error: error.message, data: error.data });
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
    const mutationContext = readMutationContext(req);
    const customStages = req.body.customStages;
    const result = await db.runTransaction(async transaction => {
      const latestSnapshot = await transaction.get(ref);
      if (!latestSnapshot.exists) throw Object.assign(new Error('Field not found.'), { status: 404 });
      const latest = latestSnapshot.data();
      if (JSON.stringify(latest.customStages || []) === JSON.stringify(customStages)) {
        return { replayed: true, updatedAt: latest.updatedAt };
      }
      assertBaseVersion(latest.updatedAt, mutationContext, fieldId, { id: fieldId, ...latest });
      const updatedAt = nowIso();
      transaction.update(ref, { customStages, updatedAt });
      return { replayed: false, updatedAt };
    });
    return res.json({ success: true, replayed: result.replayed, data: { id: fieldId, customStages, updatedAt: result.updatedAt } });
  } catch (error) {
    return res.status(error.status || 400).json({ success: false, error: error.message, data: error.data });
  }
});

module.exports = router;
