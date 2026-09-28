/**
 * ══════════════════════════════════════════════════════════════
 * HUGPONG — Central Authenticated API Client
 * Preserves exact server-authoritative mutation boundaries,
 * idempotency envelopes, and session handling.
 * ══════════════════════════════════════════════════════════════
 */

import { signInWithCustomTokenSilently } from './firebaseClient';
import { friendlyErrorMessage } from '../domain/presentationContract';

const READ_CACHE_TTL_MS = 5000;
const REQUEST_TIMEOUT_MS = 15000;
const readCache = new Map();
const inFlightReads = new Map();
const WEB_APP_VERSION = String(import.meta.env.VITE_APP_VERSION || '1.0.0');

function browserOs() {
  if (typeof navigator === 'undefined') return 'unknown';
  return String(navigator.userAgentData?.platform || navigator.platform || 'web').slice(0, 80);
}

export function webClientHeaders() {
  return {
    'x-client-platform': 'web',
    'x-app-version': WEB_APP_VERSION,
    'x-device-model': 'browser',
    'x-device-os': browserOs()
  };
}

export function responseErrorFromPayload(result = {}, status = 0, fallback = 'Request was rejected by the server.') {
  const errorCode = result.code || result.data?.code || '';
  const message = result.message || result.error || friendlyErrorMessage(errorCode, fallback || `Request failed (${status}).`);
  const nextAction = result.nextAction ? ` ${result.nextAction}` : '';
  const reference = result.referenceId ? ` Reference ID: ${result.referenceId}` : '';
  const error = new Error(`${message}${nextAction}${reference}`.trim());
  error.status = status;
  error.data = result.data;
  error.code = errorCode;
  error.referenceId = result.referenceId || '';
  error.nextAction = result.nextAction || '';
  return error;
}

function networkReference() {
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const random = globalThis.crypto.randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase();
  return `WEB-${day}-${random}`;
}

