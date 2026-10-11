/**
 * ══════════════════════════════════════════════════════════════
 * HUGPONG — Central Authenticated API Client
 * Preserves exact server-authoritative mutation boundaries,
 * idempotency envelopes, and session handling.
 * ══════════════════════════════════════════════════════════════
 */

import { friendlyErrorMessage } from '../domain/presentationContract';

// Most HUGPONG records change only after an explicit server mutation. Keep a
// short shared cache for route changes/focus churn, then revalidate in the
// background on a deliberately bounded cadence.
const READ_CACHE_TTL_MS = 2 * 60 * 1000;
const DEFAULT_REFRESH_INTERVAL_MS = 30 * 60 * 1000;
const FOCUS_REFRESH_MIN_AGE_MS = 10 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 15000;
const readCache = new Map();
const inFlightReads = new Map();
let authenticatedReadGeneration = 0;
let mutationCooldownUntil = 0;
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

function retryAfterSeconds(response, result = {}) {
  const value = response?.headers?.get?.('retry-after') ?? result.retryAfterSeconds;
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) return Math.ceil(numeric);
  if (typeof value === 'string') {
    const retryAt = Date.parse(value);
    if (Number.isFinite(retryAt)) return Math.max(1, Math.ceil((retryAt - Date.now()) / 1000));
  }
  return 0;
}

export function getMutationCooldownRemainingSeconds(now = Date.now()) {
  return Math.max(0, Math.ceil((mutationCooldownUntil - now) / 1000));
}

function localMutationCooldownError(seconds) {
  const error = new Error(`Too many requests. Try again in ${seconds} second${seconds === 1 ? '' : 's'}.`);
  error.status = 429;
  error.code = 'CLIENT_MUTATION_COOLDOWN';
  error.retryAfterSeconds = seconds;
  error.retryAfterMs = seconds * 1000;
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

// Browser API responses are authorization-scoped even when their URL is the
// same. Advance the generation at every login/logout boundary so neither a
// cached response nor an older in-flight request can cross into another
// account's UI.
export function clearAuthenticatedReadState() {
  authenticatedReadGeneration += 1;
  mutationCooldownUntil = 0;
  readCache.clear();
  inFlightReads.clear();
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

export function announceConnectionRestored() {
  clearReadCache();
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('hugpong:connection-restored'));
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
  const isMutation = !['GET', 'HEAD'].includes(method);
  const cooldownSeconds = isMutation ? getMutationCooldownRemainingSeconds() : 0;
  if (cooldownSeconds > 0) throw localMutationCooldownError(cooldownSeconds);
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
    const waitSeconds = retryAfterSeconds(response, result);
    if (waitSeconds > 0) {
      error.retryAfterSeconds = waitSeconds;
      error.retryAfterMs = waitSeconds * 1000;
      if (response.status === 429) error.message = `${error.message} Try again in ${waitSeconds} second${waitSeconds === 1 ? '' : 's'}.`;
    }
    if (response.status === 429 && isMutation) {
      const safeWaitSeconds = Math.max(1, waitSeconds || 60);
      mutationCooldownUntil = Math.max(mutationCooldownUntil, Date.now() + (safeWaitSeconds * 1000));
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('hugpong:mutation-rate-limited', {
          detail: { retryAfterSeconds: safeWaitSeconds, retryAt: new Date(mutationCooldownUntil).toISOString() }
        }));
      }
    }
    if (response.status === 401 && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('hugpong:session-revoked', {
        detail: { code: errorCode, message: error.message }
      }));
    }
    throw error;
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

  const requestGeneration = authenticatedReadGeneration;
  const request = authenticatedRequest(path)
    .then(value => {
      if (requestGeneration !== authenticatedReadGeneration) {
        const error = new Error('The authenticated account changed while this request was loading.');
        error.code = 'AUTH_CONTEXT_CHANGED';
        throw error;
      }
      readCache.set(path, { value, createdAt: Date.now() });
      return value;
    })
    .finally(() => {
      if (inFlightReads.get(path) === request) inFlightReads.delete(path);
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
  intervalMs = DEFAULT_REFRESH_INTERVAL_MS
} = {}) {
  let active = true;
  let inFlight = false;
  let forcedRefreshQueued = false;
  let lastSuccessfulRefreshAt = 0;
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
      lastSuccessfulRefreshAt = Date.now();
      if (active && !forcedRefreshQueued && typeof onData === 'function') onData(result);
    } catch (error) {
      if (active && error?.code !== 'AUTH_CONTEXT_CHANGED' && typeof onError === 'function') onError(error);
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
    if (canRefreshInBackground() && Date.now() - lastSuccessfulRefreshAt >= FOCUS_REFRESH_MIN_AGE_MS) refresh();
  };
  const handleMutation = event => {
    if (mutationAffects(event, resources)) refresh({ force: true });
  };
  const handleConnectionRestored = () => refresh({ force: true });
  if (typeof window !== 'undefined') {
    window.addEventListener('focus', handleFocus);
    window.addEventListener('hugpong:server-mutation', handleMutation);
    window.addEventListener('hugpong:connection-restored', handleConnectionRestored);
  }
  return () => {
    active = false;
    if (timer) clearInterval(timer);
    if (typeof window !== 'undefined') {
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('hugpong:server-mutation', handleMutation);
      window.removeEventListener('hugpong:connection-restored', handleConnectionRestored);
    }
  };
}

export function subscribeToAuthenticatedLoader(load, {
  onData,
  onError,
  intervalMs = DEFAULT_REFRESH_INTERVAL_MS,
  resources = []
} = {}) {
  let active = true;
  let inFlight = false;
  let lastSuccessfulRefreshAt = 0;

  const refresh = async ({ force = false } = {}) => {
    if (!active || inFlight) return;
    inFlight = true;
    try {
      const value = await load({ force });
      lastSuccessfulRefreshAt = Date.now();
      if (active && typeof onData === 'function') onData(value);
    } catch (error) {
      if (active && error?.code !== 'AUTH_CONTEXT_CHANGED' && typeof onError === 'function') onError(error);
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
    if (canRefreshInBackground() && Date.now() - lastSuccessfulRefreshAt >= FOCUS_REFRESH_MIN_AGE_MS) refresh();
  };
  const handleMutation = event => {
    if (!resources.length || mutationAffects(event, resources)) refresh({ force: true });
  };
  const handleConnectionRestored = () => refresh({ force: true });
  if (typeof window !== 'undefined') {
    window.addEventListener('focus', handleFocus);
    window.addEventListener('hugpong:server-mutation', handleMutation);
    window.addEventListener('hugpong:connection-restored', handleConnectionRestored);
  }

  return () => {
    active = false;
    if (timer) clearInterval(timer);
    if (typeof window !== 'undefined') {
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('hugpong:server-mutation', handleMutation);
      window.removeEventListener('hugpong:connection-restored', handleConnectionRestored);
    }
  };
}

export default {
  request: authenticatedRequest,
  read: authenticatedRead,
  peek: peekAuthenticatedRead,
  createMutationContext,
  clearAuthenticatedReadState,
  announceConnectionRestored,
  subscribeToAuthenticatedResource,
  subscribeToAuthenticatedLoader
};
