'use strict';

const zlib = require('node:zlib');

const AUDIT_STATUS = Object.freeze({
  COMPILED: 'COMPILED',
  PENDING_SUBMISSION: 'PENDING_SUBMISSION',
  PENDING_REVIEW: 'PENDING_REVIEW',
  RETURNED: 'RETURNED',
  CERTIFIED: 'CERTIFIED'
});

const LEGACY_STATUS = Object.freeze({
  PENDING: AUDIT_STATUS.PENDING_REVIEW,
  SUBMITTED: AUDIT_STATUS.PENDING_REVIEW,
  VERIFIED: AUDIT_STATUS.PENDING_REVIEW
});

const QR_SCHEMA_VERSION = 3;
const QR_TYPE = 'HUGPONG_AUDIT_TRANSFER';
const QR_PART_TYPE = 'HUGPONG_AUDIT_PART';
const QR_SINGLE_MAX_LENGTH = 2200;
const AUDIT_DELIVERY_METHOD = Object.freeze({ CLOUD: 'CLOUD', QR: 'QR' });
const AUDIT_DELIVERY_STATUS = Object.freeze({ READY: 'READY', SUBMITTED: 'SUBMITTED', RECEIVED: 'RECEIVED' });
const BUSINESS_TIME_ZONE = 'Asia/Manila';

function canonicalAuditStatus(value) {
  const status = String(value || '').trim().toUpperCase().replace(/[\s-]+/g, '_');
  return LEGACY_STATUS[status] || (Object.values(AUDIT_STATUS).includes(status) ? status : null);
}

function businessPeriod(date = new Date()) {
  const value = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(value.getTime())) throw new Error('A valid date is required.');
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit'
  }).formatToParts(value);
  const year = parts.find(part => part.type === 'year')?.value;
  const month = parts.find(part => part.type === 'month')?.value;
  return `${year}-${month}`;
}

