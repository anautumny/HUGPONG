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
  requiredString,
  nullableId,
  finiteNumber,
  nowIso
} = require('../schema/firestoreSchema');
const { createBlockFarmId, assertNoClientIdentity, readDevelopmentSeedId } = require('../domain/systemIds');
const { uniqueRecordsById } = require('../domain/recordIdentity');
const { readMutationContext, assertBaseVersion } = require('../services/mutationContext');
const { queueAuditEvent } = require('../services/auditWriter');
const { creationReceipt } = require('../services/creationReceipt');
const {
  assertDeclaredAreaCoversFields,
  attachBlockFarmAreaSummaries,
  blockFarmAreaSummary
} = require('../domain/landArea');

async function withAuthoritativeAreas(blockFarms) {
  if (!blockFarms.length) return [];
  const farmIds = new Set(blockFarms.map(farm => String(farm.id || '').trim()).filter(Boolean));
  const fieldsSnapshot = await db.collection(COLLECTIONS.FIELDS).get();
  const farmFields = fieldsSnapshot.docs
    .map(doc => ({ id: doc.id, ...doc.data() }))
    .filter(field => farmIds.has(String(field.blockFarmId || '').trim()));
  return attachBlockFarmAreaSummaries(blockFarms, farmFields);
}

router.get('/', requireAuth, async (req, res) => {
  try {
    if (!db) return res.status(503).json({ success: false, error: 'Database is unavailable.' });
    readMutationContext(req);
    const actorId = String(req.session.user.employeeId || req.session.user.userId || '').trim();
    const role = canonicalRole(req.session.user.role || req.session.user.roleKey);
    let query = db.collection(COLLECTIONS.BLOCK_FARMS);
    if (role === ROLES.FARM_MANAGER) {
      query = query.where('managerUserId', '==', actorId);
    } else if (role === ROLES.MEMBER_FARMER) {
      const fields = await db.collection(COLLECTIONS.FIELDS).where('memberUserId', '==', actorId).get();
      const farmIds = Array.from(new Set([
        req.session.user.blockFarmId,
        ...fields.docs.map(doc => doc.data().blockFarmId)
      ].filter(Boolean)));
      if (!farmIds.length) return res.json({ success: true, count: 0, data: [] });
      const farms = await db.getAll(...farmIds.map(id => db.collection(COLLECTIONS.BLOCK_FARMS).doc(id)));
      const scopedFarms = uniqueRecordsById(farms
        .filter(doc => doc.exists && String(doc.data().status || 'ACTIVE').toUpperCase() === 'ACTIVE')
        .map(doc => ({ ...doc.data(), id: doc.id })))
        .sort((left, right) => String(left.id).localeCompare(String(right.id)));
      const data = await withAuthoritativeAreas(scopedFarms);
      return res.json({ success: true, count: data.length, data });
    } else if (role !== ROLES.SRA_ADMIN) {
      return res.status(403).json({ success: false, error: 'Role is not authorized to list block farms.' });
    }
    const snapshot = await query.get();
    const scopedFarms = uniqueRecordsById(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })))
      .sort((left, right) => String(left.id).localeCompare(String(right.id)));
    const data = await withAuthoritativeAreas(scopedFarms);
    return res.json({ success: true, count: data.length, data });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/', requireAuth, requireRole([ROLES.SRA_ADMIN]), async (req, res) => {
  try {
    if (!db) return res.status(503).json({ success: false, error: 'Database is unavailable.' });
    const developmentSeedId = readDevelopmentSeedId(req);
    if (!developmentSeedId) assertNoClientIdentity(req.body, ['id', 'blockFarmId', 'code'], 'Block Farm');
    const name = requiredString(req.body.name, 'name', { max: 200 });
    const blockFarmId = developmentSeedId || createBlockFarmId();
    const managerUserId = nullableId(req.body.managerUserId);
    const now = nowIso();
    const payload = {
      code: blockFarmId,
      name,
      address: requiredString(req.body.address ?? req.body.location, 'address', { max: 300 }),
      declaredAreaHa: finiteNumber(req.body.declaredAreaHa, 'declaredAreaHa', { min: 0.01, max: 100000 }),
      managerUserId,
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
      archivedAt: null
    };
    const actorId = req.session.user.employeeId || req.session.user.userId;
    const receipt = developmentSeedId ? null : creationReceipt(db, actorId, readMutationContext(req), {
      name, address: payload.address, declaredAreaHa: payload.declaredAreaHa, managerUserId,
    }, 'BLOCK_FARM_CREATION');
    const result = await db.runTransaction(async transaction => {
      const prior = receipt && await receipt.read(transaction);
      if (prior) return { data: prior, replayed: true };
      if (managerUserId) {
        const managerRef = db.collection(COLLECTIONS.USERS).doc(managerUserId);
        const manager = await transaction.get(managerRef);
        const assigned = await transaction.get(db.collection(COLLECTIONS.BLOCK_FARMS).where('managerUserId', '==', managerUserId));
        if (!manager.exists || canonicalRole(manager.data().role) !== ROLES.FARM_MANAGER || manager.data().status !== 'ACTIVE') {
          throw Object.assign(new Error('managerUserId must reference an ACTIVE Farm Manager.'), { status: 400 });
        }
        if (assigned.docs.some(doc => doc.id !== blockFarmId)) {
          throw Object.assign(new Error('This Farm Manager already manages a Block Farm. Use Edit to explicitly reassign them.'), { status: 409 });
        }
        transaction.update(managerRef, { farmAssignmentUpdatedAt: now });
      }
      transaction.create(db.collection(COLLECTIONS.BLOCK_FARMS).doc(blockFarmId), payload);
      queueAuditEvent(transaction, db, {
      eventType: 'BLOCK_FARM_CREATED',
      actorUserId: req.session.user.employeeId || req.session.user.userId,
      entityType: 'BLOCK_FARM',
      entityId: blockFarmId,
      blockFarmId,
      details: `Created block farm ${name}.`,
      createdAt: now
      });
      const data = { id: blockFarmId, ...payload, ...blockFarmAreaSummary(payload, []) };
      receipt?.write(transaction, data, now);
      return { data, replayed: false };
    });
    return res.status(result.replayed ? 200 : 201).json({
      success: true,
      replayed: result.replayed,
      data: result.data || result
    });
  } catch (error) {
    const status = error.status || (/already exists/i.test(error.message) ? 409 : 400);
    return res.status(status).json({ success: false, error: error.message });
  }
});

