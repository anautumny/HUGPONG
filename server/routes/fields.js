'use strict';

const express = require('express');
const router = express.Router();
const { admin, db } = require('../firebase-admin');
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
  integer,
  cropYearParts
} = require('../schema/firestoreSchema');
const { CROP_STAGE_MAX, CROP_STAGE_MIN } = require('../domain/cropStages');
const { assertFieldScope, assertBlockFarmScope } = require('../services/resourceScope');
const { archiveFieldWithOperations } = require('../services/cropCycleOperations');
const { readMutationContext, assertBaseVersion } = require('../services/mutationContext');
const { createFieldId, assertNoClientIdentity, readDevelopmentSeedId } = require('../domain/systemIds');
const { operationAuthorization } = require('../domain/operationAuthorization');

function withoutLegacySoilType(value = {}) {
  const { soilType: _removedSoilType, ...field } = value;
  return field;
}

async function assertManagerScope(blockFarmId, user) {
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

async function assertAssignableFieldOwner(memberUserId, blockFarmId, user) {
  if (!memberUserId) return;
  const owner = await db.collection(COLLECTIONS.USERS).doc(memberUserId).get();
  if (!owner.exists || owner.data().status !== 'ACTIVE') {
    throw new Error('memberUserId must reference an ACTIVE Farm Member or the current Farm Manager.');
  }
  const ownerRole = canonicalRole(owner.data().role);
  const actorId = String(user.employeeId || user.userId || '').trim();
  const isMember = ownerRole === ROLES.MEMBER_FARMER;
  const isCurrentManager = ownerRole === ROLES.FARM_MANAGER && memberUserId === actorId;
  if (!isMember && !isCurrentManager) {
    throw new Error('memberUserId must reference an ACTIVE Farm Member or the current Farm Manager.');
  }
  if (isCurrentManager) await assertManagerScope(blockFarmId, user);
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
    } else if (role !== ROLES.SRA_ADMIN) {
      return res.status(403).json({ success: false, error: 'Role is not authorized to list fields.' });
    }
    const snapshot = await query.get();
    const fields = snapshot.docs.map(doc => ({ id: doc.id, ...withoutLegacySoilType(doc.data()) }));
    const memberIds = Array.from(new Set(fields.map(field => field.memberUserId).filter(Boolean)));
    const memberDocuments = await Promise.all(memberIds.map(memberId => (
      db.collection(COLLECTIONS.USERS).doc(memberId).get()
    )));
    const memberNames = new Map(memberDocuments
      .filter(document => document.exists)
      .map(document => [
        document.id,
        document.data().displayName || document.data().name || document.id
      ]));
    const data = fields.map(field => ({
      ...field,
      memberName: field.memberUserId ? (memberNames.get(field.memberUserId) || field.memberUserId) : null
    })).sort((left, right) => String(left.id).localeCompare(String(right.id)));
    return res.json({ success: true, count: data.length, data });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/', requireAuth, requireRole([ROLES.FARM_MANAGER]), async (req, res) => {
  try {
    if (!db) return res.status(503).json({ success: false, error: 'Database is unavailable.' });
    readMutationContext(req);
    const developmentSeedId = readDevelopmentSeedId(req);
    if (!developmentSeedId) assertNoClientIdentity(req.body, ['id', 'fieldId'], 'Field');
    if (String(req.body.variety || '').trim()) {
      throw new Error('Sugarcane variety is captured by a Planting operation, not during field enrollment.');
    }
    if (req.body.currentStageNumber != null && Number(req.body.currentStageNumber) !== CROP_STAGE_MIN) {
      throw new Error('New fields always start at the first Crop Year Cycle stage.');
    }
    const fieldId = developmentSeedId || createFieldId();
    const blockFarmId = requiredString(req.body.blockFarmId, 'blockFarmId', { max: 80 }).toUpperCase();
    await assertManagerScope(blockFarmId, req.session.user);
    const farm = await db.collection(COLLECTIONS.BLOCK_FARMS).doc(blockFarmId).get();
    if (!farm.exists || farm.data().status !== 'ACTIVE') throw new Error('blockFarmId must reference an ACTIVE block farm.');

    const memberUserId = nullableId(req.body.memberUserId);
    if (memberUserId) {
      await assertAssignableFieldOwner(memberUserId, blockFarmId, req.session.user);
      await assertMemberAssignmentScope(memberUserId, blockFarmId);
    }

    const now = nowIso();
    const cycleId = createCycleId(fieldId, 1);
    const annual = cropYearParts(null, now);
    const cropYearVal = annual.cropYear;
    const field = {
      blockFarmId,
      memberUserId,
      areaHa: finiteNumber(req.body.areaHa, 'areaHa', { min: 0.01, max: 500 }),
      cropYear: cropYearVal,
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
      blockFarmId,
      farmMemberId: memberUserId,
      sequenceNumber: 1,
      cropType: optionalString(req.body.cropType, { max: 120 }),
      variety: '',
      cropYear: cropYearVal,
      cropYearStart: annual.cropYearStart,
      cropYearEnd: annual.cropYearEnd,
      currentStageNumber: CROP_STAGE_MIN,
      elapsedMonths: finiteNumber(req.body.elapsedMonths == null ? 0 : req.body.elapsedMonths, 'elapsedMonths', { min: 0, max: 36 }),
      batchNumber: integer(req.body.batchNumber == null ? 1 : req.body.batchNumber, 'batchNumber', { min: 1, max: 9999 }),
      status: 'ACTIVE',
      startedAt: now,
      updatedAt: now,
      archivedAt: null,
      archivedByUserId: null,
      completedAt: null
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

router.patch('/:id', requireAuth, requireRole([ROLES.FARM_MANAGER]), async (req, res) => {
  try {
    if (!db) return res.status(503).json({ success: false, error: 'Database is unavailable.' });
    assertNoClientIdentity(req.body, ['id', 'fieldId'], 'Field');
    if (Object.prototype.hasOwnProperty.call(req.body, 'variety')) {
      throw new Error('Sugarcane variety belongs to a Crop Year Cycle and can be corrected only through a Planting operation amendment.');
    }
    const scope = await assertFieldScope(req.params.id, req.session.user, [ROLES.FARM_MANAGER]);
    const existing = scope.field;
    const mutationContext = readMutationContext(req);
    const blockFarmId = req.body.blockFarmId === undefined
      ? existing.blockFarmId
      : requiredString(req.body.blockFarmId, 'blockFarmId', { max: 80 }).toUpperCase();
    if (blockFarmId !== existing.blockFarmId) {
      await assertBlockFarmScope(blockFarmId, req.session.user, [ROLES.FARM_MANAGER]);
    }
    const memberUserId = req.body.memberUserId === undefined ? existing.memberUserId : nullableId(req.body.memberUserId);
    if (memberUserId) {
      await assertAssignableFieldOwner(memberUserId, blockFarmId, req.session.user);
      await assertMemberAssignmentScope(memberUserId, blockFarmId, scope.fieldId);
    }
    const update = {
      blockFarmId,
      memberUserId,
      areaHa: req.body.areaHa === undefined ? existing.areaHa : finiteNumber(req.body.areaHa, 'areaHa', { min: 0.01, max: 500 }),
      updatedAt: nowIso()
    };
    const result = await db.runTransaction(async transaction => {
      const latestSnapshot = await transaction.get(scope.snapshot.ref);
      if (!latestSnapshot.exists) throw Object.assign(new Error('Field not found.'), { status: 404 });
      const latest = latestSnapshot.data();
      const alreadyApplied = latest.blockFarmId === update.blockFarmId
        && latest.memberUserId === update.memberUserId
        && latest.areaHa === update.areaHa
        && !Object.prototype.hasOwnProperty.call(latest, 'soilType');
      if (alreadyApplied) return { replayed: true, record: withoutLegacySoilType(latest) };
      assertBaseVersion(latest.updatedAt, mutationContext, scope.fieldId, { id: scope.fieldId, ...latest });
      transaction.update(scope.snapshot.ref, {
        ...update,
        ...(Object.prototype.hasOwnProperty.call(latest, 'soilType')
          ? { soilType: admin.firestore.FieldValue.delete() }
          : {})
      });
      return { replayed: false, record: { ...withoutLegacySoilType(latest), ...update } };
    });
    return res.json({ success: true, replayed: result.replayed, data: { id: scope.fieldId, ...result.record } });
  } catch (error) {
    return res.status(error.status || 400).json({ success: false, error: error.message, data: error.data });
  }
});

router.post('/:id/archive', requireAuth, requireRole([ROLES.FARM_MANAGER]), async (req, res) => {
  try {
    if (!db) return res.status(503).json({ success: false, error: 'Database is unavailable.' });
    const result = await archiveFieldWithOperations(db, req.params.id, req.session.user, undefined, readMutationContext(req));
    return res.json({ success: true, replayed: result.replayed, data: result.field, archivedLogCount: result.archivedLogCount });
  } catch (error) {
    return res.status(error.status || 400).json({ success: false, error: error.message, data: error.data });
  }
});

router.put('/:id/custom-operations', requireAuth, requireRole([ROLES.FARM_MANAGER, ROLES.MEMBER_FARMER]), async (req, res) => {
  try {
    const fieldId = String(req.params.id || '').trim().toUpperCase();
    const ref = db.collection(COLLECTIONS.FIELDS).doc(fieldId);
    const snapshot = await ref.get();
    if (!snapshot.exists) return res.status(404).json({ success: false, error: 'Field not found.' });
    if (!operationAuthorization(req.session.user, { id: fieldId, ...snapshot.data() }).canPlan) {
      return res.status(403).json({ success: false, error: 'Farm plans can only be changed for your own assigned field.' });
    }
    const customOperations = req.body.customOperations;
    if (!customOperations || typeof customOperations !== 'object' || Array.isArray(customOperations)) {
      return res.status(400).json({ success: false, error: 'customOperations must be an object keyed by stage number.' });
    }
    const mutationContext = readMutationContext(req);
    const result = await db.runTransaction(async transaction => {
      const latestSnapshot = await transaction.get(ref);
      if (!latestSnapshot.exists) throw Object.assign(new Error('Field not found.'), { status: 404 });
      const latest = latestSnapshot.data();
      if (!operationAuthorization(req.session.user, { id: fieldId, ...latest }).canPlan) {
        throw Object.assign(new Error('Farm plans can only be changed for your own assigned field.'), { status: 403 });
      }
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

router.put('/:id/custom-stages', requireAuth, requireRole([ROLES.FARM_MANAGER]), async (req, res) => {
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
