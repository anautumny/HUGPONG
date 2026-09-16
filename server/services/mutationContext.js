'use strict';

function mutationError(message, status = 400, data) {
  const error = new Error(message);
  error.status = status;
  if (data !== undefined) error.data = data;
  return error;
}

function readMutationContext(req) {
  const value = req?.body?._mutation;
  if (value == null) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw mutationError('_mutation must be an object.');
  }
  const mutationId = String(value.mutationId || '').trim();
  const idempotencyKey = String(value.idempotencyKey || '').trim();
  const entityKey = String(value.entityKey || '').trim();
  if (!mutationId || !idempotencyKey || mutationId !== idempotencyKey) {
    throw mutationError('Queued mutations require one stable mutationId/idempotencyKey.');
  }
  if (!/^[A-Za-z0-9_-]{8,160}$/.test(idempotencyKey)) {
    throw mutationError('idempotencyKey contains unsupported characters.');
  }
  if (!entityKey || entityKey.length > 500) throw mutationError('Queued mutations require entityKey.');
  return {
    mutationId,
    idempotencyKey,
    entityKey,
    baseVersion: value.baseVersion === undefined ? null : value.baseVersion
  };
}

function expectedVersion(context, entityId = null) {
  if (!context || context.baseVersion == null) return null;
  if (
    entityId && context.baseVersion && typeof context.baseVersion === 'object' &&
    !Array.isArray(context.baseVersion)
  ) {
    return context.baseVersion[entityId] == null ? null : String(context.baseVersion[entityId]);
  }
  if (typeof context.baseVersion === 'string') return context.baseVersion;
  return null;
}

function assertBaseVersion(actualVersion, context, entityId, currentRecord) {
  const expected = expectedVersion(context, entityId);
  if (expected == null) return;
  const actual = actualVersion == null ? null : String(actualVersion);
  if (actual !== expected) {
    throw mutationError('Mutation conflicts with a newer server version.', 409, {
      entityId,
      expectedVersion: expected,
      actualVersion: actual,
      current: currentRecord
    });
  }
}

module.exports = {
  mutationError,
  readMutationContext,
  expectedVersion,
  assertBaseVersion
};
