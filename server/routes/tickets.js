'use strict';

const express = require('express');
const router = express.Router();
const { db } = require('../firebase-admin');
const { requireAuth } = require('../middleware/auth');
const {
  COLLECTIONS,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  enumValue,
  optionalString,
  requiredString,
  nullableId,
  nowIso
} = require('../schema/firestoreSchema');

router.get('/', requireAuth, async (req, res) => {
  try {
    if (!db) return res.status(503).json({ success: false, error: 'Database is unavailable.' });
    const actorId = String(req.session.user.employeeId || req.session.user.userId || '').trim();
    const isSuperAdmin = String(req.session.user.role || '').toUpperCase() === 'SUPER ADMIN';
    const snapshot = await db.collection(COLLECTIONS.SUPPORT_TICKETS).get();
    const data = snapshot.docs
      .filter(doc => isSuperAdmin || doc.data().createdByUserId === actorId)
      .map(doc => ({ id: doc.id, ...doc.data() }));
    return res.json({ success: true, count: data.length, data });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/', requireAuth, async (req, res) => {
  try {
    if (!db) return res.status(503).json({ success: false, error: 'Database is unavailable.' });
    const now = nowIso();
    const ticketId = req.body.id || `TCK-${Date.now().toString(36).toUpperCase()}`;
    const payload = {
      createdByUserId: String(req.session.user.employeeId || req.session.user.userId || '').trim(),
      fieldId: nullableId(req.body.fieldId),
      title: requiredString(req.body.title, 'title', { max: 300 }),
      category: requiredString(req.body.category, 'category', { max: 120 }),
      priority: enumValue(req.body.priority || 'NORMAL', TICKET_PRIORITIES, 'priority'),
      status: 'OPEN',
      details: optionalString(req.body.details, { max: 5000 }),
      resolutionNotes: '',
      createdAt: now,
      updatedAt: now,
      resolvedAt: null,
      resolvedByUserId: null
    };
    await db.collection(COLLECTIONS.SUPPORT_TICKETS).doc(ticketId).create(payload);
    return res.status(201).json({ success: true, data: { id: ticketId, ...payload } });
  } catch (error) {
    const status = /already exists/i.test(error.message) ? 409 : 400;
    return res.status(status).json({ success: false, error: error.message });
  }
});

router.patch('/:id', requireAuth, async (req, res) => {
  try {
    if (!db) return res.status(503).json({ success: false, error: 'Database is unavailable.' });
    if (String(req.session.user.role || '').toUpperCase() !== 'SUPER ADMIN') {
      return res.status(403).json({ success: false, error: 'Only Super Admin may update support tickets.' });
    }
    const ref = db.collection(COLLECTIONS.SUPPORT_TICKETS).doc(req.params.id);
    const snapshot = await ref.get();
    if (!snapshot.exists) return res.status(404).json({ success: false, error: 'Support ticket not found.' });
    const status = enumValue(req.body.status || snapshot.data().status, TICKET_STATUSES, 'status');
    const now = nowIso();
    const resolved = status === 'RESOLVED' || status === 'CLOSED';
    const update = {
      status,
      resolutionNotes: optionalString(req.body.resolutionNotes == null ? snapshot.data().resolutionNotes : req.body.resolutionNotes, { max: 5000 }),
      updatedAt: now,
      resolvedAt: resolved ? (snapshot.data().resolvedAt || now) : null,
      resolvedByUserId: resolved ? (snapshot.data().resolvedByUserId || String(req.session.user.employeeId || '').trim()) : null
    };
    await ref.update(update);
    return res.json({ success: true, data: { id: snapshot.id, ...snapshot.data(), ...update } });
  } catch (error) {
    return res.status(400).json({ success: false, error: error.message });
  }
});

module.exports = router;
