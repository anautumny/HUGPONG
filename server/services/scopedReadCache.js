'use strict';

const DEFAULT_SCOPED_READ_TTL_MS = 2 * 60 * 1000;
const DEFAULT_SCOPED_READ_MAX_ENTRIES = 1000;

function identityKey(req) {
  const user = req.authUser || req.session?.user || {};
  return [
    String(user.employeeId || user.userId || user.uid || '').trim(),
    String(user.canonicalRole || user.roleKey || user.role || '').trim(),
    String(user.authVersion || ''),
    String(user.blockFarmId || ''),
    String(user.fieldId || '')
  ].join('|');
}

function createScopedReadCache({
  ttlMs = DEFAULT_SCOPED_READ_TTL_MS,
  maxEntries = DEFAULT_SCOPED_READ_MAX_ENTRIES
} = {}) {
  const entries = new Map();
  const pending = new Map();
  const resourceVersions = new Map();
  let generation = 0;

  function prune(now = Date.now()) {
    for (const [key, entry] of entries) {
      if (entry.expiresAt <= now) entries.delete(key);
    }
    while (entries.size >= maxEntries) entries.delete(entries.keys().next().value);
  }

  function invalidate(resources = []) {
    const affected = new Set(resources);
    if (!affected.size) {
      generation += 1;
      entries.clear();
    } else {
      for (const resource of affected) resourceVersions.set(resource, (resourceVersions.get(resource) || 0) + 1);
      for (const [key, entry] of entries) {
        if (affected.has(entry.resource)) entries.delete(key);
      }
    }
    for (const entry of [...pending.values()]) {
      if (!affected.size || affected.has(entry.resource)) entry.finish();
    }
  }

  function middleware(req, res, next) {
    if (String(req.method || '').toUpperCase() !== 'GET') return next();
    if (String(req.headers?.['cache-control'] || '').includes('no-cache')) {
      res.set('Cache-Control', 'private, no-store');
      return next();
    }
    // SRA explicitly refreshes certified sources before saving a crop-year
    // snapshot. Keep these infrequent, bounded reads live across API instances.
    if (/^\/api\/(?:crop-year-compilations|recovery-reviews|notifications)(?:[/?]|$)/.test(String(req.originalUrl || req.url || ''))) {
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
    const requestVersion = resourceVersions.get(resource) || 0;
    const cached = entries.get(key);
    if (cached && cached.expiresAt > now) {
      res.set('X-HUGPONG-Read-Cache', 'HIT');
      res.set('Cache-Control', 'private, no-store');
      return res.status(cached.statusCode).json(JSON.parse(cached.body));
    }
    if (cached) entries.delete(key);

    // Requests still pass authentication independently. Only their identical,
    // authorized presentation reads share work while the first query finishes.
    const ongoing = pending.get(key);
    if (ongoing) return ongoing.done.then(() => {
      if (!res.destroyed && !res.writableEnded) return middleware(req, res, next);
    });
    let release;
    const entry = { resource, finished: false, done: new Promise(resolve => { release = resolve; }), finish() {
      entry.finished = true;
      if (pending.get(key) === entry) pending.delete(key);
      clearTimeout(entry.timer);
      release();
    } };
    // An abandoned handler must never strand another caller behind it.
    entry.timer = setTimeout(entry.finish, 30_000);
    entry.timer.unref?.();
    if (pending.size < maxEntries) pending.set(key, entry);
    res.once?.('finish', entry.finish);
    res.once?.('close', entry.finish);

    const originalJson = res.json.bind(res);
    res.json = body => {
      if (!entry.finished && requestGeneration === generation
        && requestVersion === (resourceVersions.get(resource) || 0)
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
      entry.finish();
      return originalJson(body);
    };
    try { return next(); } catch (error) { entry.finish(); throw error; }
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
