/**
 * ══════════════════════════════════════════════════════════════
 * HUGPONG — Central Authenticated API Client
 * Preserves exact server-authoritative mutation boundaries,
 * idempotency envelopes, and session handling.
 * ══════════════════════════════════════════════════════════════
 */

import { signInWithCustomTokenSilently } from './firebaseClient';

const READ_CACHE_TTL_MS = 5000;
const readCache = new Map();
const inFlightReads = new Map();

function clearReadCache() {
  readCache.clear();
}

function announceServerMutation(path) {
  clearReadCache();
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('hugpong:server-mutation', {
      detail: { path }
    }));
  }
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

  const response = await fetch(path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {})
    },
    body: requestBody === undefined ? undefined : JSON.stringify(requestBody),
    credentials: 'include'
  });

  const result = await response.json().catch(() => ({}));

  if (!response.ok || !result.success) {
    const error = new Error(result.error || 'Request was rejected by the server.');
    error.status = response.status;
    error.data = result.data;
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

export function subscribeToAuthenticatedResource(path, {
  onData,
  onError,
  intervalMs = 30000
} = {}) {
  let active = true;
  let inFlight = false;

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

  refresh();
  const timer = intervalMs > 0
    ? setInterval(() => refresh({ force: true }), intervalMs)
    : null;
  const handleFocus = () => refresh({ force: true });
  const handleMutation = () => refresh({ force: true });
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
  intervalMs = 30000
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
    ? setInterval(() => refresh({ force: true }), intervalMs)
    : null;
  const handleFocus = () => refresh({ force: true });
  const handleMutation = () => refresh({ force: true });
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
  createMutationContext,
  subscribeToAuthenticatedResource,
  subscribeToAuthenticatedLoader
};
