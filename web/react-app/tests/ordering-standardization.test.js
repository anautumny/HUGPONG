import test from 'node:test';
import assert from 'node:assert/strict';
import { sortNewestFirst, sortOperationsNewestFirst, timestampMillis } from '../src/utils/recordOrdering.js';
import { canonicalStoredCropYear, formatCropYear, formatCropYearDisplay, uniqueCropYears } from '../src/utils/formatters.js';

test('web chronological selectors are newest-first, stable, and non-mutating', () => {
  const input = [
    { id: 'OLD', createdAt: '2026-09-20T00:00:00.000Z' },
    { id: 'NEW', createdAt: '2026-09-23T00:00:00.000Z' }
  ];
  assert.deepEqual(sortNewestFirst(input).map(item => item.id), ['NEW', 'OLD']);
  assert.deepEqual(input.map(item => item.id), ['OLD', 'NEW']);
});

test('web operation filtering preserves newest-first order', () => {
  const ordered = sortOperationsNewestFirst([
    { id: 'W1', category: 'Weeding', performedOn: '2026-09-20' },
    { id: 'P1', category: 'Planting', performedOn: '2026-09-23' },
    { id: 'W2', category: 'Weeding', performedOn: '2026-09-22' }
  ]);
  assert.deepEqual(ordered.filter(item => item.category === 'Weeding').map(item => item.id), ['W2', 'W1']);
});

test('web timestamp normalization handles Firestore Timestamp values', () => {
  const expected = Date.parse('2026-09-23T00:00:00.000Z');
  assert.equal(timestampMillis({ seconds: expected / 1000, nanoseconds: 0 }), expected);
});

test('Crop Year Cycle storage remains canonical while display uses an en dash', () => {
  assert.equal(formatCropYear('2026–2027'), '2026-2027');
  assert.equal(formatCropYearDisplay('2026-2027'), '2026–2027');
});

test('Crop Year Cycle filter years are strict, unique, newest-first, and non-mutating', () => {
  const cycles = [
    { id: 'C1', fieldId: 'FLD-1', cropYear: '2026-2027' },
    { id: 'C2', fieldId: 'FLD-2', cropYear: '2026-2027' },
    { id: 'C3', fieldId: 'FLD-3', cropYear: '2025-2026' },
    { id: 'C4', fieldId: 'FLD-1', cropYear: null },
    { id: 'C5', fieldId: 'FLD-1', cropYear: '2026' }
  ];
  assert.deepEqual(uniqueCropYears(cycles), ['2026-2027', '2025-2026']);
  assert.equal(canonicalStoredCropYear('2026'), '');
  assert.deepEqual(cycles.map(cycle => cycle.id), ['C1', 'C2', 'C3', 'C4', 'C5']);
});
