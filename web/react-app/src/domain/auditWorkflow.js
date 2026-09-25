import { deflateRaw, inflateRaw } from 'pako';

export const AUDIT_STATUS = Object.freeze({
  COMPILED: 'COMPILED',
  PENDING_SUBMISSION: 'PENDING_SUBMISSION',
  PENDING_REVIEW: 'PENDING_REVIEW',
  RETURNED: 'RETURNED',
  CERTIFIED: 'CERTIFIED'
});

export const canonicalAuditStatus = value => {
  const status = String(value || '').trim().toUpperCase().replace(/[\s-]+/g, '_');
  if (['PENDING', 'SUBMITTED', 'VERIFIED'].includes(status)) return AUDIT_STATUS.PENDING_REVIEW;
  return Object.values(AUDIT_STATUS).includes(status) ? status : AUDIT_STATUS.COMPILED;
};

export const auditStatusLabel = value => ({
  COMPILED: 'Compiled', PENDING_SUBMISSION: 'Pending Submission',
  PENDING_REVIEW: 'Awaiting Review', RETURNED: 'Returned for Correction', CERTIFIED: 'Certified'
}[canonicalAuditStatus(value)]);

const reportTime = report => Date.parse(report?.updatedAt || report?.compiledAt || report?.createdAt || '') || 0;
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

export function auditReportPeriod(report) {
  const value = String(report?.periodKey || report?.period || report?.month || '').trim();
  const iso = value.match(/^(\d{4})-(0[1-9]|1[0-2])(?:-|$)/);
  if (iso) return `${iso[1]}-${iso[2]}`;
  const named = value.toLowerCase().replace(/,/g, ' ').replace(/\s+/g, ' ').match(/^([a-z]+)\s+(\d{4})$/);
  if (!named) return '';
  const monthIndex = MONTHS.findIndex(month => month === named[1] || month.startsWith(named[1]));
  return monthIndex >= 0 ? `${named[2]}-${String(monthIndex + 1).padStart(2, '0')}` : '';
}

export function sortAuditReportsNewest(reports = []) {
  return [...reports].sort((left, right) => {
    const versionDifference = Number(right?.reportVersion || 1) - Number(left?.reportVersion || 1);
    return versionDifference || reportTime(right) - reportTime(left);
  });
}

export function auditReportsForFarmPeriod(reports = [], blockFarmId, periodKey) {
  return sortAuditReportsNewest(reports.filter(report =>
    String(report?.blockFarmId || '').trim() === String(blockFarmId || '').trim()
      && auditReportPeriod(report) === periodKey
  ));
}

export function reportedOperationIds(reports = []) {
  return new Set(reports
    .filter(report => canonicalAuditStatus(report?.status) !== AUDIT_STATUS.RETURNED)
    .flatMap(report => Array.isArray(report?.sourceLogIds) && report.sourceLogIds.length
      ? report.sourceLogIds
      : (report?.operationSnapshots || report?.operations || []))
    .map(operation => String(operation?.operationLogId || operation?.id || operation || '').trim())
    .filter(Boolean));
}

export function certifiedOperationIds(reports = []) {
  return reportedOperationIds(reports.filter(report => canonicalAuditStatus(report?.status) === AUDIT_STATUS.CERTIFIED));
}

const AUDIT_COVERAGE_PRIORITY = Object.freeze({
  [AUDIT_STATUS.RETURNED]: 1,
  [AUDIT_STATUS.COMPILED]: 2,
  [AUDIT_STATUS.PENDING_SUBMISSION]: 2,
  [AUDIT_STATUS.PENDING_REVIEW]: 3,
  [AUDIT_STATUS.CERTIFIED]: 4
});

