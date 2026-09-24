'use strict';

const { sortCropYearsNewestFirst } = require('./recordOrdering');
const { normalizeCropYear } = require('../schema/firestoreSchema');

function canonicalStoredCropYear(value) {
  if (value == null || value === '') return null;
  const normalized = normalizeCropYear(value);
  return /^\d{4}-\d{4}$/.test(normalized) ? normalized : null;
}

function summarizeCropYearCycles(documents = [], fieldDocuments = []) {
  const records = documents.map(document => (
    typeof document?.data === 'function'
      ? { id: document.id, ...document.data() }
      : document
  ));
  const fields = fieldDocuments.map(document => (
    typeof document?.data === 'function'
      ? { id: document.id, ...document.data() }
      : document
  ));
  const fieldYearByCycleId = new Map(fields
    .filter(field => field?.currentCycleId)
    .map(field => [String(field.currentCycleId), field.cropYear]));
  const activeRecords = records.filter(record => String(record?.status || '').toUpperCase() === 'ACTIVE');
  const archivedRecords = records.filter(record => String(record?.status || '').toUpperCase() === 'ARCHIVED');
  const activeCropYears = Array.from(new Set(
    sortCropYearsNewestFirst(activeRecords)
      .map(record => canonicalStoredCropYear(record.cropYear || fieldYearByCycleId.get(String(record.id))))
      .filter(Boolean)
  ));

  return {
    cropCycles: records.length,
    activeCropCycles: activeRecords.length,
    archivedCropCycles: archivedRecords.length,
    activeCropYears
  };
}

module.exports = { canonicalStoredCropYear, summarizeCropYearCycles };
