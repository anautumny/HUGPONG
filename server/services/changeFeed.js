'use strict';

const { randomUUID, createHash } = require('node:crypto');
const { COLLECTIONS } = require('../schema/firestoreSchema');
const { canonicalRequestPath } = require('../middleware/requestPermissions');

// Revision tokens contain no account IDs or record data. The existing scoped
// API remains the only source of application records and authorization.
const RESOURCE_DEPENDENCIES = Object.freeze({
  users: ['users', 'fields', 'block-farms', 'crop-cycles', 'logs', 'audit-reports', 'recovery-reviews', 'session', 'notifications'],
  fields: ['fields', 'block-farms', 'crop-cycles', 'logs', 'audit-reports', 'session'],
  'block-farms': ['block-farms', 'fields', 'users', 'crop-cycles', 'logs', 'audit-reports', 'session'],
  'crop-cycles': ['crop-cycles', 'fields', 'logs', 'audit-reports'],
  logs: ['logs', 'fields', 'crop-cycles', 'audit-reports'],
  'audit-reports': ['audit-reports', 'logs', 'crop-year-compilations'],
  'crop-year-compilations': ['crop-year-compilations'],
  'recovery-reviews': ['recovery-reviews', 'users', 'session'],
  prices: ['prices', 'notifications'], tickets: ['tickets'], backups: ['backups'], sms: ['audit-events'],
  'terminal-diagnostics': ['terminal-diagnostics'], diagnostics: ['diagnostics']
});

function changedResources(req) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return [];
  const path = canonicalRequestPath(req.originalUrl || req.url || '');
  if (path.startsWith('/auth/')) {
    // Token renewal, login, logout and verification checks must not create a
    // refresh -> token renewal -> refresh feedback loop on every device.
    if (!/^\/auth\/(?:register|verify-phone|change-phone\/verify|change-password|request-phone-verification(?:-review)?|password-recovery\/complete|password-recovery-review\/(?:request|complete))$/.test(path)) return [];
    return [...RESOURCE_DEPENDENCIES.users, 'audit-events'];
  }
  const resource = path.match(/^\/api\/([^/]+)/)?.[1];
  if (path === '/api/backups/restore-missing') return [...new Set(Object.values(RESOURCE_DEPENDENCIES).flat()), 'audit-events', 'system-diagnostics'];
  if (resource === 'notifications') return path === '/api/notifications/state' ? ['notifications'] : [];
  if (/\/qr\/verify$/.test(path)) return [];
  const resources = RESOURCE_DEPENDENCIES[resource];
  if (!resources) return resource === 'audit-events' ? ['audit-events'] : [];
  return [...resources, ...(['diagnostics', 'terminal-diagnostics'].includes(resource) ? [] : ['audit-events', 'system-diagnostics'])];
}

