'use strict';

const RETRYABLE_STATUSES = new Set(['queued', 'retryable', 'failed', 'server_failure', 'authentication']);
const PENDING_STATUSES = new Set([
  'queued', 'retryable', 'failed', 'server_failure', 'syncing',
  'authentication', 'authorization', 'conflict', 'validation', 'rejected'
]);
const SUCCESS_STATUSES = new Set(['synced', 'success', 'completed', 'acknowledged']);

function canonicalQueueStatus(value) {
  const status = String(value || 'queued').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (SUCCESS_STATUSES.has(status)) return 'synced';
  if (status === 'pending' || status === 'waiting' || status === 'new') return 'queued';
  // A process can stop after persisting `syncing`. On restart it must be
  // retryable; otherwise a full queue produces 0 attempted and never drains.
  if (status === 'syncing' || status === 'in_progress' || status === 'processing') return 'retryable';
  return PENDING_STATUSES.has(status) ? status : 'queued';
}

function randomToken() {
  return Math.random().toString(36).slice(2, 10).toUpperCase();
}

function createMutationId(now = Date.now(), random = randomToken()) {
  return `MUT-${Number(now).toString(36).toUpperCase()}-${String(random).replace(/[^A-Z0-9]/gi, '').toUpperCase()}`;
}

function inferEntityKey(type, payload = {}) {
  const id = payload.id || payload.fieldId || payload.cycleId || '';
  if (type === 'operation_log' || type === 'takeover_log' || type === 'operation_amendment') return `operation_logs/${id}`;
  if (type === 'operation_archive') return `operation_logs/${(payload.operationLogIds || []).join(',')}`;
  if (type === 'field_upsert' || type === 'field_archive' || type === 'custom_stages' || type === 'custom_operations') return `fields/${id}`;
  if (type === 'stage_update') return `crop_cycles/${payload.cycleId || ''}`;
  if (type === 'cycle_rollover') return `fields/${payload.fieldId || ''}`;
  if (type === 'price') return `sra_prices/${id}`;
  if (type === 'ticket' || type === 'ticket_message') return `support_tickets/${id}`;
  if (type === 'audit_log' || type === 'system_event') return `audit_logs/${id}`;
  if (['audit_report', 'audit_submission', 'audit_return', 'audit_certification'].includes(type)) return `audit_reports/${id}`;
  if (type === 'audit_qr_import') return `audit_reports/${payload.reportId || payload.id || ''}`;
  if (type === 'user_approve') return `users/${id}`;
  return `${String(type || 'mutation')}/${id}`;
}

function inferLogicalMutationKey(type, payload = {}) {
  const entityKey = inferEntityKey(type, payload);
  if (type === 'operation_amendment') {
    const amendmentId = payload.amendment?.amendmentId;
    return payload.id && amendmentId ? `${type}:${payload.id}:${amendmentId}` : null;
  }
  if (type === 'audit_report') {
    const ids = Array.isArray(payload.operationLogIds) ? [...new Set(payload.operationLogIds.map(String))].sort() : [];
    return `${type}:${payload.id || `${payload.blockFarmId || ''}:${payload.periodKey || payload.period || ''}`}:${ids.join(',')}`;
  }
  if (type === 'audit_submission') return payload.id ? `${type}:${payload.id}` : null;
  if (type === 'ticket_message') return payload.id && payload.messageId ? `${type}:${payload.id}:${payload.messageId}` : null;
  if (type === 'audit_qr_import') return payload.reportId ? `${type}:${payload.reportId}` : null;
  if (type === 'operation_archive') {
    const ids = Array.isArray(payload.operationLogIds) ? [...new Set(payload.operationLogIds.map(String))].sort() : [];
    return ids.length > 0 ? `${type}:${ids.join(',')}` : null;
  }
  // Create-style mutations have a durable entity identity and can be safely
  // collapsed if a crash left the same logical mutation in the outbox twice.
  // Mutable commands (field/stage/settings updates) deliberately return null:
  // two queued updates to the same entity can represent distinct user intent.
  if (['operation_log', 'takeover_log', 'audit_log', 'system_event', 'price', 'ticket', 'user_approve'].includes(type)) {
    return entityKey.endsWith('/') ? null : `${type}:${entityKey}`;
  }
  return null;
}

