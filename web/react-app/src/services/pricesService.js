/**
 * ══════════════════════════════════════════════════════════════
 * HUGPONG — SRA Prices Service
 * Real-time price subscriptions and authoritative publication API.
 * ══════════════════════════════════════════════════════════════
 */

import { db, collection, onSnapshot } from './firebaseClient';
import { COLLECTIONS, fromPrice } from './firestoreSchema';
import { authenticatedRequest } from './apiClient';

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
  let isSubscribed = true;

  // Authoritative API fetch first
  authenticatedRequest('/api/prices')
    .then(res => {
      if (!isSubscribed) return;
      if (res.success && Array.isArray(res.data)) {
        const sorted = res.data.map(item => fromPrice(item.id, item))
          .sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate));
        const current = sorted[0] || null;
        const previous = sorted[1] || null;
        onUpdate({ prices: sorted, currentPrice: current, previousPrice: previous, isLoading: false, error: null });
      }
    })
    .catch(err => {
      console.warn('[PricesService] Initial API fetch note:', err.message);
    });

  // Real-time Firestore snapshot listener
  let unsub = null;
  try {
    const pricesRef = collection(db, COLLECTIONS.SRA_PRICES);
    unsub = onSnapshot(
      pricesRef,
      snapshot => {
        if (!isSubscribed) return;
        const prices = [];
        snapshot.forEach(docSnap => {
          try {
            prices.push(fromPrice(docSnap.id, docSnap.data()));
          } catch (e) {
            console.warn('[PricesService] Skip price doc:', docSnap.id, e.message);
          }
        });

        prices.sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate));
        const current = prices[0] || null;
        const previous = prices[1] || null;
        onUpdate({ prices, currentPrice: current, previousPrice: previous, isLoading: false, error: null });
      },
      err => {
        console.warn('[PricesService] Snapshot listener note:', err.message);
        if (onError) onError(err);
      }
    );
  } catch (err) {
    console.warn('[PricesService] Could not establish Firestore listener:', err.message);
  }

  return () => {
    isSubscribed = false;
    if (typeof unsub === 'function') unsub();
  };
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
