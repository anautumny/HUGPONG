'use strict';

const { COLLECTIONS } = require('../schema/firestoreSchema');
const { dispatchNotification } = require('./systemNotificationService');
const { cleanupExpiredOperationalData, CLEANUP_INTERVAL_MS, CLEANUP_BATCH_SIZE } = require('./operationalCleanupService');

// Scheduling only. Canonical event state, leases, permissions and receipts stay
// in the existing Firestore services, shared with the Node host.
function createDurableRuntimeTasks(database, storage, {
  now = Date.now, dispatch = dispatchNotification, cleanup = cleanupExpiredOperationalData,
  logger = console
} = {}) {
  let running = null;
  async function wake(delay = 1000) {
    const target = now() + delay;
    const current = await storage.getAlarm();
    if (!current || current > target) await storage.setAlarm(target);
  }
  async function initialize() {
    if (!await storage.get('cleanupAt')) await storage.put('cleanupAt', now() + CLEANUP_INTERVAL_MS);
    await wake(); // Recover existing pending events after deployment/eviction.
  }
  async function nextEvent() {
    const snapshot = await database.collection(COLLECTIONS.NOTIFICATION_EVENTS)
      .where('dispatchState', '==', 'PENDING').orderBy('nextAttemptAtMs').limit(1).get();
    const doc = snapshot.docs[0];
    return doc ? { id: doc.id, ...doc.data() } : null;
  }
  async function drain() {
    if (running) return running;
    running = (async () => {
      try {
        const event = await nextEvent();
        const cleanupAt = Number(await storage.get('cleanupAt')) || now();
        if (event && event.nextAttemptAtMs <= now()) {
          // A device can require multiple authorization reads and provider calls.
          // One recipient per alarm keeps those bounded on Workers Free.
          await dispatch(database, event.id, { pageSize: 1, maxPages: 1 });
        } else if (cleanupAt <= now()) {
          const result = await cleanup(database, { maxBatchesPerCollection: 1 });
          const full = Object.values(result.deletedByCollection).some(count => count >= CLEANUP_BATCH_SIZE);
          await storage.put('cleanupAt', now() + (full ? 1000 : CLEANUP_INTERVAL_MS));
        }
        const next = await nextEvent();
        const retentionAt = Number(await storage.get('cleanupAt')) || now() + CLEANUP_INTERVAL_MS;
        await storage.setAlarm(Math.max(now() + 1000, Math.min(retentionAt, next?.nextAttemptAtMs ?? Infinity)));
      } catch (error) {
        // A crash or transport failure retains Firestore's lease and intent.
        await storage.setAlarm(now() + 30000);
        logger.warn('[Runtime] Background work deferred; durable alarm scheduled.');
      }
    })().finally(() => { running = null; });
    return running;
  }
  return { initialize, wake, drain };
}

module.exports = { createDurableRuntimeTasks };
