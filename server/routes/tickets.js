'use strict';

const express = require('express');
const router = express.Router();
const { db } = require('../firebase-admin');
const { requireAuth } = require('../middleware/auth');
const { assertFieldScope } = require('../services/resourceScope');
const {
  COLLECTIONS, ROLES, TICKET_PRIORITIES, canonicalRole, enumValue,
  nullableId, nowIso, optionalString, requiredString
} = require('../schema/firestoreSchema');
const { readMutationContext } = require('../services/mutationContext');
const { createTicketId, createSystemId } = require('../domain/systemIds');
const { queueAuditEvent } = require('../services/auditWriter');
const {
  ACTIVE_TICKET_STATUSES, canCreateSupportTicket, canManageSupportTickets,
  canonicalTicketStatus, assertTicketCategory, assertStatusTransition, ticketViewStatuses
} = require('../domain/supportTickets');

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;
let missingIndexFallbackLogged = false;

function identity(user) {
  return {
    userId: String(user?.employeeId || user?.userId || '').trim(),
    name: String(user?.name || user?.displayName || 'HUGPONG User').trim(),
    role: canonicalRole(user?.canonicalRole || user?.role || user?.roleKey)
  };
}

function pageSize(value) {
  const parsed = Number(value || DEFAULT_PAGE_SIZE);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw Object.assign(new Error('limit must be a positive integer.'), { status: 400 });
  }
  return Math.min(parsed, MAX_PAGE_SIZE);
}

function normalizedTicket(document) {
  const value = document.data ? document.data() : document;
  return {
    id: document.id || value.id,
    ...value,
    status: canonicalTicketStatus(value.status),
    messages: Array.isArray(value.messages) ? value.messages : [],
    statusHistory: Array.isArray(value.statusHistory) ? value.statusHistory : []
  };
}

async function presentTickets(tickets) {
  const ids = [...new Set(tickets.map(ticket => String(ticket.createdByUserId || '').trim()).filter(Boolean))];
  const entries = await Promise.all(ids.map(async userId => {
    const snapshot = await db.collection(COLLECTIONS.USERS).doc(userId).get();
    return [userId, snapshot.exists ? snapshot.data() : null];
  }));
  const directory = new Map(entries);
  return tickets.map(ticket => {
    const requester = directory.get(String(ticket.createdByUserId || '').trim());
    const requesterRole = canonicalRole(ticket.requesterRole || requester?.role);
    return {
      ...ticket,
      requesterName: ticket.requesterName || requester?.displayName || requester?.name || 'Unknown requester',
      requesterRole: requesterRole || ticket.requesterRole || ''
    };
  });
}

function assertCanRead(ticket, actor) {
  if (canManageSupportTickets(actor.role)) return;
  if (ticket.createdByUserId !== actor.userId) {
    throw Object.assign(new Error('You may view only your own support tickets.'), { status: 403 });
  }
}

function isMissingIndexError(error) {
  const code = String(error?.code ?? '').toLowerCase();
  return code === '9'
    || code === 'failed-precondition'
    || code === 'failed_precondition'
    || /requires an index/i.test(String(error?.message || ''));
}

function updatedAtMillis(ticket) {
  const value = ticket?.updatedAt;
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (typeof value?._seconds === 'number') return value._seconds * 1000;
  const parsed = Date.parse(value || '');
  return Number.isFinite(parsed) ? parsed : 0;
}

function matchesTicketFilters(ticket, req, actor, statuses) {
  if (!canManageSupportTickets(actor.role) && ticket.createdByUserId !== actor.userId) return false;
  if (req.query.category && ticket.category !== req.query.category) return false;
  if (req.query.requesterRole && canManageSupportTickets(actor.role)
    && canonicalRole(ticket.requesterRole) !== canonicalRole(req.query.requesterRole)) return false;
  if (req.query.blockFarmId && canManageSupportTickets(actor.role)
    && String(ticket.blockFarmId || '').trim().toUpperCase() !== String(req.query.blockFarmId).trim().toUpperCase()) return false;
  return statuses.includes(canonicalTicketStatus(ticket.status));
}

