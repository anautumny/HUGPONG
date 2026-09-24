/**
 * ══════════════════════════════════════════════════════════════
 * HUGPONG — Support Tickets Service
 * Authoritative ticket tracking, creation, and resolution API.
 * ══════════════════════════════════════════════════════════════
 */

import { fromTicket } from './firestoreSchema';
import { authenticatedRequest, subscribeToAuthenticatedResource } from './apiClient';
import { sortNewestFirst } from '../utils/recordOrdering';

export const TICKET_PRIORITIES = Object.freeze(['LOW', 'NORMAL', 'HIGH', 'URGENT']);
export const TICKET_STATUSES = Object.freeze(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']);

export const TICKET_CATEGORIES = Object.freeze([
  'General Support',
  'Field Registry',
  'Operational Logging',
  'Sync & Telemetry',
  'Account & Access',
  'Audit & Verification'
]);

/**
 * Periodic server-authoritative subscription to support tickets
 * @param {Object} options
 * @param {Object} options.user
 * @param {Function} options.onUpdate - Callback with { tickets, isLoading, error }
 * @param {Function} [options.onError]
 */
export function subscribeToTicketsData({ user, onUpdate, onError }) {
  return subscribeToAuthenticatedResource('/api/tickets', {
    onData: response => {
      const tickets = sortNewestFirst((response.data || [])
        .map(ticket => fromTicket(ticket.id, ticket)), ['createdAt']);
      onUpdate({ tickets, isLoading: false, error: null });
    },
    onError: error => {
      console.warn('[TicketsService] API subscription notice:', error.message);
      if (onError) onError(error);
    }
  });
}

/**
 * Fetch tickets via authoritative API
 */
export async function fetchTickets() {
  return authenticatedRequest('/api/tickets');
}

/**
 * Submit new support ticket
 */
export async function createTicket(payload) {
  return authenticatedRequest('/api/tickets', {
    method: 'POST',
    body: payload
  });
}

/**
 * Update ticket status or resolution (Super Admin only)
 */
export async function updateTicket(ticketId, payload) {
  return authenticatedRequest(`/api/tickets/${encodeURIComponent(ticketId)}`, {
    method: 'PATCH',
    body: payload
  });
}
