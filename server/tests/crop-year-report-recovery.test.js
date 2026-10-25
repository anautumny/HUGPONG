'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { correctionDocuments } = require('../scripts/repairResetCropYear');
const { createAuditHash } = require('../schema/firestoreSchema');

function fixture() {
  const snapshot = { operationLogId: 'OP-1', fieldId: 'FLD-1', cycleId: 'CYC-2', cropYearCycle: '2027-2028', performedOn: '2026-10-15', totalCost: 4135, areaHa: 4 };
  const report = { id: 'AUD-BF1-2026-10-V2', rootReportId: 'AUD-BF1-2026-10', reportVersion: 2, blockFarmId: 'BF-1', periodKey: '2026-10', status: 'PENDING_REVIEW',
    compiledByUserId: 'MANAGER', compiledAt: '2026-10-16T00:00:00.000Z', integrityHash: 'ORIGINAL-HASH', qrHash: 'ORIGINAL-HASH',
    operationSnapshots: [snapshot], sourceLogIds: ['OP-1'], operationCount: 1, fieldCount: 1, memberCount: 1, totalCost: 4135, hectaresAudited: 4,
    fieldSnapshots: [{ fieldId: 'FLD-1', memberId: 'MEM-1', cycleId: 'CYC-2', cropYearCycle: '2027-2028', areaHa: 4, operationLogIds: ['OP-1'] }],
  };
  return { report, reports: [report], field: { id: 'FLD-1', currentCycleId: 'CYC-1' },
    fromCycle: { id: 'CYC-2', fieldId: 'FLD-1', cropYear: '2027-2028', status: 'ARCHIVED', archivedReason: 'CROP_YEAR_RESET' },
    toCycle: { id: 'CYC-1', fieldId: 'FLD-1', cropYear: '2026-2027', status: 'ACTIVE' },
    operations: [{ ...snapshot, id: 'OP-1', status: 'ARCHIVED', archivedReason: 'CROP_YEAR_RESET' }], now: '2026-10-24T00:00:00.000Z' };
}

test('recovery preserves original snapshots and reissues a separate report requiring manager delivery', () => {
  const input = fixture();
  const before = structuredClone(input);
  const { newReport, returnUpdate, affectedIds } = correctionDocuments(input);
  assert.deepEqual(input, before);
  assert.equal(newReport.id, 'AUD-BF1-2026-10-V3');
  assert.equal(newReport.status, 'COMPILED');
  assert.equal(newReport.deliveryMethod, null);
  assert.equal(newReport.cropYearCycle, '2026-2027');
  assert.equal(newReport.operationSnapshots[0].cycleId, 'CYC-1');
  assert.equal(newReport.integrityHash, createAuditHash(newReport.id, 'BF-1', '2026-10', newReport.operationSnapshots));
  assert.notEqual(newReport.integrityHash, input.report.integrityHash);
  assert.equal(returnUpdate.status, 'RETURNED');
  assert.equal(returnUpdate.supersededByCorrectionId, newReport.id);
  assert.deepEqual(affectedIds, ['OP-1']);
  assert.equal(newReport.totalCost, 4135);
});

test('recovery refuses certified history, undocumented cycles, changed work and overlapping reports', () => {
  for (const mutate of [
    value => { value.report.status = 'CERTIFIED'; },
    value => { value.fromCycle.archivedReason = 'CYCLE_COMPLETED'; },
    value => { value.field.currentCycleId = 'OTHER-CYCLE'; },
    value => { value.operations[0].totalCost = 999; },
    value => { value.reports.push({ id: 'OTHER-REPORT', status: 'CERTIFIED', operationSnapshots: value.report.operationSnapshots }); },
  ]) {
    const input = fixture(); mutate(input);
    assert.throws(() => correctionDocuments(input));
  }
});