async function listTicketsWithoutCompositeIndex(req, actor, limit, statuses) {
  let fallbackQuery = db.collection(COLLECTIONS.SUPPORT_TICKETS);
  if (!canManageSupportTickets(actor.role)) {
    fallbackQuery = fallbackQuery.where('createdByUserId', '==', actor.userId);
  }
  const snapshot = await fallbackQuery.get();
  let rows = snapshot.docs
    .map(normalizedTicket)
    .filter(ticket => matchesTicketFilters(ticket, req, actor, statuses))
    .sort((left, right) => updatedAtMillis(right) - updatedAtMillis(left)
      || String(right.id).localeCompare(String(left.id)));
  if (req.query.cursor) {
    const cursorIndex = rows.findIndex(ticket => ticket.id === String(req.query.cursor));
    if (cursorIndex >= 0) rows = rows.slice(cursorIndex + 1);
  }
  const hasMore = rows.length > limit;
  const data = await presentTickets(rows.slice(0, limit));
  return { data, hasMore };
}

async function listTickets(req) {
  const actor = identity(req.session.user);
  const limit = pageSize(req.query.limit);
  const statuses = ticketViewStatuses(req.query.view);
  let query = db.collection(COLLECTIONS.SUPPORT_TICKETS);
  if (!canManageSupportTickets(actor.role)) {
    if (!canCreateSupportTicket(actor.role)) {
      throw Object.assign(new Error('Role is not permitted to access support tickets.'), { status: 403 });
    }
    query = query.where('createdByUserId', '==', actor.userId);
  }
  if (req.query.category) query = query.where('category', '==', assertTicketCategory(req.query.category));
  if (req.query.requesterRole && canManageSupportTickets(actor.role)) {
    const requesterRole = canonicalRole(req.query.requesterRole);
    if (!requesterRole) throw Object.assign(new Error('requesterRole is invalid.'), { status: 400 });
    query = query.where('requesterRole', '==', requesterRole);
  }
  if (req.query.blockFarmId && canManageSupportTickets(actor.role)) {
    query = query.where('blockFarmId', '==', String(req.query.blockFarmId).trim().toUpperCase());
  }
  query = query.where('status', 'in', statuses).orderBy('updatedAt', 'desc');
  if (req.query.cursor) {
    const cursor = await db.collection(COLLECTIONS.SUPPORT_TICKETS).doc(String(req.query.cursor)).get();
    if (cursor.exists) {
      assertCanRead(cursor.data(), actor);
      query = query.startAfter(cursor);
    }
  }
  let data;
  let hasMore;
  try {
    const snapshot = await query.limit(limit + 1).get();
    const rows = snapshot.docs.map(normalizedTicket);
    hasMore = rows.length > limit;
    data = await presentTickets(rows.slice(0, limit));
  } catch (error) {
    if (!isMissingIndexError(error)) throw error;
    if (!missingIndexFallbackLogged) {
      missingIndexFallbackLogged = true;
      console.warn('[Tickets] Composite index unavailable; using the authorization-scoped fallback query.');
    }
    ({ data, hasMore } = await listTicketsWithoutCompositeIndex(req, actor, limit, statuses));
  }
  return {
    data,
    hasMore,
    nextCursor: hasMore ? data[data.length - 1]?.id || null : null,
    pageSize: limit,
    view: String(req.query.view || 'active').toLowerCase() === 'history' ? 'history' : 'active'
  };
}

router.get('/', requireAuth, async (req, res) => {
  try {
    if (!db) return res.status(503).json({ success: false, error: 'Database is unavailable.' });
    const page = await listTickets(req);
    return res.json({ success: true, count: page.data.length, ...page });
  } catch (error) {
    return res.status(error.status || 500).json({ success: false, error: error.message });
  }
});

router.get('/:id', requireAuth, async (req, res) => {
  try {
    if (!db) return res.status(503).json({ success: false, error: 'Database is unavailable.' });
    const snapshot = await db.collection(COLLECTIONS.SUPPORT_TICKETS).doc(req.params.id).get();
    if (!snapshot.exists) return res.status(404).json({ success: false, error: 'Support ticket not found.' });
    const ticket = normalizedTicket(snapshot);
    assertCanRead(ticket, identity(req.session.user));
    const [data] = await presentTickets([ticket]);
    return res.json({ success: true, data });
  } catch (error) {
    return res.status(error.status || 500).json({ success: false, error: error.message });
  }
});

