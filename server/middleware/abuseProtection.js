'use strict';

const { clientAddress } = require('./rateLimit');

const MAX_TRACKED_WINDOWS = 20000;
const EARLY_LIMITS = Object.freeze({
  burst: Object.freeze({ max: 100, windowMs: 10 * 1000 }),
  sustained: Object.freeze({ max: 300, windowMs: 60 * 1000 }),
  mutation: Object.freeze({ max: 60, windowMs: 60 * 1000 }),
  authentication: Object.freeze({ max: 60, windowMs: 60 * 1000 }),
  backupUpload: Object.freeze({ max: 12, windowMs: 60 * 1000 }),
  unknownPath: Object.freeze({ max: 30, windowMs: 60 * 1000 })
});
const AUTHENTICATED_LIMITS = Object.freeze({
  readUser: Object.freeze({ max: 300, windowMs: 5 * 60 * 1000 }),
  readUserAndIp: Object.freeze({ max: 240, windowMs: 5 * 60 * 1000 }),
  mutationUser: Object.freeze({ max: 60, windowMs: 5 * 60 * 1000 }),
  mutationUserAndIp: Object.freeze({ max: 45, windowMs: 5 * 60 * 1000 })
});
const JSON_LIMIT_BYTES = 1024 * 1024;
const BACKUP_JSON_LIMIT_BYTES = 12 * 1024 * 1024;
const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const KNOWN_WEB_PATHS = new Set([
  '/', '/login', '/privacy', '/terms', '/compliance', '/cookies', '/dashboard',
  '/fields', '/block-farms', '/registry', '/operations', '/takeover', '/prices',
  '/audit', '/users', '/sync', '/support', '/maintenance', '/diagnostics',
  '/backups', '/settings', '/analytics', '/login.html', '/index.html',
  '/logo.png', '/favicon.ico', '/health'
]);

