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
  'terminal-diagnostics': ['terminal-diagnostics']
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
  const token = `${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
  const mutationId = `MUT-WEB-${token}`;
  return {
    mutationId,
    idempotencyKey: mutationId,
    entityKey: String(path || '').replace(/^\/api\//, '').replace(/\?.*$/, ''),
    baseVersion: suppliedBaseVersion
  };
}

export async function authenticatedRequest(path, options = {}) {
  const token = options.token || localStorage.getItem('hugpong_auth_token');
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
  try {
    response = await fetch(path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {})
      },
      body: requestBody === undefined ? undefined : JSON.stringify(requestBody),
      credentials: 'include',
      signal: controller.signal
    });
  } catch (cause) {
    const timedOut = cause?.name === 'AbortError' && !options.signal?.aborted;
    const error = new Error(timedOut
      ? 'The server is taking too long to respond. Check your connection and try again.'
      : 'Unable to reach HUGPONG. Check your connection and try again.');
    error.code = timedOut ? 'API_REQUEST_TIMEOUT' : 'API_UNREACHABLE';
    error.isNetworkError = true;
    throw error;
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener?.('abort', abortFromCaller);
  }

  const result = await response.json().catch(() => ({}));

  if (!response.ok || !result.success) {
    const errorCode = result.code || result.data?.code || '';
    const error = new Error(friendlyErrorMessage(errorCode, result.error || 'Request was rejected by the server.'));
    error.status = response.status;
    error.data = result.data;
    error.code = errorCode;
    throw error;
  }

  if (result.token) {
    localStorage.setItem('hugpong_auth_token', result.token);
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
  const resources = affectedResources(path);

  const refresh = async ({ force = false } = {}) => {
    if (!active || inFlight) return;
    inFlight = true;
    try {
      const result = await authenticatedRead(path, { force });
      if (active && typeof onData === 'function') onData(result);
    } catch (error) {
      if (active && typeof onError === 'function') onError(error);
    } finally {
      inFlight = false;
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