function resourceName(path) {
  return String(path || '')
    .replace(/^https?:\/\/[^/]+/i, '')
    .replace(/^\/api\//, '')
    .split(/[/?#]/)[0];
}

const RELATED_RESOURCES = Object.freeze({
  'block-farms': ['block-farms', 'fields', 'users', 'audit-events'],
  fields: ['fields', 'crop-cycles', 'logs', 'audit-events'],
  'crop-cycles': ['crop-cycles', 'fields', 'logs', 'audit-events'],
  logs: ['logs', 'fields', 'crop-cycles', 'audit-events'],
  prices: ['prices', 'audit-events'],
  tickets: ['tickets', 'audit-events'],
  users: ['users', 'fields', 'block-farms', 'audit-events'],
  'audit-reports': ['audit-reports', 'audit-events'],
  'audit-events': ['audit-events'],
  telemetry: ['terminal-diagnostics'],
  'terminal-diagnostics': ['terminal-diagnostics'],
  backups: ['backups']
});

export function affectedResources(path) {
  const primary = resourceName(path);
  return RELATED_RESOURCES[primary] || (primary ? [primary] : []);
}

function clearReadCache(resources = []) {
  const affected = new Set(resources);
  if (!affected.size) {
    readCache.clear();
    return;
  }
  for (const path of readCache.keys()) {
    if (affected.has(resourceName(path))) readCache.delete(path);
  }
}

function announceServerMutation(path) {
  const resources = affectedResources(path);
  clearReadCache(resources);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('hugpong:server-mutation', {
      detail: { path, resources }
    }));
  }
}

function canRefreshInBackground() {
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return false;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
  return true;
}

function mutationAffects(event, resources) {
  const changed = new Set(event?.detail?.resources || affectedResources(event?.detail?.path));
  return resources.some(resource => changed.has(resource));
}

export function createMutationContext(path, body, suppliedBaseVersion = null) {
  const mutationId = `MUT-WEB-${globalThis.crypto.randomUUID().replace(/-/g, '').toUpperCase()}`;
  return {
    mutationId,
    idempotencyKey: mutationId,
    entityKey: String(path || '').replace(/^\/api\//, '').replace(/\?.*$/, ''),
    baseVersion: suppliedBaseVersion
  };
}

export async function authenticatedRequest(path, options = {}) {
  const token = options.token || '';
  const method = String(options.method || 'GET').toUpperCase();
  let requestBody = options.body;

  if (path.startsWith('/api/') && !['GET', 'HEAD'].includes(method) && requestBody && typeof requestBody === 'object' && !requestBody._mutation) {
    requestBody = {
      ...requestBody,
      _mutation: createMutationContext(path, requestBody, options.baseVersion)
    };
  }

  const controller = new AbortController();
  const timeoutMs = Number.isFinite(Number(options.timeoutMs))
    ? Math.max(1000, Number(options.timeoutMs))
    : REQUEST_TIMEOUT_MS;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const abortFromCaller = () => controller.abort();
  options.signal?.addEventListener?.('abort', abortFromCaller, { once: true });
  let response;
  const hasRequestBody = requestBody !== undefined;
  try {
    response = await fetch(path, {
      method,
      headers: {
        ...webClientHeaders(),
        ...(hasRequestBody ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {})
      },
      body: hasRequestBody ? JSON.stringify(requestBody) : undefined,
      credentials: 'include',
      signal: controller.signal
    });
  } catch (cause) {
    const timedOut = cause?.name === 'AbortError' && !options.signal?.aborted;
    const referenceId = networkReference();
    const message = timedOut
      ? 'The server is taking too long to respond. Check your connection and try again.'
      : 'Unable to reach HUGPONG. Check your connection and try again.';
    const error = new Error(`${message} Reference ID: ${referenceId}`);
    error.code = timedOut ? 'API_REQUEST_TIMEOUT' : 'API_UNREACHABLE';
    error.isNetworkError = true;
    error.referenceId = referenceId;
    throw error;
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener?.('abort', abortFromCaller);
  }

  const result = await response.json().catch(() => ({}));

  if (!response.ok || !result.success) {
    const errorCode = result.code || result.data?.code || '';
    const error = responseErrorFromPayload(result, response.status);
    if (response.status === 401 && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('hugpong:session-revoked', {
        detail: { code: errorCode, message: error.message }
      }));
    }
    throw error;
  }

  if (result.firebaseCustomToken) {
    await signInWithCustomTokenSilently(result.firebaseCustomToken).catch(() => {});
  }

  if (!['GET', 'HEAD'].includes(method)) {
    announceServerMutation(path);
  }

  return result;
}

export function authenticatedRead(path, { force = false, maxAgeMs = READ_CACHE_TTL_MS } = {}) {
  const now = Date.now();
  const cached = readCache.get(path);
  if (!force && cached && now - cached.createdAt < maxAgeMs) {
    return Promise.resolve(cached.value);
  }
  if (inFlightReads.has(path)) return inFlightReads.get(path);

  const request = authenticatedRequest(path)
    .then(value => {
      readCache.set(path, { value, createdAt: Date.now() });
      return value;
    })
    .finally(() => {
      inFlightReads.delete(path);
    });
  inFlightReads.set(path, request);
  return request;
}

export function peekAuthenticatedRead(path) {
  return readCache.get(path)?.value || null;
}

export function subscribeToAuthenticatedResource(path, {
  onData,
  onError,
  intervalMs = 30000
} = {}) {
  let active = true;
  let inFlight = false;
  let forcedRefreshQueued = false;
  const resources = affectedResources(path);

  const refresh = async ({ force = false } = {}) => {
    if (!active) return;
    if (inFlight) {
      // A mutation can complete while an older GET is still in flight. Never
      // let that stale response become the final subscription value; queue one
      // authoritative read after it settles instead of dropping invalidation.
      if (force) forcedRefreshQueued = true;
      return;
    }
    inFlight = true;
    try {
      const result = await authenticatedRead(path, { force });
      if (active && !forcedRefreshQueued && typeof onData === 'function') onData(result);
    } catch (error) {
      if (active && typeof onError === 'function') onError(error);
    } finally {
      inFlight = false;
      if (active && forcedRefreshQueued) {
        forcedRefreshQueued = false;
        void refresh({ force: true });
      }
    }
  };

  const cached = peekAuthenticatedRead(path);
  if (cached && typeof onData === 'function') onData(cached);
  refresh();
  const timer = intervalMs > 0
    ? setInterval(() => {
      if (canRefreshInBackground()) refresh();
    }, intervalMs)
    : null;
  const handleFocus = () => {
    if (canRefreshInBackground()) refresh({ force: true });
  };
  const handleMutation = event => {
    if (mutationAffects(event, resources)) refresh({ force: true });
  };
  if (typeof window !== 'undefined') {
    window.addEventListener('focus', handleFocus);
    window.addEventListener('hugpong:server-mutation', handleMutation);
  }
  return () => {
    active = false;
    if (timer) clearInterval(timer);
    if (typeof window !== 'undefined') {
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('hugpong:server-mutation', handleMutation);
    }
  };
}

export function subscribeToAuthenticatedLoader(load, {
  onData,
  onError,
  intervalMs = 30000,
  resources = []
} = {}) {
  let active = true;
  let inFlight = false;

  const refresh = async ({ force = false } = {}) => {
    if (!active || inFlight) return;
    inFlight = true;
    try {
      const value = await load({ force });
      if (active && typeof onData === 'function') onData(value);
    } catch (error) {
      if (active && typeof onError === 'function') onError(error);
    } finally {
      inFlight = false;
    }
  };

  refresh();
  const timer = intervalMs > 0
    ? setInterval(() => {
      if (canRefreshInBackground()) refresh();
    }, intervalMs)
    : null;
  const handleFocus = () => {
    if (canRefreshInBackground()) refresh({ force: true });
  };
  const handleMutation = event => {
    if (!resources.length || mutationAffects(event, resources)) refresh({ force: true });
  };
  if (typeof window !== 'undefined') {
    window.addEventListener('focus', handleFocus);
    window.addEventListener('hugpong:server-mutation', handleMutation);
  }

  return () => {
    active = false;
    if (timer) clearInterval(timer);
    if (typeof window !== 'undefined') {
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('hugpong:server-mutation', handleMutation);
    }
  };
}

export default {
  request: authenticatedRequest,
  read: authenticatedRead,
  peek: peekAuthenticatedRead,
  createMutationContext,
  subscribeToAuthenticatedResource,
  subscribeToAuthenticatedLoader
};
