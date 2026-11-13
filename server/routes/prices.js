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
const { decoratePriceHistory, buildPriceAnalytics } = require('../services/priceAnalyticsService');
const { readMutationContext } = require('../services/mutationContext');
const { decodeCursor, pageEnvelope } = require('../services/cursorPagination');

const DEFAULT_PRICE_HISTORY_LIMIT = 52;

router.get('/', requireAuth, requireRole([ROLES.MEMBER_FARMER, ROLES.FARM_MANAGER, ROLES.SRA_ADMIN]), async (req, res) => {
  try {
    if (!db) return res.status(503).json({ success: false, error: 'Database is unavailable.' });
    const requestedLimit = req.query.limit == null ? DEFAULT_PRICE_HISTORY_LIMIT : Number(req.query.limit);
    if (!Number.isInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > 100) {
      return res.status(400).json({ success: false, error: 'limit must be an integer between 1 and 100.' });
    }
    let query = db.collection(COLLECTIONS.SRA_PRICES)
      .orderBy('effectiveDate', 'desc')
      .orderBy('publishedAt', 'desc')
      .orderBy('__name__', 'asc');
    const cursor = decodeCursor(req.query.cursor);
    if (cursor) {
      let values;
      try { values = JSON.parse(cursor.value); } catch { /* Older cursor: re-open from its actual record. */ }
      if (!Array.isArray(values) || values.length !== 2) {
        const previous = await db.collection(COLLECTIONS.SRA_PRICES).doc(cursor.id).get();
        if (!previous.exists) return res.status(400).json({ success: false, error: 'Price cursor expired. Reload price history.' });
        values = [previous.data().effectiveDate, previous.data().publishedAt];
      }
      query = query.startAfter(...values, cursor.id);
    }
    const snapshot = await query.limit(requestedLimit + 1).get();
    const { documents, page } = pageEnvelope(snapshot.docs, requestedLimit, document => JSON.stringify([document.data().effectiveDate, document.data().publishedAt]));
    const data = decoratePriceHistory(snapshot.docs.map(doc => ({ id: doc.id, ...buildSraPrice(doc.data()) })))
      .filter(row => documents.some(document => document.id === row.id));
    if (data.length) data[0].priceAnalytics = buildPriceAnalytics(data);
    return res.json({ success: true, count: data.length, data, page });
  } catch (error) {
    return res.status(error.status || 500).json({ success: false, error: error.message });
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
