'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const http = require('node:http');
const zlib = require('node:zlib');
const { COLLECTIONS } = require('../schema/firestoreSchema');
const { createOperationRecord, amendOperationRecord, archiveOperationRecords, updateCycleStage } = require('../services/cropCycleOperations');
const { readMutationContext, assertBaseVersion } = require('../services/mutationContext');
const { presentOperationRecord } = require('../domain/presentationContract');
const { createMutationEnvelope, drainMutationQueue } = require('../../mobile/src/services/mutationOutboxCore');

// Reuse the real transactional service fixture, without registering its tests.
const fixturePath = path.join(__dirname, 'crop-cycle-renewal.test.js');
const fixture = fs.readFileSync(fixturePath, 'utf8');
const fixtureModule = { exports: {} };
new Function('require', 'module', 'exports', fixture.slice(0, fixture.indexOf("\ntest('")) + '\nmodule.exports={database,operation,USER,MANAGER,FIELD_ID};')(
  createRequire(fixturePath), fixtureModule, fixtureModule.exports);
const { database, operation, USER, MANAGER, FIELD_ID } = fixtureModule.exports;
const manager = () => ({ ...MANAGER, takeoverGrant: { actorId: MANAGER.employeeId, fieldId: FIELD_ID, expiresAt: Date.now() + 60000 } });
const amendment = id => ({ amendmentId: id, reason: 'Correct recorded costs' });

test('reported operations are immutable until an uncertified report is returned', async () => {
  for (const status of ['COMPILED', 'PENDING_REVIEW', 'CERTIFIED']) {
    const db = database();
    db.collections.set(COLLECTIONS.AUDIT_REPORTS, new Map([['AUD-TEST', { blockFarmId: 'BLK-TEST-001', status, sourceLogIds: ['LOG-A'] }]]));
    await assert.rejects(amendOperationRecord(db, 'LOG-A', { totalCost: 125 }, amendment('AMD-LOCK'), USER), error => error.status === 409 && error.data.code === 'OPERATION_AUDIT_LOCKED');
    await assert.rejects(archiveOperationRecords(db, ['LOG-A'], USER), error => error.data.code === 'OPERATION_AUDIT_LOCKED');
    assert.equal(db.get(COLLECTIONS.OPERATION_LOGS, 'LOG-A').totalCost, 100);
    db.collections.get(COLLECTIONS.AUDIT_REPORTS).get('AUD-TEST').status = 'RETURNED';
    await amendOperationRecord(db, 'LOG-A', { totalCost: 125 }, amendment('AMD-RETURN'), USER);
    const second = await amendOperationRecord(db, 'LOG-A', { totalCost: 150, baseCost: 150 }, amendment('AMD-SECOND'), USER);
    assert.equal(second.record.stageNumberAtRecord, 1);
    assert.equal(second.record.totalCost, 150);
  }
});

test('HTTP update preconditions cannot be omitted, malformed, or skipped for one batch member', () => {
  const base = { mutationId: 'MUT-TEST-123', idempotencyKey: 'MUT-TEST-123', entityKey: 'operation_logs/LOG-A' };
  for (const body of [{}, { _mutation: base }, { _mutation: { ...base, baseVersion: 123 } }, { _mutation: { ...base, baseVersion: { 'LOG-A': null } } }]) {
    assert.throws(() => readMutationContext({ method: 'PATCH', body }), error => error.status === 428);
  }
  const context = readMutationContext({ body: { _mutation: { ...base, baseVersion: { 'LOG-A': 'v1' } } } }, { requireVersion: true });
  assert.throws(() => assertBaseVersion('v1', context, 'LOG-B'), error => error.status === 428);
  assert.throws(() => assertBaseVersion('v2', context, 'LOG-A'), error => error.status === 409);
  assert.doesNotThrow(() => assertBaseVersion(undefined, { baseVersion: 'UNVERSIONED', requireVersion: true }, 'legacy'));
  assert.throws(() => assertBaseVersion('v2', { baseVersion: 'UNVERSIONED', requireVersion: true }, 'modern'), error => error.status === 409);
});