function normalizedPath(req) {
  return String(req?.originalUrl || req?.url || '/').split(/[?#]/, 1)[0].replace(/\/{2,}/g, '/');
}

function isKnownPath(path) {
  return KNOWN_WEB_PATHS.has(path)
    || /^\/(?:api|auth|assets)(?:\/|$)/.test(path)
    || /^\/(?:member|manager|admin|superadmin)-dashboard\.html$/.test(path)
    || /^\/(?:privacy-policy|terms-of-service|data-compliance)\.html$/.test(path);
}

function normalizeNetworkKey(req) {
  const address = clientAddress(req).toLowerCase().replace(/^::ffff:/, '');
  return address || 'unknown';
}

class BoundedWindowStore {
  constructor(maxEntries = MAX_TRACKED_WINDOWS) {
    this.maxEntries = maxEntries;
    this.entries = new Map();
    this.operations = 0;
  }

  cleanup(now) {
    for (const [key, value] of this.entries) {
      if (value.resetAtMs <= now) this.entries.delete(key);
    }
    while (this.entries.size >= this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
  }

  consume(key, policy, now = Date.now()) {
    this.operations += 1;
    if (this.entries.size >= this.maxEntries || this.operations % 500 === 0) this.cleanup(now);
    const current = this.entries.get(key);
    const active = current && current.resetAtMs > now;
    const count = active ? current.count + 1 : 1;
    const resetAtMs = active ? current.resetAtMs : now + policy.windowMs;
    this.entries.delete(key);
    this.entries.set(key, { count, resetAtMs });
    return {
      accepted: count <= policy.max,
      count,
      remaining: Math.max(0, policy.max - count),
      resetAtMs,
      retryAfterSeconds: Math.max(1, Math.ceil((resetAtMs - now) / 1000)),
      limit: policy.max
    };
  }
}

function applyPolicies(store, policies, now) {
  let strictest = null;
  for (const item of policies) {
    const state = store.consume(item.key, item.policy, now);
    if (!strictest || state.remaining < strictest.remaining) strictest = state;
    if (!state.accepted) return state;
  }
  return strictest;
}

function rejectRateLimited(res, state, code) {
  res.set('RateLimit-Limit', String(state.limit));
  res.set('RateLimit-Remaining', '0');
  res.set('RateLimit-Reset', String(Math.ceil(state.resetAtMs / 1000)));
  res.set('Retry-After', String(state.retryAfterSeconds));
  res.locals.aggregateDiagnostic = true;
  return res.status(429).json({
    success: false,
    error: 'Too many requests. Please try again later.',
    code,
    module: 'SECURITY'
  });
}

function earlyPolicies(req, limits) {
  const ip = normalizeNetworkKey(req);
  const path = normalizedPath(req);
  const method = String(req.method || 'GET').toUpperCase();
  const policies = [
    { key: `early:burst:${ip}`, policy: limits.burst },
    { key: `early:sustained:${ip}`, policy: limits.sustained }
  ];
  if (MUTATION_METHODS.has(method)) policies.push({ key: `early:mutation:${ip}`, policy: limits.mutation });
  if (path === '/auth' || path.startsWith('/auth/')) policies.push({ key: `early:auth:${ip}`, policy: limits.authentication });
  if (MUTATION_METHODS.has(method) && (path === '/api/backups' || path.startsWith('/api/backups/'))) {
    policies.push({ key: `early:backup:${ip}`, policy: limits.backupUpload });
  }
  if (!isKnownPath(path)) policies.push({ key: `early:unknown:${ip}`, policy: limits.unknownPath });
  return policies;
}

function createEarlyAbuseProtection({
  store = new BoundedWindowStore(),
  limits = EARLY_LIMITS,
  now = () => Date.now()
} = {}) {
  return function earlyAbuseProtection(req, res, next) {
    const state = applyPolicies(store, earlyPolicies(req, limits), now());
    if (!state.accepted) return rejectRateLimited(res, state, 'GLOBAL_RATE_LIMITED');

    const path = normalizedPath(req);
    const contentLength = Number(req.headers?.['content-length'] || 0);
    const maximum = path === '/api/backups' || path.startsWith('/api/backups/')
      ? BACKUP_JSON_LIMIT_BYTES
      : JSON_LIMIT_BYTES;
    if (Number.isFinite(contentLength) && contentLength > maximum) {
      res.locals.aggregateDiagnostic = true;
      return res.status(413).json({
        success: false,
        error: 'The submitted information is too large.',
        code: 'REQUEST_TOO_LARGE',
        module: 'SECURITY'
      });
    }
    return next();
  };
}

function createAuthenticatedApiRateLimit({
  store = new BoundedWindowStore(),
  limits = AUTHENTICATED_LIMITS,
  now = () => Date.now()
} = {}) {
  return function authenticatedApiRateLimit(req, res, next) {
    const userId = String(req.authUser?.employeeId || req.session?.user?.employeeId || '').trim();
    if (!userId) return next();
    const ip = normalizeNetworkKey(req);
    const mutation = MUTATION_METHODS.has(String(req.method || 'GET').toUpperCase());
    const userPolicy = mutation ? limits.mutationUser : limits.readUser;
    const pairPolicy = mutation ? limits.mutationUserAndIp : limits.readUserAndIp;
    const category = mutation ? 'mutation' : 'read';
    const state = applyPolicies(store, [
      { key: `authenticated:${category}:user:${userId}`, policy: userPolicy },
      { key: `authenticated:${category}:pair:${userId}:${ip}`, policy: pairPolicy }
    ], now());
    if (!state.accepted) return rejectRateLimited(res, state, 'USER_RATE_LIMITED');
    return next();
  };
}

module.exports = {
  EARLY_LIMITS,
  AUTHENTICATED_LIMITS,
  createEarlyAbuseProtection,
  createAuthenticatedApiRateLimit,
  _test: { BoundedWindowStore, applyPolicies, earlyPolicies, isKnownPath, normalizedPath }
};
