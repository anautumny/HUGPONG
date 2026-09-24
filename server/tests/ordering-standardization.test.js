'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  timestampMillis,
  sortNewestFirst,
  sortOperationsNewestFirst,
  sortCropYearsNewestFirst
} = require('../services/recordOrdering');
const { cropYearCycleForDate, normalizeCropYear } = require('../schema/firestoreSchema');
const { summarizeCropYearCycles } = require('../services/systemDiagnosticsService');
const { canonicalCropYear, eventTimeCropYear, enrichAuditEventsWithCropYears } = require('../services/auditCropYearContext');

test('chronological records sort newest first with deterministic IDs', () => {
  const records = [
    { id: 'B', createdAt: '2026-09-20T08:00:00.000Z' },
    { id: 'C', createdAt: '2026-09-23T08:00:00.000Z' },
    { id: 'A', createdAt: '2026-09-23T08:00:00.000Z' },
    { id: 'Z', createdAt: null }
  ];
  assert.deepEqual(sortNewestFirst(records).map(record => record.id), ['A', 'C', 'B', 'Z']);
  assert.deepEqual(records.map(record => record.id), ['B', 'C', 'A', 'Z'], 'source arrays are not mutated');
});

test('timestamp normalization supports Firestore timestamps, Dates, ISO strings, and numbers', () => {
  const expected = Date.parse('2026-09-23T10:30:00.000Z');
  assert.equal(timestampMillis({ toMillis: () => expected }), expected);
  assert.equal(timestampMillis({ seconds: expected / 1000, nanoseconds: 0 }), expected);
  assert.equal(timestampMillis(new Date(expected)), expected);
  assert.equal(timestampMillis('2026-09-23T10:30:00.000Z'), expected);
  assert.equal(timestampMillis(expected), expected);
  assert.equal(timestampMillis('not-a-date'), null);
});

test('operation history uses performed date and local creation time for same-day offline placement', () => {
  const records = [
    { id: 'SYNCED', performedOn: '2026-09-23', createdAt: '2026-09-23T10:00:00.000Z' },
    { id: 'OFFLINE', performedOn: '2026-09-23', localCreatedAt: '2026-09-23T10:30:00.000Z' },
    { id: 'OLDER', performedOn: '2026-09-22', createdAt: '2026-09-23T11:00:00.000Z' }
  ];
  assert.deepEqual(sortOperationsNewestFirst(records).map(record => record.id), ['OFFLINE', 'SYNCED', 'OLDER']);
});

test('Crop Year Cycle history orders newest annual cycle first', () => {
  const records = [
    { id: 'C1', cropYear: '2025-2026' },
    { id: 'C3', cropYear: '2027-2028' },
    { id: 'C2', cropYear: '2026-2027' }
  ];
  assert.deepEqual(sortCropYearsNewestFirst(records).map(record => record.id), ['C3', 'C2', 'C1']);
});

test('domain lists use their semantic timestamp before global pagination', () => {
  const notifications = sortNewestFirst([
    { id: 'N1', sentAt: '2026-09-20T08:00:00.000Z' },
    { id: 'N3', sentAt: '2026-09-23T08:00:00.000Z' },
    { id: 'N2', sentAt: '2026-09-21T08:00:00.000Z' }
  ], ['sentAt', 'createdAt']);
  const auditEvents = sortNewestFirst([
    { id: 'A1', verifiedAt: '2026-09-20T08:00:00.000Z' },
    { id: 'A2', verifiedAt: '2026-09-23T08:00:00.000Z' }
  ], ['verifiedAt', 'createdAt']);
  const prices = sortNewestFirst([
    { id: 'P-LATE-UPLOAD', effectiveDate: '2026-09-20', createdAt: '2026-09-24T08:00:00.000Z' },
    { id: 'P-NEW-EFFECTIVE', effectiveDate: '2026-09-23', createdAt: '2026-09-23T08:00:00.000Z' }
  ], ['effectiveDate']);

  assert.deepEqual(notifications.slice(0, 2).map(record => record.id), ['N3', 'N2']);
  assert.deepEqual(auditEvents.map(record => record.id), ['A2', 'A1']);
  assert.deepEqual(prices.map(record => record.id), ['P-NEW-EFFECTIVE', 'P-LATE-UPLOAD']);
});

test('server date deterministically generates the new Crop Year Cycle', () => {
  for (const year of [2025, 2026, 2027, 2030]) {
    const now = new Date(`${year}-01-15T00:00:00.000Z`);
    assert.equal(cropYearCycleForDate(now), `${year}-${year + 1}`);
    assert.equal(normalizeCropYear(null, now), `${year}-${year + 1}`);
  }
  assert.equal(cropYearCycleForDate('2026-12-31T16:30:00.000Z'), '2027-2028', 'the canonical year follows Philippine server time');
  assert.equal(normalizeCropYear('2026-2027', new Date('2030-01-01T00:00:00.000Z')), '2026-2027', 'stored history is normalized, not recalculated');
});

test('system diagnostics exposes stored active Crop Year Cycles instead of presenting the record count as a year', () => {
  const summary = summarizeCropYearCycles([
    { id: 'C1', status: 'ARCHIVED', cropYear: '2025-2026' },
    { id: 'C2', status: 'ACTIVE' },
    { id: 'C3', status: 'ACTIVE', cropYear: '2026/2027' }
  ], [
    { id: 'F1', currentCycleId: 'C2', cropYear: 'CY 2026–2027' }
  ]);

  assert.deepEqual(summary, {
    cropCycles: 3,
    activeCropCycles: 2,
    archivedCropCycles: 1,
    activeCropYears: ['2026-2027']
  });
});

test('audit Crop Year Cycle context normalizes stored values and falls back to the server event timestamp', () => {
  assert.equal(canonicalCropYear('CY 2026–2027'), '2026-2027');
  assert.equal(eventTimeCropYear('2027-01-15T08:00:00.000Z'), '2027-2028');
  assert.equal(eventTimeCropYear('invalid'), null);
});

test('audit events prefer immutable operation and report cycle context over event-time fallback', async () => {
  const records = new Map([
    ['operation_logs/LOG-1', { cycleId: 'CYCLE-1' }],
    ['audit_reports/RPT-1', { operationSnapshots: [{ cycleId: 'CYCLE-2' }] }],
    ['crop_cycles/CYCLE-1', { cropYear: '2025-2026' }],
    ['crop_cycles/CYCLE-2', { cropYear: '2026-2027' }]
  ]);
  const database = {
    collection: collectionName => ({
      doc: id => ({ collectionName, id })
    }),
    getAll: async (...references) => references.map(reference => {
      const value = records.get(`${reference.collectionName}/${reference.id}`);
      return { id: reference.id, exists: Boolean(value), data: () => value };
    })
  };

  const enriched = await enrichAuditEventsWithCropYears(database, [
    { id: 'A1', entityType: 'OPERATION_LOG', entityId: 'LOG-1', createdAt: '2030-01-01T00:00:00.000Z' },
    { id: 'A2', entityType: 'AUDIT_REPORT', entityId: 'RPT-1', createdAt: '2030-01-01T00:00:00.000Z' },
    { id: 'A3', entityType: 'USER', entityId: 'U1', createdAt: '2027-01-01T00:00:00.000Z' }
  ]);

  assert.deepEqual(enriched.map(event => event.cropYears), [
    ['2025-2026'],
    ['2026-2027'],
    ['2027-2028']
  ]);
});