test('takeover conflicts retain offline work and require a fresh explicit separate-work review', async () => {
  const db = database();
  db.collections.get(COLLECTIONS.OPERATION_LOGS).clear();
  const payload = { ...operation(), id: 'LOG-MEMBER-QUEUED' };
  const saved = await createOperationRecord(db, { ...operation(), id: 'LOG-MANAGER' }, manager(), '2026-10-24T03:00:00.000Z');
  const queued = createMutationEnvelope('operation_log', payload, { ownerUserId: USER.employeeId });
  const drained = await drainMutationQueue([queued], async item => {
    const result = await createOperationRecord(db, item.payload, USER);
    return { success: true, data: result.record };
  });
  assert.equal(drained.remainingCount, 1);
  assert.equal(drained.queue[0].status, 'conflict');
  assert.equal(drained.queue[0].conflict.code, 'OPERATION_RECONCILIATION_REQUIRED');
  assert.equal(drained.queue[0].payload.id, payload.id);
  assert.equal(db.ids(COLLECTIONS.OPERATION_LOGS).length, 1);
  await assert.rejects(createOperationRecord(db, { ...payload, reconciliation: { reason: 'Separate actual task', recordVersions: { 'LOG-MANAGER': 'stale' } } }, USER), error => error.status === 409);
  const separate = await createOperationRecord(db, { ...payload, reconciliation: { reason: 'Different crew and second actual pass', recordVersions: { 'LOG-MANAGER': saved.record.updatedAt } } }, USER);
  assert.equal(separate.record.reconciliation.reviewedByUserId, USER.employeeId);
  const retry = await createOperationRecord(db, payload, USER);
  assert.equal(retry.replayed, true);
  assert.equal(db.ids(COLLECTIONS.OPERATION_LOGS).length, 2);
  assert.equal(db.get(COLLECTIONS.CROP_CYCLES, payload.cycleId).operationWriteRevision, 2);
});

test('takeover matching is symmetric and permits work on another day', async () => {
  const db = database();
  await assert.rejects(createOperationRecord(db, { ...operation(), id: 'LOG-MANAGER-LATER' }, manager()), error => error.data.code === 'OPERATION_RECONCILIATION_REQUIRED');
  const result = await createOperationRecord(db, { ...operation({ performedOn: '2026-09-17' }), id: 'LOG-OTHER-DAY' }, manager());
  assert.equal(result.replayed, false);
});

test('corrected archived production is eligible while abandoned reset history stays excluded', () => {
  const record = { status: 'ARCHIVED', totalCost: 4135 };
  assert.equal(presentOperationRecord({ ...record, archivedReason: 'CROP_YEAR_CORRECTED' }).analyticsEligible, true);
  assert.equal(presentOperationRecord({ ...record, archivedReason: 'CROP_YEAR_RESET' }).analyticsEligible, false);
});

test('JSON middleware rejects compressed request bodies without inflating them', async () => {
  const express = require('express');
  const app = express();
  app.use(express.json({ limit: '1mb', inflate: false }));
  app.post('/', (_req, res) => res.json({ success: true }));
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ error: error.type }));
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const status = await new Promise((resolve, reject) => {
      const request = http.request({ host: '127.0.0.1', port: server.address().port, method: 'POST', headers: { 'content-type': 'application/json', 'content-encoding': 'gzip' } }, response => { response.resume(); response.on('end', () => resolve(response.statusCode)); });
      request.on('error', reject);
      request.end(Buffer.concat([zlib.gzipSync('{"hello":1}'), Buffer.from('trailing bytes')]));
    });
    assert.equal(status, 415);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

const mobileRequire = createRequire(path.resolve(__dirname, '../../mobile/package.json'));
const babel = mobileRequire('@babel/core');
const clientCache = new Map();
function loadClient(filename) {
  filename = path.resolve(filename);
  if (clientCache.has(filename)) return clientCache.get(filename);
  const localRequire = createRequire(filename);
  const compiled = babel.transformSync(fs.readFileSync(filename, 'utf8'), {
    configFile: false, babelrc: false,
    plugins: [mobileRequire.resolve('@babel/plugin-transform-modules-commonjs')]
  }).code;
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', compiled)(name => {
    if (!name.startsWith('.') || name.endsWith('.json')) return localRequire(name);
    return loadClient(localRequire.resolve(name));
  }, mod, mod.exports);
  clientCache.set(filename, mod.exports);
  return mod.exports;
}

