'use strict';

// Repairs only a pending report whose source was explicitly retired by the
// existing CROP_YEAR_RESET recovery. Original reports and their hashes survive.
const { isDeepStrictEqual } = require('node:util');
const { COLLECTIONS, buildOperationSnapshot, createAuditHash, nowIso } = require('../schema/firestoreSchema');
const { AUDIT_STATUS, canonicalAuditStatus, auditCropYearCycles, versionedAuditReportId, validateCanonicalAuditReport } = require('../domain/auditWorkflow');
const { auditReportLayout } = require('../domain/auditReportLayout');
const { queueAuditEvent } = require('../services/auditWriter');
const ACTOR = 'SYSTEM_CROP_YEAR_CORRECTION';
const operationId = value => value.operationLogId || value.id;

function correctionDocuments({ report, reports, field, fromCycle, toCycle, operations, now }) {
  if (![AUDIT_STATUS.PENDING_REVIEW, AUDIT_STATUS.COMPILED, AUDIT_STATUS.RETURNED].includes(canonicalAuditStatus(report.status))) {
    throw new Error('Only an uncertified report can be reissued by this recovery.');
  }
  const period = report.periodKey || report.period;
  if (fromCycle.archivedReason !== 'CROP_YEAR_RESET' || fromCycle.status !== 'ARCHIVED'
    || toCycle.status !== 'ACTIVE' || field.currentCycleId !== toCycle.id
    || fromCycle.fieldId !== field.id || toCycle.fieldId !== field.id
    || Number(fromCycle.cropYear.slice(0, 4)) !== Number(toCycle.cropYear.slice(0, 4)) + 1
    || Number(toCycle.cropYear.slice(0, 4)) !== Number(period.slice(0, 4))) {
    throw new Error('The source must be a retired premature cycle with a restored current-year predecessor.');
  }
  const affected = operations.filter(operation => operation.cycleId === fromCycle.id);
  if (!affected.length || affected.some(operation => operation.fieldId !== field.id
    || operation.archivedReason !== 'CROP_YEAR_RESET'
    || operation.status !== 'ARCHIVED'
    || operation.cropYearCycle !== fromCycle.cropYear
    || Number(String(operation.performedOn).slice(0, 4)) >= Number(fromCycle.cropYear.slice(0, 4)))) {
    throw new Error('The operation records do not match the documented premature-cycle reset.');
  }
  const affectedIds = new Set(affected.map(operationId));
  if (reports.some(other => other.id !== report.id && canonicalAuditStatus(other.status) !== AUDIT_STATUS.RETURNED
    && (other.operationSnapshots || []).some(operation => affectedIds.has(operationId(operation))))) {
    throw new Error('Another non-returned report already covers these operations; no records were changed.');
  }
  const byId = new Map(operations.map(operation => [operationId(operation), operation]));
  const snapshots = (report.operationSnapshots || []).map(snapshot => {
    const original = byId.get(operationId(snapshot));
    const liveSnapshot = original && buildOperationSnapshot(operationId(snapshot), original);
    if (!original || Object.entries(snapshot).some(([key, value]) =>
      !['id', 'operationLogId', 'createdAt', 'updatedAt'].includes(key) && !isDeepStrictEqual(value, liveSnapshot[key]))) {
      throw new Error('A source record changed after compilation. Use the normal review workflow.');
    }
    return affectedIds.has(operationId(snapshot)) ? { ...snapshot, cycleId: toCycle.id, cropYearCycle: toCycle.cropYear } : snapshot;
  });
  const version = Math.max(...reports.filter(other => (other.periodKey || other.period) === period).map(other => Number(other.reportVersion) || 1), Number(report.reportVersion) || 1) + 1;
  const id = versionedAuditReportId(report.blockFarmId, period, version);
  const cropYears = auditCropYearCycles({}, snapshots);
  const integrityHash = createAuditHash(id, report.blockFarmId, period, snapshots);
  const newReport = {
    ...report, id, reportId: id, reportVersion: version, previousVersionId: report.id,
    correctionOfReportId: report.id, correctedByUserId: ACTOR, correctedAt: now,
    cropYearCycle: cropYears.length === 1 ? cropYears[0] : null, cropYearCycles: cropYears,
    continuationCropYearCycle: null, reportingCalendarYears: auditReportLayout({ periodKey: period, operationSnapshots: snapshots }).years,
    operationSnapshots: snapshots,
    fieldSnapshots: (report.fieldSnapshots || []).map(snapshot => snapshot.fieldId === field.id
      ? { ...snapshot, cycleId: toCycle.id, cropYearCycle: toCycle.cropYear } : snapshot),
    status: AUDIT_STATUS.COMPILED, reviewStatus: 'not_submitted', certificationStatus: 'not_certified',
    integrityHash, qrHash: integrityHash, integrityAlgorithm: 'SHA-256',
    deliveryMethod: null, deliveryStatus: 'ready', deliverySelectedAt: null, deliverySelectedByUserId: null,
    submittedAt: null, submittedByUserId: null, submissionMethod: null, submissionMethods: [],
    importedAt: null, importedByUserId: null, receivedAt: null, receivedByUserId: null,
    returnReason: '', returnedByUserId: null, returnedAt: null,
    certificationNotes: '', certifiedByUserId: null, certifiedByName: '', certifiedAt: null,
    createdAt: now, updatedAt: now,
  };
  validateCanonicalAuditReport(newReport);
  return { newReport, affectedIds: [...affectedIds], returnUpdate: {
    status: AUDIT_STATUS.RETURNED, reviewStatus: 'returned', certificationStatus: 'not_certified',
    returnReason: `Premature crop-year assignment corrected in ${id}. Original snapshot retained.`,
    returnedByUserId: ACTOR, returnedByName: 'Crop year recovery', returnedAt: now, updatedAt: now,
    supersededByCorrectionId: id,
  } };
}

