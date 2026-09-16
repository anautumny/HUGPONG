'use strict';

const express = require('express');
const router = express.Router();
const { db } = require('../firebase-admin');
const { requireAuth } = require('../middleware/auth');
const { COLLECTIONS, requiredString, optionalString, finiteNumber, nowIso } = require('../schema/firestoreSchema');
const { actor } = require('../services/resourceScope');

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
