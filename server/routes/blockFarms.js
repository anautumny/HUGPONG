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
const { readMutationContext, assertBaseVersion } = require('../services/mutationContext');
const { queueAuditEvent } = require('../services/auditWriter');

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
      const data = farms
        .filter(doc => doc.exists && String(doc.data().status || 'ACTIVE').toUpperCase() === 'ACTIVE')
        .map(doc => ({ ...doc.data(), id: doc.id }))
        .sort((left, right) => String(left.id).localeCompare(String(right.id)));
      return res.json({ success: true, count: data.length, data });
    } else if (role !== ROLES.SRA_ADMIN) {
      return res.status(403).json({ success: false, error: 'Role is not authorized to list block farms.' });
    }
    const snapshot = await query.get();
    const data = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }))
      .sort((left, right) => String(left.id).localeCompare(String(right.id)));
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
    if (managerUserId) {
      const manager = await db.collection(COLLECTIONS.USERS).doc(managerUserId).get();
      if (!manager.exists || manager.data().role !== ROLES.FARM_MANAGER) {
        throw new Error('managerUserId must reference a Farm Manager.');
      }
    }
    const now = nowIso();
    const payload = {
      code: blockFarmId,
      name,
      location: requiredString(req.body.location, 'location', { max: 300 }),
      declaredAreaHa: finiteNumber(req.body.declaredAreaHa, 'declaredAreaHa', { min: 0, max: 100000 }),
      managerUserId,
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
      archivedAt: null
    };
    const batch = db.batch();
    batch.create(db.collection(COLLECTIONS.BLOCK_FARMS).doc(blockFarmId), payload);
    queueAuditEvent(batch, db, {
      eventType: 'BLOCK_FARM_CREATED',
      actorUserId: req.session.user.employeeId || req.session.user.userId,
      entityType: 'BLOCK_FARM',
      entityId: blockFarmId,
      blockFarmId,
      details: `Created block farm ${name}.`,
      createdAt: now
    });
    await batch.commit();
    return res.status(201).json({ success: true, data: { id: blockFarmId, ...payload } });
  } catch (error) {
    const status = /already exists/i.test(error.message) ? 409 : 400;
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
    const requestedLocation = req.body.location === undefined ? null : requiredString(req.body.location, 'location', { max: 300 });
    const requestedAreaHa = req.body.declaredAreaHa === undefined
      ? null
      : finiteNumber(req.body.declaredAreaHa, 'declaredAreaHa', { min: 0, max: 100000 });
    const payload = await db.runTransaction(async transaction => {
      const latestSnapshot = await transaction.get(ref);
      if (!latestSnapshot.exists) throw Object.assign(new Error('Block farm not found.'), { status: 404 });
      const latest = latestSnapshot.data();
      assertBaseVersion(latest.updatedAt, mutationContext, blockFarmId, { id: blockFarmId, ...latest });
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
      const nextPayload = {
        code: latest.code || blockFarmId,
        name: requestedName === null ? latest.name : requestedName,
        location: requestedLocation === null ? latest.location : requestedLocation,
        declaredAreaHa: requestedAreaHa === null ? latest.declaredAreaHa : requestedAreaHa,
        managerUserId,
        status: latest.status,
        createdAt: latest.createdAt,
        updatedAt,
        archivedAt: latest.archivedAt || null
      };
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
      return nextPayload;
    });
    return res.json({ success: true, data: { id: blockFarmId, ...payload } });
  } catch (error) {
    return res.status(error.status || 400).json({ success: false, error: error.message, data: error.data });
  }
});

module.exports = router;
