'use strict';

const DEFAULT_SCOPED_READ_TTL_MS = 2 * 60 * 1000;
const DEFAULT_SCOPED_READ_MAX_ENTRIES = 1000;

function identityKey(req) {
  const user = req.authUser || req.session?.user || {};
  return [
    String(user.employeeId || user.userId || user.uid || '').trim(),
    String(user.canonicalRole || user.roleKey || user.role || '').trim()
  ].join('|');
}

function createScopedReadCache({
  ttlMs = DEFAULT_SCOPED_READ_TTL_MS,
  maxEntries = DEFAULT_SCOPED_READ_MAX_ENTRIES
} = {}) {
  const entries = new Map();
  let generation = 0;

  function prune(now = Date.now()) {
    for (const [key, entry] of entries) {
      if (entry.expiresAt <= now) entries.delete(key);
    }
    while (entries.size >= maxEntries) entries.delete(entries.keys().next().value);
  }

  function invalidate(resources = []) {
    generation += 1;
    const affected = new Set(resources);
    if (!affected.size) {
      entries.clear();
      return;
    }
    for (const [key, entry] of entries) {
      if (affected.has(entry.resource)) entries.delete(key);
    }
  }

  function middleware(req, res, next) {
    if (String(req.method || '').toUpperCase() !== 'GET') return next();
    // SRA explicitly refreshes certified sources before saving a crop-year
    // snapshot. Keep these infrequent, bounded reads live across API instances.
    if (/^\/api\/crop-year-compilations(?:[/?]|$)/.test(String(req.originalUrl || req.url || ''))) {
      res.set('Cache-Control', 'private, no-store');
      return next();
    }
    const actor = identityKey(req);
    if (!actor.split('|', 1)[0]) return next();

    const now = Date.now();
    const key = `${actor}|${String(req.originalUrl || req.url || '')}`;
    const resource = String(req.originalUrl || req.url || '')
      .replace(/^\/api\//, '')
      .split(/[/?#]/, 1)[0];
    const requestGeneration = generation;
    const cached = entries.get(key);
    if (cached && cached.expiresAt > now) {
      res.set('X-HUGPONG-Read-Cache', 'HIT');
      res.set('Cache-Control', 'private, no-store');
      return res.status(cached.statusCode).json(JSON.parse(cached.body));
    }
    if (cached) entries.delete(key);

    const originalJson = res.json.bind(res);
    res.json = body => {
      if (requestGeneration === generation
        && res.statusCode >= 200 && res.statusCode < 300
        && body?.success !== false) {
        prune();
        entries.set(key, {
          resource,
          statusCode: res.statusCode,
          body: JSON.stringify(body),
          expiresAt: Date.now() + ttlMs
        });
        res.set('X-HUGPONG-Read-Cache', 'MISS');
        res.set('Cache-Control', 'private, no-store');
      }
      return originalJson(body);
    };
    return next();
  }

  return {
    invalidate,
    middleware,
    size: () => entries.size
  };
}

module.exports = {
  DEFAULT_SCOPED_READ_TTL_MS,
  createScopedReadCache
};
