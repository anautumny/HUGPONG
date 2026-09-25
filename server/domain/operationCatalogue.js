'use strict';

const SRA_OPERATIONS_CATALOGUE = Object.freeze([
  { id: 'SRA-01', stageNumber: 1, name: 'Soil Sampling', category: 'prep' },
  { id: 'SRA-02', stageNumber: 1, name: 'Land Preparation', category: 'prep' },
  { id: 'SRA-03', stageNumber: 2, name: 'Cost of Planting Material (Seedcane acquisition)', category: 'plant' },
  { id: 'SRA-04', stageNumber: 2, name: 'Planting Operations (Labor & Handling)', category: 'plant' },
  { id: 'SRA-05', stageNumber: 3, name: 'Basal Fertilizer Application (Labor & Materials)', category: 'fert' },
  { id: 'SRA-06', stageNumber: 3, name: 'Lime Application (Soil Amending)', category: 'fert' },
  { id: 'SRA-07', stageNumber: 4, name: 'Cultivation (Off-barring & On-barring)', category: 'weed' },
  { id: 'SRA-08', stageNumber: 4, name: 'Weeding Operations (Hilamon & Herbicides)', category: 'weed' },
  { id: 'SRA-09', stageNumber: 5, name: 'Top-Dress / 2nd Dose Fertilization', category: 'fert' },
  { id: 'SRA-10', stageNumber: 5, name: 'Final Hilling-up (Pasungkal)', category: 'weed' },
  { id: 'SRA-11', stageNumber: 6, name: 'Cutting and Loading Operations', category: 'harvest' },
  { id: 'SRA-12', stageNumber: 6, name: 'Hauling (Trucking to Mill)', category: 'harvest' },
  { id: 'SRA-13', stageNumber: 6, name: 'Bull Cart / In-field Transport', category: 'harvest' },
  { id: 'SRA-14', stageNumber: 6, name: 'Drainage & Post-Harvest Field Clearing', category: 'prep' }
].map(Object.freeze));

const OPERATION_BY_ID = new Map(SRA_OPERATIONS_CATALOGUE.map(operation => [operation.id, operation]));

function getOperationsForStage(stageNumber) {
  return SRA_OPERATIONS_CATALOGUE.filter(operation => operation.stageNumber === Number(stageNumber));
}

function getOperationDefinition(operationDefinitionId) {
  return OPERATION_BY_ID.get(String(operationDefinitionId || '').trim().toUpperCase()) || null;
}

module.exports = { SRA_OPERATIONS_CATALOGUE, getOperationsForStage, getOperationDefinition };