test('both real client decoders bound legacy expansion and reject excessive multipart inputs', () => {
  const report = {
    reportId: 'AUD-BF1-2026-10-V1', blockFarmId: 'BF1', periodKey: '2026-10', status: 'COMPILED',
    compiledByUserId: '03000001', compiledAt: '2026-10-24T00:00:00.000Z', integrityHash: 'HUG-1234567890ABCDEF12345678',
    operationSnapshots: [{ operationLogId: 'LOG-QR', fieldId: FIELD_ID, totalCost: 100, cropYearCycle: '2026-2027' }],
    fieldSnapshots: [{ fieldId: FIELD_ID, memberId: USER.employeeId, areaHa: 1, operationLogIds: ['LOG-QR'] }],
    sourceLogIds: ['LOG-QR'], operationCount: 1, fieldCount: 1, memberCount: 1, hectaresAudited: 1, totalCost: 100
  };
  const encode = padding => JSON.stringify({ type: 'HUGPONG_AUDIT_TRANSFER', schemaVersion: 3, encoding: 'DEFLATE_RAW_BASE64_UTF8', reportId: report.reportId, integrityHash: report.integrityHash, data: zlib.deflateRawSync(Buffer.from(JSON.stringify({ ...report, padding }))).toString('base64') });
  for (const client of ['mobile', 'web/react-app']) {
    const decoder = loadClient(path.resolve(__dirname, `../../${client}/src/domain/auditWorkflow.js`));
    assert.equal(decoder.decodeAuditQrPayload(encode('small')).totalCost, 100);
    assert.throws(() => decoder.decodeAuditQrPayload(encode('x'.repeat(1200000))), /malformed/);
    assert.throws(() => decoder.assembleAuditQrParts(Array(257).fill('{}')), /Too many/);
    assert.throws(() => decoder.decodeAuditQrPart({ type: decoder.AUDIT_QR_PART_TYPE, schemaVersion: 2, transferId: 'X', partCount: 256, partNumber: 1, data: 'x'.repeat(8193) }), /incomplete/);
  }
});

test('mobile conflict review preserves identity, dependent changes, and concurrent enqueue on a failed save', async () => {
  const vm = require('node:vm');
  const source = fs.readFileSync(path.resolve(__dirname, '../../mobile/src/services/syncEngine.js'), 'utf8').replace(/^import[\s\S]*?;\r?$/gm, '').replace(/\bexport /g, '');
  const store = new Map();
  let failNextSave = false, releaseFailure;
  const context = { console: { info() {}, warn() {} }, require: () => require('../../mobile/src/services/mutationOutboxCore'), STORAGE_KEYS: {},
    getItem: async (key, fallback) => store.get(key) || fallback,
    saveItem: async (key, value) => {
      if (failNextSave) { failNextSave = false; await new Promise(resolve => { releaseFailure = resolve; }); return false; }
      store.set(key, value); return true;
    },
    toOperationLogDocument: payload => payload,
    localOutboxStorageKey: id => 'outbox-' + id, setTimeout, clearTimeout, Date, Map, Set, Uint32Array
  };
  vm.createContext(context); vm.runInContext(source, context);
  await context.initSyncEngine(USER.employeeId);
  const first = await context.enqueueOutboxItem('operation_log', { id: 'LOG-QUEUED', cycleId: 'C1' });
  await context.enqueueOutboxItem('operation_amendment', { id: 'LOG-QUEUED', changes: { totalCost: 125 } });
  await context.processOutbox(async () => { throw Object.assign(new Error('Review matching work'), { status: 409, data: { code: 'OPERATION_RECONCILIATION_REQUIRED', records: [{ id: 'LOG-MANAGER', updatedAt: 'v1' }] } }); });
  await context.resolveOperationConflict(first.mutationId, { separate: true, reason: 'Separate actual task' });
  assert.equal(context.getOutboxQueue()[0].mutationId, first.mutationId);
  assert.equal(context.getOutboxQueue()[0].payload.reconciliation.recordVersions['LOG-MANAGER'], 'v1');
  await context.processOutbox(async () => { throw Object.assign(new Error('Changed again'), { status: 409, data: { code: 'OPERATION_RECONCILIATION_REQUIRED', records: [{ id: 'LOG-MANAGER', updatedAt: 'v2' }] } }); });
  failNextSave = true;
  const review = context.resolveOperationConflict(first.mutationId);
  await new Promise(resolve => setImmediate(resolve));
  const concurrent = await context.enqueueOutboxItem('operation_log', { id: 'LOG-CONCURRENT', cycleId: 'C1' });
  releaseFailure();
  await assert.rejects(review, /could not be saved/);
  assert.equal(context.getOutboxQueue().length, 3);
  assert.ok(context.getOutboxQueue().some(item => item.mutationId === concurrent.mutationId));
  assert.equal(store.get('outbox-' + USER.employeeId).length, 3, 'restart must retain the original and the concurrent entry');
  await context.resolveOperationConflict(first.mutationId);
  const queue = context.getOutboxQueue();
  assert.equal(queue.length, 2);
  assert.equal(queue.find(item => item.type === 'operation_amendment').conflict.code, 'REMOVED_OPERATION_DEPENDENCY');
});