function createMutationEnvelope(type, payload, options = {}, existingQueue = []) {
  if (!type || !payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('An explicit mutation type and payload are required.');
  }
  const mutationId = options.mutationId || options.idempotencyKey || createMutationId(options.now, options.random);
  const entityKey = options.entityKey || inferEntityKey(type, payload);
  const logicalMutationKey = options.logicalMutationKey || inferLogicalMutationKey(type, payload);
  const predecessor = [...existingQueue].reverse().find(item =>
    item.entityKey === entityKey && PENDING_STATUSES.has(item.status)
  );
  const enqueuedAt = options.enqueuedAt || new Date(options.now || Date.now()).toISOString();

  return {
    schemaVersion: 1,
    outboxId: mutationId,
    mutationId,
    idempotencyKey: mutationId,
    type,
    entityKey,
    logicalMutationKey,
    ownerUserId: String(options.ownerUserId || '').trim() || null,
    baseVersion: options.baseVersion === undefined ? null : options.baseVersion,
    // Takeover grants are deliberately never serialized into the durable queue.
    takeoverGrant: null,
    dependsOnMutationId: predecessor?.mutationId || null,
    payload: { ...payload },
    status: 'queued',
    enqueuedAt,
    retryCount: 0,
    nextAttemptAt: null,
    lastAttempt: null,
    lastError: null,
    conflict: null
  };
}

function migrateOutbox(savedQueue = []) {
  if (!Array.isArray(savedQueue)) return [];
  const migrated = savedQueue.map((item, index) => {
    const stableId = String(item?.mutationId || item?.idempotencyKey || item?.outboxId || item?.id || `LEGACY-${index}`);
    const type = item?.type || 'mutation';
    const payload = { ...(item?.payload || {}) };
    const entityKey = item?.entityKey || inferEntityKey(type, payload);
    return {
      ...item,
      schemaVersion: 1,
      outboxId: stableId,
      mutationId: stableId,
      idempotencyKey: stableId,
      type,
      entityKey,
      logicalMutationKey: item?.logicalMutationKey || inferLogicalMutationKey(type, payload),
      ownerUserId: String(item?.ownerUserId || '').trim() || null,
      baseVersion: item?.baseVersion === undefined ? null : item.baseVersion,
      takeoverGrant: null,
      dependsOnMutationId: item?.dependsOnMutationId || null,
      payload,
      status: canonicalQueueStatus(item?.status),
      retryCount: Number(item?.retryCount || 0),
      nextAttemptAt: item?.nextAttemptAt || null,
      conflict: item?.conflict || null
    };
  });

  const unique = [];
  const seenIds = new Set();
  const seenLogicalKeys = new Set();
  migrated.forEach(item => {
    // A durable record already marked successful is stale cleanup residue.
    if (item.status === 'synced') return;
    if (seenIds.has(item.idempotencyKey) || (item.logicalMutationKey && seenLogicalKeys.has(item.logicalMutationKey))) return;
    seenIds.add(item.idempotencyKey);
    if (item.logicalMutationKey) seenLogicalKeys.add(item.logicalMutationKey);
    unique.push(item);
  });
  const knownMutationIds = new Set(unique.map(item => item.mutationId));
  unique.forEach(item => {
    if (item.dependsOnMutationId && !knownMutationIds.has(item.dependsOnMutationId)) item.dependsOnMutationId = null;
  });
  return unique;
}

function appendUniqueMutation(queue, envelope) {
  const existing = queue.find(item =>
    item.idempotencyKey === envelope.idempotencyKey
    || (item.logicalMutationKey && item.logicalMutationKey === envelope.logicalMutationKey)
  );
  if (existing) return { queue, item: existing, inserted: false };
  return { queue: [...queue, envelope], item: envelope, inserted: true };
}

function classifyMutationError(error) {
  const status = Number(error?.status || 0);
  if (status === 401) return 'authentication';
  if (status === 403) return 'authorization';
  if (status === 409) return 'conflict';
  if (status === 400 || status === 422) return 'validation';
  if (status >= 400 && status < 500) return 'rejected';
  if (status >= 500) return 'server_failure';
  return 'retryable';
}

function isRetryableMutation(item) {
  return RETRYABLE_STATUSES.has(item?.status);
}

function isPendingMutation(item) {
  return PENDING_STATUSES.has(item?.status);
}

function createSingleFlightRunner() {
  let activePromise = null;
  return async task => {
    if (activePromise) return activePromise;
    activePromise = Promise.resolve().then(task);
    try {
      return await activePromise;
    } finally {
      activePromise = null;
    }
  };
}

