'use strict';

const { COLLECTIONS, cropYearCycleForDate, normalizeCropYear } = require('../schema/firestoreSchema');

function canonicalCropYear(value) {
  if (value == null || value === '') return null;
  const normalized = normalizeCropYear(value);
  return /^\d{4}-\d{4}$/.test(normalized) ? normalized : null;
}

function eventTimeCropYear(createdAt) {
  try {
    return cropYearCycleForDate(createdAt);
  } catch {
    return null;
  }
}

async function getRecordsById(database, collectionName, ids) {
  const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
  const records = new Map();
  for (let index = 0; index < uniqueIds.length; index += 100) {
    const references = uniqueIds.slice(index, index + 100)
      .map(id => database.collection(collectionName).doc(id));
    const documents = await database.getAll(...references);
    documents.filter(document => document.exists)
      .forEach(document => records.set(document.id, document.data()));
  }
  return records;
}

function explicitCropYears(event) {
  const values = [
    ...(Array.isArray(event?.cropYears) ? event.cropYears : []),
    event?.cropYear
  ];
  return Array.from(new Set(values.map(canonicalCropYear).filter(Boolean)))
    .sort((left, right) => right.localeCompare(left));
}

async function enrichAuditEventsWithCropYears(database, events = []) {
  const operationIds = events
    .filter(event => explicitCropYears(event).length === 0 && event.entityType === 'OPERATION_LOG')
    .map(event => event.entityId);
  const reportIds = events
    .filter(event => explicitCropYears(event).length === 0 && event.entityType === 'AUDIT_REPORT')
    .map(event => event.entityId);
  const [operationsById, reportsById] = await Promise.all([
    getRecordsById(database, COLLECTIONS.OPERATION_LOGS, operationIds),
    getRecordsById(database, COLLECTIONS.AUDIT_REPORTS, reportIds)
  ]);

  const cycleIds = [];
  operationsById.forEach(operation => cycleIds.push(operation.cycleId));
  reportsById.forEach(report => {
    (report.operationSnapshots || []).forEach(snapshot => cycleIds.push(snapshot.cycleId));
  });
  const cyclesById = await getRecordsById(database, COLLECTIONS.CROP_CYCLES, cycleIds);

  return events.map(event => {
    let cropYears = explicitCropYears(event);
    if (cropYears.length === 0 && event.entityType === 'OPERATION_LOG') {
      const operation = operationsById.get(event.entityId);
      const cropYear = canonicalCropYear(cyclesById.get(operation?.cycleId)?.cropYear);
      if (cropYear) cropYears = [cropYear];
    }
    if (cropYears.length === 0 && event.entityType === 'AUDIT_REPORT') {
      const report = reportsById.get(event.entityId);
      cropYears = Array.from(new Set((report?.operationSnapshots || [])
        .map(snapshot => canonicalCropYear(cyclesById.get(snapshot.cycleId)?.cropYear))
        .filter(Boolean)))
        .sort((left, right) => right.localeCompare(left));
    }
    if (cropYears.length === 0) {
      const fallback = eventTimeCropYear(event.createdAt);
      if (fallback) cropYears = [fallback];
    }
    return { ...event, cropYears };
  });
}

module.exports = {
  canonicalCropYear,
  eventTimeCropYear,
  enrichAuditEventsWithCropYears
};