export function operationAuditCoverage(reports = []) {
  const coverage = new Map();
  reports.forEach(report => {
    const status = canonicalAuditStatus(report?.status);
    const candidate = {
      reportId: report?.reportId || report?.id || '',
      status,
      label: ({
        [AUDIT_STATUS.COMPILED]: 'Included in Compiled Audit',
        [AUDIT_STATUS.PENDING_SUBMISSION]: 'Included in Compiled Audit',
        [AUDIT_STATUS.PENDING_REVIEW]: 'Compiled · Submitted to SRA',
        [AUDIT_STATUS.RETURNED]: 'Compiled · Returned for Correction',
        [AUDIT_STATUS.CERTIFIED]: 'Compiled · SRA Certified'
      })[status],
      compiledAt: report?.compiledAt || null,
      submittedAt: report?.submittedAt || null
    };
    const sourceIds = Array.isArray(report?.sourceLogIds) && report.sourceLogIds.length
      ? report.sourceLogIds
      : (report?.operationSnapshots || report?.operations || []);
    sourceIds
      .map(operation => String(operation?.operationLogId || operation?.id || operation || '').trim())
      .filter(Boolean)
      .forEach(operationId => {
        const current = coverage.get(operationId);
        if (!current || AUDIT_COVERAGE_PRIORITY[status] > AUDIT_COVERAGE_PRIORITY[current.status]) {
          coverage.set(operationId, candidate);
        }
      });
  });
  return coverage;
}

export const AUDIT_QR_SCHEMA_VERSION = 3;
export const AUDIT_QR_TYPE = 'HUGPONG_AUDIT_TRANSFER';
export const AUDIT_QR_PART_TYPE = 'HUGPONG_AUDIT_PART';
// Keep each symbol sparse enough to scan reliably from another phone screen.
// The multipart envelope adds roughly 200 characters around each data chunk.
export const AUDIT_QR_SINGLE_MAX_LENGTH = 600;
export const AUDIT_QR_PART_DATA_LENGTH = 350;
export const AUDIT_DELIVERY_METHOD = Object.freeze({ CLOUD: 'cloud', QR: 'qr' });
export const AUDIT_DELIVERY_STATUS = Object.freeze({ READY: 'ready', SUBMITTED: 'submitted', RECEIVED: 'received' });

const operationId = value => String(value?.operationLogId || value?.id || value || '').trim();

export function buildAuditFieldSnapshots(operationSnapshots = [], activeFields = []) {
  const fieldMap = new Map(activeFields.map(field => [String(field.id || field.fieldId || '').trim(), field]));
  const grouped = new Map();
  operationSnapshots.forEach(operation => {
    const fieldId = String(operation?.fieldId || '').trim();
    if (!fieldId) return;
    if (!grouped.has(fieldId)) grouped.set(fieldId, []);
    grouped.get(fieldId).push(operation);
  });
  return Array.from(grouped.entries()).sort(([left], [right]) => left.localeCompare(right)).map(([fieldId, operations]) => {
    const field = fieldMap.get(fieldId) || {};
    const memberId = field.memberUserId || field.memberId || null;
    return {
      fieldId,
      memberId,
      memberName: field.memberName || field.member || null,
      areaHa: Number(field.areaHa || field.ha || operations[0]?.areaHa || 0),
      cropYearCycle: field.cropYearCycle || field.cropYear || operations[0]?.cropYearCycle || null,
      cycleId: field.currentCycleId || operations[0]?.cycleId || null,
      operationLogIds: operations.map(operationId),
      operationCount: operations.length,
      totalCost: Number(operations.reduce((sum, operation) => sum + Number(operation.totalCost || 0), 0).toFixed(2))
    };
  });
}

