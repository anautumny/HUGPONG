'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = file => fs.readFileSync(path.resolve(__dirname, '../..', file), 'utf8');
const core = require('../../mobile/src/services/mutationOutboxCore');

test('sync preflight preserves queued work and distinguishes temporary failures from revocation', async () => {
  const source = read('mobile/src/data/dataStore.js');
  const begin = source.indexOf('export const performMobileSync =');
  const end = source.indexOf('export const fetchAuditHistoryPage', begin);
  for (const [error, reason, retried] of [
    [Object.assign(new Error('Outage'), { status: 503 }), 'AUTHENTICATION_RECOVERY', true],
    [Object.assign(new Error('Connection'), { code: 'auth/network-request-failed' }), 'SERVER_UNAVAILABLE', true],
    [Object.assign(new Error('Busy'), { status: 429, retryAfterMs: 90000 }), 'RATE_LIMITED', true],
    [Object.assign(new Error('Revoked'), { status: 401 }), 'AUTHENTICATION_REQUIRED', false],
    [Object.assign(new Error('Disabled'), { status: 403 }), 'AUTHORIZATION_FAILURE', false],
    [Object.assign(new Error('Changed'), { code: 'AUTH_CONTEXT_CHANGED' }), 'AUTH_CONTEXT_CHANGED', false],
  ]) {
    const queue = [{ mutationId: 'STAGE', type: 'stage_update', status: 'queued' }, { mutationId: 'LOG', type: 'operation_log', status: 'queued' }];
    const original = structuredClone(queue); let schedules = 0, flushes = 0;
    const context = vm.createContext({ console: { info() {} }, Date,
      CURRENT_SESSION: { employeeId: 'A' }, auth: { currentUser: { uid: 'A' } }, cloudSyncGeneration: 1,
      mobileSyncPromise: null, getOutboxStorageState: () => ({ ready: true }), getOutboxCount: () => queue.length,
      getOutboxQueue: () => queue, isAutomaticSyncEnabled: () => true, getNetworkStatus: () => true,
      refreshMobileSessionForSync: async () => { throw error; }, scheduleMobileSyncContinuation: () => schedules++,
      flushOutboxToApi: async () => { flushes++; },
    });
    vm.runInContext(source.slice(begin, end).replace('export const', 'const') + ';globalThis.sync = performMobileSync;', context);
    const result = await context.sync('NETWORK_RESTORED');
    assert.equal(result.reason, reason); assert.equal(result.attemptedCount, 0); assert.equal(result.failedCount, 0);
    assert.equal(result.remainingCount, 2); assert.equal(flushes, 0); assert.equal(schedules, Number(retried));
    assert.deepEqual(queue, original, 'no queued intent was removed or marked failed before upload');
    if (retried) assert.ok(Date.parse(result.retryAt) >= Date.now() + (error.retryAfterMs || 30000) - 1000);
  }
});

test('automatic uploads run on every lifecycle trigger despite a legacy disabled preference', async () => {
  const source = read('mobile/src/data/dataStore.js');
  const begin = source.indexOf('export const performMobileSync =');
  const end = source.indexOf('export const fetchAuditHistoryPage', begin);
  for (const trigger of ['APP_START', 'AUTH_RESTORED', 'NETWORK_RESTORED', 'APP_FOREGROUND', 'POST_MUTATION', 'OUTBOX_CONTINUATION']) {
    let queue = [{ mutationId: 'SAVED-LOG', type: 'operation_log', status: 'queued' }];
    let flushes = 0;
    const context = vm.createContext({ console: { info() {} }, Date,
      SECURITY_PREFERENCES: { autoSyncEnabled: false }, isAutomaticSyncEnabled: () => false,
      CURRENT_SESSION: { employeeId: 'A' }, auth: { currentUser: { uid: 'A' } }, cloudSyncGeneration: 1,
      mobileSyncPromise: null, IS_SYNCED: false,
      getOutboxStorageState: () => ({ ready: true }), getOutboxCount: () => queue.length,
      getOutboxQueue: () => queue, getNetworkStatus: () => true,
      refreshMobileSessionForSync: async () => ({}),
      flushOutboxToApi: async () => { flushes++; queue = []; return { success: true, processedCount: 1, responses: {} }; },
      reconcileSuccessfulMutations: async () => {}, getPendingSyncCount: () => queue.length,
      notify() {}, scheduleMobileSyncContinuation() {}, canReportAgriculturalSyncTelemetry: () => false
    });
    vm.runInContext(source.slice(begin, end).replace('export const', 'const') + ';globalThis.sync = performMobileSync;', context);
    const result = await context.sync(trigger);
    assert.equal(result.success, true, trigger);
    assert.equal(flushes, 1, trigger);
    assert.equal(result.remainingCount, 0, trigger);
  }
});

test('legacy auto-sync preferences are discarded during hydration and cannot be restored by settings updates', () => {
  const source = read('mobile/src/data/dataStore.js');
  const begin = source.indexOf('export let SECURITY_PREFERENCES');
  const end = source.indexOf('export const resetLocalCache', begin);
  const context = vm.createContext({ notify() {} });
  vm.runInContext(source.slice(begin, end).replace(/export /g, '') + ';globalThis.update = updateSecurityPreferences;globalThis.read = getSecurityPreferences;', context);
  context.update({ autoSyncEnabled: false, sessionAlert: false });
  assert.equal('autoSyncEnabled' in context.read(), false);
  assert.equal(context.read().sessionAlert, false);
  context.STORAGE_KEYS = { PREFS: 'prefs' };
  context.stored = { prefs: { autoSyncEnabled: false, sessionAlert: true } };
  const hydrationBegin = source.indexOf('    if (stored[STORAGE_KEYS.PREFS]) {');
  const hydrationEnd = source.indexOf('// Hydrate cached price circulars', hydrationBegin);
  vm.runInContext(source.slice(hydrationBegin, hydrationEnd), context);
  assert.equal('autoSyncEnabled' in context.read(), false);
  assert.equal(context.read().sessionAlert, true);
});

