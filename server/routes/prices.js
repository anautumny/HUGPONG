'use strict';

const express = require('express');
const router = express.Router();
const { db } = require('../firebase-admin');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/roleGuard');
const {
  COLLECTIONS,
  ROLES,
  requiredString,
  finiteNumber,
  calendarDate,
  nowIso
} = require('../schema/firestoreSchema');

router.get('/', requireAuth, async (req, res) => {
  try {
    if (!db) return res.status(503).json({ success: false, error: 'Database is unavailable.' });
    const snapshot = await db.collection(COLLECTIONS.SRA_PRICES).get();
    const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
      .sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate));
    return res.json({ success: true, count: data.length, data });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/', requireAuth, requireRole([ROLES.SRA_ADMIN]), async (req, res) => {
  try {
    if (!db) return res.status(503).json({ success: false, error: 'Database is unavailable.' });
    const publishedAt = nowIso();
    const priceId = req.body.id || `PRC-${Date.now().toString(36).toUpperCase()}`;
    const payload = {
      effectiveDate: calendarDate(req.body.effectiveDate, 'effectiveDate'),
      weekLabel: requiredString(req.body.weekLabel, 'weekLabel', { max: 100 }),
      sugarPricePerLkg: finiteNumber(req.body.sugarPricePerLkg, 'sugarPricePerLkg'),
      sugarPriceChange: finiteNumber(req.body.sugarPriceChange == null ? 0 : req.body.sugarPriceChange, 'sugarPriceChange', { min: -1000000, max: 1000000 }),
      molassesPricePerMetricTon: finiteNumber(req.body.molassesPricePerMetricTon, 'molassesPricePerMetricTon'),
      molassesPriceChange: finiteNumber(req.body.molassesPriceChange == null ? 0 : req.body.molassesPriceChange, 'molassesPriceChange', { min: -1000000, max: 1000000 }),
      circularNumber: requiredString(req.body.circularNumber, 'circularNumber', { max: 120 }),
      source: requiredString(req.body.source, 'source', { max: 300 }),
      publishedByUserId: String(req.session.user.employeeId || req.session.user.userId || '').trim(),
      publishedAt
    };
    await db.collection(COLLECTIONS.SRA_PRICES).doc(priceId).create(payload);
    return res.status(201).json({ success: true, data: { id: priceId, ...payload } });
  } catch (error) {
    const status = /already exists/i.test(error.message) ? 409 : 400;
    return res.status(status).json({ success: false, error: error.message });
  }
});

module.exports = router;
