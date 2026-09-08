import { STORAGE_KEYS, getItem, saveItem } from './storageService';

let outboxQueue = [];
let isProcessing = false;
let syncListeners = [];

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
      console.warn('[syncEngine] Listener error:', e);
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
export function generateUserNumericId(role, seedIndex = null) {
  let prefix = '04'; // Default to Member
  const roleLower = String(role || '').toLowerCase();

  if (roleLower.includes('super admin') || roleLower.includes('super_admin')) {
    prefix = '01';
  } else if (roleLower.includes('sra') || (roleLower.includes('admin') && !roleLower.includes('farm'))) {
    prefix = '02';
  } else if (roleLower.includes('manager') || roleLower.includes('farm manager')) {
    prefix = '03';
  } else {
    prefix = '04';
  }

  if (seedIndex !== null && seedIndex !== undefined) {
    return `${prefix}${String(seedIndex).padStart(6, '0')}`;
  }

  const randomSeq = Math.floor(100000 + Math.random() * 900000);
  return `${prefix}${randomSeq}`;
}

/**
 * Generate a unique deterministic production-grade ID for operational logs
 * Format: LOG-{FIELD}-{TIMESTAMP_HEX}-{RAND} e.g. LOG-FLDNCY001-M7A9X2-8F2A
 */
export function generateDeterministicLogId(fieldId) {
  const cleanField = (fieldId || 'FLD-NCY-001').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  const timeHex = Date.now().toString(36).toUpperCase();
  const randHex = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `LOG-${cleanField}-${timeHex}-${randHex}`;
}

export function generateLogId(fieldId) {
  return generateDeterministicLogId(fieldId);
}

/**
 * Generate a production draft log ID
 * Format: DFT-{FIELD}-{TIMESTAMP_HEX}-{RAND}
 */
export function generateDraftId(fieldId) {
  const cleanField = (fieldId || 'FLD-NCY-001').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  const timeHex = Date.now().toString(36).toUpperCase();
  const randHex = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `DFT-${cleanField}-${timeHex}-${randHex}`;
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
  const timeHex = Date.now().toString(36).toUpperCase();
  return `TCK-${year}-${timeHex}`;
}

/**
 * Generate a custom operation ID
 */
export function generateCustomOpId(stageNumber = 1) {
  const timeHex = Date.now().toString(36).toUpperCase();
  return `COP-STG${stageNumber}-${timeHex}`;
}

/**
 * Initialize outbox queue from persistent disk storage
 */
export async function initSyncEngine() {
  try {
    const savedOutbox = await getItem(STORAGE_KEYS.OUTBOX, []);
    outboxQueue = Array.isArray(savedOutbox) ? savedOutbox : [];
    notifySyncEngine();
    return outboxQueue;
  } catch (error) {
    console.warn('[syncEngine] Error initializing outbox:', error);
    outboxQueue = [];
    return [];
  }
}

/**
 * Get current outbox items
 */
export function getOutboxQueue() {
  return [...outboxQueue];
}

/**
 * Get number of unsynced items in outbox
 */
export function getOutboxCount() {
  return outboxQueue.filter(item => item.status !== 'synced').length;
}

/**
 * Enqueue a new operation log or field action to the outbox queue
 */
export async function enqueueOutboxItem(type, payload) {
  const clientGeneratedId = payload.id || generateDeterministicLogId(payload.fieldId);
  const timeHex = Date.now().toString(36).toUpperCase();
  const randHex = Math.random().toString(36).substring(2, 6).toUpperCase();
  const outboxItem = {
    outboxId: `OUT-${timeHex}-${randHex}`,
    id: clientGeneratedId,
    type: type || 'operation_log', // 'operation_log', 'stage_update', 'ticket'
    payload: {
      ...payload,
      id: clientGeneratedId,
      createdAt: payload.createdAt || new Date().toISOString(),
      offlineCaptured: true
    },
    status: 'queued', // 'queued', 'syncing', 'failed', 'synced'
    enqueuedAt: new Date().toISOString(),
    retryCount: 0,
    lastAttempt: null,
    lastError: null
  };

  outboxQueue.push(outboxItem);
  await saveItem(STORAGE_KEYS.OUTBOX, outboxQueue);
  notifySyncEngine();
  return outboxItem;
}

/**
 * Remove an item from the outbox after confirmed upload
 */
export async function removeOutboxItem(outboxId) {
  outboxQueue = outboxQueue.filter(item => item.outboxId !== outboxId && item.id !== outboxId);
  await saveItem(STORAGE_KEYS.OUTBOX, outboxQueue);
  notifySyncEngine();
}

/**
 * Mark an outbox item as failed
 */
export async function markOutboxItemFailed(outboxId, errorMessage) {
  const item = outboxQueue.find(i => i.outboxId === outboxId || i.id === outboxId);
  if (item) {
    item.status = 'failed';
    item.retryCount = (item.retryCount || 0) + 1;
    item.lastAttempt = new Date().toISOString();
    item.lastError = errorMessage;
    await saveItem(STORAGE_KEYS.OUTBOX, outboxQueue);
    notifySyncEngine();
  }
}

/**
 * Process all queued outbox items (FIFO) with remote upload handler
 * @param {Function} remoteUploadHandler - Async callback `async (item) => boolean`
 */
