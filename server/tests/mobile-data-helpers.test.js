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

test('mobile operation ordering keeps an offline record in its chronological position after reconciliation', async () => {
  const { cleanupDuplicateLogs, sortOperationsNewestFirst } = await loadMobileDataHelpers();
  const synced = { id: 'LOG-1', performedOn: '2026-09-23', createdAt: '2026-09-23T10:00:00.000Z', cost: 10 };
  const reconciled = { ...synced, updatedAt: '2026-09-23T10:35:00.000Z', cost: 11 };
  const offline = { id: 'LOG-2', performedOn: '2026-09-23', localCreatedAt: '2026-09-23T10:30:00.000Z', synced: false };
  const older = { id: 'LOG-0', performedOn: '2026-09-22', createdAt: '2026-09-23T11:00:00.000Z' };
  const result = sortOperationsNewestFirst(cleanupDuplicateLogs([synced, offline, older, reconciled]));
  assert.deepEqual(result.map(record => record.id), ['LOG-2', 'LOG-1', 'LOG-0']);
  assert.equal(result.filter(record => record.id === 'LOG-1').length, 1);
});

test('mobile Crop Year Cycle preview is deterministic and display-only formatting preserves storage', async () => {
  const { cropYearCycleForDate, formatCropYearDisplay } = await loadMobileDataHelpers();
  assert.equal(cropYearCycleForDate(new Date('2027-06-01T00:00:00.000Z')), '2027-2028');
  assert.equal(formatCropYearDisplay('2027-2028'), '2027–2028');
});

test('mobile Crop Year Cycle options exclude invalid years and deduplicate across fields', async () => {
  const { canonicalStoredCropYear, uniqueCropYears } = await loadMobileDataHelpers();
  const cycles = [
    { id: 'A', fieldId: 'FLD-1', cropYear: '2026-2027' },
    { id: 'B', fieldId: 'FLD-2', cropYear: '2026-2027' },
    { id: 'C', fieldId: 'FLD-3', cropYear: '2025-2026' },
    { id: 'D', fieldId: 'FLD-1', cropYear: '2026' },
    { id: 'E', fieldId: 'FLD-1', cropYear: null }
  ];
  assert.deepEqual(uniqueCropYears(cycles), ['2026-2027', '2025-2026']);
  assert.equal(canonicalStoredCropYear('2026'), '');
});