test('conflict review waits for a running drain instead of joining and skipping its command', async () => {
  const { createSingleFlightRunner } = require('../../mobile/src/services/mutationOutboxCore');
  const run = createSingleFlightRunner();
  let finish, reviewed = false;
  const drain = run(() => new Promise(resolve => { finish = resolve; }));
  await new Promise(resolve => setImmediate(resolve));
  const review = run(async () => { reviewed = true; return 'review saved'; }, { joinExisting: false });
  assert.equal(reviewed, false);
  finish('drained');
  assert.equal(await drain, 'drained');
  assert.equal(await review, 'review saved');
  assert.equal(reviewed, true);
});

test('mobile cycle approval sends a field version accepted by the strict API boundary', async () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../../mobile/src/data/dataStore.js'), 'utf8');
  const start = source.indexOf('export const approveFieldCropCycleRollover =');
  const end = source.indexOf('export const rejectFieldCropCycleRollover =', start);
  let calls = 0;
  const approve = new Function('fields', 'getNetworkStatus', 'createClientRecordId', 'authenticatedRequest', 'performMobileSync', source.slice(start, end).replace('export const', 'const') + ';return approveFieldCropCycleRollover;')(
    [{ id: FIELD_ID, currentCycleId: 'CYC-1', updatedAt: 'field-v1' }], () => true, () => 'MUT-APPROVAL-TEST',
    async (_path, options) => {
      calls++;
      const context = readMutationContext({ method: options.method, body: options.body }, { requireVersion: true });
      assertBaseVersion('field-v1', context, FIELD_ID);
      assert.equal(options.body.previousCycleId, 'CYC-1');
      return { success: true, data: { newCycleId: 'CYC-2' } };
    }, async () => {});
  const result = await approve(FIELD_ID);
  assert.equal(result.success, true, result.message);
  assert.equal(calls, 1);
});

test('planting receipts carry the new cycle version for a subsequent explicit stage advance', async () => {
  const db = database();
  const cycleId = operation().cycleId;
  const cycle = db.collections.get(COLLECTIONS.CROP_CYCLES).get(cycleId);
  cycle.currentStageNumber = 2;
  const originalVersion = cycle.updatedAt;
  const recorded = await createOperationRecord(db, { ...operation({ operationDefinitionId: 'SRA-03', stageNumber: 2, variety: 'PHIL 2006-2289' }), id: 'LOG-NEW-PLANT' }, USER, '2026-10-24T03:00:00.000Z');
  assert.notEqual(recorded.cycleVersion, originalVersion);
  const updated = await updateCycleStage(db, cycleId, { currentStageNumber: 3 }, USER, '2026-10-24T03:01:00.000Z', { baseVersion: recorded.cycleVersion, requireVersion: true });
  assert.equal(updated.currentStageNumber, 3);
  const replay = await createOperationRecord(db, { ...operation(), id: 'LOG-NEW-PLANT' }, USER);
  assert.equal(replay.cycleVersion, updated.updatedAt);
});