function getPendingOperationPayloads(queue = []) {
  return queue
    .filter(item => (item.type === 'operation_log' || item.type === 'takeover_log') && isPendingMutation(item))
    .map(item => ({ ...item.payload }));
}

function responseVersion(response) {
  return response?.data?.updatedAt
    || response?.data?.field?.updatedAt
    || response?.updatedAt
    || null;
}

function retryDelayMs(retryCount) {
  const exponent = Math.max(0, Number(retryCount || 1) - 1);
  return Math.min(5 * 60 * 1000, 5000 * (2 ** exponent));
}

function isRetryEligible(item, now = Date.now()) {
  if (!item?.nextAttemptAt) return true;
  const eligibleAt = Date.parse(item.nextAttemptAt);
  return !Number.isFinite(eligibleAt) || eligibleAt <= now;
}

async function drainMutationQueue(queue, remoteHandler, onStateChange = () => {}, options = {}) {
  let workingQueue = Array.isArray(queue) ? queue : [];
  let processedCount = 0;
  let failedCount = 0;
  const responses = {};
  const batchSize = Number.isInteger(options.batchSize) && options.batchSize > 0
    ? options.batchSize
    : Number.POSITIVE_INFINITY;
  const candidates = workingQueue
    .filter(isRetryableMutation)
    .filter(item => !options.applyBackoff || isRetryEligible(item))
    .slice(0, batchSize);
  let attemptedCount = 0;
  let dependencyBlockedCount = 0;

  for (const item of candidates) {
    if (item.dependsOnMutationId && workingQueue.some(queued => queued.mutationId === item.dependsOnMutationId)) {
      dependencyBlockedCount += 1;
      continue;
    }
    item.status = 'syncing';
    item.lastAttempt = new Date().toISOString();
    attemptedCount += 1;
    await onStateChange(workingQueue);

    try {
      const response = await remoteHandler(item);
      if (!response || response.success !== true) throw new Error('The server did not return an explicit successful persistence acknowledgement.');
      responses[item.mutationId] = response;
      const serverVersion = responseVersion(response);
      workingQueue.forEach(dependent => {
        if (dependent.dependsOnMutationId === item.mutationId) {
          if (serverVersion) dependent.baseVersion = serverVersion;
          dependent.dependsOnMutationId = null;
        }
      });
      workingQueue = workingQueue.filter(queued => queued.mutationId !== item.mutationId);
      processedCount += 1;
    } catch (error) {
      item.status = classifyMutationError(error);
      item.retryCount = Number(item.retryCount || 0) + 1;
      item.lastError = error?.message || 'Sync connection timeout';
      item.conflict = item.status === 'conflict' ? (error?.data || { message: item.lastError }) : null;
      if (options.applyBackoff && ['retryable', 'server_failure', 'authentication'].includes(item.status)) {
        item.nextAttemptAt = new Date(Date.now() + retryDelayMs(item.retryCount)).toISOString();
      } else {
        item.nextAttemptAt = null;
      }
      failedCount += 1;
    }
    await onStateChange(workingQueue);
  }

  return {
    queue: workingQueue,
    success: failedCount === 0 && workingQueue.length === 0,
    attemptedCount,
    processedCount,
    failedCount,
    remainingCount: workingQueue.length,
    dependencyBlockedCount,
    blockedCount: workingQueue.filter(item => !isRetryableMutation(item)).length,
    remainingItems: workingQueue.map(item => ({
      mutationId: item.mutationId,
      entityKey: item.entityKey,
      type: item.type,
      status: item.status,
      retryCount: Number(item.retryCount || 0),
      lastError: item.lastError || null,
      ...(item.nextAttemptAt ? { nextAttemptAt: item.nextAttemptAt } : {}),
      dependsOnMutationId: item.dependsOnMutationId || null
    })),
    responses
  };
}

module.exports = {
  RETRYABLE_STATUSES,
  PENDING_STATUSES,
  SUCCESS_STATUSES,
  canonicalQueueStatus,
  createMutationId,
  inferEntityKey,
  inferLogicalMutationKey,
  createMutationEnvelope,
  migrateOutbox,
  appendUniqueMutation,
  classifyMutationError,
  isRetryableMutation,
  isPendingMutation,
  isRetryEligible,
  retryDelayMs,
  createSingleFlightRunner,
  getPendingOperationPayloads,
  drainMutationQueue
};
