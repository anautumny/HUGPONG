'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

async function loadMobileDataHelpers() {
  const source = fs.readFileSync(
    path.resolve(__dirname, '../../mobile/src/utils/dataHelpers.js'),
    'utf8'
  );
  const url = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
  return import(url);
}

test('mobile date helpers preserve display and storage date formats', async () => {
  const { formatDisplayDate, toISODateString } = await loadMobileDataHelpers();

  assert.equal(formatDisplayDate('2026-09-03'), 'September 3, 2026');
  assert.equal(formatDisplayDate('September 3, 2026'), 'September 3, 2026');
  assert.equal(formatDisplayDate('not-a-date'), 'not-a-date');
  assert.equal(toISODateString('2026-9-3'), '2026-09-03');
});

test('mobile log cleanup keeps the newest record for a duplicate id', async () => {
  const { cleanupDuplicateLogs } = await loadMobileDataHelpers();
  const older = { id: 'LOG-1', updatedAt: '2026-09-01T00:00:00.000Z', cost: 10 };
  const newer = { id: 'LOG-1', updatedAt: '2026-09-02T00:00:00.000Z', cost: 20 };
  const distinct = { id: 'LOG-2', updatedAt: '2026-09-01T00:00:00.000Z', cost: 30 };

  assert.deepEqual(cleanupDuplicateLogs([older, null, newer, distinct]), [newer, distinct]);
  assert.deepEqual(cleanupDuplicateLogs(null), []);
});

test('mobile Firestore cleanup recursively removes undefined object fields', async () => {
  const { cleanDataForFirestore } = await loadMobileDataHelpers();

  assert.deepEqual(
    cleanDataForFirestore({
      fieldId: 'FIELD-1',
      missing: undefined,
      details: { cost: 100, note: undefined },
      values: [1, undefined, null]
    }),
    {
      fieldId: 'FIELD-1',
      details: { cost: 100 },
      values: [1, null, null]
    }
  );
});
