'use strict';

const { createFieldId } = require('../domain/systemIds');
const { createCycleId, cropYearParts, finiteNumber } = require('../schema/firestoreSchema');
const { CROP_STAGE_MIN } = require('../domain/cropStages');

// Match ordinary field enrollment: the API owns IDs, crop year, and initial stage.
function approvalFieldAssignment(input, blockFarmId, memberUserId, now) {
  const areaHa = finiteNumber(input.fieldAreaHa, 'fieldAreaHa', { min: 0.01, max: 500 });
  const fieldId = createFieldId();
  const cycleId = createCycleId(fieldId, 1);
  const annual = cropYearParts(null, now);
  return {
    field: {
      id: fieldId, blockFarmId, memberUserId, areaHa, cropYear: annual.cropYear,
      currentCycleId: cycleId, status: 'ACTIVE', customStages: [], customOperations: {},
      operationSchedule: [], createdAt: now, updatedAt: now, archivedAt: null
    },
    cycle: {
      id: cycleId, fieldId, blockFarmId, farmMemberId: memberUserId, sequenceNumber: 1,
      cropType: null, variety: '', ...annual, currentStageNumber: CROP_STAGE_MIN,
      elapsedMonths: 0, batchNumber: 1, status: 'ACTIVE', startedAt: now, updatedAt: now,
      archivedAt: null, archivedByUserId: null, completedAt: null
    }
  };
}

module.exports = { approvalFieldAssignment };
