'use strict';

const { COLLECTIONS } = require('../schema/firestoreSchema');

const CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000;
const CLEANUP_BATCH_SIZE = 100;
const MAX_BATCHES_PER_COLLECTION = 5;

const EXPIRATION_POLICIES = Object.freeze([
  Object.freeze({ collection: COLLECTIONS.SERVER_SESSIONS, field: 'expiresAt' }),
  Object.freeze({ collection: COLLECTIONS.PASSWORD_RECOVERY_CHALLENGES, field: 'deleteAfter' }),
  Object.freeze({ collection: COLLECTIONS.SECURITY_RATE_LIMITS, field: 'deleteAfter' }),
  Object.freeze({ collection: COLLECTIONS.DIAGNOSTIC_EVENTS, field: 'deleteAfter' }),
  Object.freeze({ collection: COLLECTIONS.TERMINAL_DIAGNOSTICS, field: 'deleteAfter' })
]);

async function deleteExpiredPage(database, policy, cutoff, batchSize) {
  const snapshot = await database.collection(policy.collection)
    .where(policy.field, '<=', cutoff)
    .limit(batchSize)
    .get();
  if (snapshot.empty || snapshot.docs.length === 0) return 0;

  const batch = database.batch();
  snapshot.docs.forEach(document => batch.delete(document.ref));
  await batch.commit();
  return snapshot.docs.length;
}

async function cleanupExpiredOperationalData(database, {
  now = Date.now(),
  batchSize = CLEANUP_BATCH_SIZE,
  maxBatchesPerCollection = MAX_BATCHES_PER_COLLECTION
} = {}) {
  if (!database) throw new Error('Firestore is required for operational cleanup.');
  const cutoff = new Date(now);
  const deletedByCollection = {};

  for (const policy of EXPIRATION_POLICIES) {
    let deleted = 0;
    for (let batchNumber = 0; batchNumber < maxBatchesPerCollection; batchNumber += 1) {
      const pageCount = await deleteExpiredPage(database, policy, cutoff, batchSize);
      deleted += pageCount;
      if (pageCount < batchSize) break;
    }
    deletedByCollection[policy.collection] = deleted;
  }

  return {
    cutoff: cutoff.toISOString(),
    deletedByCollection,
    deletedCount: Object.values(deletedByCollection).reduce((sum, count) => sum + count, 0)
  };
}

function startOperationalCleanup(database, {
  intervalMs = CLEANUP_INTERVAL_MS,
  logger = console
} = {}) {
  let inFlight = null;
  const run = () => {
    if (inFlight) return inFlight;
    inFlight = cleanupExpiredOperationalData(database)
      .then(result => {
        if (result.deletedCount > 0) {
          logger.info(`[Retention] Removed ${result.deletedCount} expired operational records.`);
        }
        return result;
      })
      .catch(() => {
        logger.warn('[Retention] Expired-record cleanup was deferred.');
        return null;
      })
      .finally(() => {
        inFlight = null;
      });
    return inFlight;
  };

  const initialTimer = setTimeout(run, 0);
  initialTimer.unref?.();
  const interval = setInterval(run, intervalMs);
  interval.unref?.();
  return {
    run,
    stop() {
      clearTimeout(initialTimer);
      clearInterval(interval);
    }
  };
}

module.exports = {
  CLEANUP_INTERVAL_MS,
  CLEANUP_BATCH_SIZE,
  MAX_BATCHES_PER_COLLECTION,
  EXPIRATION_POLICIES,
  cleanupExpiredOperationalData,
  startOperationalCleanup
};