router.post('/', requireAuth, async (req, res) => {
  try {
    if (!db) return res.status(503).json({ success: false, error: 'Database is unavailable.' });
    readMutationContext(req);
    const actor = identity(req.session.user);
    if (!canCreateSupportTicket(actor.role)) {
      return res.status(403).json({ success: false, error: 'Super Admin handles support requests and cannot create a normal support ticket.' });
    }
    const now = nowIso();
    const ticketId = String(req.body.id || createTicketId()).trim().toUpperCase();
    if (!/^[A-Z0-9_-]{8,100}$/.test(ticketId)) throw new Error('Ticket ID is invalid.');
    const fieldId = nullableId(req.body.fieldId);
    let blockFarmId = nullableId(req.session.user.blockFarmId);
    if (fieldId) {
      const scope = await assertFieldScope(fieldId, req.session.user, [ROLES.MEMBER_FARMER, ROLES.FARM_MANAGER, ROLES.SRA_ADMIN]);
      blockFarmId = scope.field.blockFarmId || blockFarmId;
    }
    const title = requiredString(req.body.title || req.body.subject, 'subject', { max: 300 });
    const details = requiredString(req.body.details || req.body.description, 'description', { max: 5000 });
    const payload = {
      createdByUserId: actor.userId,
      requesterName: actor.name,
      requesterRole: actor.role,
      blockFarmId,
      fieldId,
      operationId: nullableId(req.body.operationId),
      auditReportId: nullableId(req.body.auditReportId),
      title,
      category: assertTicketCategory(req.body.category),
      priority: enumValue(req.body.priority || 'NORMAL', TICKET_PRIORITIES, 'priority'),
      status: 'OPEN',
      details,
      messages: [{
        messageId: `${ticketId}-MSG-1`, authorUserId: actor.userId, authorName: actor.name,
        authorRole: actor.role, visibility: 'PUBLIC', content: details, createdAt: now
      }],
      statusHistory: [{ from: null, to: 'OPEN', changedByUserId: actor.userId, changedByRole: actor.role, changedAt: now }],
      resolutionNotes: '', createdAt: now, updatedAt: now,
      resolvedAt: null, resolvedByUserId: null, closedAt: null, closedByUserId: null
    };
    const ref = db.collection(COLLECTIONS.SUPPORT_TICKETS).doc(ticketId);
    const result = await db.runTransaction(async transaction => {
      const existing = await transaction.get(ref);
      if (existing.exists) {
        const current = normalizedTicket(existing);
        if (current.createdByUserId === actor.userId && current.title === payload.title) {
          return { replayed: true, ticket: current };
        }
        throw Object.assign(new Error('Ticket ID already belongs to another ticket.'), { status: 409 });
      }
      transaction.create(ref, payload);
      queueAuditEvent(transaction, db, {
        eventType: 'SUPPORT_TICKET_CREATED',
        actorUserId: actor.userId,
        entityType: 'SUPPORT_TICKET',
        entityId: ticketId,
        blockFarmId,
        details: `Created support ticket ${ticketId}.`,
        createdAt: now
      });
      return { replayed: false, ticket: { id: ticketId, ...payload } };
    });
    const [data] = await presentTickets([result.ticket]);
    return res.status(result.replayed ? 200 : 201).json({ success: true, replayed: result.replayed, data });
  } catch (error) {
    return res.status(error.status || (/already exists/i.test(error.message) ? 409 : 400)).json({ success: false, error: error.message });
  }
});

