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

router.get('/', requireAuth, async (req, res) => {
  try {
    if (!db) return res.status(503).json({ success: false, error: 'Database is unavailable.' });
    const actorId = String(req.session.user.employeeId || req.session.user.userId || '').trim();
    const role = canonicalRole(req.session.user.role || req.session.user.roleKey);
    let query = db.collection(COLLECTIONS.BLOCK_FARMS);
    if (role === ROLES.FARM_MANAGER) {
      query = query.where('managerUserId', '==', actorId);
    } else if (role === ROLES.MEMBER_FARMER) {
      const fields = await db.collection(COLLECTIONS.FIELDS).where('memberUserId', '==', actorId).get();
      const farmIds = Array.from(new Set(fields.docs.map(doc => doc.data().blockFarmId).filter(Boolean)));
      if (!farmIds.length) return res.json({ success: true, count: 0, data: [] });
      const farms = await db.getAll(...farmIds.map(id => db.collection(COLLECTIONS.BLOCK_FARMS).doc(id)));
      const data = farms.filter(doc => doc.exists).map(doc => ({ id: doc.id, ...doc.data() }));
      return res.json({ success: true, count: data.length, data });
    } else if (role !== ROLES.SRA_ADMIN && role !== ROLES.SUPER_ADMIN) {
      return res.status(403).json({ success: false, error: 'Role is not authorized to list block farms.' });
    }
    const snapshot = await query.get();
    return res.json({ success: true, count: snapshot.size, data: snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/', requireAuth, requireRole([ROLES.SRA_ADMIN]), async (req, res) => {
  try {
    if (!db) return res.status(503).json({ success: false, error: 'Database is unavailable.' });
    const name = requiredString(req.body.name, 'name', { max: 200 });
    const blockFarmId = requiredString(req.body.id, 'id', { max: 80 }).toUpperCase();
    const managerUserId = nullableId(req.body.managerUserId);
    if (managerUserId) {
      const manager = await db.collection(COLLECTIONS.USERS).doc(managerUserId).get();
      if (!manager.exists || manager.data().role !== ROLES.FARM_MANAGER) {
        throw new Error('managerUserId must reference a Farm Manager.');
      }
    }
    const now = nowIso();
    const payload = {
      code: requiredString(req.body.code, 'code', { max: 40 }).toUpperCase(),
      name,
      location: requiredString(req.body.location, 'location', { max: 300 }),
      declaredAreaHa: finiteNumber(req.body.declaredAreaHa, 'declaredAreaHa', { min: 0, max: 100000 }),
      managerUserId,
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
      archivedAt: null
    };
    await db.collection(COLLECTIONS.BLOCK_FARMS).doc(blockFarmId).create(payload);
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
    const ref = db.collection(COLLECTIONS.BLOCK_FARMS).doc(blockFarmId);
    const snapshot = await ref.get();
    if (!snapshot.exists) return res.status(404).json({ success: false, error: 'Block farm not found.' });
    const existing = snapshot.data();
    const managerUserId = req.body.managerUserId === undefined ? existing.managerUserId : nullableId(req.body.managerUserId);
    if (managerUserId) {
      const manager = await db.collection(COLLECTIONS.USERS).doc(managerUserId).get();
      if (!manager.exists || manager.data().role !== ROLES.FARM_MANAGER) {
        throw new Error('managerUserId must reference a Farm Manager.');
      }
    }
    const payload = {
      code: req.body.code === undefined ? existing.code : requiredString(req.body.code, 'code', { max: 40 }).toUpperCase(),
      name: req.body.name === undefined ? existing.name : requiredString(req.body.name, 'name', { max: 200 }),
      location: req.body.location === undefined ? existing.location : requiredString(req.body.location, 'location', { max: 300 }),
      declaredAreaHa: req.body.declaredAreaHa === undefined ? existing.declaredAreaHa : finiteNumber(req.body.declaredAreaHa, 'declaredAreaHa', { min: 0, max: 100000 }),
      managerUserId,
      status: existing.status,
      createdAt: existing.createdAt,
      updatedAt: nowIso(),
      archivedAt: existing.archivedAt || null
    };
    await ref.set(payload);
    return res.json({ success: true, data: { id: blockFarmId, ...payload } });
  } catch (error) {
    return res.status(400).json({ success: false, error: error.message });
  }
});

module.exports = router;
