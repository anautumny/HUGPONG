'use strict';

const { ROLES, canonicalRole } = require('../schema/firestoreSchema');

const SUPPORT_TICKET_CATEGORIES = Object.freeze([
  'Account / Login',
  'Synchronization',
  'Field / Operation Data',
  'Audit / QR',
  'SRA Price',
  'Other'
]);

const SUPPORT_TICKET_STATUSES = Object.freeze(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']);
const ACTIVE_TICKET_STATUSES = Object.freeze(['OPEN', 'IN_PROGRESS']);
const HISTORY_TICKET_STATUSES = Object.freeze(['RESOLVED', 'CLOSED']);
const SUPPORT_REQUESTER_ROLES = Object.freeze([
  ROLES.MEMBER_FARMER,
  ROLES.FARM_MANAGER,
  ROLES.SRA_ADMIN
]);

const STATUS_TRANSITIONS = Object.freeze({
  OPEN: Object.freeze(['IN_PROGRESS']),
  IN_PROGRESS: Object.freeze(['RESOLVED']),
  RESOLVED: Object.freeze(['CLOSED']),
  CLOSED: Object.freeze([])
});

function canCreateSupportTicket(role) {
  return SUPPORT_REQUESTER_ROLES.includes(canonicalRole(role));
}

function canManageSupportTickets(role) {
  return canonicalRole(role) === ROLES.SUPER_ADMIN;
}

function canonicalTicketStatus(value, fallback = 'OPEN') {
  const normalized = String(value || '').trim().toUpperCase().replace(/[\s-]+/g, '_');
  if (SUPPORT_TICKET_STATUSES.includes(normalized)) return normalized;
  // Historical records used PENDING for tickets that had already reached Firestore.
  if (normalized === 'PENDING') return 'OPEN';
  return fallback;
}

function assertTicketCategory(value) {
  const category = String(value || '').trim();
  if (!SUPPORT_TICKET_CATEGORIES.includes(category)) {
    throw Object.assign(new Error(`category must be one of: ${SUPPORT_TICKET_CATEGORIES.join(', ')}.`), { status: 400 });
  }
  return category;
}

function assertStatusTransition(fromValue, toValue) {
  const from = canonicalTicketStatus(fromValue);
  const to = canonicalTicketStatus(toValue, null);
  if (!to || !SUPPORT_TICKET_STATUSES.includes(to)) {
    throw Object.assign(new Error('A valid support ticket status is required.'), { status: 400 });
  }
  if (from === to) return to;
  if (!STATUS_TRANSITIONS[from]?.includes(to)) {
    throw Object.assign(new Error(`Support ticket status cannot move from ${from} to ${to}.`), { status: 409 });
  }
  return to;
}

function ticketViewStatuses(view) {
  return String(view || 'active').toLowerCase() === 'history'
    ? HISTORY_TICKET_STATUSES
    : ACTIVE_TICKET_STATUSES;
}

module.exports = {
  SUPPORT_TICKET_CATEGORIES,
  SUPPORT_TICKET_STATUSES,
  ACTIVE_TICKET_STATUSES,
  HISTORY_TICKET_STATUSES,
  SUPPORT_REQUESTER_ROLES,
  STATUS_TRANSITIONS,
  canCreateSupportTicket,
  canManageSupportTickets,
  canonicalTicketStatus,
  assertTicketCategory,
  assertStatusTransition,
  ticketViewStatuses
};
