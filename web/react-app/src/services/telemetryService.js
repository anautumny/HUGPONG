/**
 * ══════════════════════════════════════════════════════════════
 * HUGPONG — Telemetry & Sync Monitoring Service
 * Truthful mobile terminal status and synchronization monitoring.
 * Zero fake scores, zero artificial grades.
 * ══════════════════════════════════════════════════════════════
 */

import { db, collection, onSnapshot } from './firebaseClient';
import { COLLECTIONS } from './firestoreSchema';
import { authenticatedRequest } from './apiClient';

/**
 * Real-time subscription to mobile terminal diagnostics
 * @param {Object} options
 * @param {Function} options.onUpdate - Callback with { diagnostics, isLoading, error }
 * @param {Function} [options.onError]
 */
export function subscribeToTerminalDiagnostics({ onUpdate, onError }) {
  let isSubscribed = true;

  let unsub = null;
  try {
    const diagRef = collection(db, COLLECTIONS.TERMINAL_DIAGNOSTICS);
    unsub = onSnapshot(
      diagRef,
      snapshot => {
        if (!isSubscribed) return;
        const list = [];
        snapshot.forEach(docSnap => {
          try {
            const data = docSnap.data();
            list.push({
              id: docSnap.id,
              deviceId: docSnap.id,
              userId: data.userId || '',
              model: data.model || 'Android Terminal',
              os: data.os || 'Android',
              appVersion: data.appVersion || 'v1.0.0',
              battery: data.battery || '—',
              cachedLogs: Number(data.cachedLogs || 0),
              status: data.status || 'SYNCED',
              updatedAt: data.updatedAt || null
            });
          } catch (e) {
            console.warn('[TelemetryService] Skip diag doc:', docSnap.id, e.message);
          }
        });

        list.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
        onUpdate({ diagnostics: list, isLoading: false, error: null });
      },
      err => {
        console.warn('[TelemetryService] Snapshot listener notice:', err.message);
        if (onError) onError(err);
      }
    );
  } catch (err) {
    console.warn('[TelemetryService] Could not establish Firestore listener:', err.message);
  }

  return () => {
    isSubscribed = false;
    if (typeof unsub === 'function') unsub();
  };
}

/**
 * Update terminal telemetry for current device
 */
export async function updateDeviceTelemetry(deviceId, payload) {
  return authenticatedRequest(`/api/telemetry/${encodeURIComponent(deviceId)}`, {
    method: 'PUT',
    body: payload
  });
}

/**
 * Derive truthful connectivity status of a diagnostic record
 * @param {string|null} updatedAt - ISO timestamp
 * @returns {{ state: 'ACTIVE' | 'DELAYED' | 'OFFLINE', label: string, badgeClass: string }}
 */
export function evaluateNodeStatus(updatedAt) {
  if (!updatedAt) {
    return {
      state: 'OFFLINE',
      label: 'Offline / Never Synced',
      badgeClass: 'bg-danger-bg text-danger border-danger/20'
    };
  }

  const now = Date.now();
  const timestamp = new Date(updatedAt).getTime();
  if (isNaN(timestamp)) {
    return {
      state: 'OFFLINE',
      label: 'Offline',
      badgeClass: 'bg-danger-bg text-danger border-danger/20'
    };
  }

  const diffHours = (now - timestamp) / (1000 * 60 * 60);

  if (diffHours < 24) {
    return {
      state: 'ACTIVE',
      label: 'Active & Synced',
      badgeClass: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/60'
    };
  } else if (diffHours < 72) {
    const days = Math.floor(diffHours / 24);
    return {
      state: 'DELAYED',
      label: `Delayed (${days}d offline)`,
      badgeClass: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 border-amber-200 dark:border-amber-800/60'
    };
  } else {
    const days = Math.floor(diffHours / 24);
    return {
      state: 'OFFLINE',
      label: `Offline (${days}d inactive)`,
      badgeClass: 'bg-danger-bg text-danger border-danger/20'
    };
  }
}
