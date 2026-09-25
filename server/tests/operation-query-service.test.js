'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { listOperationRecords } = require('../services/operationQueryService');

function snapshot(entries) {
  return {
    docs: entries.map(([id, data]) => ({ id, data: () => ({ ...data }) }))
  };
}

function fakeDatabase(collections, { failOrderedQuery = false } = {}) {
  function query(entries, constraints = [], ordering = null, maximum = null) {
    return {
      async get() {
        if (ordering && failOrderedQuery) {
          const error = new Error('9 FAILED_PRECONDITION: The query requires an index.');
          error.code = 9;
          throw error;
        }
        let matching = entries.filter(([, data]) => constraints.every(({ field, operator, value }) => operator === 'in'
          ? value.includes(data[field])
          : data[field] === value));
        if (ordering) {
          matching = matching.sort((left, right) => String(right[1][ordering] || '').localeCompare(String(left[1][ordering] || '')));
        }
        if (maximum) matching = matching.slice(0, maximum);
        return snapshot(matching);
      },
      where(field, operator, value) {
        assert.ok(operator === '==' || operator === 'in');
        return query(entries, [...constraints, { field, operator, value }], ordering, maximum);
      },
      orderBy(field, direction) {
        assert.equal(direction, 'desc');
        return query(entries, constraints, field, maximum);
      },
      limit(value) {
        return query(entries, constraints, ordering, value);
      }
    };
  }
  return {
    collection(name) {
      const entries = Object.entries(collections[name] || {});
      return query(entries);
    }
  };
}

const database = fakeDatabase({
  block_farms: {
    'BF-1': { managerUserId: 'MGR-1' },
    'BF-2': { managerUserId: 'MGR-2' }
  },
  fields: {
    'FLD-1': { blockFarmId: 'BF-1', memberUserId: 'MEM-1' },
    'FLD-2': { blockFarmId: 'BF-2', memberUserId: 'MEM-2' }
  },
  operation_logs: {
    'LOG-1': { fieldId: 'FLD-1', totalCost: 100, status: 'ACTIVE' },
    'LOG-2': { fieldId: 'FLD-2', totalCost: 200, status: 'ARCHIVED' }
  }
});

test('operation query service preserves Farm Manager assigned-farm scope', async () => {
  const records = await listOperationRecords(database, { employeeId: 'MGR-1', role: 'FARM_MANAGER' });
  assert.deepEqual(records.map(record => record.id), ['LOG-1']);
});

test('operation query service preserves Farm Member own-field scope', async () => {
  const records = await listOperationRecords(database, { employeeId: 'MEM-2', role: 'MEMBER_FARMER' });
  assert.deepEqual(records.map(record => record.id), ['LOG-2']);
});

test('operation query service preserves district-wide SRA read scope', async () => {
  const records = await listOperationRecords(database, { employeeId: 'SRA-1', role: 'SRA_ADMIN' });
  assert.deepEqual(records.map(record => record.id), ['LOG-1', 'LOG-2']);
});

test('operation query service can exclude archived records at query time', async () => {
  const records = await listOperationRecords(database, { employeeId: 'SRA-1', role: 'SRA_ADMIN' }, { status: 'ACTIVE' });
  assert.deepEqual(records.map(record => record.id), ['LOG-1']);
});

test('operation query service applies a bounded newest-first server query', async () => {
  const boundedDatabase = fakeDatabase({
    operation_logs: {
      'LOG-OLD': { fieldId: 'FLD-1', status: 'ACTIVE', performedOn: '2026-09-01' },
      'LOG-NEW': { fieldId: 'FLD-1', status: 'ACTIVE', performedOn: '2026-09-20' },
      'LOG-MID': { fieldId: 'FLD-1', status: 'ACTIVE', performedOn: '2026-09-10' }
    }
  });
  const records = await listOperationRecords(
    boundedDatabase,
    { employeeId: 'SRA-1', role: 'SRA_ADMIN' },
    { limit: '2' }
  );
  assert.deepEqual(records.map(record => record.id), ['LOG-NEW', 'LOG-MID']);
});

test('bounded manager operation reads fall back safely while the composite index is unavailable', async () => {
  const fallbackDatabase = fakeDatabase({
    block_farms: { 'BF-1': { managerUserId: 'MGR-1' } },
    fields: { 'FLD-1': { blockFarmId: 'BF-1', memberUserId: 'MEM-1' } },
    operation_logs: {
      'LOG-OLD': { fieldId: 'FLD-1', status: 'ACTIVE', performedOn: '2026-09-01' },
      'LOG-NEW': { fieldId: 'FLD-1', status: 'ACTIVE', performedOn: '2026-09-20' },
      'LOG-MID': { fieldId: 'FLD-1', status: 'ACTIVE', performedOn: '2026-09-10' }
    }
  }, { failOrderedQuery: true });
  const records = await listOperationRecords(
    fallbackDatabase,
    { employeeId: 'MGR-1', role: 'FARM_MANAGER' },
    { limit: '2' }
  );
  assert.deepEqual(records.map(record => record.id), ['LOG-NEW', 'LOG-MID']);
});

test('operation query service rejects invalid and caps excessive limits', async () => {
  await assert.rejects(
    listOperationRecords(database, { employeeId: 'SRA-1', role: 'SRA_ADMIN' }, { limit: '0' }),
    error => error.status === 400
  );
  const records = await listOperationRecords(database, { employeeId: 'SRA-1', role: 'SRA_ADMIN' }, { limit: '500' });
  assert.equal(records.length, 2);
});
