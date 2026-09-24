'use strict';

const { db } = require('../firebase-admin');
const { COLLECTIONS } = require('../schema/firestoreSchema');

function canonicalStoredCropYear(value) {
  const match = String(value || '').trim().match(/^(\d{4})-(\d{4})$/);
  if (!match || Number(match[2]) !== Number(match[1]) + 1) return null;
  return `${match[1]}-${match[2]}`;
}

function buildCropYearIntegrityReport({ cycles = [], operations = [], fields = [] }) {
  const cyclesByFieldYear = new Map();
  const uniqueCropYears = new Set();

  cycles.forEach(cycle => {
    const cropYear = canonicalStoredCropYear(cycle.cropYear);
    if (!cropYear) return;
    uniqueCropYears.add(cropYear);
    const key = `${cycle.fieldId || ''}|${cropYear}`;
    cyclesByFieldYear.set(key, [...(cyclesByFieldYear.get(key) || []), cycle.id]);
  });

  const duplicateFieldYearCycles = Array.from(cyclesByFieldYear.entries())
    .filter(([, cycleIds]) => cycleIds.length > 1)
    .map(([key, cycleIds]) => {
      const [fieldId, cropYear] = key.split('|');
      return { fieldId, cropYear, cycleIds };
    });

  return {
    counts: {
      cropCycles: cycles.length,
      operationLogs: operations.length,
      fields: fields.length,
      uniqueCropYears: uniqueCropYears.size
    },
    uniqueCropYears: Array.from(uniqueCropYears).sort((left, right) => Number(right.slice(0, 4)) - Number(left.slice(0, 4))),
    cycleRecords: cycles.map(cycle => ({
      id: cycle.id,
      fieldId: cycle.fieldId || null,
      cropYear: cycle.cropYear ?? null,
      status: cycle.status || null,
      sequenceNumber: cycle.sequenceNumber ?? null
    })),
    fieldRecords: fields.map(field => ({
      id: field.id,
      currentCycleId: field.currentCycleId || null,
      cropYear: field.cropYear ?? null,
      status: field.status || null
    })),
    operationGroups: Array.from(operations.reduce((groups, operation) => {
      const key = JSON.stringify({
        cycleId: operation.cycleId || null,
        cropYearCycle: operation.cropYearCycle ?? null,
        status: operation.status || null
      });
      groups.set(key, (groups.get(key) || 0) + 1);
      return groups;
    }, new Map()).entries()).map(([key, count]) => ({ ...JSON.parse(key), count })),
    duplicateFieldYearCycles,
    invalidOrMissingCycleYears: cycles
      .filter(cycle => !canonicalStoredCropYear(cycle.cropYear))
      .map(cycle => ({
        id: cycle.id,
        fieldId: cycle.fieldId || null,
        cropYear: cycle.cropYear ?? null,
        aliases: {
          cropYearLabel: cycle.cropYearLabel ?? null,
          cropYearCycle: cycle.cropYearCycle ?? null,
          cycleYear: cycle.cycleYear ?? null
        }
      })),
    operationsMissingCycleId: operations
      .filter(operation => !String(operation.cycleId || '').trim())
      .map(operation => operation.id),
    operationsMissingCropYearCycle: operations
      .filter(operation => !canonicalStoredCropYear(operation.cropYearCycle))
      .map(operation => ({
        id: operation.id,
        cycleId: operation.cycleId || null,
        cropYearCycle: operation.cropYearCycle ?? null
      })),
    obsoleteAliases: {
      cycles: cycles
        .filter(cycle => cycle.cropYearLabel != null || cycle.cropYearCycle != null || cycle.cycleYear != null)
        .map(cycle => ({
          id: cycle.id,
          cropYearLabel: cycle.cropYearLabel ?? null,
          cropYearCycle: cycle.cropYearCycle ?? null,
          cycleYear: cycle.cycleYear ?? null
        })),
      operations: operations
        .filter(operation => operation.cropYear != null || operation.cropYearLabel != null || operation.cycleYear != null)
        .map(operation => ({
          id: operation.id,
          cropYear: operation.cropYear ?? null,
          cropYearLabel: operation.cropYearLabel ?? null,
          cycleYear: operation.cycleYear ?? null
        }))
    }
  };
}

async function readCollection(database, collectionName) {
  const snapshot = await database.collection(collectionName).get();
  return snapshot.docs.map(document => ({ id: document.id, ...document.data() }));
}

async function auditCropYearIntegrity(database = db) {
  if (!database) throw new Error('Database is unavailable.');
  const [cycles, operations, fields] = await Promise.all([
    readCollection(database, COLLECTIONS.CROP_CYCLES),
    readCollection(database, COLLECTIONS.OPERATION_LOGS),
    readCollection(database, COLLECTIONS.FIELDS)
  ]);
  return buildCropYearIntegrityReport({ cycles, operations, fields });
}

if (require.main === module) {
  auditCropYearIntegrity()
    .then(report => {
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
      process.exit(0);
    })
    .catch(error => {
      console.error(`[Crop Year Integrity Audit] ${error.message}`);
      process.exit(1);
    });
}

module.exports = {
  canonicalStoredCropYear,
  buildCropYearIntegrityReport,
  auditCropYearIntegrity
};
