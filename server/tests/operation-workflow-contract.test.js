'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildOperationLog } = require('../schema/firestoreSchema');
const { getOperationDefinition, getSelectableOperationsForStage } = require('../domain/operationCatalogue');
const { OPERATION_UNITS, canonicalOperationUnit } = require('../domain/operationUnits');
const { normalizeCustomOperationsPlan } = require('../domain/operationPlan');

function baseOperation(overrides = {}) {
  return {
    fieldId: 'FLD-001',
    cycleId: 'CYC-FLD001-001',
    submittedByUserId: '04000001',
    submissionSource: 'FIELD_OWNER',
    operationDefinitionId: 'SRA-02',
    parentOperationDefinitionId: null,
    childOperationDefinitionId: null,
    childOperationName: '',
    operationName: 'Land Preparation',
    category: 'prep',
    stageNumber: 1,
    performedOn: '2026-09-26',
    areaHa: 1,
    peopleCount: 2,
    quantity: { value: 1, unit: 'ha', inputName: '1st Round' },
    baseCost: 2000,
    totalCost: 2500,
    lineItems: [],
    laborEntries: [{ laborEntryId: 'LAB-1', workerCount: 2, days: 0.5, rate: 500, subtotal: 500 }],
    ...overrides
  };
}

test('weeding is selectable once and legacy round IDs remain readable only for compatibility', () => {
  const selectable = getSelectableOperationsForStage(4);
  assert.deepEqual(selectable.filter(item => item.id === 'SRA-08').map(item => item.id), ['SRA-08']);
  assert.equal(getOperationDefinition('SRA-08').childOperations, undefined);
  assert.equal(getOperationDefinition('SRA-08-2').name, 'Manual Weeding (2nd Round)');
  assert.equal(getOperationDefinition('SRA-08-2').parentOperationDefinitionId, 'SRA-08');
});

test('an itemized row is one record under the unchanged parent operation title', () => {
  const log = buildOperationLog(baseOperation({
    operationDefinitionId: 'SRA-08',
    childOperationDefinitionId: 'SI-08-1',
    childOperationName: 'Manual Weeding (1st Round)',
    operationName: 'Weeding Operations (Hilamon & Herbicides)',
    category: 'weed',
    stageNumber: 4,
    peopleCount: 2,
    quantity: null,
    baseCost: 0,
    totalCost: 2500,
    lineItems: [{
      lineItemId: 'SI-08-1',
      itemType: 'EXPENSE',
      description: 'Manual Weeding (1st Round)',
      quantity: 1,
      unit: 'ha',
      unitCost: 2000,
      subtotal: 2000
    }],
    laborEntries: [{ laborEntryId: 'LAB-ATTACHED', workerCount: 2, days: 0.5, rate: 500, subtotal: 500 }]
  }));

  assert.equal(log.operationDefinitionId, 'SRA-08');
  assert.equal(log.operationName, 'Weeding Operations (Hilamon & Herbicides)');
  assert.equal(log.childOperationDefinitionId, 'SI-08-1');
  assert.equal(log.lineItems.length, 1);
  assert.equal(log.laborEntries.length, 1);
  assert.equal(log.peopleCount, 2);
  assert.equal(log.totalCost, 2500);
  assert.equal(log.baseCost, 0);
});

test('individual worker costs are included exactly once in the operation total', () => {
  const log = buildOperationLog(baseOperation());
  assert.equal(log.peopleCount, 2);
  assert.equal(log.baseCost, 2000);
  assert.equal(log.laborEntries[0].subtotal, 500);
  assert.equal(log.totalCost, 2500);

  assert.throws(
    () => buildOperationLog(baseOperation({ totalCost: 3000 })),
    /baseCost plus expense and worker subtotals/
  );
});

test('operation units use one standardized list while normalizing legacy spellings', () => {
  assert.deepEqual(OPERATION_UNITS, ['ha', 'm²', 'bag', 'kg', 'L', 'ton', 'lac', 'pass', 'day', 'worker', 'trip']);
  assert.equal(canonicalOperationUnit('bags'), 'bag');
  assert.equal(canonicalOperationUnit('liters'), 'L');
  assert.equal(canonicalOperationUnit('sqm'), 'm²');
});

test('server normalizes the itemized planner operation under one parent title', () => {
  const plan = normalizeCustomOperationsPlan({
    4: [{
      id: 'SRA-08',
      name: 'ignored client label',
      inputType: 'group',
      isGroup: true,
      unit: 'ha',
      subItems: [
        { id: 'SI-08-1', description: 'Manual Weeding (1st Round)', qty: 1, unit: 'ha', unitCost: 2000 },
        { id: 'SI-08-2', description: 'Manual Weeding (2nd Round)', qty: 1, unit: 'ha', unitCost: 2000 }
      ]
    }]
  });
  assert.equal(plan[4].length, 1);
  assert.equal(plan[4][0].id, 'SRA-08');
  assert.equal(plan[4][0].name, 'Weeding Operations (Hilamon & Herbicides)');
  assert.equal(plan[4][0].unit, 'ha');
  assert.equal(plan[4][0].parentOperationDefinitionId, null);
  assert.equal(plan[4][0].inputType, 'group');
  assert.deepEqual(plan[4][0].childOperations, []);
  assert.deepEqual(plan[4][0].subItems.map(item => item.id), ['SI-08-1', 'SI-08-2']);

  const legacyPlan = normalizeCustomOperationsPlan({
    4: [
      { id: 'SRA-08-1', name: 'old first round', perHa: 1, unit: 'ha', rate: 2000 },
      { id: 'SRA-08-2', name: 'old second round', perHa: 1, unit: 'ha', rate: 2000 }
    ]
  });
  assert.equal(legacyPlan[4].length, 1);
  assert.equal(legacyPlan[4][0].inputType, 'group');
  assert.deepEqual(legacyPlan[4][0].subItems.map(item => item.id), ['SI-08-1', 'SI-08-2']);
});
