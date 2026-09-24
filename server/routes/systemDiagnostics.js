'use strict';

const express = require('express');
const router = express.Router();
const { db } = require('../firebase-admin');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/roleGuard');
const { COLLECTIONS, ROLES } = require('../schema/firestoreSchema');
const { summarizeCropYearCycles } = require('../services/systemDiagnosticsService');

router.get('/', requireAuth, requireRole([ROLES.SUPER_ADMIN]), async (req, res) => {
  try {
    if (!db) return res.status(503).json({ success: false, error: 'Database is unavailable.' });

    const [users, blockFarms, fields, operations, cropCycles, prices] = await Promise.all([
      db.collection(COLLECTIONS.USERS).get(),
      db.collection(COLLECTIONS.BLOCK_FARMS).get(),
      db.collection(COLLECTIONS.FIELDS).get(),
      db.collection(COLLECTIONS.OPERATION_LOGS).get(),
      db.collection(COLLECTIONS.CROP_CYCLES).get(),
      db.collection(COLLECTIONS.SRA_PRICES).get()
    ]);

    const cycleSummary = summarizeCropYearCycles(cropCycles.docs, fields.docs);

    return res.json({
      success: true,
      data: {
        users: users.size,
        blockFarms: blockFarms.size,
        fields: fields.size,
        operations: operations.size,
        prices: prices.size,
        ...cycleSummary
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
