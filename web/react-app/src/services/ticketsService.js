/**
 * ══════════════════════════════════════════════════════════════
 * HUGPONG — Support Tickets Service
 * Authoritative ticket tracking, creation, and resolution API.
 * ══════════════════════════════════════════════════════════════
 */

import { db, collection, onSnapshot } from './firebaseClient';
import { COLLECTIONS, fromTicket } from './firestoreSchema';
import { authenticatedRequest } from './apiClient';

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
 * Real-time subscription to support tickets
 * @param {Object} options
 * @param {Object} options.user
 * @param {Function} options.onUpdate - Callback with { tickets, isLoading, error }
 * @param {Function} [options.onError]
 */
export function subscribeToTicketsData({ user, onUpdate, onError }) {
  let isSubscribed = true;

  // Initial authoritative API fetch
  authenticatedRequest('/api/tickets')
    .then(res => {
      if (!isSubscribed) return;
      if (res.success && Array.isArray(res.data)) {
        const sorted = res.data.map(t => fromTicket(t.id, t))
          .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
        onUpdate({ tickets: sorted, isLoading: false, error: null });
      }
    })
    .catch(err => {
      console.warn('[TicketsService] Initial API fetch notice:', err.message);
    });

  // Real-time Firestore snapshot listener
  let unsub = null;
  try {
    const ticketsRef = collection(db, COLLECTIONS.SUPPORT_TICKETS);
    unsub = onSnapshot(
      ticketsRef,
      snapshot => {
        if (!isSubscribed) return;
        const actorId = String(user?.id || user?.employeeId || '').trim();
        const isSuperAdmin = String(user?.role || user?.roleKey || '').toUpperCase().replace(/ /g, '_') === 'SUPER_ADMIN';

        const list = [];
        snapshot.forEach(docSnap => {
          try {
            const data = docSnap.data();
            // Scoping: Super Admin sees all; others see their own
            if (isSuperAdmin || data.createdByUserId === actorId) {
              list.push(fromTicket(docSnap.id, data));
            }
          } catch (e) {
            console.warn('[TicketsService] Skip ticket doc:', docSnap.id, e.message);
          }
        });

        list.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
        onUpdate({ tickets: list, isLoading: false, error: null });
      },
      err => {
        console.warn('[TicketsService] Snapshot listener notice:', err.message);
        if (onError) onError(err);
      }
    );
  } catch (err) {
    console.warn('[TicketsService] Could not establish Firestore listener:', err.message);
  }

  return () => {
    isSubscribed = false;
    if (typeof unsub === 'function') unsub();
  };
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
