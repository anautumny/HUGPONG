'use strict';

const RETRYABLE_STATUSES = new Set(['queued', 'retryable', 'failed']);
const PENDING_STATUSES = new Set(['queued', 'retryable', 'failed', 'syncing']);

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
  if (type === 'ticket') return `support_tickets/${id}`;
  if (type === 'audit_log' || type === 'system_event') return `audit_logs/${id}`;
  if (type === 'audit_report' || type === 'audit_certification') return `audit_reports/${id}`;
  if (type === 'user_approve') return `users/${id}`;
  return `${String(type || 'mutation')}/${id}`;
}

function createMutationEnvelope(type, payload, options = {}, existingQueue = []) {
  if (!type || !payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('An explicit mutation type and payload are required.');
  }
  const mutationId = options.mutationId || options.idempotencyKey || createMutationId(options.now, options.random);
  const entityKey = options.entityKey || inferEntityKey(type, payload);
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
    baseVersion: options.baseVersion === undefined ? null : options.baseVersion,
    dependsOnMutationId: predecessor?.mutationId || null,
    payload: { ...payload },
    status: 'queued',
    enqueuedAt,
    retryCount: 0,
    lastAttempt: null,
    lastError: null,
    conflict: null
  };
}

function migrateOutbox(savedQueue = []) {
  if (!Array.isArray(savedQueue)) return [];
  return savedQueue.map((item, index) => {
    if (item?.schemaVersion === 1 && item.mutationId && item.idempotencyKey && item.entityKey) return item;
    const stableId = String(item?.mutationId || item?.idempotencyKey || item?.outboxId || item?.id || `LEGACY-${index}`);
    return {
      ...item,
      schemaVersion: 1,
      outboxId: stableId,
      mutationId: stableId,
      idempotencyKey: stableId,
      entityKey: item?.entityKey || inferEntityKey(item?.type, item?.payload || {}),
      baseVersion: item?.baseVersion === undefined ? null : item.baseVersion,
      dependsOnMutationId: item?.dependsOnMutationId || null,
      payload: { ...(item?.payload || {}) },
      status: item?.status === 'syncing' ? 'retryable' : (item?.status || 'queued'),
      retryCount: Number(item?.retryCount || 0),
      conflict: item?.conflict || null
    };
  });
}

function appendUniqueMutation(queue, envelope) {
  const existing = queue.find(item => item.idempotencyKey === envelope.idempotencyKey);
  if (existing) return { queue, item: existing, inserted: false };
  return { queue: [...queue, envelope], item: envelope, inserted: true };
}

function classifyMutationError(error) {
  const status = Number(error?.status || 0);
  if (status === 409) return 'conflict';
  if (status >= 400 && status < 500) return 'rejected';
  return 'retryable';
}

function isRetryableMutation(item) {
  return RETRYABLE_STATUSES.has(item?.status);
}

function isPendingMutation(item) {
  return PENDING_STATUSES.has(item?.status);
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

async function drainMutationQueue(queue, remoteHandler, onStateChange = () => {}) {
  let workingQueue = Array.isArray(queue) ? queue : [];
  let processedCount = 0;
  let failedCount = 0;
  const responses = {};
  const candidates = workingQueue.filter(isRetryableMutation);

  for (const item of candidates) {
    if (item.dependsOnMutationId && workingQueue.some(queued => queued.mutationId === item.dependsOnMutationId)) {
      continue;
    }
    item.status = 'syncing';
    item.lastAttempt = new Date().toISOString();
    onStateChange(workingQueue);

    try {
      const response = await remoteHandler(item);
      if (response === false) throw new Error('Remote rejected or network unavailable');
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
      failedCount += 1;
    }
    onStateChange(workingQueue);
  }

  return {
    queue: workingQueue,
    success: failedCount === 0,
    processedCount,
    failedCount,
    remainingCount: workingQueue.length,
    responses
  };
}

module.exports = {
  RETRYABLE_STATUSES,
  PENDING_STATUSES,
  createMutationId,
  inferEntityKey,
  createMutationEnvelope,
  migrateOutbox,
  appendUniqueMutation,
  classifyMutationError,
  isRetryableMutation,
  isPendingMutation,
  getPendingOperationPayloads,
  drainMutationQueue
};
