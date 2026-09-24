/**
 * ══════════════════════════════════════════════════════════════
 * HUGPONG — SRA Prices Service
 * Real-time price subscriptions and authoritative publication API.
 * ══════════════════════════════════════════════════════════════
 */

import { fromPrice } from './firestoreSchema';
import { authenticatedRequest, subscribeToAuthenticatedResource } from './apiClient';
import { sortNewestFirst } from '../utils/recordOrdering';

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
  return subscribeToAuthenticatedResource('/api/prices', {
    onData: response => {
      const prices = sortNewestFirst((response.data || []).map(item => fromPrice(item.id, item)), ['effectiveDate']);
      onUpdate({
        prices,
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
export async function fetchPrices() {
  return authenticatedRequest('/api/prices');
}

/**
 * SRA Admin: Publish new official weekly SRA price circular
 */
export async function publishPrice(payload) {
  return authenticatedRequest('/api/prices', {
    method: 'POST',
    body: payload
  });
}
