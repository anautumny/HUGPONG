/**
 * HUGPONG — Telemetry & Sync Monitoring Service
 * Reads role-scoped diagnostics through the authoritative server API.
 */

import { authenticatedRequest, subscribeToAuthenticatedResource } from './apiClient';
import { sortNewestFirst } from '../utils/recordOrdering';

export function subscribeToTerminalDiagnostics({ onUpdate, onError }) {
  return subscribeToAuthenticatedResource('/api/terminal-diagnostics', {
    onData: response => {
      const diagnostics = sortNewestFirst((response.data || []).map(data => ({
        id: data.id,
        deviceId: data.deviceId || data.id,
        userId: data.userId || '',
        model: data.model || 'Android Terminal',
        os: data.os || 'Android',
        appVersion: data.appVersion || 'v1.0.0',
        battery: data.battery || '—',
        cachedLogs: Number(data.cachedLogs || 0),
        status: data.status || 'SYNCED',
        updatedAt: data.updatedAt || null
      })), ['updatedAt']);
      onUpdate({ diagnostics, isLoading: false, error: null });
    },
    onError: error => {
      console.warn('[TelemetryService] API subscription notice:', error.message);
      if (onError) onError(error);
    }
  });
}

export async function updateDeviceTelemetry(deviceId, payload) {
  return authenticatedRequest(`/api/terminal-diagnostics/${encodeURIComponent(deviceId)}`, {
    method: 'PUT',
    body: payload
  });
}

export function evaluateNodeStatus(updatedAt) {
  if (!updatedAt) {
    return {
      state: 'OFFLINE',
      label: 'Offline / Never Synced',
      badgeClass: 'bg-danger-bg text-danger border-danger/20'
    };
  }

  const timestamp = new Date(updatedAt).getTime();
  if (Number.isNaN(timestamp)) {
    return {
      state: 'OFFLINE',
      label: 'Offline',
      badgeClass: 'bg-danger-bg text-danger border-danger/20'
    };
  }

  const diffHours = (Date.now() - timestamp) / (1000 * 60 * 60);
  if (diffHours < 24) {
    return {
      state: 'ACTIVE',
      label: 'Active & Synced',
      badgeClass: 'bg-success-bg text-success border border-success/30'
    };
  }
  if (diffHours < 72) {
    const days = Math.floor(diffHours / 24);
    return {
      state: 'DELAYED',
      label: `Delayed (${days}d offline)`,
      badgeClass: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 border-amber-200 dark:border-amber-800/60'
    };
  }

  const days = Math.floor(diffHours / 24);
  return {
    state: 'OFFLINE',
    label: `Offline (${days}d inactive)`,
    badgeClass: 'bg-danger-bg text-danger border-danger/20'
  };
}