function createChangeFeed({ database, invalidate = () => {}, logger = console, retryMs = 1000, singleWriter = false } = {}) {
  const ref = database?.collection(COLLECTIONS.SYSTEM_METADATA).doc('realtime_revisions');
  const clients = new Set();
  const acknowledgements = new Set();
  let unsubscribe = null;
  let listenerRetry = null;
  let writeRetry = null;
  let stopped = false;
  let revisions = {};
  let pending = {};
  let listenerRetryAttempt = 0;
  let writeRetryAttempt = 0;

  function revision() {
    return createHash('sha256').update(JSON.stringify(Object.entries(revisions).sort(([a], [b]) => a.localeCompare(b)))).digest('hex');
  }

  function emit(resources) {
    invalidate(resources);
    for (const client of clients) client.send({ resources, revision: revision() });
  }

  function startListener() {
    if (singleWriter || stopped || unsubscribe || !ref) return;
    unsubscribe = ref.onSnapshot(snapshot => {
      listenerRetryAttempt = 0;
      const next = snapshot.exists ? snapshot.data().revisions || {} : {};
      const resources = [...new Set([...Object.keys(revisions), ...Object.keys(next)])]
        .filter(key => revisions[key] !== next[key]);
      revisions = next;
      // Empty/deleted revision snapshots invalidate replicas too.
      if (resources.length) emit(resources);
    }, () => {
      unsubscribe?.();
      unsubscribe = null;
      for (const client of [...clients]) client.close();
      logger.warn('[Sync] Change listener disconnected; retrying.');
      if (!stopped) {
        listenerRetry = setTimeout(startListener, Math.min(30000, retryMs * 2 ** Math.min(listenerRetryAttempt++, 5)));
        listenerRetry.unref?.();
      }
    });
  }

  async function persist() {
    const batch = { ...pending };
    if (!Object.keys(batch).length) return;
    if (!ref) throw new Error('Change feed database unavailable.');
    await ref.set({ revisions: batch }, { merge: true });
    // All Worker API traffic is routed through one named Durable Object. Its
    // successful canonical commits can fan out directly, without gRPC/polling.
    if (singleWriter) {
      revisions = { ...revisions, ...batch };
      emit(Object.keys(batch));
    }
    writeRetryAttempt = 0;
    for (const [key, value] of Object.entries(batch)) {
      if (pending[key] === value) delete pending[key];
    }
    for (const acknowledgement of [...acknowledgements]) {
      if (acknowledgement.resources.every(resource => !pending[resource])) acknowledgement.finish(true);
    }
  }

  function waitForPersistence(resources, res) {
    if (resources.every(resource => !pending[resource])) return Promise.resolve(true);
    return new Promise(resolve => {
      const closed = () => acknowledgement.finish(false);
      const acknowledgement = { resources, finish(persisted) {
        acknowledgements.delete(acknowledgement);
        res.removeListener?.('close', closed);
        resolve(persisted);
      } };
      acknowledgements.add(acknowledgement);
      res.once?.('close', closed);
      if (res.destroyed) acknowledgement.finish(false);
    });
  }

  function retryWrite() {
    if (stopped || writeRetry) return;
    writeRetry = setTimeout(async () => {
      writeRetry = null;
      try { await persist(); } catch { retryWrite(); }
    }, Math.min(30000, retryMs * 2 ** Math.min(writeRetryAttempt++, 5)));
    writeRetry.unref?.();
  }

  async function publish(resources) {
    const token = randomUUID();
    resources.forEach(resource => { pending[resource] = token; });
    // Clear this instance's caches before any client starts an authoritative GET.
    invalidate(resources);
    try { await persist(); } catch (error) {
      emit(resources);
      retryWrite();
      logger.warn('[Sync] Change notification persistence deferred; retrying.');
      throw error;
    }
  }

  function mutationMiddleware(req, res, next) {
    const resources = changedResources(req);
    if (!resources.length) return next();
    const json = res.json.bind(res);
    res.json = body => {
      if (res.statusCode < 200 || res.statusCode >= 300 || body?.success !== true) return json(body);
      // The route has already committed. Persist the notification before the
      // success acknowledgement, including during transient feed outages. An
      // interrupted caller retains its existing idempotent retry/outbox intent.
      res.json = json;
      const acknowledge = persisted => {
        if (persisted && !res.destroyed && !res.writableEnded) json(body);
      };
      void publish(resources).then(() => acknowledge(true), () => {
        void waitForPersistence(resources, res).then(acknowledge);
      });
      return res;
    };
    return next();
  }

  function stream(req, res) {
    startListener();
    invalidate([]);
    res.status(200);
    res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'private, no-store, no-transform',
      Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    req.socket?.setTimeout?.(0);
    res.flushHeaders?.();
    let closed = false;
    const client = {
      send(data) {
        if (closed) return;
        // Disconnect slow readers instead of accumulating unbounded buffers.
        if (!res.write(`data: ${JSON.stringify(data)}\n\n`)) client.close();
      },
      close() {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        clearTimeout(reauthorize);
        clients.delete(client);
        res.end();
      }
    };
    const heartbeat = setInterval(() => client.send({ heartbeat: true }), 15000);
    // Reconnect through live account/session authorization periodically. No
    // record payload is ever sent on a previously authorized connection.
    const reauthorize = setTimeout(() => client.close(), 5 * 60 * 1000);
    heartbeat.unref?.();
    reauthorize.unref?.();
    clients.add(client);
    // Always re-read after opening/reopening: revisions may have been missed
    // while offline, suspended, behind a proxy, or during a deployment.
    client.send({ reset: true, revision: revision() });
    res.once('close', () => client.close());
  }

  function revalidateRequest(req, _res, next) {
    const observed = String(req.headers?.['x-hugpong-sync-revision'] || '');
    // Load balancers can send an invalidation-driven GET to an instance whose
    // listener has not caught up yet. Never serve that instance's old data or
    // assignment/auth cache to a client that has already seen a newer revision.
    if (/^[a-f0-9]{64}$/.test(observed) && observed !== revision()) invalidate([]);
    next();
  }

  startListener();
  return { publish, stream, mutationMiddleware, revalidateRequest,
    async hydrate() {
      if (!singleWriter || !ref) return;
      const snapshot = await ref.get();
      revisions = snapshot.exists ? snapshot.data().revisions || {} : {};
      invalidate([]);
    }, stop() {
    stopped = true;
    unsubscribe?.();
    clearTimeout(listenerRetry);
    clearTimeout(writeRetry);
    for (const client of [...clients]) client.close();
    for (const acknowledgement of [...acknowledgements]) acknowledgement.finish(false);
  } };
}

module.exports = { createChangeFeed, changedResources, RESOURCE_DEPENDENCIES };
