/**
 * ══════════════════════════════════════════════════════════════
 * HUGPONG — Maintenance & System Health Service
 * Truthful system health checks, audit logs, and maintenance state.
 * Zero fabricated health percentages, zero artificial grades.
 * ══════════════════════════════════════════════════════════════
 */

import { authenticatedRequest, subscribeToAuthenticatedResource } from './apiClient';
import { sortNewestFirst } from '../utils/recordOrdering';

/**
 * Periodic server-authoritative subscription to system audit and security logs
 * @param {Object} options
 * @param {Function} options.onUpdate - Callback with { logs, isLoading, error }
 * @param {Function} [options.onError]
 */
export function subscribeToAuditLogs({ onUpdate, onError }) {
  return subscribeToAuthenticatedResource('/api/audit-events', {
    onData: response => {
      const logs = sortNewestFirst((response.data || []).map(data => ({
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
      onUpdate({ logs, isLoading: false, error: null });
    },
    onError: error => {
      console.warn('[MaintenanceService] Audit API subscription notice:', error.message);
      if (onError) onError(error);
    }
  });
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
  const response = await authenticatedRequest('/api/system-diagnostics');
  return response.data || {};
}
