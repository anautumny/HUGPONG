import { Platform } from 'react-native';
import { authenticatedRequest, getMobileClientInstanceId } from './authService';

const ACTIVITY_HEARTBEAT_MS = 5 * 60 * 1000;
let lastActivityReportAt = 0;

function deviceMetadata() {
  const constants = Platform.constants || {};
  return {
    platform: 'MOBILE',
    model: String(constants.Model || constants.model || Platform.OS || 'Mobile device'),
    os: `${Platform.OS} ${String(Platform.Version || '')}`.trim(),
    appVersion: String(constants.reactNativeVersion?.major ? `React Native ${constants.reactNativeVersion.major}.${constants.reactNativeVersion.minor}` : 'HUGPONG Mobile')
  };
}

async function telemetryRequest(path, body) {
  const clientInstanceId = await getMobileClientInstanceId();
  return authenticatedRequest(path, {
    method: 'POST',
    headers: { 'x-client-instance-id': clientInstanceId },
    body: { ...deviceMetadata(), ...body }
  });
}

export async function reportMobileActivity(event = 'HEARTBEAT') {
  const now = Date.now();
  if (String(event).toUpperCase() !== 'LOGIN' && now - lastActivityReportAt < ACTIVITY_HEARTBEAT_MS) {
    return { throttled: true };
  }
  lastActivityReportAt = now;
  try {
    return await telemetryRequest('/api/terminal-diagnostics/activity', { event });
  } catch (error) {
    lastActivityReportAt = 0;
    console.warn('[Telemetry] Activity report deferred:', error.message);
    return null;
  }
}

export async function reportMobileSync({
  pendingMutationCount = 0,
  failedMutationCount = 0,
  syncState = 'UNKNOWN',
  connectionState = 'ONLINE',
  syncSucceeded = false
} = {}) {
  try {
    return await telemetryRequest('/api/terminal-diagnostics/sync', {
      pendingMutationCount,
      failedMutationCount,
      syncState,
      connectionState,
      syncSucceeded
    });
  } catch (error) {
    console.warn('[Telemetry] Sync report deferred:', error.message);
    return null;
  }
}

export async function fetchAgriculturalSyncMonitor() {
  const response = await authenticatedRequest('/api/terminal-diagnostics');
  return response.data || { scope: {}, subjects: [] };
}

// Compatibility export used by startup code. Reporting a queue snapshot never
// claims that a synchronization completed.
export async function publishTerminalTelemetry(_session, pendingLogsCount = 0) {
  return reportMobileSync({
    pendingMutationCount: Number(pendingLogsCount || 0),
    failedMutationCount: 0,
    syncState: Number(pendingLogsCount || 0) > 0 ? 'PENDING_SYNC' : 'UNKNOWN',
    connectionState: 'ONLINE',
    syncSucceeded: false
  });
}
