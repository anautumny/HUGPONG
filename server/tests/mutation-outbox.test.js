'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  createMutationEnvelope,
  migrateOutbox,
  appendUniqueMutation,
  classifyMutationError,
  getPendingOperationPayloads,
  createSingleFlightRunner,
  drainMutationQueue
} = require('../../mobile/src/services/mutationOutboxCore');
const { readMutationContext, assertBaseVersion } = require('../services/mutationContext');

test('offline creation produces one explicit durable mutation envelope', () => {
  const payload = { id: 'LOG-OFFLINE-1', fieldId: 'FLD-1', cycleId: 'CYC-1', status: 'ACTIVE' };
  const item = createMutationEnvelope('operation_log', payload, {
    now: 1_700_000_000_000,
    random: 'ABC12345',
    baseVersion: null
  });

  assert.equal(item.mutationId, 'MUT-LOYW3V28-ABC12345');
  assert.equal(item.idempotencyKey, item.mutationId);
  assert.equal(item.entityKey, 'operation_logs/LOG-OFFLINE-1');
  assert.deepEqual(item.payload, payload);
  assert.equal(item.status, 'queued');
  assert.equal(item.payload.offlineCaptured, undefined, 'transport metadata is not mixed into canonical data');
});

test('restart migration preserves the same idempotency key', () => {
  const saved = [{
    outboxId: 'OUT-PERSISTED-1',
    type: 'operation_log',
    payload: { id: 'LOG-RESTART-1', fieldId: 'FLD-1', cycleId: 'CYC-1' },
    status: 'syncing'
  }];
  const once = migrateOutbox(saved);
  const twice = migrateOutbox(JSON.parse(JSON.stringify(once)));

  assert.equal(once[0].idempotencyKey, 'OUT-PERSISTED-1');
  assert.equal(twice[0].idempotencyKey, once[0].idempotencyKey);
  assert.equal(twice[0].status, 'retryable');
});

test('duplicate retry with the same key does not append a second mutation', () => {
  const first = createMutationEnvelope('ticket', { id: 'TCK-1' }, { mutationId: 'MUT-DUPLICATE-1' });
  const duplicate = createMutationEnvelope('ticket', { id: 'TCK-1' }, { mutationId: 'MUT-DUPLICATE-1' });
  const initial = appendUniqueMutation([], first);
  const retried = appendUniqueMutation(initial.queue, duplicate);

  assert.equal(initial.inserted, true);
  assert.equal(retried.inserted, false);
  assert.equal(retried.queue.length, 1);
});

test('a stale cached record cannot manufacture an upload', () => {
  const staleCache = [{ id: 'LOG-CACHE-ONLY', cycleId: 'CYC-OLD', status: 'ACTIVE' }];
  const queue = [createMutationEnvelope('operation_log', {
    id: 'LOG-EXPLICIT', fieldId: 'FLD-1', cycleId: 'CYC-1', status: 'ACTIVE'
  }, { mutationId: 'MUT-EXPLICIT-1' })];
  const overlays = getPendingOperationPayloads(queue);

  assert.equal(staleCache.length, 1);
  assert.deepEqual(overlays.map(item => item.id), ['LOG-EXPLICIT']);
  assert.equal(overlays.some(item => item.id === 'LOG-CACHE-ONLY'), false);
});

test('conflicts are terminal and retained distinctly from network retries', () => {
  assert.equal(classifyMutationError({ status: 409 }), 'conflict');
  assert.equal(classifyMutationError({ status: 401 }), 'authentication');
  assert.equal(classifyMutationError({ status: 403 }), 'authorization');
  assert.equal(classifyMutationError({ status: 422 }), 'validation');
  assert.equal(classifyMutationError({ status: 500 }), 'server_failure');
  assert.equal(classifyMutationError(new Error('offline')), 'retryable');
});

test('malformed server acknowledgement remains queued', async () => {
  const mutation = createMutationEnvelope('operation_log', {
    id: 'LOG-MALFORMED-1', fieldId: 'FLD-1', cycleId: 'CYC-1', status: 'ACTIVE'
  }, { mutationId: 'MUT-MALFORMED-1' });
  const result = await drainMutationQueue([mutation], async () => ({ data: { id: 'LOG-MALFORMED-1' } }));

  assert.equal(result.processedCount, 0);
  assert.equal(result.failedCount, 1);
  assert.equal(result.remainingCount, 1);
  assert.equal(result.queue[0].status, 'retryable');
});

test('partial queue failure removes only acknowledged items', async () => {
  const first = createMutationEnvelope('operation_log', {
    id: 'LOG-PARTIAL-1', fieldId: 'FLD-1', cycleId: 'CYC-1', status: 'ACTIVE'
  }, { mutationId: 'MUT-PARTIAL-1' });
  const second = createMutationEnvelope('operation_log', {
    id: 'LOG-PARTIAL-2', fieldId: 'FLD-2', cycleId: 'CYC-2', status: 'ACTIVE'
  }, { mutationId: 'MUT-PARTIAL-2' });
  const result = await drainMutationQueue([first, second], async item => {
    if (item.mutationId === 'MUT-PARTIAL-2') throw Object.assign(new Error('Forbidden'), { status: 403 });
    return { success: true, data: { id: item.payload.id } };
  });

  assert.equal(result.attemptedCount, 2);
  assert.equal(result.processedCount, 1);
  assert.equal(result.failedCount, 1);
  assert.equal(result.remainingCount, 1);
  assert.equal(result.queue[0].mutationId, 'MUT-PARTIAL-2');
  assert.equal(result.queue[0].status, 'authorization');
});

