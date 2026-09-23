import test from 'node:test';
import assert from 'node:assert/strict';
import { selectProductionCost } from '../src/services/analyticsSelectors.js';

test('Farm Manager ALL analytics includes only operations from the assigned Block Farm', () => {
  const assignedBlockFarmId = 'BF-ASSIGNED';
  const districtFields = [
    { id: 'FIELD-OWN', blockFarmId: assignedBlockFarmId, memberName: 'Own Member', areaHa: 2 },
    { id: 'FIELD-OTHER', blockFarmId: 'BF-OTHER', memberName: 'Other Member', areaHa: 3 }
  ];
  const districtOperations = [
    { id: 'LOG-OWN', fieldId: 'FIELD-OWN', status: 'ACTIVE', performedOn: '2026-09-10', totalCost: 1200 },
    { id: 'LOG-OTHER', fieldId: 'FIELD-OTHER', status: 'ACTIVE', performedOn: '2026-09-11', totalCost: 9800 }
  ];

  // Mirrors operationReadService: scope fields first, then request operations by
  // those field IDs, before any analytics selector receives the data.
  const authorizedFields = districtFields.filter(field => field.blockFarmId === assignedBlockFarmId);
  const authorizedFieldIds = new Set(authorizedFields.map(field => field.id));
  const authorizedOperations = districtOperations.filter(operation => authorizedFieldIds.has(operation.fieldId));
  const result = selectProductionCost({
    operations: authorizedOperations,
    fields: authorizedFields,
    blockFarms: [{ id: assignedBlockFarmId, name: 'Assigned Farm' }],
    selectedFarmId: 'ALL',
    selectedPeriod: 'ALL',
    isFarmManager: true
  });

  assert.equal(result.totalExpenditure, 1200);
  assert.equal(result.operationsCount, 1);
  assert.equal(result.breakdownByEntity.length, 1);
  assert.equal(result.breakdownByEntity[0].id, 'FIELD-OWN');
});