export function canonicalAuditReport(report = {}) {
  const operationSnapshots = Array.isArray(report.operationSnapshots)
    ? report.operationSnapshots
    : (Array.isArray(report.operations) ? report.operations : []);
  const fieldSnapshots = Array.isArray(report.fieldSnapshots) && report.fieldSnapshots.length
    ? report.fieldSnapshots
    : buildAuditFieldSnapshots(operationSnapshots);
  const sourceLogIds = Array.isArray(report.sourceLogIds) && report.sourceLogIds.length
    ? report.sourceLogIds.map(operationId)
    : operationSnapshots.map(operationId);
  return {
    reportId: report.id || report.reportId,
    schemaVersion: AUDIT_QR_SCHEMA_VERSION,
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
    status: canonicalAuditStatus(report.status),
    reviewStatus: report.reviewStatus || ({
      [AUDIT_STATUS.COMPILED]: 'not_submitted',
      [AUDIT_STATUS.PENDING_SUBMISSION]: 'not_submitted',
      [AUDIT_STATUS.PENDING_REVIEW]: 'pending_review',
      [AUDIT_STATUS.RETURNED]: 'returned',
      [AUDIT_STATUS.CERTIFIED]: 'complete'
    }[canonicalAuditStatus(report.status)] || 'not_submitted'),
    certificationStatus: report.certificationStatus || (
      canonicalAuditStatus(report.status) === AUDIT_STATUS.CERTIFIED ? 'certified' : 'not_certified'
    ),
    deliveryMethod: report.deliveryMethod ? String(report.deliveryMethod).toLowerCase() : null,
    deliveryStatus: report.deliveryStatus ? String(report.deliveryStatus).toLowerCase() : AUDIT_DELIVERY_STATUS.READY,
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

export function validateCanonicalAuditReport(report) {
  const value = canonicalAuditReport(report);
  ['reportId', 'blockFarmId', 'periodKey', 'compiledByUserId', 'compiledAt', 'integrityHash'].forEach(field => {
    if (!String(value[field] || '').trim()) throw new Error(`The compiled audit report is missing ${field}.`);
  });
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value.periodKey)) throw new Error('The compiled audit reporting period is invalid.');
  if (!value.operationSnapshots.length || !value.sourceLogIds.length) throw new Error('The compiled audit report contains no operation data.');
  const operationIds = value.operationSnapshots.map(operationId);
  if (operationIds.some(id => !id) || new Set(operationIds).size !== operationIds.length) throw new Error('The compiled audit report contains missing or duplicate operations.');
  if (new Set(value.sourceLogIds).size !== operationIds.length || operationIds.some(id => !value.sourceLogIds.includes(id))) throw new Error('The compiled audit source log references do not match its operations.');
  const fieldIds = new Set(value.fieldSnapshots.map(field => String(field.fieldId || '').trim()).filter(Boolean));
  if (!fieldIds.size || value.operationSnapshots.some(operation => !fieldIds.has(String(operation.fieldId || '').trim()))) throw new Error('The compiled audit operations are not attached to valid fields.');
  const attachedOperationIds = value.fieldSnapshots.flatMap(field => Array.isArray(field.operationLogIds) ? field.operationLogIds.map(operationId) : []);
  if (attachedOperationIds.length !== operationIds.length || new Set(attachedOperationIds).size !== operationIds.length || operationIds.some(id => !attachedOperationIds.includes(id))) throw new Error('The compiled audit field operation references are incomplete.');
  const memberCount = new Set(value.fieldSnapshots.map(field => field.memberId).filter(Boolean)).size;
  const hectaresAudited = Number(value.fieldSnapshots.reduce((sum, field) => sum + Number(field.areaHa || 0), 0).toFixed(4));
  const totalCost = Number(value.operationSnapshots.reduce((sum, operation) => sum + Number(operation.totalCost || 0), 0).toFixed(2));
  if (!Number.isFinite(value.totalCost) || Math.abs(totalCost - value.totalCost) > 0.01) throw new Error('The compiled audit total cost is invalid.');
  if (Math.abs(hectaresAudited - value.hectaresAudited) > 0.0001) throw new Error('The compiled audit acreage summary is invalid.');
  if (value.operationCount !== value.operationSnapshots.length || value.fieldCount !== fieldIds.size || value.memberCount !== memberCount) throw new Error('The compiled audit summary counts do not match its payload.');
  return value;
}

export function createAuditQrPayload(report) {
  const canonical = validateCanonicalAuditReport({ ...report, deliveryMethod: AUDIT_DELIVERY_METHOD.QR, deliveryStatus: AUDIT_DELIVERY_STATUS.READY });
  const bytes = new TextEncoder().encode(JSON.stringify(canonical));
  return JSON.stringify({
    type: AUDIT_QR_TYPE,
    schemaVersion: AUDIT_QR_SCHEMA_VERSION,
    encoding: 'DEFLATE_RAW_BASE64_UTF8',
    reportId: canonical.reportId,
    integrityHash: canonical.integrityHash,
    data: encodeQrPartData(deflateRaw(bytes, { level: 9 }))
  });
}