test('takeover credentials are never serialized into a durable mutation envelope', () => {
  const item = createMutationEnvelope('takeover_log', {
    id: 'LOG-TAKEOVER-1', fieldId: 'FLD-1', cycleId: 'CYC-1'
  }, { mutationId: 'MUT-TAKEOVER-1', takeoverGrant: 'sensitive-grant' });
  assert.equal(item.takeoverGrant, null);
  assert.doesNotMatch(JSON.stringify(item), /sensitive-grant/);
});

test('concurrent sync triggers execute one processor and share its result', async () => {
  const runSingleFlight = createSingleFlightRunner();
  let executions = 0;
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const task = async () => {
    executions += 1;
    await gate;
    return { processedCount: 1 };
  };

  const manual = runSingleFlight(task);
  const reconnect = runSingleFlight(task);
  const foreground = runSingleFlight(task);
  release();

  const results = await Promise.all([manual, reconnect, foreground]);
  assert.equal(executions, 1);
  assert.deepEqual(results, [{ processedCount: 1 }, { processedCount: 1 }, { processedCount: 1 }]);
});

test('single-flight lock releases after an exception', async () => {
  const runSingleFlight = createSingleFlightRunner();
  await assert.rejects(runSingleFlight(async () => { throw new Error('boom'); }), /boom/);
  const recovered = await runSingleFlight(async () => 'recovered');
  assert.equal(recovered, 'recovered');
});

test('failed mutation remains retryable across restart and reconnect then clears on success', async () => {
  const mutation = createMutationEnvelope('operation_log', {
    id: 'LOG-RECONNECT-1', fieldId: 'FLD-1', cycleId: 'CYC-1', status: 'ACTIVE'
  }, { mutationId: 'MUT-RECONNECT-1' });

  const offline = await drainMutationQueue([mutation], async () => {
    throw new Error('Network unavailable');
  });
  assert.equal(offline.success, false);
  assert.equal(offline.queue.length, 1);
  assert.equal(offline.queue[0].status, 'retryable');
  assert.equal(offline.queue[0].retryCount, 1);

  const restarted = migrateOutbox(JSON.parse(JSON.stringify(offline.queue)));
  const reconnected = await drainMutationQueue(restarted, async item => ({
    success: true,
    data: { id: item.payload.id, updatedAt: '2026-09-17T09:00:00.000Z' }
  }));
  assert.equal(reconnected.success, true);
  assert.equal(reconnected.processedCount, 1);
  assert.equal(reconnected.queue.length, 0, 'successful mutation leaves the outbox clean');
});

test('dependent mutations wait, then inherit the authoritative server version', async () => {
  const first = createMutationEnvelope('custom_stages', {
    fieldId: 'FLD-1', customStages: [{ stageNumber: 1 }]
  }, { mutationId: 'MUT-CHAIN-1', baseVersion: 'VERSION-0' });
  const second = createMutationEnvelope('custom_operations', {
    fieldId: 'FLD-1', customOperations: { 1: [] }
  }, { mutationId: 'MUT-CHAIN-2', baseVersion: 'LOCAL-OPTIMISTIC' }, [first]);
  const sent = [];

  const drained = await drainMutationQueue([first, second], async item => {
    sent.push({ mutationId: item.mutationId, baseVersion: item.baseVersion });
    return { success: true, data: { updatedAt: item.mutationId === 'MUT-CHAIN-1' ? 'VERSION-1' : 'VERSION-2' } };
  });

  assert.deepEqual(sent, [
    { mutationId: 'MUT-CHAIN-1', baseVersion: 'VERSION-0' },
    { mutationId: 'MUT-CHAIN-2', baseVersion: 'VERSION-1' }
  ]);
  assert.equal(drained.queue.length, 0);
});

test('server validates mutation identity and rejects stale base versions', () => {
  const context = readMutationContext({ body: { _mutation: {
    mutationId: 'MUT-VERSION-1',
    idempotencyKey: 'MUT-VERSION-1',
    entityKey: 'operation_logs/LOG-1',
    baseVersion: '2026-09-17T08:00:00.000Z'
  } } });

  assert.equal(context.idempotencyKey, 'MUT-VERSION-1');
  assert.throws(
    () => assertBaseVersion('2026-09-17T08:01:00.000Z', context, 'LOG-1', { status: 'ACTIVE' }),
    error => error.status === 409 && error.data.actualVersion === '2026-09-17T08:01:00.000Z'
  );
});

test('mobile sync has no broad lifecycle upload/refresh and listeners use explicit overlays only', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', '..', 'mobile', 'src', 'data', 'dataStore.js'), 'utf8');
  const syncSource = fs.readFileSync(path.join(__dirname, '..', '..', 'mobile', 'src', 'services', 'syncEngine.js'), 'utf8');
  const webSource = fs.readFileSync(path.join(__dirname, '..', '..', 'web', 'shared', 'core.js'), 'utf8');

  assert.doesNotMatch(source, /authenticatedRequest\('\/api\/(crop-cycles|fields|logs)'\)/);
  assert.doesNotMatch(source, /const localOnly/);
  assert.match(source, /pendingCreateOverlays/);
  assert.match(syncSource, /enqueueAndFlushMutation/);
  assert.match(syncSource, /idempotencyKey/);
  assert.match(syncSource, /baseVersion/);
  assert.doesNotMatch(webSource, /refreshWebLifecycleStateFromApi/);
});
