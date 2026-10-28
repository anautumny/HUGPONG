import { fromTicket } from './firestoreSchema';
import { authenticatedRequest, subscribeToAuthenticatedResource } from './apiClient';
import { assertWebOnline } from './onlinePolicy';
import { sortNewestFirst } from '../utils/recordOrdering';
import { TICKET_CATEGORIES, TICKET_STATUSES, canCreateSupportTicket, canonicalSupportRole } from '../domain/supportTickets';

export const TICKET_PRIORITIES = Object.freeze(['LOW', 'NORMAL', 'HIGH', 'URGENT']);
export { TICKET_CATEGORIES, TICKET_STATUSES };

export function subscribeToTicketsData({ view = 'active', category = null, onUpdate, onError }) {
  const params = new URLSearchParams({ view, limit: '20' });
  if (category) params.set('category', category);
  const publish = response => onUpdate({
    tickets: sortNewestFirst((response.data || []).map(ticket => fromTicket(ticket.id, ticket)), ['updatedAt', 'createdAt']),
    isLoading: false, error: null, hasMore: response.hasMore, nextCursor: response.nextCursor
  });
  const options = { onData: publish, onError };
  return view === 'history' || category
    ? subscribeToAuthenticatedResource(`/api/tickets?${params}`, options)
    : subscribeToAuthenticatedResource('/api/tickets', options);
}

export async function fetchTicketPage({ view = 'active', cursor = null, limit = 20, category = null } = {}) {
  const params = new URLSearchParams({ view, limit: String(limit) });
  if (cursor) params.set('cursor', cursor);
  if (category) params.set('category', category);
  return authenticatedRequest(`/api/tickets?${params}`);
}

export async function fetchTickets() {
  return authenticatedRequest('/api/tickets');
}

export async function createTicket(payload, user = {}) {
  assertWebOnline();
  const role = canonicalSupportRole(user.canonicalRole || user.role || user.roleKey);
  if (!canCreateSupportTicket(role)) {
    throw Object.assign(new Error('Super Admin handles support requests and cannot create a normal support ticket.'), { status: 403 });
  }
  return authenticatedRequest('/api/tickets', { method: 'POST', body: payload });
}

export async function addTicketMessage(ticketId, content) {
  return authenticatedRequest(`/api/tickets/${encodeURIComponent(ticketId)}/messages`, { method: 'POST', body: { content } });
}

export async function updateTicket(ticketId, payload) {
  return authenticatedRequest(`/api/tickets/${encodeURIComponent(ticketId)}`, { method: 'PATCH', body: payload });
}