test('operation receipts recheck current field scope while allowing assigned managers to read after grant expiry', async () => {
  const db = database();
  db.collections.get(COLLECTIONS.FIELDS).get(FIELD_ID).memberUserId = '04009999';
  await assert.rejects(createOperationRecord(db, { ...operation(), id: 'LOG-A' }, USER), error => error.status === 403);
  const managedDb = database();
  const payload = { ...operation({ performedOn: '2026-09-17' }), id: 'LOG-MGR-RECEIPT' };
  await createOperationRecord(managedDb, payload, manager());
  assert.equal((await createOperationRecord(managedDb, payload, MANAGER)).replayed, true);
  managedDb.collections.get(COLLECTIONS.BLOCK_FARMS).get('BLK-TEST-001').managerUserId = '03009999';
  await assert.rejects(createOperationRecord(managedDb, payload, MANAGER), error => error.status === 403);
});

test('a sync requested during mobile conflict review drains afterwards and returns a sync result', async () => {
  const vm = require('node:vm');
  const source = fs.readFileSync(path.resolve(__dirname, '../../mobile/src/services/syncEngine.js'), 'utf8').replace(/^import[\s\S]*?;\r?$/gm, '').replace(/\bexport /g, '');
  let holdSave = false, releaseSave;
  const context = { console: { info() {}, warn() {} }, require: () => require('../../mobile/src/services/mutationOutboxCore'), STORAGE_KEYS: {},
    getItem: async (_key, fallback) => fallback,
    saveItem: async () => { if (holdSave) { holdSave = false; await new Promise(resolve => { releaseSave = resolve; }); } return true; },
    toOperationLogDocument: payload => payload, localOutboxStorageKey: id => 'outbox-' + id, setTimeout, clearTimeout, Date, Map, Set, Uint32Array
  };
  vm.createContext(context); vm.runInContext(source, context);
  await context.initSyncEngine(USER.employeeId);
  const queued = await context.enqueueOutboxItem('operation_log', { id: 'LOG-REVIEW-DRAIN', cycleId: 'C1' });
  await context.processOutbox(async () => { throw Object.assign(new Error('Matching work'), { status: 409, data: { code: 'OPERATION_RECONCILIATION_REQUIRED', records: [{ id: 'LOG-SERVER', updatedAt: 'v1' }] } }); });
  holdSave = true;
  const review = context.resolveOperationConflict(queued.mutationId, { separate: true, reason: 'Different actual work' });
  await new Promise(resolve => setImmediate(resolve));
  let attempts = 0;
  const drain = context.processOutbox(async () => { attempts++; return { success: true, data: { updatedAt: 'v2' } }; });
  assert.equal(attempts, 0);
  releaseSave(); await review;
  const result = await drain;
  assert.equal(result.success, true);
  assert.equal(result.processedCount, 1);
  assert.equal(attempts, 1);
  assert.equal(context.getOutboxQueue().length, 0);
});

test('web and mobile analytics include corrected production once and exclude reset history', () => {
  const corrected = { id: 'LOG-1', fieldId: 'F1', blockFarmId: 'BF1', cycleId: 'C1', status: 'ARCHIVED', archivedReason: 'CROP_YEAR_CORRECTED', totalCost: 4135, performedOn: '2026-10-15', cropYearCycle: '2026-2027' };
  for (const client of ['mobile', 'web/react-app']) {
    const selectors = loadClient(path.resolve(__dirname, `../../${client}/src/services/analyticsSelectors.js`));
    const input = { fields: [{ id: 'F1', blockFarmId: 'BF1', currentCycleId: 'C1', ha: 4, areaHa: 4 }], blockFarms: [{ id: 'BF1' }], selectedFarmId: 'ALL', selectedParcelId: 'ALL', selectedPeriod: 'ALL' };
    assert.equal(selectors.selectProductionCost({ ...input, operations: [corrected] }).totalExpenditure, 4135);
    assert.equal(selectors.selectProductionCost({ ...input, operations: [{ ...corrected, archivedReason: 'CROP_YEAR_RESET' }] }).totalExpenditure, 0);
    assert.equal(selectors.selectProductionCost({ ...input, operations: [{ ...corrected, analyticsEligible: false }] }).totalExpenditure, 0);
  }
});
