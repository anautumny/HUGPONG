'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { memoryFirestore } = require('./helpers/memoryFirestore');
const { COLLECTIONS: C, ROLES } = require('../schema/firestoreSchema');
const { listOperationPage, listOperationRecords, invalidateOperationDisplayCache } = require('../services/operationQueryService');
const admin = { employeeId: 'SRA-1', role: ROLES.SRA_ADMIN };
const operation = index => `OP-${String(index).padStart(4, '0')}`;
function fixture() {
  const seed = {};
  for (let index = 0; index < 500; index++) seed[`${C.OPERATION_LOGS}/${operation(index)}`] = {
    blockFarmId: 'FARM-1', fieldId: 'FIELD-1', status: 'ACTIVE', performedOn: '2026-11-16'
  };
  for (let index = 0; index < 200; index++) seed[`${C.AUDIT_REPORTS}/AUD-${index}`] = {
    blockFarmId: 'FARM-1', status: index % 2 ? 'RETURNED' : 'CERTIFIED', sourceLogIds: [operation(index)]
  };
  return seed;
}
async function allPages(database, options) {
  const data = [];
  let cursor;
  do {
    const result = await listOperationPage(database, admin, { limit: 100, cursor, ...options });
    data.push(...result.data);
    cursor = result.page.nextCursor;
  } while (cursor);
  return data;
}

test('complete five-page history returns identical records with 704 rather than 1504 modeled document reads', async () => {
  const beforeReads = [], afterReads = [];
  const before = await allPages(memoryFirestore(fixture(), { readCounts: beforeReads }), {});
  const after = await allPages(memoryFirestore(fixture(), { readCounts: afterReads }), { cacheDisplay: true });
  assert.deepEqual(after, before);
  assert.equal(after.length, 500);
  assert.equal(after.find(row => row.id === operation(0)).auditLockReportId, 'AUD-0');
  assert.equal(after.find(row => row.id === operation(1)).auditLockReportId, null);
  const total = reads => reads.reduce((sum, read) => sum + read.documents, 0);
  assert.equal(total(beforeReads), 1504);
  assert.equal(total(afterReads), 704);
  assert.equal(afterReads.filter(read => read.collection === C.AUDIT_REPORTS).length, 1);
});

test('concurrent pages share report metadata, while report decisions and explicit refresh invalidate it', async () => {
  const reads = [];
  const database = memoryFirestore(fixture(), { readCounts: reads });
  await Promise.all([1, 2, 3].map(() => listOperationPage(database, admin, { limit: 10, cacheDisplay: true })));
  const reportQueries = () => reads.filter(read => read.collection === C.AUDIT_REPORTS).length;
  assert.equal(reportQueries(), 1);
  database.records.get(`${C.AUDIT_REPORTS}/AUD-0`).status = 'RETURNED';
  invalidateOperationDisplayCache(database, ['audit-reports']);
  let result = await listOperationPage(database, admin, { cacheDisplay: true });
  assert.equal(result.data[0].auditLockReportId, null);
  assert.equal(reportQueries(), 2);
  database.records.get(`${C.AUDIT_REPORTS}/AUD-0`).status = 'CERTIFIED';
  result = await listOperationPage(database, admin, { cacheDisplay: true, freshDisplay: true });
  assert.equal(result.data[0].auditLockReportId, 'AUD-0');
  assert.equal(reportQueries(), 3);
  database.records.get(`${C.AUDIT_REPORTS}/AUD-0`).status = 'RETURNED';
  result = await listOperationRecords(database, admin);
  assert.equal(result.find(row => row.id === operation(0)).auditLockReportId, null,
    'internal callers default to fresh authoritative reports');
});

test('cached display pointers never cache field ownership or cross farm operation results', async () => {
  const seed = fixture();
  seed[`${C.FIELDS}/FIELD-1`] = { memberUserId: 'MEMBER-1', blockFarmId: 'FARM-1' };
  seed[`${C.FIELDS}/FIELD-2`] = { memberUserId: 'MEMBER-2', blockFarmId: 'FARM-2' };
  seed[`${C.OPERATION_LOGS}/FOREIGN`] = { fieldId: 'FIELD-2', blockFarmId: 'FARM-2', status: 'ACTIVE' };
  const database = memoryFirestore(seed);
  const member = { employeeId: 'MEMBER-1', role: ROLES.MEMBER_FARMER };
  const options = { cacheDisplay: true };
  const first = await listOperationPage(database, member, options);
  assert.ok(first.data.length);
  assert.ok(first.data.every(row => row.fieldId === 'FIELD-1'));
  database.records.get(`${C.FIELDS}/FIELD-1`).memberUserId = 'MEMBER-2';
  assert.deepEqual((await listOperationPage(database, member, options)).data, []);
  const other = await listOperationPage(database, { ...member, employeeId: 'MEMBER-2' }, options);
  assert.ok(other.data.some(row => row.id === 'FOREIGN'));
});

test('invalidation during report reads prevents older metadata from entering the next request cache', async () => {
  const database = memoryFirestore(fixture());
  const collection = database.collection.bind(database);
  let release;
  let captured;
  let queries = 0;
  database.collection = name => {
    const result = collection(name);
    if (name !== C.AUDIT_REPORTS) return result;
    return { ...result, where(...args) {
      const query = result.where(...args);
      return { ...query, async get() {
        queries++;
        const snapshot = await query.get();
        // Firestore snapshots preserve the version read, unlike mutable records.
        const rows = snapshot.docs.map(doc => ({ id: doc.id, value: doc.data() }));
        if (queries === 1) { captured = true; await new Promise(resolve => { release = resolve; }); }
        return { docs: rows.map(row => ({ id: row.id, data: () => row.value })) };
      } };
    } };
  };
  const pending = listOperationPage(database, admin, { cacheDisplay: true });
  while (!captured) await new Promise(resolve => setImmediate(resolve));
  database.records.get(`${C.AUDIT_REPORTS}/AUD-0`).status = 'RETURNED';
  invalidateOperationDisplayCache(database, ['audit-reports']);
  release();
  await pending;
  const fresh = await listOperationPage(database, admin, { cacheDisplay: true });
  assert.equal(queries, 2);
  assert.equal(fresh.data[0].auditLockReportId, null);
});

test('display metadata expires and failed reads never become cached responses', async () => {
  const reads = [];
  const database = memoryFirestore(fixture(), { readCounts: reads });
  const now = Date.now;
  let clock = now();
  Date.now = () => clock;
  try {
    await listOperationPage(database, admin, { cacheDisplay: true });
    clock += 60001;
    database.records.get(`${C.AUDIT_REPORTS}/AUD-0`).status = 'RETURNED';
    assert.equal((await listOperationPage(database, admin, { cacheDisplay: true })).data[0].auditLockReportId, null);
    assert.equal(reads.filter(read => read.collection === C.AUDIT_REPORTS).length, 2);
  } finally { Date.now = now; }
  invalidateOperationDisplayCache(database);
  const collection = database.collection.bind(database);
  let fail = true;
  database.collection = name => name !== C.AUDIT_REPORTS || !fail ? collection(name)
    : { where: () => ({ get: async () => { throw new Error('Injected report outage'); } }) };
  await assert.rejects(listOperationPage(database, admin, { cacheDisplay: true }), /Injected report outage/);
  fail = false;
  assert.equal((await listOperationPage(database, admin, { cacheDisplay: true })).data[0].auditLockReportId, null);
});
