'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildCropYearIntegrityReport,
  canonicalStoredCropYear
} = require('../scripts/auditCropYearIntegrity');

test('crop-year integrity audit distinguishes shared years, duplicate field cycles, and invalid records', () => {
  const report = buildCropYearIntegrityReport({
    fields: [{ id: 'FLD-1' }, { id: 'FLD-2' }],
    cycles: [
      { id: 'C1', fieldId: 'FLD-1', cropYear: '2026-2027' },
      { id: 'C2', fieldId: 'FLD-2', cropYear: '2026-2027' },
      { id: 'C3', fieldId: 'FLD-1', cropYear: '2026-2027' },
      { id: 'C4', fieldId: 'FLD-1', cropYear: null }
    ],
    operations: [
      { id: 'OP-1', cycleId: 'C1', cropYearCycle: '2026-2027' },
      { id: 'OP-2', cycleId: 'C4', cropYearCycle: null }
    ]
  });

  assert.deepEqual(report.uniqueCropYears, ['2026-2027']);
  assert.deepEqual(report.duplicateFieldYearCycles, [{
    fieldId: 'FLD-1', cropYear: '2026-2027', cycleIds: ['C1', 'C3']
  }]);
  assert.deepEqual(report.invalidOrMissingCycleYears.map(cycle => cycle.id), ['C4']);
  assert.deepEqual(report.operationsMissingCropYearCycle.map(operation => operation.id), ['OP-2']);
  assert.equal(canonicalStoredCropYear('2026'), null);
});
