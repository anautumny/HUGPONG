'use strict';

const express = require('express');
const router = express.Router();
const { db } = require('../firebase-admin');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/roleGuard');
const { ROLES } = require('../schema/firestoreSchema');
const { actor } = require('../services/resourceScope');
const { recordActivity, recordSyncTelemetry, buildAgriculturalMonitor, buildSystemMonitor } = require('../services/telemetryService');

const AGRICULTURAL_ROLES = [ROLES.MEMBER_FARMER, ROLES.FARM_MANAGER];
const MONITOR_ROLES = [...AGRICULTURAL_ROLES, ROLES.SUPER_ADMIN];

function clientIdentity(req) {
  return {
    platform: req.headers['x-client-platform'] || req.body?.platform,
    clientInstanceId: req.headers['x-client-instance-id'] || req.body?.clientInstanceId
  };
}

function metadata(body = {}) {
  return { model: body.model, os: body.os, appVersion: body.appVersion };
}

router.get('/', requireAuth, requireRole(MONITOR_ROLES), async (req, res) => {
  try {
    if (!db) return res.status(503).json({ success: false, error: 'Database is unavailable.' });
    const identity = actor(req.session.user);
    const data = identity.role === ROLES.SUPER_ADMIN
      ? await buildSystemMonitor(db, identity)
      : await buildAgriculturalMonitor(db, identity);
    return res.json({ success: true, count: data.subjects.length, data });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/activity', requireAuth, async (req, res) => {
  try {
    if (!db) return res.status(503).json({ success: false, error: 'Database is unavailable.' });
    const identity = actor(req.session.user);
    const data = await recordActivity(db, {
      userId: identity.userId,
      ...clientIdentity(req),
      event: req.body?.event || 'HEARTBEAT',
      metadata: metadata(req.body)
    });
    return res.json({ success: true, data });
  } catch (error) {
    return res.status(400).json({ success: false, error: error.message });
  }
});

router.post('/sync', requireAuth, requireRole(AGRICULTURAL_ROLES), async (req, res) => {
  try {
    if (!db) return res.status(503).json({ success: false, error: 'Database is unavailable.' });
    const identity = actor(req.session.user);
    const data = await recordSyncTelemetry(db, {
      userId: identity.userId,
      ...clientIdentity(req),
      pendingMutationCount: req.body?.pendingMutationCount,
      failedMutationCount: req.body?.failedMutationCount,
      syncState: req.body?.syncState,
      connectionState: req.body?.connectionState,
      syncSucceeded: req.body?.syncSucceeded === true,
      metadata: metadata(req.body)
    });
    return res.json({ success: true, data });
  } catch (error) {
    return res.status(400).json({ success: false, error: error.message });
  }
});

// Compatibility endpoint for deployed clients. It reports a buffer snapshot
// but deliberately cannot claim a successful synchronization.
router.put('/:legacyDeviceId', requireAuth, requireRole(AGRICULTURAL_ROLES), async (req, res) => {
  try {
    if (!db) return res.status(503).json({ success: false, error: 'Database is unavailable.' });
    const identity = actor(req.session.user);
    const pending = Number(req.body?.cachedLogs || 0);
    const data = await recordSyncTelemetry(db, {
      userId: identity.userId,
      ...clientIdentity(req),
      clientInstanceId: req.headers['x-client-instance-id'] || req.body?.clientInstanceId || req.params.legacyDeviceId,
      pendingMutationCount: pending,
      failedMutationCount: 0,
      syncState: pending > 0 ? 'PENDING_SYNC' : 'UNKNOWN',
      connectionState: 'ONLINE',
      syncSucceeded: false,
      metadata: metadata(req.body)
    });
    return res.json({ success: true, data });
  } catch (error) {
    return res.status(400).json({ success: false, error: error.message });
  }
});

module.exports = router;
