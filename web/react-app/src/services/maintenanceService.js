/**
 * ══════════════════════════════════════════════════════════════
 * HUGPONG — Maintenance & System Health Service
 * Truthful system health checks, audit logs, and maintenance state.
 * Zero fabricated health percentages, zero artificial grades.
 * ══════════════════════════════════════════════════════════════
 */

import { db, collection, onSnapshot } from './firebaseClient';
import { COLLECTIONS } from './firestoreSchema';
import { authenticatedRequest } from './apiClient';

/**
 * Real-time subscription to system audit and security logs
 * @param {Object} options
 * @param {Function} options.onUpdate - Callback with { logs, isLoading, error }
 * @param {Function} [options.onError]
 */
export function subscribeToAuditLogs({ onUpdate, onError }) {
  let isSubscribed = true;

  let unsub = null;
  try {
    const logsRef = collection(db, COLLECTIONS.AUDIT_LOGS);
    unsub = onSnapshot(
      logsRef,
      snapshot => {
        if (!isSubscribed) return;
        const list = [];
        snapshot.forEach(docSnap => {
          try {
            const data = docSnap.data();
            list.push({
              id: docSnap.id,
              actorUserId: data.actorUserId || 'System',
              eventType: data.eventType || 'SYSTEM_EVENT',
              entityType: data.entityType || 'SYSTEM',
              entityId: data.entityId || docSnap.id,
              details: data.details || '',
              outcome: data.outcome || 'SUCCESS',
              createdAt: data.createdAt || null
            });
          } catch (e) {
            console.warn('[MaintenanceService] Skip audit log doc:', docSnap.id, e.message);
          }
        });

        list.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
        onUpdate({ logs: list, isLoading: false, error: null });
      },
      err => {
        console.warn('[MaintenanceService] Snapshot listener notice:', err.message);
        if (onError) onError(err);
      }
    );
  } catch (err) {
    console.warn('[MaintenanceService] Could not establish Firestore listener:', err.message);
  }

  return () => {
    isSubscribed = false;
    if (typeof unsub === 'function') unsub();
  };
}

/**
 * Verify real backend server and database availability
 * Measures genuine HTTP round-trip latency.
 */
export async function checkSystemHealth() {
  const start = Date.now();
  try {
    const res = await authenticatedRequest('/auth/session');
    const latencyMs = Date.now() - start;
    return {
      isApiConnected: Boolean(res.success),
      isDbAvailable: Boolean(res.authenticated || res.user),
      latencyMs,
      timestamp: new Date().toISOString(),
      error: null
    };
  } catch (err) {
    const latencyMs = Date.now() - start;
    return {
      isApiConnected: false,
      isDbAvailable: false,
      latencyMs,
      timestamp: new Date().toISOString(),
      error: err.message || 'Server connection failed.'
    };
  }
}
