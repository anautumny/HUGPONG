import { STORAGE_KEYS, getItem, saveItem, localOutboxStorageKey } from './storageService';
import { createClientRecordId } from './secureId';
import { toOperationLogDocument } from '../data/firestoreSchema';
import {
  createOperation,
  amendOperation,
  archiveOperations,
  createTicket,
  addTicketMessage,
  updateCycleStage,
  createField,
  updateField,
  archiveField,
  publishPrice,
  saveCustomStages,
  saveCustomOperations,
  saveOperationSchedule,
  compileAuditReport,
  selectAuditDeliveryMethod,
  submitAuditReport,
  returnAuditReport,
  importAuditQr,
  certifyAuditReport,
  approveUser
} from './mutationService';
const {
  createMutationEnvelope,
  migrateOutbox,
  appendUniqueMutation,
  requeueCorrectableMutations,
  classifyMutationError,
  queuePressure,
  createSingleFlightRunner,
  drainMutationQueue,
  responseVersion
} = require('./mutationOutboxCore');

let outboxQueue = [];
let activeOutboxOwnerId = '';
let outboxReady = false;
let outboxStorageError = null;
let outboxLoadGeneration = 0;
let syncListeners = [];
const transientTakeoverGrants = new Map();
const runOutboxSingleFlight = createSingleFlightRunner();

export function subscribeToSyncEngine(listener) {
  syncListeners.push(listener);
  return () => {
    syncListeners = syncListeners.filter(l => l !== listener);
  };
}

function notifySyncEngine() {
  syncListeners.forEach(listener => {
    try {
      listener([...outboxQueue]);
    } catch (e) {
      console.warn('[syncEngine] A synchronization listener failed.');
    }
  });
}

/**
 * ── HUGPONG ASYNC CONFLICT RESOLUTION POLICY ─────────────────────────
 * 
 * 1. Event Stream Logs: Append-Only Immutable Model
 *    - All field operations (fertilizer, weeding, harvest) are immutable event records.
 *    - Deterministic Client UUIDs (LOG-{fieldId}-{timestamp}-{rand}) ensure idempotent retries.
 *    - Multiple workers logging activities on the same plot are all preserved in the field history.
 *
 * 2. Crop Growth Stages: Monotonic Hierarchy + Timestamp Vector
 *    - Biological sugarcane growth moves forward through Stages 1 to 6.
 *    - Higher stages supersede lower stages when flushing delayed offline queues.
 *    - Accidental regression (e.g. outbox flush attempting to push Stage 2 onto Stage 4)
 *      is automatically rejected to preserve advanced agronomic progress.
 *
 * 3. Assignments & Boundary State: Two-Phase SRA Authority & Collision Ticketing
 *    - Central database holds authoritative state for field ownership and member plot claims.
 *    - Irreconcilable offline collisions automatically generate an "Offline Sync Collision"
 *      support ticket (category: 'Offline Sync Collision') flagged for Farm Manager / SRA triage.
 */

export const SRA_STAGE_HIERARCHY = {
  'Stage 1: Soil Sampling & Land Preparation': 1,
  'Stage 1: Land Preparation & Tillage': 1,
  'Stage 1: Pre-Planting & Land Preparation': 1,
  'Stage 1': 1,
  'Soil & Land Prep': 1,
  
  'Stage 2: Planting Material & Planting (Patdan)': 2,
  'Stage 2: Planting & Basal Nutrition': 2,
  'Stage 2: Planting & Crop Establishment': 2,
  'Stage 2': 2,
  'Planting & Canepoints': 2,

  'Stage 3: Basal Fertilization & Early Care': 3,
  'Stage 3: Basal Nutrition & Early Care': 3,
  'Stage 3: Early Vegetative & Weed Control': 3,
  'Stage 3': 3,
  'Basal Fertilization': 3,

  'Stage 4: Cultivation, Weeding & Drainage': 4,
  'Stage 4: Cultivation & Weed Management': 4,
  'Stage 4: Top-Dressing & Earthing-Up': 4,
  'Stage 4': 4,
  'Cultivation & Care': 4,

  'Stage 5: Top-Dress Fertilization (2nd Dose)': 5,
  'Stage 5: Crop Maintenance & Final Hilling-Up': 5,
  'Stage 5: Ripening & Stalk Maturation': 5,
  'Stage 5': 5,
  'Top-Dress Fert': 5,

  'Stage 6: Harvesting, Cutting & Hauling Operations': 6,
  'Stage 6: Harvesting & Post-Harvest Transport': 6,
  'Stage 6: Harvest & Hauling': 6,
  'Stage 6': 6,
  'Harvest & Milling': 6,
};

