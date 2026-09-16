'use strict';

const express = require('express');
const router = express.Router();
const { db } = require('../firebase-admin');
const { requireAuth } = require('../middleware/auth');
const { COLLECTIONS, ROLES, canonicalRole, requiredString, optionalString, nowIso } = require('../schema/firestoreSchema');
const { assertFieldScope, assertBlockFarmScope, actor } = require('../services/resourceScope');
const { readMutationContext } = require('../services/mutationContext');

async function assertEventScope(entityType, entityId, user) {
  const role = canonicalRole(user.role || user.roleKey);
  if (role === ROLES.SRA_ADMIN || role === ROLES.SUPER_ADMIN) return;
  if (entityType === 'FIELD') return assertFieldScope(entityId, user);
  if (entityType === 'BLOCK_FARM') return assertBlockFarmScope(entityId, user, [ROLES.FARM_MANAGER]);
  if (entityType === 'OPERATION_LOG') {
    const log = await db.collection(COLLECTIONS.OPERATION_LOGS).doc(entityId).get();
    if (!log.exists) throw Object.assign(new Error('Operation log not found.'), { status: 404 });
    return assertFieldScope(log.data().fieldId, user);
  }
  if (entityType === 'SUPPORT_TICKET') {
    const ticket = await db.collection(COLLECTIONS.SUPPORT_TICKETS).doc(entityId).get();
    const identity = actor(user);
    if (!ticket.exists) throw Object.assign(new Error('Support ticket not found.'), { status: 404 });
    if (ticket.data().createdByUserId !== identity.userId) throw Object.assign(new Error('Ticket is outside the authenticated user scope.'), { status: 403 });
    return;
  }
  throw Object.assign(new Error('This role cannot create an audit event for that entity type.'), { status: 403 });
}

router.post('/', requireAuth, async (req, res) => {
  try {
    if (!db) return res.status(503).json({ success: false, error: 'Database is unavailable.' });
    readMutationContext(req);
    const entityType = requiredString(req.body.entityType, 'entityType', { max: 80 }).toUpperCase();
    const entityId = requiredString(req.body.entityId, 'entityId', { max: 120 });
    await assertEventScope(entityType, entityId, req.session.user);
    const identity = actor(req.session.user);
    const event = {
      eventType: requiredString(req.body.eventType, 'eventType', { max: 120 }).toUpperCase(),
      actorUserId: identity.userId,
      entityType,
      entityId,
      details: optionalString(req.body.details, { max: 4000 }),
      outcome: String(req.body.outcome || 'SUCCESS').toUpperCase() === 'FAILURE' ? 'FAILURE' : 'SUCCESS',
      createdAt: nowIso()
    };
    const ref = req.body.id
      ? db.collection(COLLECTIONS.AUDIT_LOGS).doc(requiredString(req.body.id, 'id', { max: 120 }))
      : db.collection(COLLECTIONS.AUDIT_LOGS).doc();
    const existing = await ref.get();
    if (existing.exists) {
      const current = existing.data();
      if (current.actorUserId === identity.userId && current.eventType === event.eventType && current.entityType === entityType && current.entityId === entityId) {
        return res.json({ success: true, replayed: true, data: { id: ref.id, ...current } });
      }
      return res.status(409).json({ success: false, error: 'Audit event ID already belongs to another event.' });
    }
    await ref.create(event);
    return res.status(201).json({ success: true, data: { id: ref.id, ...event } });
  } catch (error) {
    return res.status(error.status || 400).json({ success: false, error: error.message });
  }
});

module.exports = router;
