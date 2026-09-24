'use strict';

const express = require('express');
const router = express.Router();
const { db } = require('../firebase-admin');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/roleGuard');
const { COLLECTIONS, ROLES, requiredString, optionalString, finiteNumber, nowIso } = require('../schema/firestoreSchema');
const { actor } = require('../services/resourceScope');
const { sortNewestFirst } = require('../services/recordOrdering');

router.get('/', requireAuth, requireRole([ROLES.FARM_MANAGER, ROLES.SRA_ADMIN, ROLES.SUPER_ADMIN]), async (req, res) => {
  try {
    if (!db) return res.status(503).json({ success: false, error: 'Database is unavailable.' });
    const identity = actor(req.session.user);
    let permittedUserIds = null;

    if (identity.role === ROLES.FARM_MANAGER) {
      const farms = await db.collection(COLLECTIONS.BLOCK_FARMS)
        .where('managerUserId', '==', identity.userId)
        .get();
      const farmIds = new Set(farms.docs.map(document => document.id));
      const fields = await db.collection(COLLECTIONS.FIELDS).get();
      permittedUserIds = [
        identity.userId,
        ...fields.docs
          .filter(document => farmIds.has(document.data().blockFarmId))
          .map(document => document.data().memberUserId)
          .filter(Boolean)
      ];
    }

    const records = [];
    if (permittedUserIds === null) {
      const snapshot = await db.collection(COLLECTIONS.TERMINAL_DIAGNOSTICS).get();
      records.push(...snapshot.docs.map(document => ({ id: document.id, ...document.data() })));
    } else {
      const uniqueUserIds = Array.from(new Set(permittedUserIds));
      for (let index = 0; index < uniqueUserIds.length; index += 10) {
        const snapshot = await db.collection(COLLECTIONS.TERMINAL_DIAGNOSTICS)
          .where('userId', 'in', uniqueUserIds.slice(index, index + 10))
          .get();
        records.push(...snapshot.docs.map(document => ({ id: document.id, ...document.data() })));
      }
    }
    const data = sortNewestFirst(records, ['updatedAt']);

    return res.json({ success: true, count: data.length, data });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.put('/:deviceId', requireAuth, async (req, res) => {
  try {
    if (!db) return res.status(503).json({ success: false, error: 'Database is unavailable.' });
    const identity = actor(req.session.user);
    const deviceId = requiredString(req.params.deviceId, 'deviceId', { max: 120 });
    const ref = db.collection(COLLECTIONS.TERMINAL_DIAGNOSTICS).doc(deviceId);
    const current = await ref.get();
    if (current.exists && current.data().userId !== identity.userId) {
      return res.status(403).json({ success: false, error: 'This terminal belongs to another user.' });
    }
    const payload = {
      userId: identity.userId,
      deviceId,
      model: optionalString(req.body.model, { max: 200 }),
      os: optionalString(req.body.os, { max: 200 }),
      appVersion: optionalString(req.body.appVersion, { max: 120 }),
      battery: optionalString(req.body.battery, { max: 40 }),
      cachedLogs: finiteNumber(req.body.cachedLogs == null ? 0 : req.body.cachedLogs, 'cachedLogs', { min: 0, max: 100000 }),
      status: optionalString(req.body.status, { max: 80 }),
      updatedAt: nowIso()
    };
    await ref.set(payload, { merge: true });
    return res.json({ success: true, data: payload });
  } catch (error) {
    return res.status(400).json({ success: false, error: error.message });
  }
});

module.exports = router;