async function repairResetCropYear(database, reportId, { execute = false, now = nowIso() } = {}) {
  return database.runTransaction(async transaction => {
    const reportRef = database.collection(COLLECTIONS.AUDIT_REPORTS).doc(reportId);
    const reportSnapshot = await transaction.get(reportRef);
    if (!reportSnapshot.exists) throw new Error('Report not found.');
    const report = { ...reportSnapshot.data(), id: reportId };
    if (report.supersededByCorrectionId) return { replayed: true, reportId: report.supersededByCorrectionId };
    const snapshots = report.operationSnapshots || [];
    const sources = await Promise.all(snapshots.map(snapshot => transaction.get(database.collection(COLLECTIONS.OPERATION_LOGS).doc(operationId(snapshot)))));
    const operations = sources.map(snapshot => ({ ...snapshot.data(), id: snapshot.id }));
    const candidates = operations.filter(operation => operation.archivedReason === 'CROP_YEAR_RESET');
    if (!candidates.length || new Set(candidates.map(operation => operation.fieldId)).size !== 1 || new Set(candidates.map(operation => operation.cycleId)).size !== 1) {
      throw new Error('Select a report containing one documented premature-cycle reset.');
    }
    const fieldSnapshot = await transaction.get(database.collection(COLLECTIONS.FIELDS).doc(candidates[0].fieldId));
    const field = { ...fieldSnapshot.data(), id: fieldSnapshot.id };
    const fromRef = database.collection(COLLECTIONS.CROP_CYCLES).doc(candidates[0].cycleId);
    const toRef = database.collection(COLLECTIONS.CROP_CYCLES).doc(field.currentCycleId);
    const [from, to, farmReports] = await Promise.all([
      transaction.get(fromRef), transaction.get(toRef),
      transaction.get(database.collection(COLLECTIONS.AUDIT_REPORTS).where('blockFarmId', '==', report.blockFarmId)),
    ]);
    const reports = farmReports.docs.map(snapshot => ({ ...snapshot.data(), id: snapshot.id }));
    const documents = correctionDocuments({ report, reports, field, fromCycle: { ...from.data(), id: from.id }, toCycle: { ...to.data(), id: to.id }, operations, now });
    const nextRef = database.collection(COLLECTIONS.AUDIT_REPORTS).doc(documents.newReport.id);
    if ((await transaction.get(nextRef)).exists) throw new Error('The replacement report already exists.');
    const plan = { originalReportId: reportId, replacementReportId: documents.newReport.id, fromCropYear: from.data().cropYear, toCropYear: to.data().cropYear, operationIds: documents.affectedIds, status: 'COMPILED — manager must review and choose delivery', execute };
    if (!execute) return plan;
    const backup = { type: 'CROP_YEAR_REPORT_CORRECTION', createdAt: now, createdBy: ACTOR,
      before: { report, operations }, replacementReportId: documents.newReport.id };
    if (Buffer.byteLength(JSON.stringify(backup), 'utf8') > 850000) throw new Error('Recovery snapshot is too large.');
    transaction.create(database.collection(COLLECTIONS.SYSTEM_METADATA).doc(`crop-year-report-correction-${reportId}`), backup);
    for (const operation of operations.filter(operation => documents.affectedIds.includes(operation.id))) {
      transaction.update(database.collection(COLLECTIONS.OPERATION_LOGS).doc(operation.id), {
        cycleId: to.id, cropYearCycle: to.data().cropYear, archivedReason: 'CROP_YEAR_CORRECTED',
        cropYearCorrection: { previousCycleId: from.id, previousCropYear: from.data().cropYear, correctedAt: now, correctedByUserId: ACTOR }, updatedAt: now,
      });
    }
    transaction.update(reportRef, documents.returnUpdate);
    const { id, reportId: alias, ...record } = documents.newReport;
    transaction.create(nextRef, record);
    queueAuditEvent(transaction, database, { eventType: 'AUDIT_CROP_YEAR_CORRECTED', actorUserId: ACTOR, entityType: 'AUDIT_REPORT', entityId: id,
      blockFarmId: report.blockFarmId, details: `Reissued ${reportId} as ${id}, correcting ${from.data().cropYear} to ${to.data().cropYear}. Certified history was preserved.`, createdAt: now });
    return plan;
  });
}

if (require.main === module) {
  const arg = name => (process.argv.find(value => value.startsWith(`--${name}=`)) || '').slice(name.length + 3);
  const { db, admin } = require('../firebase-admin');
  const project = admin.app().options.projectId;
  const execute = process.argv.includes('--execute');
  Promise.resolve().then(() => {
    if (!arg('report')) throw new Error('--report is required.');
    if (execute && arg('expected-project') !== project) throw new Error('--expected-project must match the configured Firebase project.');
    return repairResetCropYear(db, arg('report'), { execute });
  }).then(plan => { console.log(JSON.stringify({ project, ...plan }, null, 2)); process.exit(0); })
    .catch(error => { console.error(error.message); process.exit(1); });
}

module.exports = { correctionDocuments, repairResetCropYear };
