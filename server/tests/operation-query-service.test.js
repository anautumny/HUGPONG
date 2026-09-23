'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { listOperationRecords } = require('../services/operationQueryService');

function snapshot(entries) {
  return {
    docs: entries.map(([id, data]) => ({ id, data: () => ({ ...data }) }))
  };
}

function fakeDatabase(collections) {
  return {
    collection(name) {
      const entries = Object.entries(collections[name] || {});
      return {
        async get() {
          return snapshot(entries);
        },
        where(field, operator, value) {
          assert.ok(operator === '==' || operator === 'in');
          return {
            async get() {
              return snapshot(entries.filter(([, data]) => operator === 'in'
                ? value.includes(data[field])
                : data[field] === value));
            }
          };
        }
      };
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
    'LOG-1': { fieldId: 'FLD-1', totalCost: 100 },
    'LOG-2': { fieldId: 'FLD-2', totalCost: 200 }
  }
});

test('operation query service preserves Farm Manager assigned-farm scope', async () => {
  const records = await listOperationRecords(database, { employeeId: 'MGR-1', role: 'FARM_MANAGER' });
  assert.deepEqual(records.map(record => record.id), ['LOG-1']);
});

test('operation query service preserves Member Farmer own-field scope', async () => {
  const records = await listOperationRecords(database, { employeeId: 'MEM-2', role: 'MEMBER_FARMER' });
  assert.deepEqual(records.map(record => record.id), ['LOG-2']);
});

test('operation query service preserves district-wide SRA read scope', async () => {
  const records = await listOperationRecords(database, { employeeId: 'SRA-1', role: 'SRA_ADMIN' });
  assert.deepEqual(records.map(record => record.id), ['LOG-1', 'LOG-2']);
});