function normalizeFarmToken(blockFarmId) {
  return String(blockFarmId || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

function rootAuditReportId(blockFarmId, periodKey) {
  return `AUD-${normalizeFarmToken(blockFarmId)}-${periodKey}`;
}

function versionedAuditReportId(blockFarmId, periodKey, version = 1) {
  return `${rootAuditReportId(blockFarmId, periodKey)}-V${Number(version)}`;
}

function summarizeSnapshots(operationSnapshots = [], activeFields = []) {
  const fieldIds = new Set(operationSnapshots.map(item => item.fieldId).filter(Boolean));
  const fieldArea = new Map(activeFields.map(field => [field.id, Number(field.areaHa || field.ha || 0)]));
  const hectaresAudited = Array.from(fieldIds).reduce((sum, fieldId) => sum + Number(fieldArea.get(fieldId) || 0), 0);
  return {
    operationCount: operationSnapshots.length,
    fieldCount: fieldIds.size,
    hectaresAudited: Number(hectaresAudited.toFixed(4)),
    totalCost: Number(operationSnapshots.reduce((sum, item) => sum + Number(item.totalCost || 0), 0).toFixed(2))
  };
}

function buildFieldSnapshots(operationSnapshots = [], activeFields = []) {
  const fieldMap = new Map(activeFields.map(field => [String(field.id || '').trim(), field]));
  const grouped = new Map();
  operationSnapshots.forEach(operation => {
    const fieldId = String(operation.fieldId || '').trim();
    if (!fieldId) return;
    if (!grouped.has(fieldId)) grouped.set(fieldId, []);
    grouped.get(fieldId).push(operation);
  });
  return Array.from(grouped.entries()).sort(([left], [right]) => left.localeCompare(right)).map(([fieldId, operations]) => {
    const field = fieldMap.get(fieldId) || {};
    const memberId = field.memberUserId || field.memberId || null;
    const memberName = field.memberName || field.member || null;
    return {
      fieldId,
      memberId,
      memberName,
      areaHa: Number(field.areaHa || field.ha || operations[0]?.areaHa || 0),
      cropYearCycle: field.cropYearCycle || field.cropYear || operations[0]?.cropYearCycle || null,
      cycleId: field.currentCycleId || operations[0]?.cycleId || null,
      operationLogIds: operations.map(operationId),
      operationCount: operations.length,
      totalCost: Number(operations.reduce((sum, operation) => sum + Number(operation.totalCost || 0), 0).toFixed(2))
    };
  });
}

function canonicalAuditReport(report = {}) {
  const operationSnapshots = Array.isArray(report.operationSnapshots)
    ? report.operationSnapshots
    : (Array.isArray(report.operations) ? report.operations : []);
  const fieldSnapshots = Array.isArray(report.fieldSnapshots) && report.fieldSnapshots.length
    ? report.fieldSnapshots
    : buildFieldSnapshots(operationSnapshots, []);
  const sourceLogIds = Array.isArray(report.sourceLogIds) && report.sourceLogIds.length
    ? report.sourceLogIds.map(operationId)
    : operationSnapshots.map(operationId);
  return {
    reportId: report.id || report.reportId,
    schemaVersion: QR_SCHEMA_VERSION,
    rootReportId: report.rootReportId,
    reportVersion: Number(report.reportVersion || 1),
    blockFarmId: report.blockFarmId,
    blockFarmName: report.blockFarmName || report.blockFarm || report.blockFarmId,
    periodKey: report.periodKey || report.period,
    compiledByUserId: report.compiledByUserId,
    compiledByName: report.compiledByName || '',
    compiledAt: report.compiledAt,
    operationSnapshots,
    fieldSnapshots,
    sourceLogIds,
    operationCount: Number(report.operationCount || operationSnapshots.length),
    fieldCount: Number(report.fieldCount || fieldSnapshots.length),
    memberCount: Number(report.memberCount || new Set(fieldSnapshots.map(field => field.memberId).filter(Boolean)).size),
    hectaresAudited: Number(report.hectaresAudited || 0),
    totalCost: Number(report.totalCost || 0),
    status: canonicalAuditStatus(report.status) || AUDIT_STATUS.COMPILED,
    deliveryMethod: report.deliveryMethod || null,
    deliveryStatus: report.deliveryStatus || AUDIT_DELIVERY_STATUS.READY,
    submittedAt: report.submittedAt || null,
    submittedByUserId: report.submittedByUserId || null,
    submissionMethod: report.submissionMethod || null,
    submissionMethods: Array.isArray(report.submissionMethods) ? report.submissionMethods : [],
    returnReason: report.returnReason || '',
    returnedByUserId: report.returnedByUserId || null,
    returnedAt: report.returnedAt || null,
    certificationNotes: report.certificationNotes || '',
    certifiedByUserId: report.certifiedByUserId || null,
    certifiedByName: report.certifiedByName || '',
    certifiedAt: report.certifiedAt || null,
    createdAt: report.createdAt || report.compiledAt,
    updatedAt: report.updatedAt || report.compiledAt,
    integrityHash: report.integrityHash || report.qrHash,
    qrHash: report.qrHash || report.integrityHash
  };
}

function validateCanonicalAuditReport(report) {
  const value = canonicalAuditReport(report);
  for (const field of ['reportId', 'blockFarmId', 'periodKey', 'compiledByUserId', 'compiledAt', 'integrityHash']) {
    if (!String(value[field] || '').trim()) throw new Error(`The compiled audit report is missing ${field}.`);
  }
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value.periodKey)) throw new Error('The compiled audit reporting period is invalid.');
  if (!value.operationSnapshots.length || !value.sourceLogIds.length) throw new Error('The compiled audit report contains no operation data.');
  const operationIds = value.operationSnapshots.map(operationId);
  if (operationIds.some(id => !id)) throw new Error('The compiled audit report contains an operation without an ID.');
  if (new Set(operationIds).size !== operationIds.length) throw new Error('The compiled audit report contains duplicate operations.');
  if (new Set(value.sourceLogIds).size !== operationIds.length || operationIds.some(id => !value.sourceLogIds.includes(id))) {
    throw new Error('The compiled audit source log references do not match its operations.');
  }
  const fieldIds = new Set(value.fieldSnapshots.map(field => String(field.fieldId || '').trim()).filter(Boolean));
  if (!fieldIds.size || value.operationSnapshots.some(operation => !fieldIds.has(String(operation.fieldId || '').trim()))) {
    throw new Error('The compiled audit operations are not attached to valid fields.');
  }
  const attachedOperationIds = value.fieldSnapshots.flatMap(field => Array.isArray(field.operationLogIds) ? field.operationLogIds.map(operationId) : []);
  if (attachedOperationIds.length !== operationIds.length || new Set(attachedOperationIds).size !== operationIds.length || operationIds.some(id => !attachedOperationIds.includes(id))) {
    throw new Error('The compiled audit field operation references are incomplete.');
  }
  const memberCount = new Set(value.fieldSnapshots.map(field => field.memberId).filter(Boolean)).size;
  const hectaresAudited = Number(value.fieldSnapshots.reduce((sum, field) => sum + Number(field.areaHa || 0), 0).toFixed(4));
  const totalCost = Number(value.operationSnapshots.reduce((sum, operation) => sum + Number(operation.totalCost || 0), 0).toFixed(2));
  if (!Number.isFinite(value.totalCost) || Math.abs(totalCost - value.totalCost) > 0.01) throw new Error('The compiled audit total cost is invalid.');
  if (Math.abs(hectaresAudited - value.hectaresAudited) > 0.0001) throw new Error('The compiled audit acreage summary is invalid.');
  if (value.operationCount !== value.operationSnapshots.length || value.fieldCount !== fieldIds.size || value.memberCount !== memberCount) {
    throw new Error('The compiled audit summary counts do not match its payload.');
  }
  return value;
}

