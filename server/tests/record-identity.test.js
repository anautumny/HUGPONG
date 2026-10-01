'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { uniqueRecordsById } = require('../domain/recordIdentity');

test('server block-farm identity normalization keeps one newest canonical ID', () => {
  const older = { id: 'BF-CF0B82E817C300A47D7D', updatedAt: '2026-10-01T08:00:00.000Z', name: 'Older' };
  const newer = { id: 'bf-cf0b82e817c300a47d7d', updatedAt: '2026-10-01T09:00:00.000Z', name: 'Current' };
  const distinct = { id: 'BF-OTHER', updatedAt: '2026-10-01T07:00:00.000Z' };

  assert.deepEqual(uniqueRecordsById([older, null, newer, distinct]), [newer, distinct]);
  assert.deepEqual(uniqueRecordsById(null), []);
});

