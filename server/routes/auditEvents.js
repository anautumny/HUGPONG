'use strict';

const express = require('express');
const router = express.Router();
const { admin, db } = require('../firebase-admin');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/roleGuard');
const { COLLECTIONS, ROLES } = require('../schema/firestoreSchema');
const { actor } = require('../services/resourceScope');
const { sortNewestFirst } = require('../services/recordOrdering');
const { enrichAuditEventsWithCropYears } = require('../services/auditCropYearContext');
const { pageLimit, decodeCursor, encodeCursor } = require('../services/cursorPagination');

function orderedAuditQuery(query, limit, cursor) {
  let ordered = query
    .orderBy('createdAt', 'desc')
    .orderBy(admin.firestore.FieldPath.documentId(), 'desc');
  if (cursor) ordered = ordered.startAfter(cursor.value, cursor.id);
  return ordered.limit(limit + 1);
}

router.get('/', requireAuth, requireRole([ROLES.FARM_MANAGER, ROLES.SRA_ADMIN, ROLES.SUPER_ADMIN]), async (req, res) => {
  try {
    if (!db) return res.status(503).json({ success: false, error: 'Database is unavailable.' });
    const identity = actor(req.session.user);
    const limit = pageLimit(req.query.limit);
    const cursor = decodeCursor(req.query.cursor);
    const recordsById = new Map();
    let sourceHasMore = false;

    if (identity.role === ROLES.FARM_MANAGER) {
      const farms = await db.collection(COLLECTIONS.BLOCK_FARMS)
        .where('managerUserId', '==', identity.userId)
        .get();
      const farmIds = farms.docs.map(document => document.id);
      const sources = [db.collection(COLLECTIONS.AUDIT_LOGS).where('actorUserId', '==', identity.userId)];
      for (let index = 0; index < farmIds.length; index += 10) {
        sources.push(db.collection(COLLECTIONS.AUDIT_LOGS)
          .where('blockFarmId', 'in', farmIds.slice(index, index + 10)));
      }
      const snapshots = await Promise.all(sources.map(query => orderedAuditQuery(query, limit, cursor).get()));
      sourceHasMore = snapshots.some(snapshot => snapshot.docs.length > limit);
      const ownEvents = snapshots.shift();
      ownEvents.docs.forEach(document => recordsById.set(document.id, { id: document.id, ...document.data() }));
      for (const farmEvents of snapshots) {
        farmEvents.docs.forEach(document => recordsById.set(document.id, { id: document.id, ...document.data() }));
      }
    } else {
      const snapshot = await orderedAuditQuery(db.collection(COLLECTIONS.AUDIT_LOGS), limit, cursor).get();
      sourceHasMore = snapshot.docs.length > limit;
      snapshot.docs.forEach(document => recordsById.set(document.id, { id: document.id, ...document.data() }));
    }

    const orderedRecords = Array.from(recordsById.values()).sort((left, right) => {
      const dateDelta = String(right.createdAt || '').localeCompare(String(left.createdAt || ''));
      return dateDelta || String(right.id).localeCompare(String(left.id));
    });
    const hasMore = sourceHasMore || orderedRecords.length > limit;
    const pageRecords = orderedRecords.slice(0, limit);
    const contextualRecords = await enrichAuditEventsWithCropYears(db, pageRecords);
    const data = sortNewestFirst(contextualRecords, ['createdAt']);
    const last = pageRecords.at(-1);

    return res.json({
      success: true,
      count: data.length,
      data,
      page: {
        limit,
        hasMore,
        nextCursor: hasMore && last ? encodeCursor(last.createdAt, last.id) : null
      }
    });
  } catch (error) {
    return res.status(error.status || 500).json({ success: false, error: error.message });
  }
});

router.post('/', requireAuth, async (req, res) => {
  return res.status(405).json({
    success: false,
    error: 'Audit events are created only by completed server operations.',
    code: 'AUDIT_EVENTS_SERVER_MANAGED'
  });
});

module.exports = router;