function operationId(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  return String(value.operationLogId || value.id || '').trim();
}

function newestAuditReport(reports = []) {
  return [...reports].sort((left, right) => {
    const versionDifference = Number(right?.reportVersion || 1) - Number(left?.reportVersion || 1);
    if (versionDifference) return versionDifference;
    const rightTime = Date.parse(right?.updatedAt || right?.compiledAt || right?.createdAt || '') || 0;
    const leftTime = Date.parse(left?.updatedAt || left?.compiledAt || left?.createdAt || '') || 0;
    return rightTime - leftTime;
  })[0] || null;
}

/**
 * Determines the next authoritative monthly compilation batch.
 *
 * Every non-returned snapshot covers its source operations and those operations
 * are never included in a later batch.
 * An in-progress report is replayed idempotently. Once the latest report is
 * certified, newly recorded operations become a new version. A returned batch
 * can be rebuilt from its still-uncertified operations plus any newer records.
 */
function selectAuditCompilationBatch(eligibleOperations = [], reports = []) {
  const latest = newestAuditReport(reports);
  const latestStatus = canonicalAuditStatus(latest?.status);
  if (latest && [AUDIT_STATUS.COMPILED, AUDIT_STATUS.PENDING_SUBMISSION, AUDIT_STATUS.PENDING_REVIEW].includes(latestStatus)) {
    return { latest, operations: [], replay: latest };
  }

  const coveredOperationIds = new Set(reports
    .filter(report => canonicalAuditStatus(report?.status) !== AUDIT_STATUS.RETURNED)
    .flatMap(report => report.operationSnapshots || report.operations || [])
    .map(operationId)
    .filter(Boolean));
  const operations = eligibleOperations.filter(operation => !coveredOperationIds.has(operationId(operation)));

  if (latest && latestStatus === AUDIT_STATUS.CERTIFIED && operations.length === 0) {
    return { latest, operations: [], replay: latest };
  }
  return { latest, operations, replay: null };
}

function qrTransportObject(report) {
  const canonical = validateCanonicalAuditReport({
    ...report,
    deliveryMethod: AUDIT_DELIVERY_METHOD.QR,
    deliveryStatus: AUDIT_DELIVERY_STATUS.READY
  });
  return {
    type: QR_TYPE,
    schemaVersion: QR_SCHEMA_VERSION,
    encoding: 'DEFLATE_RAW_BASE64_UTF8',
    reportId: canonical.reportId,
    integrityHash: canonical.integrityHash,
    data: zlib.deflateRawSync(Buffer.from(JSON.stringify(canonical), 'utf8'), { level: 9 }).toString('base64')
  };
}

function encodeQrPayload(report) {
  return JSON.stringify(qrTransportObject(report));
}

