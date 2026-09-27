'use strict';

const express = require('express');
const router = express.Router();
const { db } = require('../firebase-admin');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/roleGuard');
const {
  COLLECTIONS,
  ROLES,
  buildSraPrice
} = require('../schema/firestoreSchema');
const { publishSraPrice } = require('../services/priceService');
const { sortNewestFirst } = require('../services/recordOrdering');
const { readMutationContext } = require('../services/mutationContext');

router.get('/', requireAuth, requireRole([ROLES.MEMBER_FARMER, ROLES.FARM_MANAGER, ROLES.SRA_ADMIN]), async (req, res) => {
  try {
    if (!db) return res.status(503).json({ success: false, error: 'Database is unavailable.' });
    const snapshot = await db.collection(COLLECTIONS.SRA_PRICES).get();
    const data = sortNewestFirst(
      snapshot.docs.map(doc => ({ id: doc.id, ...buildSraPrice(doc.data()) })),
      ['effectiveDate']
    );
    return res.json({ success: true, count: data.length, data });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/', requireAuth, requireRole([ROLES.SRA_ADMIN]), async (req, res) => {
  try {
    if (!db) return res.status(503).json({ success: false, error: 'Database is unavailable.' });
    readMutationContext(req);
    const publication = await publishSraPrice(db, req.body, {
      publishedByUserId: req.session.user.employeeId || req.session.user.userId
    });
    return res.status(publication.created ? 201 : 200).json({ success: true, ...publication });
  } catch (error) {
    const status = error.statusCode || (/already exists/i.test(error.message) ? 409 : 400);
    return res.status(status).json({ success: false, error: error.message });
  }
});

module.exports = router;