router.post('/:id/messages', requireAuth, async (req, res) => {
  try {
    if (!db) return res.status(503).json({ success: false, error: 'Database is unavailable.' });
    readMutationContext(req);
    const actor = identity(req.session.user);
    const ref = db.collection(COLLECTIONS.SUPPORT_TICKETS).doc(req.params.id);
    const content = requiredString(req.body.content || req.body.message, 'message', { max: 5000 });
    const now = nowIso();
    const requestedMessageId = String(req.body.messageId || '').trim().toUpperCase();
    if (requestedMessageId && !/^[A-Z0-9_-]{8,160}$/.test(requestedMessageId)) {
      throw new Error('messageId is invalid.');
    }
    const result = await db.runTransaction(async transaction => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists) throw Object.assign(new Error('Support ticket not found.'), { status: 404 });
      const current = normalizedTicket(snapshot);
      assertCanRead(current, actor);
      if (!ACTIVE_TICKET_STATUSES.includes(current.status)) {
        throw Object.assign(new Error('Follow-up messages are allowed only while a ticket is active.'), { status: 409 });
      }
      if (requestedMessageId && current.messages.some(message => message.messageId === requestedMessageId)) {
        return { replayed: true, ticket: current };
      }
      const messageId = requestedMessageId || createSystemId('MSG');
      const messages = [...current.messages, {
        messageId, authorUserId: actor.userId, authorName: actor.name, authorRole: actor.role,
        visibility: 'PUBLIC', content, createdAt: now
      }];
      transaction.update(ref, { messages, updatedAt: now });
      queueAuditEvent(transaction, db, {
        eventType: 'SUPPORT_TICKET_MESSAGE_ADDED',
        actorUserId: actor.userId,
        entityType: 'SUPPORT_TICKET',
        entityId: snapshot.id,
        blockFarmId: current.blockFarmId,
        details: `Added a message to support ticket ${snapshot.id}.`,
        createdAt: now
      });
      return { replayed: false, ticket: { ...current, messages, updatedAt: now } };
    });
    const [data] = await presentTickets([result.ticket]);
    return res.json({ success: true, replayed: result.replayed, data });
  } catch (error) {
    return res.status(error.status || 400).json({ success: false, error: error.message });
  }
});

router.patch('/:id', requireAuth, async (req, res) => {
  try {
    if (!db) return res.status(503).json({ success: false, error: 'Database is unavailable.' });
    readMutationContext(req);
    const actor = identity(req.session.user);
    if (!canManageSupportTickets(actor.role)) {
      return res.status(403).json({ success: false, error: 'Only Super Admin may update support ticket status.' });
    }
    const ref = db.collection(COLLECTIONS.SUPPORT_TICKETS).doc(req.params.id);
    const now = nowIso();
    const response = optionalString(req.body.response || req.body.resolutionNotes, { max: 5000 });
    const ticket = await db.runTransaction(async transaction => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists) throw Object.assign(new Error('Support ticket not found.'), { status: 404 });
      const current = normalizedTicket(snapshot);
      const status = req.body.status == null ? current.status : assertStatusTransition(current.status, req.body.status);
      const messages = response ? [...current.messages, {
        messageId: createSystemId('MSG'), authorUserId: actor.userId, authorName: actor.name, authorRole: actor.role,
        visibility: 'PUBLIC', content: response, createdAt: now
      }] : current.messages;
      const changed = status !== current.status;
      const update = {
        status,
        priority: req.body.priority == null ? (current.priority || 'NORMAL') : enumValue(req.body.priority, TICKET_PRIORITIES, 'priority'),
        messages,
        statusHistory: changed ? [...current.statusHistory, {
          from: current.status, to: status, changedByUserId: actor.userId,
          changedByRole: actor.role, changedAt: now
        }] : current.statusHistory,
        resolutionNotes: status === 'RESOLVED' && response ? response : (current.resolutionNotes || ''),
        updatedAt: now,
        resolvedAt: ['RESOLVED', 'CLOSED'].includes(status) ? (current.resolvedAt || now) : null,
        resolvedByUserId: ['RESOLVED', 'CLOSED'].includes(status) ? (current.resolvedByUserId || actor.userId) : null,
        closedAt: status === 'CLOSED' ? (current.closedAt || now) : null,
        closedByUserId: status === 'CLOSED' ? (current.closedByUserId || actor.userId) : null
      };
      transaction.update(ref, update);
      queueAuditEvent(transaction, db, {
        eventType: 'SUPPORT_TICKET_UPDATED',
        actorUserId: actor.userId,
        entityType: 'SUPPORT_TICKET',
        entityId: snapshot.id,
        blockFarmId: current.blockFarmId,
        details: `Updated support ticket ${snapshot.id} to ${status}.`,
        createdAt: now
      });
      return { ...current, ...update };
    });
    const [data] = await presentTickets([ticket]);
    return res.json({ success: true, data });
  } catch (error) {
    return res.status(error.status || 400).json({ success: false, error: error.message });
  }
});

module.exports = router;