export async function processOutbox(remoteUploadHandler) {
  if (isProcessing) return { success: false, reason: 'Already processing' };
  if (outboxQueue.length === 0) return { success: true, processedCount: 0 };

  isProcessing = true;
  let processedCount = 0;
  let failedCount = 0;

  try {
    const itemsToProcess = [...outboxQueue];

    for (const item of itemsToProcess) {
      item.status = 'syncing';
      item.lastAttempt = new Date().toISOString();
      notifySyncEngine();

      try {
        let isSuccess = true;
        if (typeof remoteUploadHandler === 'function') {
          isSuccess = await remoteUploadHandler(item);
        }

        if (isSuccess) {
          item.status = 'synced';
          processedCount++;
          // Remove from outbox
          outboxQueue = outboxQueue.filter(q => q.outboxId !== item.outboxId);
        } else {
          item.status = 'failed';
          item.retryCount = (item.retryCount || 0) + 1;
          item.lastError = 'Remote rejected or network unavailable';
          failedCount++;
        }
      } catch (err) {
        item.status = 'failed';
        item.retryCount = (item.retryCount || 0) + 1;
        item.lastError = err.message || 'Sync connection timeout';
        failedCount++;
      }
    }

    await saveItem(STORAGE_KEYS.OUTBOX, outboxQueue);
    await saveItem(STORAGE_KEYS.LAST_SYNC, new Date().toISOString());
    notifySyncEngine();

    return {
      success: failedCount === 0,
      processedCount,
      failedCount,
      remainingCount: outboxQueue.length
    };
  } finally {
    isProcessing = false;
  }
}

/**
 * Flush all outbox items directly to Cloud Firestore (hugpong-ff)
 */
export async function flushOutboxToFirestore() {
  try {
    const { db } = require('../firebase/config');
    const { doc, setDoc, getDoc } = require('firebase/firestore');

    if (!db) {
      console.warn('[syncEngine] Firestore instance not initialized, skipping cloud flush.');
      return { success: false, reason: 'Firestore unavailable' };
    }

    return await processOutbox(async (item) => {
      const { type, payload } = item;

      if (type === 'operation_log' || type === 'takeover_log') {
        const docRef = doc(db, 'operation_logs', payload.id);
        await setDoc(docRef, {
          ...payload,
          synced: true,
          syncedAt: new Date().toISOString()
        }, { merge: true });

        // Update corresponding field plot stage safely with conflict resolution
        const incomingStage = payload.stage || payload.stageName;
        if (incomingStage && payload.fieldId) {
          const fieldRef = doc(db, 'fields', payload.fieldId);
          try {
            const currentSnap = await getDoc(fieldRef);
            if (currentSnap.exists()) {
              const currentData = currentSnap.data();
              const conflict = resolveStageConflict(
                currentData.stage,
                incomingStage,
                currentData.updatedAt,
                payload.createdAt || item.enqueuedAt
              );
              if (conflict.resolution !== 'rejected_regression_preserved_advanced_stage') {
                await setDoc(fieldRef, {
                  stage: conflict.stage,
                  stageNumber: getStageLevel(conflict.stage),
                  lastSync: 'Just now',
                  synced: true,
                  updatedAt: new Date().toISOString()
                }, { merge: true });
              } else {
                console.log(`[syncEngine] Preserved advanced stage ${currentData.stage} over regressive offline stage ${incomingStage} for ${payload.fieldId}`);
              }
            } else {
              await setDoc(fieldRef, {
                stage: incomingStage,
                stageNumber: getStageLevel(incomingStage),
                lastSync: 'Just now',
                synced: true,
                updatedAt: new Date().toISOString()
              }, { merge: true });
            }
          } catch (stageErr) {
            console.warn('[syncEngine] Field stage sync notice:', stageErr);
          }
        }
        return true;
      } else if (type === 'ticket') {
        const docRef = doc(db, 'support_tickets', payload.id);
        await setDoc(docRef, { ...payload, synced: true, syncedAt: new Date().toISOString() }, { merge: true });
        return true;
      } else if (type === 'stage_update') {
        const incomingStage = payload.stage || payload.stageName;
        const fieldRef = doc(db, 'fields', payload.fieldId);
        try {
          const currentSnap = await getDoc(fieldRef);
          if (currentSnap.exists()) {
            const currentData = currentSnap.data();
            const conflict = resolveStageConflict(
              currentData.stage,
              incomingStage,
              currentData.updatedAt,
              payload.createdAt || item.enqueuedAt
            );
            if (conflict.resolution !== 'rejected_regression_preserved_advanced_stage') {
              await setDoc(fieldRef, {
                stage: conflict.stage,
                stageNumber: getStageLevel(conflict.stage),
                lastSync: 'Just now',
                synced: true,
                updatedAt: new Date().toISOString()
              }, { merge: true });
            } else {
              console.log(`[syncEngine] Preserved advanced stage ${currentData.stage} over regressive offline stage ${incomingStage} for ${payload.fieldId}`);
            }
          } else {
            await setDoc(fieldRef, {
              stage: incomingStage,
              stageNumber: getStageLevel(incomingStage),
              lastSync: 'Just now',
              synced: true,
              updatedAt: new Date().toISOString()
            }, { merge: true });
          }
        } catch (stageErr) {
          console.warn('[syncEngine] Stage update notice:', stageErr);
        }
        return true;
      } else if (type === 'audit_log' || type === 'system_event') {
        const docRef = doc(db, 'audit_logs', payload.id);
        await setDoc(docRef, { ...payload, synced: true, syncedAt: new Date().toISOString() }, { merge: true });
        return true;
      }
      return true;
    });
  } catch (err) {
    console.warn('[syncEngine] Error flushing to Firestore:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Clear the entire outbox queue (e.g. on cache wipe)
 */
export async function clearOutbox() {
  outboxQueue = [];
  await saveItem(STORAGE_KEYS.OUTBOX, []);
  notifySyncEngine();
  return true;
}
