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
const {
  createOperationRecord,
  amendOperationRecord,
  archiveOperationRecords
} = require('../services/cropCycleOperations');
const { readMutationContext } = require('../services/mutationContext');

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
    if (!db) return res.status(503).json({ success: false, error: 'Database is unavailable.' });
    readMutationContext(req);
    const result = await createOperationRecord(db, req.body, req.session.user);
    return res.status(result.replayed ? 200 : 201).json({
      success: true,
      replayed: result.replayed,
      data: { id: result.id, ...result.record }
    });
  } catch (error) {
    return res.status(error.status || 400).json({ success: false, error: error.message, data: error.data });
  }
});

router.patch('/:id', requireAuth, requireRole([ROLES.MEMBER_FARMER, ROLES.FARM_MANAGER]), async (req, res) => {
  try {
    if (!db) return res.status(503).json({ success: false, error: 'Database is unavailable.' });
    const result = await amendOperationRecord(
      db,
      req.params.id,
      req.body.changes,
      req.body.amendment,
      req.session.user,
      undefined,
      readMutationContext(req)
    );
    return res.json({ success: true, replayed: result.replayed, data: { id: result.id, ...result.record } });
  } catch (error) {
    return res.status(error.status || 400).json({ success: false, error: error.message, data: error.data });
  }
});

router.post('/archive', requireAuth, requireRole([ROLES.MEMBER_FARMER, ROLES.FARM_MANAGER]), async (req, res) => {
  try {
    if (!db) return res.status(503).json({ success: false, error: 'Database is unavailable.' });
    const result = await archiveOperationRecords(db, req.body.ids, req.session.user, undefined, readMutationContext(req));
    return res.json({ success: true, ...result });
  } catch (error) {
    return res.status(error.status || 400).json({ success: false, error: error.message });
  }
});

module.exports = router;
