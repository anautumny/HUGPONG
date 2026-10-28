'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const core = require('../../mobile/src/services/mutationOutboxCore');
const OWNER = '04000001';
const KEY = `@hugpong_outbox:${OWNER}`;
const source = file => fs.readFileSync(path.resolve(__dirname, '../../mobile/src/services', file), 'utf8')
  .replace(/^import[\s\S]*?;\r?$/gm, '').replace(/\bexport /g, '');
const entry = () => core.createMutationEnvelope('operation_log', { id: 'LOG-SAVED', fieldId: 'FLD-1', cycleId: 'CYC-1' },
  { ownerUserId: OWNER, mutationId: 'MUT-SAVED' });

function device(raw = JSON.stringify([entry()])) {
  const disk = new Map(raw === undefined ? [] : [[KEY, raw]]);
  const faults = { read: false, write: false };
  const writes = [];
  const storage = { console: { warn() {} }, Map, Set, SecureStore: {}, AsyncStorage: {
    async getItem(key) { if (faults.read) throw new Error('Device read failure'); return disk.get(key) ?? null; },
    async setItem(key, value) { if (faults.write) throw new Error('Device write failure'); writes.push(key); disk.set(key, value); }
  } };
  vm.createContext(storage); vm.runInContext(source('storageService.js'), storage);
  const runtime = { console: { info() {}, warn() {} }, require: () => core, Map, Set, Date, setTimeout, clearTimeout,
    getItem: storage.getItem, saveItem: storage.saveItem, localOutboxStorageKey: storage.localOutboxStorageKey,
    STORAGE_KEYS: {}, toOperationLogDocument: value => value };
  vm.createContext(runtime); vm.runInContext(source('syncEngine.js'), runtime);
  return { disk, faults, writes, runtime, storage };
}

test('failed device read preserves saved work and blocks enqueue, drain and clear until a successful retry', async () => {
  const { disk, faults, writes, runtime } = device();
  const original = disk.get(KEY);
  faults.read = true;
  await runtime.initSyncEngine(OWNER);
  assert.equal(runtime.getOutboxStorageState().ready, false);
  assert.match(runtime.getOutboxStorageState().error, /do not clear local storage/);
  await assert.rejects(runtime.enqueueOutboxItem('operation_log', {}, { mutationId: 'MUT-NEW' }), { code: 'QUEUE_STORAGE_UNAVAILABLE' });
  await assert.rejects(runtime.processOutbox(async () => ({ success: true })), { code: 'QUEUE_STORAGE_UNAVAILABLE' });
  await assert.rejects(runtime.clearOutbox(), { code: 'QUEUE_STORAGE_UNAVAILABLE' });
  assert.equal(disk.get(KEY), original);
  assert.equal(writes.length, 0);
  faults.read = false;
  await runtime.initSyncEngine(OWNER);
  assert.equal(runtime.getOutboxStorageState().ready, true);
  assert.equal(runtime.getOutboxQueue()[0].idempotencyKey, 'MUT-SAVED');
  const drained = await runtime.processOutbox(async () => ({ success: true }));
  assert.equal(drained.success, true);
  assert.equal(JSON.parse(disk.get(KEY)).length, 0);
});

test('corrupt JSON and non-array saved queues are left intact rather than converted to an empty queue', async () => {
  for (const raw of ['{invalid json', '{"unexpected":"object"}', 'null']) {
    const { disk, runtime, writes } = device(raw);
    await runtime.initSyncEngine(OWNER);
    assert.equal(runtime.getOutboxStorageState().ready, false);
    assert.equal(disk.get(KEY), raw);
    assert.equal(writes.length, 0);
  }
});

test('reinitialization reads disk strictly even with a warm cache and preserves the known queue on failure', async () => {
  const { disk, faults, runtime } = device();
  await runtime.initSyncEngine(OWNER);
  const original = disk.get(KEY);
  faults.read = true;
  await runtime.initSyncEngine(OWNER);
  assert.equal(runtime.getOutboxStorageState().ready, false);
  assert.equal(runtime.getOutboxQueue().length, 1);
  assert.equal(disk.get(KEY), original);
});

