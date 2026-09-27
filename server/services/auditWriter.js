'use strict';

const { COLLECTIONS, nowIso } = require('../schema/firestoreSchema');
const { createAuditEventId } = require('../domain/systemIds');

function clean(value) {
  return String(value || '').trim();
}

function buildAuditEvent(input = {}) {
  const eventType = clean(input.eventType).toUpperCase();
  const actorUserId = clean(input.actorUserId);
  const entityType = clean(input.entityType).toUpperCase();
  const entityId = clean(input.entityId);
  if (!eventType || !actorUserId || !entityType || !entityId) {
    throw new Error('Server audit events require an event type, actor, entity type, and entity ID.');
  }
  return {
    eventType,
    actorUserId,
    entityType,
    entityId,
    blockFarmId: clean(input.blockFarmId) || null,
    details: clean(input.details) || `${eventType} completed.`,
    outcome: clean(input.outcome).toUpperCase() || 'SUCCESS',
    createdAt: input.createdAt || nowIso()
  };
}

function queueAuditEvent(writer, database, input) {
  if (!writer || typeof writer.create !== 'function') throw new Error('An atomic database writer is required.');
  const id = input.id || createAuditEventId();
  const record = buildAuditEvent(input);
  writer.create(database.collection(COLLECTIONS.AUDIT_LOGS).doc(id), record);
  return { id, ...record };
}

module.exports = { buildAuditEvent, queueAuditEvent };
