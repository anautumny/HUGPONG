import { Platform } from 'react-native';
import { authenticatedRequest, getMobileClientInstanceId } from './authService';
import { STORAGE_KEYS, getItem } from './storageService';

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
    const session = await getItem(STORAGE_KEYS.SESSION);
    const roleUpper = String(session?.canonicalRole || session?.role || session?.roleKey || '').trim().toUpperCase().replace(/[ -]+/g, '_');
    if (roleUpper && roleUpper !== 'MEMBER_FARMER' && roleUpper !== 'FARM_MANAGER') {
      return null;
    }
    return await telemetryRequest('/api/terminal-diagnostics/sync', {
      pendingMutationCount,
      failedMutationCount,
      syncState,
      connectionState,
      syncSucceeded
    });
  } catch (error) {
    if (!error.message?.includes('Access Denied')) {
      console.warn('[Telemetry] Sync report deferred:', error.message);
    }
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
  const roleUpper = String(_session?.canonicalRole || _session?.role || _session?.roleKey || '').trim().toUpperCase().replace(/[ -]+/g, '_');
  if (roleUpper && roleUpper !== 'MEMBER_FARMER' && roleUpper !== 'FARM_MANAGER') {
    return null;
  }
  return reportMobileSync({
    pendingMutationCount: Number(pendingLogsCount || 0),
    failedMutationCount: 0,
    syncState: Number(pendingLogsCount || 0) > 0 ? 'PENDING_SYNC' : 'UNKNOWN',
    connectionState: 'ONLINE',
    syncSucceeded: false
  });
}
