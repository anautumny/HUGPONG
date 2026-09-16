'use strict';

const express = require('express');
const router = express.Router();
const { db } = require('../firebase-admin');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/roleGuard');
const {
  COLLECTIONS,
  ROLES,
  canonicalRole
} = require('../schema/firestoreSchema');
const { updateCycleStage, rolloverFieldCycle } = require('../services/cropCycleOperations');
const { readMutationContext } = require('../services/mutationContext');

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
    const result = await updateCycleStage(db, req.params.id, req.body, req.session.user, undefined, readMutationContext(req));
    return res.json({ success: true, data: result });
  } catch (error) {
    return res.status(error.status || 400).json({ success: false, error: error.message, data: error.data });
  }
});

router.post('/:fieldId/rollover', requireAuth, requireRole([ROLES.MEMBER_FARMER, ROLES.FARM_MANAGER]), async (req, res) => {
  try {
    if (!db) return res.status(503).json({ success: false, error: 'Database is unavailable.' });
    const result = await rolloverFieldCycle(db, req.params.fieldId, req.body, req.session.user, undefined, readMutationContext(req));
    return res.status(result.replayed ? 200 : 201).json({ success: true, data: result });
  } catch (error) {
    return res.status(error.status || 400).json({ success: false, error: error.message, data: error.data });
  }
});

module.exports = router;