export function getStageLevel(stageStr) {
  if (!stageStr) return 0;
  if (SRA_STAGE_HIERARCHY[stageStr]) return SRA_STAGE_HIERARCHY[stageStr];
  const s = String(stageStr).toLowerCase();
  if (s.includes('stage 6') || s.includes('harvest') || s.includes('hauling') || s.includes('cutting')) return 6;
  if (s.includes('stage 5') || s.includes('top-dress') || s.includes('hilling') || s.includes('maint')) return 5;
  if (s.includes('stage 4') || s.includes('cultivation') || s.includes('weed')) return 4;
  if (s.includes('stage 3') || s.includes('basal') || s.includes('dap')) return 3;
  if (s.includes('stage 2') || s.includes('plant') || s.includes('patdan')) return 2;
  if (s.includes('stage 1') || s.includes('prep') || s.includes('soil') || s.includes('plow')) return 1;
  return 1;
}

/**
 * Resolves conflict between current field stage and an incoming offline stage update
 */
export function resolveStageConflict(currentStage, incomingStage, currentUpdatedAt, incomingCreatedAt) {
  if (!currentStage) return { stage: incomingStage, resolution: 'applied_initial' };
  if (!incomingStage) return { stage: currentStage, resolution: 'retained_current' };

  const currentLevel = getStageLevel(currentStage);
  const incomingLevel = getStageLevel(incomingStage);

  // Monotonic forward progression: higher stage takes natural precedence
  if (incomingLevel > currentLevel) {
    return { stage: incomingStage, resolution: 'applied_forward_progression' };
  }

  // Same stage: Last-Write-Wins based on physical activity timestamp
  if (incomingLevel === currentLevel) {
    const isNewer = new Date(incomingCreatedAt) >= new Date(currentUpdatedAt || 0);
    return { stage: isNewer ? incomingStage : currentStage, resolution: isNewer ? 'applied_lww' : 'retained_existing' };
  }

  // Regression attempt (e.g. attempting to regress Stage 4 back to Stage 2 from an old offline queue):
  return { stage: currentStage, resolution: 'rejected_regression_preserved_advanced_stage' };
}

/**
 * Format a date as YYYYMMDD string for human-readable semantic IDs
 */
export function getSemanticDatePrefix() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

/**
 * ── 8-DIGIT NUMERIC USER ID GENERATOR ─────────────────────────────────
 * 01xxxxxx: Super Admin
 * 02xxxxxx: SRA Admin
 * 03xxxxxx: Farm Manager
 * 04xxxxxx: Member / Farmer
 */
/**
 * Generate a unique deterministic production-grade ID for operational logs
 * Format: LOG-{FIELD}-{TIMESTAMP_HEX}-{RAND} e.g. LOG-FLDNCY001-M7A9X2-8F2A
 */
