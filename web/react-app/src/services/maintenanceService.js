/**
 * ══════════════════════════════════════════════════════════════
 * HUGPONG — Maintenance & System Health Service
 * Truthful system health checks, audit logs, and maintenance state.
 * Zero fabricated health percentages, zero artificial grades.
 * ══════════════════════════════════════════════════════════════
 */

import { authenticatedRead, authenticatedRequest, subscribeToAuthenticatedResource } from './apiClient';
import { sortNewestFirst } from '../utils/recordOrdering';

/**
 * Periodic server-authoritative subscription to system audit and security logs
 * @param {Object} options
 * @param {Function} options.onUpdate - Callback with { logs, isLoading, error }
 * @param {Function} [options.onError]
 */
export function subscribeToAuditLogs({ onUpdate, onError }) {
  let logs = [];
  let nextCursor = null;
  let hasMore = false;
  let loadingMore = false;

  const mapLogs = response => sortNewestFirst((response.data || []).map(data => ({
    id: data.id,
    actorUserId: data.actorUserId || 'System',
    eventType: data.eventType || 'SYSTEM_EVENT',
    entityType: data.entityType || 'SYSTEM',
    entityId: data.entityId || data.id,
    details: data.details || '',
    outcome: data.outcome || 'SUCCESS',
    createdAt: data.createdAt || null,
    cropYears: Array.isArray(data.cropYears) ? data.cropYears : []
  })), ['createdAt']);

  const notify = () => onUpdate({ logs, hasMore, isLoadingMore: loadingMore, isLoading: false, error: null });
  const unsubscribe = subscribeToAuthenticatedResource('/api/audit-events?limit=50', {
    onData: response => {
      logs = mapLogs(response);
      nextCursor = response.page?.nextCursor || null;
      hasMore = Boolean(response.page?.hasMore && nextCursor);
      notify();
    },
    onError: error => {
      console.warn('[MaintenanceService] Audit Ledger refresh was deferred.');
      if (onError) onError(error);
    }
  });
  unsubscribe.loadMore = async () => {
    if (!hasMore || !nextCursor || loadingMore) return;
    loadingMore = true;
    notify();
    try {
      const response = await authenticatedRequest(`/api/audit-events?limit=50&cursor=${encodeURIComponent(nextCursor)}`);
      const byId = new Map(logs.map(item => [item.id, item]));
      mapLogs(response).forEach(item => byId.set(item.id, item));
      logs = sortNewestFirst(Array.from(byId.values()), ['createdAt']);
      nextCursor = response.page?.nextCursor || null;
      hasMore = Boolean(response.page?.hasMore && nextCursor);
    } catch (error) {
      if (onError) onError(error);
    } finally {
      loadingMore = false;
      notify();
    }
  };
  return unsubscribe;
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

export async function fetchSystemDiagnostics({ force = false } = {}) {
  const response = await authenticatedRead('/api/system-diagnostics', { force });
  return response.data || {};
}
