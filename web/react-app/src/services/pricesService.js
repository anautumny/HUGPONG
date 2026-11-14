/**
 * ══════════════════════════════════════════════════════════════
 * HUGPONG — SRA Prices Service
 * Real-time price subscriptions and authoritative publication API.
 * ══════════════════════════════════════════════════════════════
 */

import { fromPrice } from './firestoreSchema';
import { authenticatedRequest, subscribeToAuthenticatedResource, captureAuthenticatedContext } from './apiClient';
import { sortNewestFirst } from '../utils/recordOrdering';
import { creationIntent } from './enrollmentIntentService';

/**
 * Calculate human-readable SRA week label from calendar date
 * e.g. "2026-09-18" -> "Week 3, September 2026"
 */
export function calculateSRAWeekLabel(dateString) {
  if (!dateString) return '';
  const d = new Date(dateString);
  if (isNaN(d.getTime())) return '';

  const day = d.getDate();
  const weekNum = Math.min(Math.ceil(day / 7), 5);
  const monthName = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  return `Week ${weekNum}, ${monthName}`;
}

/**
 * Real-time subscription to SRA price circulars
 * @param {Object} options
 * @param {Function} options.onUpdate - ({ prices: Array, currentPrice: Object|null, previousPrice: Object|null, isLoading: boolean, error: string|null })
 * @param {Function} [options.onError]
 */
export function subscribeToPrices({ onUpdate, onError }) {
  return subscribeToAuthenticatedResource('/api/prices?limit=52', {
    onData: response => {
      const prices = sortNewestFirst((response.data || []).map(item => fromPrice(item.id, item)), ['effectiveDate'], ['publishedAt']);
      onUpdate({
        prices,
        page: response.page,
        currentPrice: prices[0] || null,
        previousPrice: prices[1] || null,
        isLoading: false,
        error: null
      });
    },
    onError: error => {
      if (onError) onError(error);
    }
  });
}

/**
 * Fetch historical prices via API
 */
export async function fetchPrices({ cursor, limit = 100 } = {}) {
  const query = new URLSearchParams({ limit: String(limit) });
  if (cursor) query.set('cursor', cursor);
  return authenticatedRequest(`/api/prices?${query}`);
}

/**
 * SRA Admin: Publish new official weekly SRA price circular
 */
export async function publishPrice(payload, { ownerId } = {}) {
  const isCurrent = captureAuthenticatedContext();
  const intent = await creationIntent(ownerId, payload, 'prices');
  if (!isCurrent()) throw Object.assign(new Error('The signed-in account changed. Please try again.'), { code: 'AUTH_CONTEXT_CHANGED' });
  const result = await authenticatedRequest('/api/prices', {
    method: 'POST',
    body: { ...payload, _mutation: intent.mutation }
  });
  localStorage.removeItem(intent.storageKey);
  return result;
}