function encodeQrPartData(value) {
  let binary = '';
  value.forEach(byte => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}

function decodeQrPartData(value) {
  const binary = atob(value);
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

export function decodeAuditQrPayload(raw) {
  const value = typeof raw === 'string' ? JSON.parse(raw.trim()) : raw;
  if (value?.type === 'HUGPONG_AUDIT' && Number(value.schemaVersion) === 1) return { ...value, legacyLookupOnly: true };
  if (!value || value.type !== AUDIT_QR_TYPE) throw new Error('This is not a supported HUGPONG audit QR package.');
  if (Number(value.schemaVersion) === 2) return validateCanonicalAuditReport(value.report);
  if (Number(value.schemaVersion) !== AUDIT_QR_SCHEMA_VERSION || value.encoding !== 'DEFLATE_RAW_BASE64_UTF8' || !value.data) throw new Error('This is not a supported HUGPONG audit QR package.');
  let report;
  try {
    report = JSON.parse(new TextDecoder().decode(inflateRaw(decodeQrPartData(String(value.data)))));
  } catch {
    throw new Error('The compressed audit QR package is malformed.');
  }
  const canonical = validateCanonicalAuditReport(report);
  if (canonical.reportId !== value.reportId || canonical.integrityHash !== value.integrityHash) throw new Error('The audit QR identity does not match its report data.');
  return canonical;
}

export function createAuditQrParts(report) {
  const payload = createAuditQrPayload(report);
  if (new TextEncoder().encode(payload).length <= AUDIT_QR_SINGLE_MAX_LENGTH) return [payload];
  const canonical = validateCanonicalAuditReport(report);
  const chunks = [];
  for (let index = 0; index < payload.length; index += AUDIT_QR_PART_DATA_LENGTH) chunks.push(payload.slice(index, index + AUDIT_QR_PART_DATA_LENGTH));
  const transferId = `${canonical.reportId}:${canonical.integrityHash}`;
  return chunks.map((data, index) => JSON.stringify({
    type: AUDIT_QR_PART_TYPE,
    schemaVersion: 2,
    transferId,
    partNumber: index + 1,
    partCount: chunks.length,
    encoding: 'RAW',
    data
  }));
}

export function decodeAuditQrPart(raw) {
  const value = typeof raw === 'string' ? JSON.parse(raw.trim()) : raw;
  const partNumber = Number(value?.partNumber);
  const partCount = Number(value?.partCount);
  if (!value || value.type !== AUDIT_QR_PART_TYPE || Number(value.schemaVersion) !== 2) throw new Error('This is not a HUGPONG multipart audit transfer.');
  if (!value.transferId || !Number.isInteger(partNumber) || !Number.isInteger(partCount) || partNumber < 1 || partNumber > partCount || !value.data) throw new Error('The QR transfer part is incomplete.');
  return { transferId: value.transferId, partNumber, partCount, encoding: value.encoding || 'RAW', data: String(value.data) };
}

export function assembleAuditQrParts(rawParts = []) {
  const parts = rawParts.map(decodeAuditQrPart);
  if (!parts.length) throw new Error('No QR transfer parts were supplied.');
  const { transferId, partCount } = parts[0];
  if (parts.some(part => part.transferId !== transferId || part.partCount !== partCount)) throw new Error('QR transfer parts belong to different reports.');
  const unique = new Map(parts.map(part => [part.partNumber, part]));
  if (unique.size !== partCount) throw new Error(`QR transfer is incomplete: ${unique.size} of ${partCount} parts received.`);
  return decodeAuditQrPayload(Array.from(unique.values()).sort((left, right) => left.partNumber - right.partNumber).map(part => (
    part.encoding === 'BASE64_UTF8' ? new TextDecoder().decode(decodeQrPartData(part.data)) : part.data
  )).join(''));
}