test('session retry scheduling honors cooldown even when an older install saved auto sync as off', () => {
  const source = read('mobile/src/data/dataStore.js');
  const begin = source.indexOf('const scheduleMobileSyncContinuation =');
  const end = source.indexOf('const canonicalStageName', begin);
  let delay;
  const context = vm.createContext({ Date, mobileSyncContinuationTimer: null, MOBILE_SYNC_BATCH_INTERVAL_MS: 75000,
    cancelMobileSyncContinuation() {}, isAutomaticSyncEnabled: () => false, getNetworkStatus: () => true,
    getOutboxCount: () => 1, AppState: { currentState: 'active' }, CURRENT_SESSION: { employeeId: 'A' },
    auth: { currentUser: { uid: 'A' } }, getOutboxQueue: () => [{ mutationId: 'STAGE', status: 'queued' }],
    setTimeout: (_callback, milliseconds) => { delay = milliseconds; return 1; },
  });
  vm.runInContext(source.slice(begin, end) + ';globalThis.schedule = scheduleMobileSyncContinuation;', context);
  context.schedule({ reason: 'AUTHENTICATION_RECOVERY', retryAt: new Date(Date.now() + 30000).toISOString() });
  assert.ok(delay >= 29000 && delay <= 30000);
});

test('reviewed legacy stage conflicts retain identity and dependencies, reject regression, and roll back failed local saves', async () => {
  const source = read('mobile/src/services/syncEngine.js');
  const begin = source.indexOf('export async function retryReviewedStageConflict');
  const end = source.indexOf('export async function markOutboxItemFailed', begin);
  const context = vm.createContext({ Number, Set, activeOutboxOwnerId: 'A',
    assertOutboxReady() {}, runOutboxSingleFlight: work => work(), notifySyncEngine() {}, persistOutboxQueue: async () => true });
  vm.runInContext(source.slice(begin, end).replace('export async', 'async'), context);
  const make = () => ({ mutationId: 'MUT-ORIGINAL', idempotencyKey: 'MUT-ORIGINAL', type: 'stage_update', status: 'conflict', ownerUserId: 'A',
    payload: { cycleId: 'CYCLE', currentStageNumber: 3, elapsedMonths: 2 },
    conflict: { current: { id: 'CYCLE', status: 'ACTIVE', currentStageNumber: 2, elapsedMonths: 1, updatedAt: 'NEW-VERSION' } } });
  context.outboxQueue = [make(), { mutationId: 'MUT-NEXT', dependsOnMutationId: 'MUT-ORIGINAL', status: 'queued' }];
  await context.retryReviewedStageConflict('MUT-ORIGINAL');
  assert.equal(context.outboxQueue[0].baseVersion, 'NEW-VERSION'); assert.equal(context.outboxQueue[0].status, 'queued');
  assert.equal(context.outboxQueue[0].mutationId, 'MUT-ORIGINAL'); assert.equal(context.outboxQueue[1].dependsOnMutationId, 'MUT-ORIGINAL');
  assert.deepEqual(JSON.parse(JSON.stringify(context.outboxQueue[0].payload.expectedStage)), { currentStageNumber: 2, elapsedMonths: 1, completedAt: null });
  context.outboxQueue = [make()]; context.outboxQueue[0].conflict.current.currentStageNumber = 4;
  await assert.rejects(context.retryReviewedStageConflict('MUT-ORIGINAL'), /newer stage progress/);
  context.outboxQueue = [make()]; context.outboxQueue[0].ownerUserId = 'B';
  await assert.rejects(context.retryReviewedStageConflict('MUT-ORIGINAL'), /must be synchronized/);
  context.outboxQueue = [make()]; const original = structuredClone(context.outboxQueue);
  context.persistOutboxQueue = async () => false;
  await assert.rejects(context.retryReviewedStageConflict('MUT-ORIGINAL'), /could not be saved/);
  assert.deepEqual(JSON.parse(JSON.stringify(context.outboxQueue)), original);
});

test('queued sequential stage updates use each acknowledged server revision and drain exactly once', async () => {
  const first = core.createMutationEnvelope('stage_update', { cycleId: 'CYCLE', currentStageNumber: 2 }, { baseVersion: 'V1', mutationId: 'MUT-FIRST' });
  const second = core.createMutationEnvelope('stage_update', { cycleId: 'CYCLE', currentStageNumber: 3 }, { baseVersion: 'V1', mutationId: 'MUT-SECOND' }, [first]);
  let version = 'V1'; const visited = [];
  const result = await core.drainMutationQueue([first, second], async item => {
    assert.equal(item.baseVersion, version); visited.push(item.mutationId);
    version = item.mutationId === first.mutationId ? 'V2' : 'V3';
    return { success: true, data: { updatedAt: version } };
  });
  assert.deepEqual(visited, ['MUT-FIRST', 'MUT-SECOND']); assert.equal(result.remainingCount, 0); assert.equal(result.processedCount, 2);
});