export function generateDeterministicLogId(fieldId) {
  const cleanField = String(fieldId || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  if (!cleanField) throw new Error('A Field identity is required before creating an operation.');
  return createClientRecordId('LOG', cleanField);
}

export function generateLogId(fieldId) {
  return generateDeterministicLogId(fieldId);
}

/**
 * Generate a production draft log ID
 * Format: DFT-{FIELD}-{TIMESTAMP_HEX}-{RAND}
 */
export function generateDraftId(fieldId) {
  const cleanField = String(fieldId || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  if (!cleanField) throw new Error('A Field identity is required before creating a draft.');
  return createClientRecordId('DFT', cleanField);
}

/**
 * Generate a production sub-item ID
 */
export function generateSubItemId(parentLogId, idx = 0) {
  const cleanParent = (parentLogId || 'ITEM').replace(/[^a-zA-Z0-9]/g, '-');
  return `SI-${cleanParent}-${idx + 1}`;
}

/**
 * Generate a production support ticket ID
 * Format: TCK-2026-00801 or TCK-2026-XXXXX
 */
export function generateTicketId(seq = null) {
  const year = new Date().getFullYear();
  if (seq !== null && seq !== undefined) {
    return `TCK-${year}-${String(seq).padStart(5, '0')}`;
  }
  return createClientRecordId('TCK', year);
}

function normalizeOutboxOwnerId(userId) {
  return String(userId || '').trim();
}

function migrateQueuedPayload(type, payload = {}) {
  if (type !== 'operation_log' && type !== 'takeover_log') return { ...payload };
  try {
    const submissionSource = ['MEMBER', 'FIELD_OWNER', 'MANAGER_TAKEOVER'].includes(payload.submissionSource)
      ? payload.submissionSource
      : type === 'takeover_log' ? 'MANAGER_TAKEOVER' : 'MEMBER';
    const normalized = toOperationLogDocument(payload, {
      cycleId: payload.cycleId,
      submittedByUserId: payload.submittedByUserId || activeOutboxOwnerId,
      submissionSource,
      status: payload.status || 'ACTIVE',
      updatedAt: payload.updatedAt
    });
    return { id: payload.id, ...normalized };
  } catch (error) {
    console.warn('[syncEngine] A queued change requires manual correction.');
    return { ...payload };
  }
}

async function persistOutboxQueue(queue = outboxQueue, ownerUserId = activeOutboxOwnerId) {
  assertOutboxReady();
  const normalizedOwnerId = normalizeOutboxOwnerId(ownerUserId);
  if (!normalizedOwnerId) return Array.isArray(queue) && queue.length === 0;
  return saveItem(localOutboxStorageKey(normalizedOwnerId), queue);
}

/**
 * Generate a custom operation ID
 */
export function generateCustomOpId(stageNumber = 1) {
  return createClientRecordId('COP', `STG${stageNumber}`);
}

/**
 * Initialize outbox queue from persistent disk storage
 */
export async function initSyncEngine(userId = '') {
  const normalizedOwnerId = normalizeOutboxOwnerId(userId);
  const generation = ++outboxLoadGeneration;
  const previousQueue = activeOutboxOwnerId === normalizedOwnerId ? outboxQueue : [];
  activeOutboxOwnerId = normalizedOwnerId;
  outboxReady = false;
  outboxStorageError = null;
  outboxQueue = previousQueue;
  try {
    transientTakeoverGrants.clear();
    if (!activeOutboxOwnerId) {
      outboxQueue = [];
      outboxReady = true;
      notifySyncEngine();
      return [];
    }

    const savedOutbox = await getItem(localOutboxStorageKey(normalizedOwnerId), [], { strict: true, bypassCache: true });
    if (generation !== outboxLoadGeneration) return [];
    if (!Array.isArray(savedOutbox)) throw new Error('The saved synchronization queue is not a valid list.');
    const restoredQueue = migrateOutbox(savedOutbox, { migratePayload: migrateQueuedPayload })
      .filter(item => item.type !== 'audit_log' && item.type !== 'system_event')
      .map(item => ({
      ...item,
      ownerUserId: activeOutboxOwnerId
    }));
    // Persist migrations immediately so a restart reuses the same idempotency
    // keys instead of manufacturing a second mutation. The former unscoped
    // STORAGE_KEYS.OUTBOX is deliberately left quarantined: its owner cannot
    // be proven, so it must never be replayed under whichever user logs in.
    if (!(await saveItem(localOutboxStorageKey(normalizedOwnerId), restoredQueue))) {
      throw new Error('The restored synchronization queue could not be saved.');
    }
    if (generation !== outboxLoadGeneration) return [];
    outboxQueue = restoredQueue;
    outboxReady = true;
    notifySyncEngine();
    return outboxQueue;
  } catch (error) {
    console.warn('[syncEngine] The synchronization queue could not be initialized.');
    if (generation !== outboxLoadGeneration) return [];
    outboxStorageError = 'Saved offline work could not be loaded. New saves and synchronization are paused. Retry Sync Now; do not clear local storage.';
    notifySyncEngine();
    return [...outboxQueue];
  }
}

export function getOutboxStorageState() {
  return { ready: outboxReady, error: outboxStorageError, ownerUserId: activeOutboxOwnerId };
}

function assertOutboxReady() {
  if (!outboxReady) throw Object.assign(new Error(outboxStorageError || 'Saved offline work is still loading. Please wait and retry.'), {
    code: 'QUEUE_STORAGE_UNAVAILABLE'
  });
}

/**
 * Get current outbox items
 */
export function getOutboxQueue() {
  return [...outboxQueue];
}

export function getOutboxDiagnostics() {
  return outboxQueue.map(item => ({
    mutationId: item.mutationId,
    entityKey: item.entityKey,
    type: item.type,
    ownerUserId: item.ownerUserId || activeOutboxOwnerId || null,
    status: item.status,
    enqueuedAt: item.enqueuedAt,
    retryCount: Number(item.retryCount || 0),
    nextAttemptAt: item.nextAttemptAt || null,
    lastAttempt: item.lastAttempt || null,
    lastError: item.lastError || null,
    conflict: item.conflict || null,
    proposedChanges: item.type === 'operation_amendment' ? item.payload?.changes : null,
    dependsOnMutationId: item.dependsOnMutationId || null
  }));
}

/**
 * Get number of unsynced items in outbox
 */
export function getOutboxCount() {
  return outboxQueue.length;
}

export function getOutboxPressure() {
  return queuePressure(outboxQueue.length);
}

/**
 * Enqueue a new operation log or field action to the outbox queue
 */
export async function enqueueOutboxItem(type, payload, options = {}) {
  assertOutboxReady();
  if (!activeOutboxOwnerId) {
    throw new Error('A signed-in user is required before work can be added to the synchronization queue.');
  }
  const outboxItem = createMutationEnvelope(type, payload, {
    ...options,
    ownerUserId: activeOutboxOwnerId
  }, outboxQueue);

  // A schedule mutation contains the field's complete current schedule, so a
  // newer save supersedes older unsent or correctable schedule snapshots. If
  // those snapshots are left in the queue, the newest save becomes dependent
  // on a rejected item and can never be attempted.
  if (type === 'operation_schedule') {
    const replaceableStatuses = new Set(['queued', 'retryable', 'failed', 'server_failure', 'validation', 'rejected']);
    const superseded = outboxQueue.filter(item => (
      item.type === type
      && item.entityKey === outboxItem.entityKey
      && replaceableStatuses.has(item.status)
    ));
    if (superseded.length > 0) {
      const previousQueue = outboxQueue;
      const supersededIds = new Set(superseded.map(item => item.mutationId));
      const byMutationId = new Map(previousQueue.map(item => [item.mutationId, item]));
      const resolveSurvivingDependency = dependencyId => {
        let currentId = dependencyId || null;
        const visited = new Set();
        while (currentId && supersededIds.has(currentId) && !visited.has(currentId)) {
          visited.add(currentId);
          currentId = byMutationId.get(currentId)?.dependsOnMutationId || null;
        }
        return currentId;
      };
      const compactedQueue = previousQueue
        .filter(item => !supersededIds.has(item.mutationId))
        .map(item => supersededIds.has(item.dependsOnMutationId)
          ? { ...item, dependsOnMutationId: resolveSurvivingDependency(item.dependsOnMutationId) }
          : item);
      const predecessor = [...compactedQueue].reverse().find(item => item.entityKey === outboxItem.entityKey);
      const replacement = {
        ...outboxItem,
        // Preserve the last confirmed server version from the first queued
        // schedule instead of an optimistic local timestamp.
        baseVersion: superseded[0].baseVersion ?? outboxItem.baseVersion,
        dependsOnMutationId: predecessor?.mutationId || null
      };
      outboxQueue = [...compactedQueue, replacement];
      const persisted = await persistOutboxQueue();
      if (!persisted) {
        outboxQueue = previousQueue;
        throw new Error('The updated farm schedule could not be saved to the persistent synchronization queue.');
      }
      console.info(`[SYNC] Replaced ${superseded.length} older schedule update(s): ${replacement.mutationId}`);
      notifySyncEngine();
      return replacement;
    }
  }

  const appended = appendUniqueMutation(outboxQueue, outboxItem);
  if (!appended.inserted) return appended.item;
  outboxQueue = appended.queue;
  const persisted = await persistOutboxQueue();
  if (!persisted) {
    outboxQueue = outboxQueue.filter(item => item.mutationId !== outboxItem.mutationId);
    throw new Error('The operation could not be saved to the persistent synchronization queue.');
  }
  if (options.takeoverGrant) transientTakeoverGrants.set(outboxItem.mutationId, options.takeoverGrant);
  console.info(`[SYNC] Enqueued: ${outboxItem.mutationId}`);
  notifySyncEngine();
  return outboxItem;
}

/**
 * Persist the user's intent before making any network request, then attempt a
 * flush. A network failure leaves the exact same mutation and idempotency key
 * on disk for restart/retry.
 */
export async function enqueueAndFlushMutation(type, payload, options = {}) {
  const item = await enqueueOutboxItem(type, payload, options);
  const result = await flushOutboxToApi();
  const retained = outboxQueue.find(queued => queued.mutationId === item.mutationId);
  return { item: retained || item, result, queued: !!retained, response: result.responses?.[item.mutationId] };
}

/**
 * Remove an item from the outbox after confirmed upload
 */
export async function removeOutboxItem(outboxId) {
  assertOutboxReady();
  outboxQueue = outboxQueue.filter(item => (
    item.mutationId !== outboxId
    && item.outboxId !== outboxId
    && item.id !== outboxId
  ));
  await persistOutboxQueue();
  notifySyncEngine();
}

export async function resolveOperationConflict(mutationId, { separate = false, reason = '' } = {}) {
  return runOutboxSingleFlight(async () => {
    assertOutboxReady();
    const item = outboxQueue.find(queued => queued.mutationId === mutationId);
    const reviewable = item && ['operation_log', 'takeover_log', 'operation_amendment', 'operation_archive'].includes(item.type)
      && ['conflict', 'validation', 'rejected', 'authorization'].includes(item.status);
    if (!activeOutboxOwnerId || !reviewable || (item.ownerUserId && item.ownerUserId !== activeOutboxOwnerId)
      || (separate && item.conflict?.code !== 'OPERATION_RECONCILIATION_REQUIRED')) throw new Error('This operation conflict is no longer available. Refresh the queue.');
    if (separate && String(reason).trim().length < 3) throw new Error('Explain why this is separate work.');
    const nextQueue = separate ? outboxQueue.map(queued => queued !== item ? queued : {
      ...item, status: 'queued', lastError: null, conflict: null, nextAttemptAt: null,
      payload: { ...item.payload, reconciliation: {
        recordVersions: Object.fromEntries(item.conflict.records.map(record => [record.id, record.updatedAt || 'UNVERSIONED'])),
        reason: String(reason).trim().slice(0, 500)
      } }
    }) : outboxQueue.filter(queued => queued !== item).map(queued => queued.dependsOnMutationId !== mutationId ? queued : {
      ...queued, status: 'conflict', lastError: 'The original queued copy was removed after review. Review this dependent change before submitting.', conflict: { code: 'REMOVED_OPERATION_DEPENDENCY' }
    });
    const owner = activeOutboxOwnerId;
    const previousQueue = outboxQueue;
    outboxQueue = nextQueue;
    if (!(await persistOutboxQueue(nextQueue, owner))) {
      if (activeOutboxOwnerId === owner) {
        const previousIds = new Set(previousQueue.map(queued => queued.mutationId));
        outboxQueue = [...previousQueue, ...outboxQueue.filter(queued => !previousIds.has(queued.mutationId))];
        await persistOutboxQueue(outboxQueue, owner);
      }
      throw new Error('The reviewed queue could not be saved.');
    }
    notifySyncEngine();
  }, { joinExisting: false });
}

/**
 * Mark an outbox item as failed
 */
export async function markOutboxItemFailed(outboxId, errorMessage) {
  assertOutboxReady();
  const item = outboxQueue.find(i => i.outboxId === outboxId || i.id === outboxId);
  if (item) {
    item.status = 'retryable';
    item.retryCount = (item.retryCount || 0) + 1;
    item.lastAttempt = new Date().toISOString();
    item.lastError = errorMessage;
    await persistOutboxQueue();
    notifySyncEngine();
  }
}

export async function retryCorrectableOutboxItems() {
  assertOutboxReady();
  const migrated = migrateOutbox(outboxQueue, { migratePayload: migrateQueuedPayload });
  const requeued = requeueCorrectableMutations(migrated);
  if (requeued.requeuedCount === 0) return 0;
  outboxQueue = requeued.queue;
  if (!(await persistOutboxQueue())) {
    throw new Error('The corrected synchronization queue could not be saved.');
  }
  notifySyncEngine();
  return requeued.requeuedCount;
}

/**
 * Process all queued outbox items (FIFO) with remote upload handler
 * @param {Function} remoteUploadHandler - Async callback `async (item) => boolean`
 */
export async function processOutbox(remoteUploadHandler) {
  return runOutboxSingleFlight(async () => {
    assertOutboxReady();
    if (outboxQueue.length === 0) {
      return { success: true, attemptedCount: 0, processedCount: 0, failedCount: 0, remainingCount: 0, responses: {} };
    }
    const processingOwnerId = activeOutboxOwnerId;
    if (!processingOwnerId) {
      throw new Error('A signed-in user is required before the synchronization queue can be processed.');
    }
    console.info(`[SYNC] Queue size: ${outboxQueue.length}`);
    const processingMutationIds = new Set(outboxQueue.map(item => item.mutationId));
    const mergeConcurrentItems = (nextQueue, acknowledgedResponses = {}) => {
      const nextIds = new Set(nextQueue.map(item => item.mutationId));
      const concurrentItems = outboxQueue
        .filter(item => !processingMutationIds.has(item.mutationId) && !nextIds.has(item.mutationId))
        .map(item => {
          const dependencyResponse = acknowledgedResponses[item.dependsOnMutationId];
          const serverVersion = dependencyResponse?.success ? responseVersion(dependencyResponse) : null;
          return serverVersion
            ? { ...item, baseVersion: serverVersion, dependsOnMutationId: null }
            : item;
        });
      return [...nextQueue, ...concurrentItems];
    };
    const drained = await drainMutationQueue(
      outboxQueue,
      async item => {
        console.info(`[SYNC] Item attempt: ${item.mutationId}`);
        try {
          const response = await (typeof remoteUploadHandler === 'function' ? remoteUploadHandler(item) : { success: true });
          transientTakeoverGrants.delete(item.mutationId);
          console.info(`[SYNC] Success: ${item.mutationId}`);
          return response;
        } catch (error) {
          const classification = classifyMutationError(error);
          const label = classification === 'retryable' || classification === 'server_failure' ? 'Retry' : 'Failed';
          console.info(`[SYNC] ${label}: ${item.mutationId} ${error?.message || 'Unknown error'}`);
          throw error;
        }
      },
      async (nextQueue, acknowledgedResponses) => {
        const mergedQueue = mergeConcurrentItems(nextQueue, acknowledgedResponses);
        const persisted = await persistOutboxQueue(mergedQueue, processingOwnerId);
        if (!persisted) throw new Error('The synchronization queue state could not be persisted.');
        if (activeOutboxOwnerId === processingOwnerId) {
          outboxQueue = mergedQueue;
          notifySyncEngine();
        }
      },
      { batchSize: 10, applyBackoff: true }
    );
    if (activeOutboxOwnerId !== processingOwnerId) {
      return { success: false, error: 'Signed-in account changed during synchronization.', reason: 'ACCOUNT_CHANGED', remainingCount: drained.queue.length };
    }
    outboxQueue = mergeConcurrentItems(drained.queue, drained.responses);

    if (!(await persistOutboxQueue(outboxQueue, processingOwnerId))) {
      throw new Error('The synchronization result could not be persisted.');
    }
    await saveItem(STORAGE_KEYS.LAST_SYNC, new Date().toISOString());
    notifySyncEngine();

    const { queue: _persistedQueue, ...drainedResult } = drained;
    const result = {
      ...drainedResult,
      success: drainedResult.failedCount === 0 && outboxQueue.length === 0,
      remainingCount: outboxQueue.length,
      remainingItems: outboxQueue.map(item => ({
        mutationId: item.mutationId,
        entityKey: item.entityKey,
        type: item.type,
        status: item.status,
        retryCount: Number(item.retryCount || 0),
        lastError: item.lastError || null,
        ...(item.nextAttemptAt ? { nextAttemptAt: item.nextAttemptAt } : {}),
        dependsOnMutationId: item.dependsOnMutationId || null
      }))
    };
    console.info(`[SYNC] Remaining: ${result.remainingCount}`);
    if (result.remainingCount === 0) {
      console.info('[SYNC] Complete');
    } else if (result.attemptedCount === 0) {
      console.info(`[SYNC] Deferred: ${result.remainingCount} item(s) are waiting for retry or user action`);
    } else {
      console.info(`[SYNC] Incomplete: ${result.remainingCount} item(s) remain`);
    }
    return result;
  }, { joinExisting: false });
}

/**
 * Execute one mutation through the authoritative Express API. Direct online
 * callers with a version also send a transient precondition envelope. Durable
 * outbox replay always keeps its original identity and version.
 */
export async function executeMutationViaApi(item, { includeMutation = true } = {}) {
      const { type, payload } = item;
      const envelope = !item.mutationId && item.baseVersion != null
        ? createMutationEnvelope(type, payload, { baseVersion: item.baseVersion }) : item;
      const mutation = includeMutation || item.baseVersion != null ? {
        mutationId: envelope.mutationId,
        idempotencyKey: envelope.idempotencyKey,
        entityKey: envelope.entityKey,
        baseVersion: envelope.baseVersion
      } : null;
      const takeoverGrant = item.takeoverGrant || transientTakeoverGrants.get(item.mutationId) || null;

      if (type === 'operation_log' || type === 'takeover_log') {
        if (!payload.id || !payload.cycleId) throw new Error('Queued operation requires stable id and cycleId.');
        return createOperation(payload, mutation, takeoverGrant);
      } else if (type === 'ticket') {
        return createTicket(payload, mutation);
      } else if (type === 'ticket_message') {
        return addTicketMessage(payload, mutation);
      } else if (type === 'stage_update') {
        if (!payload.cycleId) throw new Error('Queued stage update requires cycleId.');
        return updateCycleStage(payload.cycleId, {
          currentStageNumber: Number(payload.currentStageNumber || payload.stageNumber),
          elapsedMonths: Number(payload.elapsedMonths || 0),
          ...(Object.prototype.hasOwnProperty.call(payload, 'isCompleted') ? { isCompleted: payload.isCompleted === true } : {})
        }, mutation, takeoverGrant);
      } else if (type === 'operation_amendment') {
        return amendOperation(payload.id, payload.changes, payload.amendment, mutation, takeoverGrant);
      } else if (type === 'operation_archive') {
        return archiveOperations(payload.operationLogIds || [payload.id], mutation, takeoverGrant);
      } else if (type === 'field_upsert') {
        if (payload.isNew) return createField(payload, mutation);
        return updateField(payload.id, payload, mutation);
      } else if (type === 'field_archive') {
        return archiveField(payload.id, mutation);
      } else if (type === 'cycle_rollover') {
        const error = new Error('Queued Crop Year Cycle rollover is not permitted. Synchronize the field, then start the next cycle while online.');
        error.status = 422;
        throw error;
      } else if (type === 'price') {
        return publishPrice(payload, mutation);
      } else if (type === 'custom_stages') {
        return saveCustomStages(payload.fieldId, payload.customStages, mutation);
      } else if (type === 'custom_operations') {
        return saveCustomOperations(payload.fieldId, payload.customOperations, mutation);
      } else if (type === 'operation_schedule') {
        return saveOperationSchedule(payload.fieldId, payload.operationSchedule, mutation);
      } else if (type === 'audit_report') {
        return compileAuditReport(payload, mutation);
      } else if (type === 'audit_delivery_selection') {
        return selectAuditDeliveryMethod(payload.id, payload.deliveryMethod || 'QR', mutation);
      } else if (type === 'audit_submission') {
        return submitAuditReport(payload.id, payload.submissionMethod || 'CLOUD', mutation);
      } else if (type === 'audit_return') {
        return returnAuditReport(payload.id, payload.returnReason, mutation);
      } else if (type === 'audit_qr_import') {
        return importAuditQr(payload.payload, mutation);
      } else if (type === 'audit_certification') {
        return certifyAuditReport(payload.id, payload.certificationNotes, mutation);
      } else if (type === 'user_approve') {
        return approveUser(payload, mutation);
      }
      const error = new Error(`Unsupported queued mutation type: ${type}`);
      error.status = 400;
      throw error;
}

/**
 * Flush queued offline work through the authoritative Express API.
 */
export async function flushOutboxToApi() {
  try {
    return await processOutbox(async (item) => {
      return executeMutationViaApi(item);
    });
  } catch (err) {
    console.warn('[syncEngine] The synchronization queue could not be sent.');
    return {
      success: false,
      error: err.message,
      reason: 'QUEUE_PERSISTENCE_FAILURE',
      attemptedCount: 0,
      processedCount: 0,
      failedCount: 0,
      remainingCount: outboxQueue.length,
      remainingItems: getOutboxDiagnostics(),
      responses: {}
    };
  }
}

/**
 * Clear the entire outbox queue (e.g. on cache wipe)
 */
export async function clearOutbox() {
  assertOutboxReady();
  outboxQueue = [];
  await persistOutboxQueue();
  notifySyncEngine();
  return true;
}
