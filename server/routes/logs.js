'use strict';

const express = require('express');
const router = express.Router();
const { db } = require('../firebase-admin');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/roleGuard');
const { ROLES } = require('../schema/firestoreSchema');
const {
  createOperationRecord,
  amendOperationRecord,
  archiveOperationRecords
} = require('../services/cropCycleOperations');
const { listOperationRecords } = require('../services/operationQueryService');
const { listArchivedOperationPage } = require('../services/archiveQueryService');
const { readMutationContext } = require('../services/mutationContext');
const { attachTakeoverAuthorization } = require('../middleware/takeoverAuthorization');

router.get('/', requireAuth, async (req, res) => {
  try {
    if (!db) return res.status(503).json({ success: false, error: 'Database is unavailable.' });
    const data = await listOperationRecords(db, req.session.user, { status: req.query.status });
    return res.json({ success: true, count: data.length, data });
  } catch (error) {
    return res.status(error.status || 500).json({ success: false, error: error.message });
  }
});

router.get('/archive', requireAuth, async (req, res) => {
  try {
    if (!db) return res.status(503).json({ success: false, error: 'Database is unavailable.' });
    const page = await listArchivedOperationPage(db, req.session.user, req.query);
    return res.json({ success: true, count: page.data.length, ...page });
  } catch (error) {
    return res.status(error.status || 500).json({ success: false, error: error.message });
  }
});

router.post('/', requireAuth, requireRole([ROLES.MEMBER_FARMER, ROLES.FARM_MANAGER]), attachTakeoverAuthorization, async (req, res) => {
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

router.patch('/:id', requireAuth, requireRole([ROLES.MEMBER_FARMER, ROLES.FARM_MANAGER]), attachTakeoverAuthorization, async (req, res) => {
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

router.post('/archive', requireAuth, requireRole([ROLES.MEMBER_FARMER, ROLES.FARM_MANAGER]), attachTakeoverAuthorization, async (req, res) => {
  try {
    if (!db) return res.status(503).json({ success: false, error: 'Database is unavailable.' });
    const result = await archiveOperationRecords(db, req.body.ids, req.session.user, undefined, readMutationContext(req));
    return res.json({ success: true, ...result });
  } catch (error) {
    return res.status(error.status || 400).json({ success: false, error: error.message });
  }
});

module.exports = router;
