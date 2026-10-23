'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizedFields, planFirestoreIndexes, createMissingIndexes, assertIndexProject } = require('../services/firestoreIndexPreparation');
const { assertSupportedNodeVersion } = require('../services/runtimeVersionPolicy');

const definition = { collectionGroup: 'operation_logs', queryScope: 'COLLECTION', fields: [{ fieldPath: 'blockFarmId', order: 'ASCENDING' }, { fieldPath: 'performedOn', order: 'ASCENDING' }] };
const remote = (state = 'READY', group = 'operation_logs') => ({ name: `projects/fixture/databases/(default)/collectionGroups/${group}/indexes/abc`, queryScope: 'COLLECTION', fields: normalizedFields(definition.fields), state });

test('index planning recognizes implicit document-ID ordering and preserves the manifest', () => {
  const before = structuredClone(definition);
  const plan = planFirestoreIndexes([definition], [remote()]);
  assert.equal(plan.ready, true); assert.equal(plan.missing.length, 0);
  assert.deepEqual(definition, before);
  const descending = normalizedFields([{ fieldPath: 'fieldId', order: 'ASCENDING' }, { fieldPath: 'performedOn', order: 'DESCENDING' }]);
  assert.deepEqual(descending.at(-1), { fieldPath: '__name__', order: 'DESCENDING' });
});

test('an index for another collection or wrong sort direction never satisfies readiness', () => {
  assert.equal(planFirestoreIndexes([definition], [remote('READY', 'other')]).ready, false);
  const wrong = remote(); wrong.fields[1].order = 'DESCENDING';
  assert.equal(planFirestoreIndexes([definition], [wrong]).missing.length, 1);
  assert.throws(() => planFirestoreIndexes([definition, definition], []), /Duplicate/);
});

test('preparation creates only missing indexes; an existing build must reach READY without recreation', async () => {
  const other = { ...definition, collectionGroup: 'other' };
  const plan = planFirestoreIndexes([definition, other], [remote('CREATING')]);
  const created = [];
  await createMissingIndexes(plan, async index => { created.push(index); return 'queued'; });
  assert.equal(plan.ready, false); assert.equal(plan.pending.length, 1);
  assert.deepEqual(created, [other]);
  assert.equal(planFirestoreIndexes([definition], [remote('READY')]).ready, true);
  assert.equal(planFirestoreIndexes([definition], [remote('NEEDS_REPAIR')]).ready, false);
});

test('index preparation refuses a missing or mismatched project before network changes', () => {
  const environment = { FIREBASE_PROJECT_ID: 'fixture', VITE_FIREBASE_PROJECT_ID: 'fixture', EXPO_PUBLIC_FIREBASE_PROJECT_ID: 'fixture' };
  assert.doesNotThrow(() => assertIndexProject('fixture', environment));
  assert.throws(() => assertIndexProject('other', environment), /must match/);
  assert.throws(() => assertIndexProject('fixture', { ...environment, EXPO_PUBLIC_FIREBASE_PROJECT_ID: '' }), /must match/);
});

test('runtime policy rejects old, unreviewed major, and prerelease Node versions before startup', () => {
  for (const version of ['18.20.8', '22.22.0', '24.22.0', '24.21.9', '25.0.0', '24.22.1-rc.1', 'invalid']) {
    assert.throws(() => assertSupportedNodeVersion(version), /requires Node.js/);
  }
  for (const version of ['24.22.1', 'v24.22.1', '24.22.2', '24.23.0']) assert.doesNotThrow(() => assertSupportedNodeVersion(version));
});

test('operation fallback scans past excluded statuses, keeps page cursors, and never broadens manager scope', async () => {
  const { memoryFirestore } = require('./helpers/memoryFirestore');
  const { listOperationPage } = require('../services/operationQueryService');
  const seed = { 'block_farms/BF-1': { managerUserId: 'MGR' }, 'fields/FLD-1': { blockFarmId: 'BF-1' } };
  for (let index = 0; index < 600; index++) seed[`operation_logs/LOG-${String(index).padStart(4, '0')}`] = { fieldId: 'FLD-1', status: index < 420 ? 'ARCHIVED' : 'ACTIVE' };
  seed['operation_logs/SECRET'] = { fieldId: 'OTHER', status: 'ACTIVE' };
  const db = memoryFirestore(seed), collection = db.collection.bind(db);
  let failureCode = 9;
  const reads = [];
  const wrap = (query, scoped = false, compound = false, limit) => new Proxy(query, { get(target, key) {
    if (key === 'get') return async () => {
      assert.equal(scoped, true, 'every operation read retains field authorization');
      if (compound) throw Object.assign(new Error(failureCode === 9 ? 'Query requires an index' : 'Permission denied'), { code: failureCode });
      reads.push(limit); return target.get();
    };
    if (key === 'doc') return target.doc.bind(target);
    if (typeof target[key] !== 'function') return target[key];
    return (...args) => wrap(target[key](...args), scoped || key === 'where' && args[0] === 'fieldId', compound || key === 'where' && args[0] === 'status', key === 'limit' ? args[0] : limit);
  } });
  db.collection = name => name === 'operation_logs' ? wrap(collection(name)) : collection(name);
  const actor = { employeeId: 'MGR', role: 'FARM_MANAGER' };
  const first = await listOperationPage(db, actor, { status: 'ACTIVE', limit: 100 });
  const second = await listOperationPage(db, actor, { status: 'ACTIVE', limit: 100, cursor: first.page.nextCursor });
  assert.equal(first.data.length, 100); assert.equal(second.data.length, 80);
  assert.equal(second.page.hasMore, false);
  assert.equal(new Set([...first.data, ...second.data].map(row => row.id)).size, 180);
  assert.equal([...first.data, ...second.data].some(row => row.id === 'SECRET' || row.status !== 'ACTIVE'), false);
  assert.ok(reads.every(limit => limit <= 200));
  failureCode = 7;
  await assert.rejects(listOperationPage(db, actor, { status: 'ACTIVE' }), error => error.code === 7);
});
