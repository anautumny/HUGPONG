import { fromTicket } from './firestoreSchema';
import { authenticatedRequest, subscribeToAuthenticatedResource } from './apiClient';
import { sortNewestFirst } from '../utils/recordOrdering';
import { reportWebSync } from './telemetryService';
import {
  TICKET_CATEGORIES,
  TICKET_STATUSES,
  canCreateSupportTicket,
  canonicalSupportRole
} from '../domain/supportTickets';

export const TICKET_PRIORITIES = Object.freeze(['LOW', 'NORMAL', 'HIGH', 'URGENT']);
export { TICKET_CATEGORIES, TICKET_STATUSES };

const OUTBOX_KEY = 'hugpong_support_ticket_outbox_v1';

function userId(user = {}) {
  return String(user.employeeId || user.userId || user.id || '').trim();
}

function loadOutbox() {
  try {
    const parsed = JSON.parse(localStorage.getItem(OUTBOX_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveOutbox(queue) {
  localStorage.setItem(OUTBOX_KEY, JSON.stringify(queue));
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('hugpong:ticket-outbox'));
}

function ticketId() {
  const random = globalThis.crypto?.randomUUID?.().replace(/-/g, '').slice(0, 10).toUpperCase()
    || `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`.toUpperCase();
  return `TCK-${new Date().getFullYear()}-${random}`;
}

function pendingTicket(entry) {
  return fromTicket(entry.payload.id, {
    ...entry.payload,
    createdByUserId: entry.ownerId,
    requesterName: entry.requesterName,
    requesterRole: entry.requesterRole,
    status: 'PENDING_SUBMISSION',
    createdAt: entry.createdAt,
    updatedAt: entry.createdAt,
    messages: [{
      messageId: `${entry.payload.id}-LOCAL`,
      authorUserId: entry.ownerId,
      authorName: entry.requesterName,
      authorRole: entry.requesterRole,
      visibility: 'PUBLIC',
      content: entry.payload.details,
      createdAt: entry.createdAt
    }]
  });
}

export function getPendingTickets(user) {
  const ownerId = userId(user);
  return loadOutbox().filter(entry => entry.ownerId === ownerId).map(pendingTicket);
}

export function getPendingTicketMutationCount(user) {
  return getPendingTickets(user).length;
}

function reportTicketOutbox(user, { processed = 0, failed = 0 } = {}) {
  const role = canonicalSupportRole(user?.canonicalRole || user?.role || user?.roleKey);
  if (role !== 'FARM_MANAGER') return;
  const pending = getPendingTicketMutationCount(user);
  reportWebSync({
    pendingMutationCount: pending,
    failedMutationCount: failed,
    syncState: failed > 0 ? 'SYNC_FAILED' : pending > 0 ? 'PENDING_SYNC' : processed > 0 ? 'UP_TO_DATE' : 'UNKNOWN',
    syncSucceeded: processed > 0 && failed === 0
  });
}

async function sendOutboxEntry(entry) {
  return authenticatedRequest('/api/tickets', { method: 'POST', body: entry.payload });
}

export async function flushTicketOutbox(user) {
  const ownerId = userId(user);
  if (!ownerId || (typeof navigator !== 'undefined' && navigator.onLine === false)) return { processed: 0, remaining: loadOutbox().length };
  let queue = loadOutbox();
  let processed = 0;
  for (const entry of queue.filter(item => item.ownerId === ownerId)) {
    try {
      await sendOutboxEntry(entry);
      queue = queue.filter(item => item.id !== entry.id);
      saveOutbox(queue);
      processed += 1;
    } catch (error) {
      if (error.isNetworkError) break;
      queue = queue.filter(item => item.id !== entry.id);
      saveOutbox(queue);
      throw error;
    }
  }
  const result = { processed, remaining: queue.filter(item => item.ownerId === ownerId).length };
  reportTicketOutbox(user, { processed });
  return result;
}

function mergePending(tickets, user) {
  const pending = getPendingTickets(user);
  const remoteIds = new Set(tickets.map(ticket => ticket.id));
  return sortNewestFirst([...pending.filter(ticket => !remoteIds.has(ticket.id)), ...tickets], ['updatedAt', 'createdAt']);
}

export function subscribeToTicketsData({ user, view = 'active', category = null, onUpdate, onError }) {
  const params = new URLSearchParams({ view, limit: '20' });
  if (category) params.set('category', category);
  const path = `/api/tickets?${params.toString()}`;
  const publish = response => {
    const remote = (response.data || []).map(ticket => fromTicket(ticket.id, ticket));
    const tickets = view === 'active' ? mergePending(remote, user) : sortNewestFirst(remote, ['updatedAt', 'createdAt']);
    onUpdate({ tickets, isLoading: false, error: null, hasMore: response.hasMore, nextCursor: response.nextCursor });
  };
  const subscriptionOptions = {
    onData: publish,
    onError: error => {
      if (view === 'active') onUpdate({ tickets: getPendingTickets(user), isLoading: false, error: error.message });
      if (onError) onError(error);
    }
  };
  const unsubscribe = view === 'history' || category
    ? subscribeToAuthenticatedResource(path, subscriptionOptions)
    : subscribeToAuthenticatedResource('/api/tickets', subscriptionOptions);
  const handleOutbox = () => {
    if (view === 'active') fetchTicketPage({ view, user }).then(publish).catch(() => {});
  };
  const handleOnline = () => flushTicketOutbox(user).then(handleOutbox).catch(error => onError?.(error));
  window.addEventListener('hugpong:ticket-outbox', handleOutbox);
  window.addEventListener('online', handleOnline);
  handleOnline();
  return () => {
    unsubscribe?.();
    window.removeEventListener('hugpong:ticket-outbox', handleOutbox);
    window.removeEventListener('online', handleOnline);
  };
}

export async function fetchTicketPage({ view = 'active', cursor = null, limit = 20, user = null, category = null } = {}) {
  const params = new URLSearchParams({ view, limit: String(limit) });
  if (cursor) params.set('cursor', cursor);
  if (category) params.set('category', category);
  const response = await authenticatedRequest(`/api/tickets?${params.toString()}`);
  if (view === 'active' && !cursor && user) {
    response.data = mergePending((response.data || []).map(ticket => fromTicket(ticket.id, ticket)), user);
  }
  return response;
}

export async function fetchTickets() {
  return authenticatedRequest('/api/tickets');
}

export async function createTicket(payload, user = {}) {
  const role = canonicalSupportRole(user.canonicalRole || user.role || user.roleKey);
  if (!canCreateSupportTicket(role)) {
    const error = new Error('Super Admin handles support requests and cannot create a normal support ticket.');
    error.status = 403;
    throw error;
  }
  const id = payload.id || ticketId();
  const createdAt = new Date().toISOString();
  const entry = {
    id,
    ownerId: userId(user),
    requesterName: user.name || user.displayName || 'HUGPONG User',
    requesterRole: role,
    createdAt,
    payload: { ...payload, id }
  };
  const queue = loadOutbox();
  if (!queue.some(item => item.id === id)) saveOutbox([...queue, entry]);
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { success: true, queued: true, data: pendingTicket(entry) };
  }
  try {
    const response = await sendOutboxEntry(entry);
    saveOutbox(loadOutbox().filter(item => item.id !== id));
    reportTicketOutbox(user, { processed: 1 });
    return { ...response, queued: false };
  } catch (error) {
    if (error.isNetworkError) return { success: true, queued: true, data: pendingTicket(entry) };
    saveOutbox(loadOutbox().filter(item => item.id !== id));
    reportTicketOutbox(user, { failed: 1 });
    throw error;
  }
}

export async function addTicketMessage(ticketIdValue, content) {
  return authenticatedRequest(`/api/tickets/${encodeURIComponent(ticketIdValue)}/messages`, {
    method: 'POST', body: { content }
  });
}

export async function updateTicket(ticketIdValue, payload) {
  return authenticatedRequest(`/api/tickets/${encodeURIComponent(ticketIdValue)}`, {
    method: 'PATCH', body: payload
  });
}