router.put('/:id', requireAuth, requireRole([ROLES.SRA_ADMIN]), async (req, res) => {
  try {
    if (!db) return res.status(503).json({ success: false, error: 'Database is unavailable.' });
    const blockFarmId = String(req.params.id || '').trim().toUpperCase();
    const mutationContext = readMutationContext(req);
    assertNoClientIdentity(req.body, ['id', 'blockFarmId', 'code'], 'Block Farm');
    const ref = db.collection(COLLECTIONS.BLOCK_FARMS).doc(blockFarmId);
    const snapshot = await ref.get();
    if (!snapshot.exists) return res.status(404).json({ success: false, error: 'Block farm not found.' });
    const managerAssignmentRequested = req.body.managerUserId !== undefined;
    const requestedManagerUserId = managerAssignmentRequested ? nullableId(req.body.managerUserId) : null;
    const requestedName = req.body.name === undefined ? null : requiredString(req.body.name, 'name', { max: 200 });
    const addressRequested = req.body.address !== undefined || req.body.location !== undefined;
    const requestedAddress = addressRequested
      ? requiredString(req.body.address ?? req.body.location, 'address', { max: 300 })
      : null;
    const requestedAreaHa = req.body.declaredAreaHa === undefined
      ? null
      : finiteNumber(req.body.declaredAreaHa, 'declaredAreaHa', { min: 0.01, max: 100000 });
    const payload = await db.runTransaction(async transaction => {
      const latestSnapshot = await transaction.get(ref);
      if (!latestSnapshot.exists) throw Object.assign(new Error('Block farm not found.'), { status: 404 });
      const latest = latestSnapshot.data();
      assertBaseVersion(latest.updatedAt, mutationContext, blockFarmId, { id: blockFarmId, ...latest });
      const farmFieldsSnapshot = await transaction.get(
        db.collection(COLLECTIONS.FIELDS).where('blockFarmId', '==', blockFarmId)
      );
      const managerUserId = managerAssignmentRequested ? requestedManagerUserId : latest.managerUserId;
      let managerFarms = null;
      if (managerUserId) {
        const manager = await transaction.get(db.collection(COLLECTIONS.USERS).doc(managerUserId));
        if (!manager.exists
          || canonicalRole(manager.data().role) !== ROLES.FARM_MANAGER
          || String(manager.data().status || 'ACTIVE').toUpperCase() !== 'ACTIVE') {
          throw new Error('managerUserId must reference an ACTIVE Farm Manager.');
        }
        managerFarms = await transaction.get(
          db.collection(COLLECTIONS.BLOCK_FARMS).where('managerUserId', '==', managerUserId)
        );
      }
      const updatedAt = nowIso();
      const declaredAreaHa = requestedAreaHa === null ? (latest.declaredAreaHa ?? latest.declaredHa) : requestedAreaHa;
      assertDeclaredAreaCoversFields({
        declaredAreaHa,
        fields: farmFieldsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })),
        blockFarmId
      });
      const nextPayload = {
        code: latest.code || blockFarmId,
        name: requestedName === null ? latest.name : requestedName,
        address: requestedAddress === null ? (latest.address || latest.location) : requestedAddress,
        declaredAreaHa,
        managerUserId,
        status: latest.status,
        createdAt: latest.createdAt,
        updatedAt,
        archivedAt: latest.archivedAt || null
      };
      if (managerUserId) transaction.update(db.collection(COLLECTIONS.USERS).doc(managerUserId), { farmAssignmentUpdatedAt: updatedAt });
      managerFarms?.docs
        .filter(doc => doc.id !== blockFarmId)
        .forEach(doc => transaction.update(doc.ref, { managerUserId: null, updatedAt }));
      transaction.set(ref, nextPayload);
      queueAuditEvent(transaction, db, {
        eventType: 'BLOCK_FARM_UPDATED',
        actorUserId: req.session.user.employeeId || req.session.user.userId,
        entityType: 'BLOCK_FARM',
        entityId: blockFarmId,
        blockFarmId,
        details: `Updated block farm ${nextPayload.name}${managerUserId ? ` and assigned Farm Manager ${managerUserId}` : ' and left it unassigned'}.`,
        createdAt: updatedAt
      });
      return {
        ...nextPayload,
        ...blockFarmAreaSummary(
          nextPayload,
          farmFieldsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
        )
      };
    });
    return res.json({ success: true, data: { id: blockFarmId, ...payload } });
  } catch (error) {
    return res.status(error.status || 400).json({ success: false, error: error.message, data: error.data });
  }
});

module.exports = router;