function decodeQrPayload(rawPayload) {
  let parsed = rawPayload;
  if (typeof rawPayload === 'string') {
    const text = rawPayload.trim();
    if (!text.startsWith('{')) throw new Error('This is not a supported HUGPONG audit QR package.');
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error('The audit QR package is malformed.');
    }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('The audit QR package is malformed.');
  if (parsed.type === 'HUGPONG_AUDIT' && Number(parsed.schemaVersion) === 1) return { ...parsed, legacyLookupOnly: true };
  if (parsed.type !== QR_TYPE) throw new Error('This HUGPONG audit QR version is not supported.');
  if (Number(parsed.schemaVersion) === 2) return validateCanonicalAuditReport(parsed.report);
  if (Number(parsed.schemaVersion) !== QR_SCHEMA_VERSION || parsed.encoding !== 'DEFLATE_RAW_BASE64_UTF8' || !parsed.data) {
    throw new Error('This HUGPONG audit QR version is not supported.');
  }
  let report;
  try {
    report = JSON.parse(zlib.inflateRawSync(Buffer.from(String(parsed.data), 'base64')).toString('utf8'));
  } catch {
    throw new Error('The compressed audit QR package is malformed.');
  }
  const canonical = validateCanonicalAuditReport(report);
  if (canonical.reportId !== parsed.reportId || canonical.integrityHash !== parsed.integrityHash) throw new Error('The audit QR identity does not match its report data.');
  return canonical;
}

function encodeQrParts(report) {
  const payload = encodeQrPayload(report);
  if (Buffer.byteLength(payload, 'utf8') > QR_SINGLE_MAX_LENGTH) throw new Error('This report is too large for one offline QR. Send it through Cloud instead.');
  return [payload];
}

function decodeQrPart(rawPart) {
  let parsed;
  try { parsed = typeof rawPart === 'string' ? JSON.parse(rawPart.trim()) : rawPart; } catch { throw new Error('The QR transfer part is malformed.'); }
  if (!parsed || parsed.type !== QR_PART_TYPE || Number(parsed.schemaVersion) !== 2) throw new Error('This is not a HUGPONG multipart audit transfer.');
  const partNumber = Number(parsed.partNumber);
  const partCount = Number(parsed.partCount);
  if (!parsed.transferId || !Number.isInteger(partNumber) || !Number.isInteger(partCount) || partNumber < 1 || partNumber > partCount || !parsed.data) {
    throw new Error('The QR transfer part is incomplete.');
  }
  return { transferId: parsed.transferId, partNumber, partCount, encoding: parsed.encoding || 'RAW', data: String(parsed.data) };
}

function assembleQrParts(rawParts = []) {
  const parts = rawParts.map(decodeQrPart);
  if (!parts.length) throw new Error('No QR transfer parts were supplied.');
  const transferId = parts[0].transferId;
  const partCount = parts[0].partCount;
  if (parts.some(part => part.transferId !== transferId || part.partCount !== partCount)) throw new Error('QR transfer parts belong to different reports.');
  const unique = new Map(parts.map(part => [part.partNumber, part]));
  if (unique.size !== partCount) throw new Error(`QR transfer is incomplete: ${unique.size} of ${partCount} parts received.`);
  const payload = Array.from(unique.values()).sort((left, right) => left.partNumber - right.partNumber).map(part => (
    part.encoding === 'BASE64_UTF8' ? Buffer.from(part.data, 'base64').toString('utf8') : part.data
  )).join('');
  return decodeQrPayload(payload);
}

module.exports = {
  AUDIT_STATUS,
  BUSINESS_TIME_ZONE,
  QR_SCHEMA_VERSION,
  QR_TYPE,
  QR_PART_TYPE,
  AUDIT_DELIVERY_METHOD,
  AUDIT_DELIVERY_STATUS,
  canonicalAuditStatus,
  businessPeriod,
  rootAuditReportId,
  versionedAuditReportId,
  summarizeSnapshots,
  buildFieldSnapshots,
  canonicalAuditReport,
  validateCanonicalAuditReport,
  newestAuditReport,
  selectAuditCompilationBatch,
  qrTransportObject,
  encodeQrPayload,
  decodeQrPayload,
  encodeQrParts,
  decodeQrPart,
  assembleQrParts
};
