'use strict';

const express = require('express');
const router = express.Router();
const { db } = require('../firebase-admin');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/roleGuard');
const { COLLECTIONS, ROLES } = require('../schema/firestoreSchema');
const { actor } = require('../services/resourceScope');
const { sortNewestFirst } = require('../services/recordOrdering');
const { enrichAuditEventsWithCropYears } = require('../services/auditCropYearContext');

router.get('/', requireAuth, requireRole([ROLES.FARM_MANAGER, ROLES.SRA_ADMIN, ROLES.SUPER_ADMIN]), async (req, res) => {
  try {
    if (!db) return res.status(503).json({ success: false, error: 'Database is unavailable.' });
    const identity = actor(req.session.user);
    const recordsById = new Map();

    if (identity.role === ROLES.FARM_MANAGER) {
      const farms = await db.collection(COLLECTIONS.BLOCK_FARMS)
        .where('managerUserId', '==', identity.userId)
        .get();
      const farmIds = farms.docs.map(document => document.id);
      const ownEvents = await db.collection(COLLECTIONS.AUDIT_LOGS)
        .where('actorUserId', '==', identity.userId)
        .get();
      ownEvents.docs.forEach(document => recordsById.set(document.id, { id: document.id, ...document.data() }));
      for (let index = 0; index < farmIds.length; index += 10) {
        const farmEvents = await db.collection(COLLECTIONS.AUDIT_LOGS)
          .where('blockFarmId', 'in', farmIds.slice(index, index + 10))
          .get();
        farmEvents.docs.forEach(document => recordsById.set(document.id, { id: document.id, ...document.data() }));
      }
    } else {
      const snapshot = await db.collection(COLLECTIONS.AUDIT_LOGS).get();
      snapshot.docs.forEach(document => recordsById.set(document.id, { id: document.id, ...document.data() }));
    }

    const contextualRecords = await enrichAuditEventsWithCropYears(db, Array.from(recordsById.values()));
    const data = sortNewestFirst(contextualRecords, ['createdAt']);

    return res.json({ success: true, count: data.length, data });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/', requireAuth, async (req, res) => {
  return res.status(405).json({
    success: false,
    error: 'Audit events are created only by completed server operations.',
    code: 'AUDIT_EVENTS_SERVER_MANAGED'
  });
});

module.exports = router;
