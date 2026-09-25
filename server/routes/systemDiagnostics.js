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
      db.collection(COLLECTIONS.USERS).count().get(),
      db.collection(COLLECTIONS.BLOCK_FARMS).count().get(),
      db.collection(COLLECTIONS.FIELDS).get(),
      db.collection(COLLECTIONS.OPERATION_LOGS).count().get(),
      db.collection(COLLECTIONS.CROP_CYCLES).get(),
      db.collection(COLLECTIONS.SRA_PRICES).count().get()
    ]);

    const cycleSummary = summarizeCropYearCycles(cropCycles.docs, fields.docs);

    return res.json({
      success: true,
      data: {
        users: users.data().count,
        blockFarms: blockFarms.data().count,
        fields: fields.size,
        operations: operations.data().count,
        prices: prices.data().count,
        ...cycleSummary
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
