'use strict';

const AREA_EPSILON = 0.0001;

function areaError(message, data = {}) {
  const error = new Error(message);
  error.status = 409;
  error.data = data;
  return error;
}

function activeAllocatedArea(fields = [], excludedFieldId = null) {
  return Number(fields
    .filter(field => String(field?.status || 'ACTIVE').toUpperCase() === 'ACTIVE')
    .filter(field => !excludedFieldId || String(field?.id || '') !== String(excludedFieldId))
    .reduce((sum, field) => {
      const area = Number(field?.areaHa ?? field?.ha ?? 0);
      return sum + (Number.isFinite(area) && area > 0 ? area : 0);
    }, 0)
    .toFixed(4));
}

function assertFieldFitsBlockFarm({ declaredAreaHa, fields = [], requestedAreaHa, excludedFieldId = null, blockFarmId = null }) {
  const declared = Number(declaredAreaHa);
  const requested = Number(requestedAreaHa);
  // Older imported records may not have a declaration. New and edited Block Farms always do.
  if (!Number.isFinite(declared)) return;
  const allocatedAreaHa = activeAllocatedArea(fields, excludedFieldId);
  const remainingAreaHa = Number(Math.max(0, declared - allocatedAreaHa).toFixed(4));
  if (requested - remainingAreaHa > AREA_EPSILON) {
    throw areaError(
      `Field area exceeds the Block Farm's remaining declared area (${remainingAreaHa.toFixed(2)} ha available).`,
      {
        code: 'BLOCK_FARM_AREA_EXCEEDED',
        blockFarmId,
        declaredAreaHa: declared,
        allocatedAreaHa,
        remainingAreaHa,
        requestedAreaHa: requested
      }
    );
  }
}

function assertOperationFitsField(operationAreaHa, fieldAreaHa, fieldId = null) {
  const operationArea = Number(operationAreaHa);
  const fieldArea = Number(fieldAreaHa);
  // Preserve compatibility with incomplete legacy fields; current field writes always include areaHa.
  if (!Number.isFinite(fieldArea) || fieldArea <= 0) return;
  if (operationArea - fieldArea > AREA_EPSILON) {
    throw areaError(
      `Operation area cannot exceed the field's registered area (${fieldArea.toFixed(2)} ha).`,
      {
        code: 'FIELD_OPERATION_AREA_EXCEEDED',
        fieldId,
        fieldAreaHa: fieldArea,
        requestedAreaHa: operationArea
      }
    );
  }
}

function assertDeclaredAreaCoversFields({ declaredAreaHa, fields = [], blockFarmId = null }) {
  const declared = Number(declaredAreaHa);
  const allocatedAreaHa = activeAllocatedArea(fields);
  if (Number.isFinite(declared) && allocatedAreaHa - declared > AREA_EPSILON) {
    throw areaError(
      `Declared Block Farm area cannot be less than its active fields (${allocatedAreaHa.toFixed(2)} ha allocated).`,
      {
        code: 'BLOCK_FARM_DECLARED_AREA_TOO_SMALL',
        blockFarmId,
        declaredAreaHa: declared,
        allocatedAreaHa
      }
    );
  }
}

module.exports = {
  AREA_EPSILON,
  activeAllocatedArea,
  assertDeclaredAreaCoversFields,
  assertFieldFitsBlockFarm,
  assertOperationFitsField
};
