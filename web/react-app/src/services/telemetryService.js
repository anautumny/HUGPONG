import { authenticatedRequest, subscribeToAuthenticatedResource } from './apiClient';

const CLIENT_INSTANCE_KEY = 'hugpong_web_client_instance_id';
const HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000;
let lastHeartbeatAt = 0;

export function getWebClientInstanceId() {
  let value = localStorage.getItem(CLIENT_INSTANCE_KEY);
  if (!value) {
    const random = globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    value = `web-${random}`;
    localStorage.setItem(CLIENT_INSTANCE_KEY, value);
  }
  return value;
}

export async function reportWebActivity({ force = false, event = 'HEARTBEAT' } = {}) {
  const now = Date.now();
  if (!force && now - lastHeartbeatAt < HEARTBEAT_INTERVAL_MS) return { throttled: true };
  lastHeartbeatAt = now;
  try {
    return await authenticatedRequest('/api/terminal-diagnostics/activity', {
      method: 'POST',
      headers: {
        'x-client-platform': 'web',
        'x-client-instance-id': getWebClientInstanceId()
      },
      body: { event, platform: 'WEB' }
    });
  } catch (error) {
    lastHeartbeatAt = 0;
    throw error;
  }
}

export async function reportWebSync({ pendingMutationCount = 0, failedMutationCount = 0, syncState = 'UNKNOWN', syncSucceeded = false } = {}) {
  try {
    let session = null;
    try {
      session = JSON.parse(sessionStorage.getItem('hugpong_session') || localStorage.getItem('hugpong_session') || '{}');
    } catch {}
    const roleUpper = String(session?.canonicalRole || session?.role || session?.roleKey || '').trim().toUpperCase().replace(/[ -]+/g, '_');
    if (roleUpper && roleUpper !== 'MEMBER_FARMER' && roleUpper !== 'FARM_MANAGER') {
      return null;
    }
    return await authenticatedRequest('/api/terminal-diagnostics/sync', {
      method: 'POST',
      headers: {
        'x-client-platform': 'web',
        'x-client-instance-id': getWebClientInstanceId()
      },
      body: {
        platform: 'WEB',
        pendingMutationCount,
        failedMutationCount,
        syncState,
        connectionState: navigator.onLine === false ? 'OFFLINE' : 'ONLINE',
        syncSucceeded
      }
    });
  } catch (error) {
    if (!error.message?.includes('Access Denied')) { console.warn('[TelemetryService] Web sync report deferred:', error.message); }
    return null;
  }
}

export function subscribeToTerminalDiagnostics({ onUpdate, onError }) {
  return subscribeToAuthenticatedResource('/api/terminal-diagnostics', {
    intervalMs: 30000,
    onData: response => onUpdate({
      subjects: response.data?.subjects || [],
      scope: response.data?.scope || {},
      isLoading: false,
      error: null
    }),
    onError
  });
}

export function syncStatusPresentation(state, pending = 0, failed = 0) {
  const normalized = String(state || 'UNKNOWN').toUpperCase();
  if (normalized === 'SYNC_FAILED' || failed > 0) return { label: failed > 0 ? `${failed} Failed` : 'Sync Failed', tone: 'danger' };
  if (normalized === 'PENDING_SYNC' || pending > 0) return { label: `${pending} Pending`, tone: 'warning' };
  if (normalized === 'SYNCING') return { label: 'Syncing', tone: 'info' };
  if (normalized === 'OFFLINE') return { label: 'Offline', tone: 'muted' };
  if (normalized === 'UP_TO_DATE') return { label: 'Up to Date', tone: 'success' };
  return { label: 'Not Reported', tone: 'muted' };
}

export function activityAttentionPresentation(activity = {}) {
  const days = Number.isFinite(Number(activity.inactiveDays)) ? Number(activity.inactiveDays) : null;
  if (activity.attentionStatus === 'CRITICAL') {
    return { label: days == null ? 'Activity Unknown' : `${days} Days Inactive`, tone: 'danger' };
  }
  if (activity.attentionStatus === 'NEEDS_ATTENTION') {
    return { label: days == null ? 'Activity Not Reported' : `${days} Days Inactive`, tone: 'warning' };
  }
  if (!activity.lastActiveAt && activity.basedOn === 'ACCOUNT_CREATED') {
    return { label: 'New Account', tone: 'info' };
  }
  return { label: 'Within 3-Day Window', tone: 'success' };
}

export function formatPhilippineTime(value, fallback = 'Not reported') {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(date);
}

export function formatActivity(value) {
  if (!value) return 'Not reported';
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return 'Not reported';
  const minutes = Math.max(0, Math.floor((Date.now() - time) / 60000));
  if (minutes < 2) return 'Active recently';
  if (minutes < 60) return `${minutes} minutes ago`;
  return formatPhilippineTime(value);
}
