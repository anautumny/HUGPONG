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
  integer,
  finiteNumber
} = require('../schema/firestoreSchema');

router.get('/', requireAuth, async (req, res) => {
  try {
    if (!db) return res.status(503).json({ success: false, error: 'Database is unavailable.' });
    const snapshot = await db.collection(COLLECTIONS.CROP_CYCLES).get();
    const actorId = String(req.session.user.employeeId || req.session.user.userId || '').trim();
    const actorRole = canonicalRole(req.session.user.role || req.session.user.roleKey);
    let permittedFieldIds = null;
    if (actorRole === ROLES.MEMBER_FARMER) {
      const fields = await db.collection(COLLECTIONS.FIELDS).where('memberUserId', '==', actorId).get();
      permittedFieldIds = new Set(fields.docs.map(doc => doc.id));
    } else if (actorRole === ROLES.FARM_MANAGER) {
      const farms = await db.collection(COLLECTIONS.BLOCK_FARMS).where('managerUserId', '==', actorId).get();
      const farmIds = new Set(farms.docs.map(doc => doc.id));
      const fields = await db.collection(COLLECTIONS.FIELDS).get();
      permittedFieldIds = new Set(fields.docs.filter(doc => farmIds.has(doc.data().blockFarmId)).map(doc => doc.id));
    } else if (actorRole !== ROLES.SRA_ADMIN && actorRole !== ROLES.SUPER_ADMIN) {
      return res.status(403).json({ success: false, error: 'Role is not permitted to view crop cycles.' });
    }
    const data = snapshot.docs
      .filter(doc => permittedFieldIds === null || permittedFieldIds.has(doc.data().fieldId))
      .map(doc => ({ id: doc.id, ...doc.data() }));
    return res.json({
      success: true,
      count: data.length,
      data
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.patch('/:id/stage', requireAuth, requireRole([ROLES.MEMBER_FARMER, ROLES.FARM_MANAGER]), async (req, res) => {
  try {
    if (!db) return res.status(503).json({ success: false, error: 'Database is unavailable.' });
    const cycleId = String(req.params.id || '').trim().toUpperCase();
    const cycleRef = db.collection(COLLECTIONS.CROP_CYCLES).doc(cycleId);
    const cycleSnapshot = await cycleRef.get();
    if (!cycleSnapshot.exists) return res.status(404).json({ success: false, error: 'Crop cycle not found.' });
    const cycle = cycleSnapshot.data();
    if (cycle.status !== 'ACTIVE') return res.status(409).json({ success: false, error: 'ARCHIVED crop cycles cannot be changed.' });
    const fieldSnapshot = await db.collection(COLLECTIONS.FIELDS).doc(cycle.fieldId).get();
    if (!fieldSnapshot.exists || fieldSnapshot.data().currentCycleId !== cycleId) {
      return res.status(409).json({ success: false, error: 'The crop cycle is not the field current cycle.' });
    }
    const actorId = String(req.session.user.employeeId || req.session.user.userId || '').trim();
    const actorRole = canonicalRole(req.session.user.role || req.session.user.roleKey);
    const field = fieldSnapshot.data();
    if (actorRole === ROLES.MEMBER_FARMER && field.memberUserId !== actorId) {
      return res.status(403).json({ success: false, error: 'Member Farmers may update only their assigned field cycle.' });
    }
    if (actorRole === ROLES.FARM_MANAGER) {
      const farm = await db.collection(COLLECTIONS.BLOCK_FARMS).doc(field.blockFarmId).get();
      if (!farm.exists || farm.data().managerUserId !== actorId) {
        return res.status(403).json({ success: false, error: 'Farm Managers may update only their assigned block farm.' });
      }
    }
    const update = {
      currentStageNumber: integer(req.body.currentStageNumber, 'currentStageNumber', { min: 1, max: 6 }),
      elapsedMonths: finiteNumber(req.body.elapsedMonths == null ? cycle.elapsedMonths : req.body.elapsedMonths, 'elapsedMonths', { min: 0, max: 36 }),
      updatedAt: nowIso()
    };
    await cycleRef.update(update);
    return res.json({ success: true, data: { id: cycleId, ...cycle, ...update } });
  } catch (error) {
    return res.status(400).json({ success: false, error: error.message });
  }
});

router.post('/:fieldId/rollover', requireAuth, requireRole([ROLES.MEMBER_FARMER, ROLES.FARM_MANAGER]), async (req, res) => {
  try {
    if (!db) return res.status(503).json({ success: false, error: 'Database is unavailable.' });
    const fieldId = String(req.params.fieldId || '').trim().toUpperCase();
    const actorId = String(req.session.user.employeeId || req.session.user.userId || '').trim();
    const actorRole = canonicalRole(req.session.user.role || req.session.user.roleKey);
    const now = nowIso();
    const result = await db.runTransaction(async transaction => {
      const fieldRef = db.collection(COLLECTIONS.FIELDS).doc(fieldId);
      const fieldSnapshot = await transaction.get(fieldRef);
      if (!fieldSnapshot.exists) throw new Error('Field not found.');
      const field = fieldSnapshot.data();
      if (field.status !== 'ACTIVE') throw new Error('Only an ACTIVE field can start a new crop cycle.');
      if (!field.currentCycleId) throw new Error('Field has no explicit currentCycleId.');

      if (actorRole === ROLES.MEMBER_FARMER && field.memberUserId !== actorId) {
        throw new Error('Member Farmers may roll over only an assigned field.');
      }
      if (actorRole === ROLES.FARM_MANAGER) {
        const farmRef = db.collection(COLLECTIONS.BLOCK_FARMS).doc(field.blockFarmId);
        const farmSnapshot = await transaction.get(farmRef);
        if (!farmSnapshot.exists || farmSnapshot.data().managerUserId !== actorId) {
          throw new Error('Farm Managers may roll over only fields in their assigned block farm.');
        }
      }

      const oldCycleRef = db.collection(COLLECTIONS.CROP_CYCLES).doc(field.currentCycleId);
      const oldCycleSnapshot = await transaction.get(oldCycleRef);
      if (!oldCycleSnapshot.exists) throw new Error('The field currentCycleId does not reference an existing cycle.');
      const oldCycle = oldCycleSnapshot.data();
      if (oldCycle.fieldId !== fieldId || oldCycle.status !== 'ACTIVE') {
        throw new Error('The referenced current crop cycle is not ACTIVE for this field.');
      }

      const nextSequence = integer(oldCycle.sequenceNumber, 'sequenceNumber', { min: 1, max: 9998 }) + 1;
      const newCycleId = createCycleId(fieldId, nextSequence);
      const newCycleRef = db.collection(COLLECTIONS.CROP_CYCLES).doc(newCycleId);
      const newCycleSnapshot = await transaction.get(newCycleRef);
      if (newCycleSnapshot.exists) throw new Error('The next crop cycle already exists.');

      const logQuery = db.collection(COLLECTIONS.OPERATION_LOGS)
        .where('cycleId', '==', field.currentCycleId)
        .where('status', '==', 'ACTIVE');
      const logSnapshot = await transaction.get(logQuery);

      transaction.update(oldCycleRef, {
        status: 'ARCHIVED',
        archivedAt: now,
        archivedByUserId: actorId,
        updatedAt: now
      });
      logSnapshot.docs.forEach(logDoc => transaction.update(logDoc.ref, {
        status: 'ARCHIVED',
        archivedAt: now,
        archivedByUserId: actorId,
        updatedAt: now
      }));

      const newCycle = {
        fieldId,
        sequenceNumber: nextSequence,
        cropType: requiredString(req.body.cropType || oldCycle.cropType, 'cropType', { max: 120 }),
        cropYear: requiredString(req.body.cropYear, 'cropYear', { max: 40 }),
        currentStageNumber: 1,
        elapsedMonths: finiteNumber(req.body.elapsedMonths == null ? 0 : req.body.elapsedMonths, 'elapsedMonths', { min: 0, max: 36 }),
        batchNumber: integer(req.body.batchNumber == null ? 1 : req.body.batchNumber, 'batchNumber', { min: 1, max: 9999 }),
        status: 'ACTIVE',
        startedAt: now,
        updatedAt: now,
        archivedAt: null,
        archivedByUserId: null
      };
      transaction.create(newCycleRef, newCycle);
      transaction.update(fieldRef, { currentCycleId: newCycleId, updatedAt: now });
      return { oldCycleId: oldCycleSnapshot.id, newCycleId, archivedLogCount: logSnapshot.size, newCycle };
    });

    return res.status(201).json({ success: true, data: result });
  } catch (error) {
    return res.status(400).json({ success: false, error: error.message });
  }
});

module.exports = router;