test('migration write failure pauses synchronization and a later retry recovers the original identity', async () => {
  const original = entry(); original.status = 'syncing';
  const { disk, faults, runtime } = device(JSON.stringify([original]));
  faults.write = true;
  await runtime.initSyncEngine(OWNER);
  assert.equal(runtime.getOutboxStorageState().ready, false);
  assert.equal(JSON.parse(disk.get(KEY))[0].status, 'syncing');
  faults.write = false;
  await runtime.initSyncEngine(OWNER);
  assert.equal(runtime.getOutboxQueue()[0].status, 'retryable');
  assert.equal(runtime.getOutboxQueue()[0].mutationId, 'MUT-SAVED');
});

test('a genuinely absent queue is initialized and can safely accept new offline work', async () => {
  const { disk, runtime } = device(); disk.delete(KEY);
  await runtime.initSyncEngine(OWNER);
  assert.equal(runtime.getOutboxStorageState().ready, true);
  await runtime.enqueueOutboxItem('operation_log', { id: 'LOG-NEW' }, { mutationId: 'MUT-NEW' });
  assert.equal(JSON.parse(disk.get(KEY))[0].mutationId, 'MUT-NEW');
});

test('a slow prior account restore cannot replace the current account queue', async () => {
  const { runtime } = device();
  let release;
  runtime.getItem = key => key.endsWith(OWNER) ? new Promise(resolve => { release = resolve; }) : Promise.resolve([]);
  const old = runtime.initSyncEngine(OWNER);
  await runtime.initSyncEngine('04000002');
  release([entry()]);
  await old;
  assert.equal(runtime.getOutboxStorageState().ownerUserId, '04000002');
  assert.equal(runtime.getOutboxQueue().length, 0);
});

test('cache upgrades and missing markers preserve every owner queue, draft and secure session', async () => {
  for (const marker of [null, 'older-version', '2026_09_17_post_reset_v1']) {
    const { disk, storage, writes } = device();
    if (marker) disk.set('@hugpong_cache_schema_version', marker);
    disk.set('@hugpong_outbox:04000002', '[{"mutationId":"OTHER-OWNER"}]');
    disk.set('@hugpong_outbox', '[{"mutationId":"LEGACY-QUARANTINED"}]');
    disk.set('@hugpong_drafts:04000001', '[{"notes":"Unsaved field work"}]');
    disk.set('@hugpong_fields', '[{"id":"FLD-1"}]');
    const before = new Map(disk);
    storage.SecureStore.deleteItemAsync = () => assert.fail('Startup must not delete secure sessions');
    storage.AsyncStorage.multiRemove = () => assert.fail('Startup must not delete saved data');
    const result = await storage.ensureCurrentCacheSchema();
    assert.equal(result.reset, false);
    for (const [key, value] of before) {
      if (key !== '@hugpong_cache_schema_version') assert.equal(disk.get(key), value, key);
    }
    assert.equal(disk.get('@hugpong_cache_schema_version'), '2026_09_17_post_reset_v1');
    assert.deepEqual(writes, marker === '2026_09_17_post_reset_v1' ? [] : ['@hugpong_cache_schema_version']);
  }
});

test('cache marker write failure preserves pending work and can safely be retried', async () => {
  const { disk, storage, faults } = device();
  disk.set('@hugpong_cache_schema_version', 'old');
  const before = [...disk];
  faults.write = true;
  await assert.rejects(storage.ensureCurrentCacheSchema(), /Device write failure/);
  assert.deepEqual([...disk], before);
  faults.write = false;
  await storage.ensureCurrentCacheSchema();
  assert.equal(disk.get(KEY), before.find(([key]) => key === KEY)[1]);
});
