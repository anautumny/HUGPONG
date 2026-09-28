'use strict';

const express = require('express');
const router = express.Router();
const { db } = require('../firebase-admin');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/roleGuard');
const { COLLECTIONS, ROLES } = require('../schema/firestoreSchema');
const { canonicalStoredCropYear, summarizeCropYearCycles } = require('../services/systemDiagnosticsService');

function chunks(values, size = 30) {
  const result = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}

router.get('/', requireAuth, requireRole([ROLES.SUPER_ADMIN]), async (req, res) => {
  try {
    if (!db) return res.status(503).json({ success: false, error: 'Database is unavailable.' });

    const [users, blockFarms, fields, operations, cropCycles, activeCropCycles, archivedCropCycles, prices] = await Promise.all([
      db.collection(COLLECTIONS.USERS).count().get(),
      db.collection(COLLECTIONS.BLOCK_FARMS).count().get(),
      db.collection(COLLECTIONS.FIELDS).count().get(),
      db.collection(COLLECTIONS.OPERATION_LOGS).count().get(),
      db.collection(COLLECTIONS.CROP_CYCLES).count().get(),
      db.collection(COLLECTIONS.CROP_CYCLES).where('status', '==', 'ACTIVE').get(),
      db.collection(COLLECTIONS.CROP_CYCLES).where('status', '==', 'ARCHIVED').count().get(),
      db.collection(COLLECTIONS.SRA_PRICES).count().get()
    ]);

    const missingYearCycleIds = activeCropCycles.docs
      .filter(document => !canonicalStoredCropYear(document.data()?.cropYear))
      .map(document => document.id);
    const fallbackFieldSnapshots = await Promise.all(chunks(missingYearCycleIds).map(ids => (
      db.collection(COLLECTIONS.FIELDS).where('currentCycleId', 'in', ids).get()
    )));
    const fallbackFields = fallbackFieldSnapshots.flatMap(snapshot => snapshot.docs);
    const { activeCropYears } = summarizeCropYearCycles(activeCropCycles.docs, fallbackFields);

    return res.json({
      success: true,
      data: {
        users: users.data().count,
        blockFarms: blockFarms.data().count,
        fields: fields.data().count,
        operations: operations.data().count,
        prices: prices.data().count,
        cropCycles: cropCycles.data().count,
        activeCropCycles: activeCropCycles.size,
        archivedCropCycles: archivedCropCycles.data().count,
        activeCropYears
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
