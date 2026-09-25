'use strict';

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

const QR_SCHEMA_VERSION = 1;
const QR_TYPE = 'HUGPONG_AUDIT';
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

function qrTransportObject(report) {
  return {
    type: QR_TYPE,
    schemaVersion: QR_SCHEMA_VERSION,
    reportId: report.id || report.reportId,
    rootReportId: report.rootReportId,
    blockFarmId: report.blockFarmId,
    periodKey: report.periodKey || report.period,
    reportVersion: Number(report.reportVersion || 1),
    operationCount: Number(report.operationCount || report.operationSnapshots?.length || 0),
    fieldCount: Number(report.fieldCount || 0),
    hectaresAudited: Number(report.hectaresAudited || 0),
    totalCost: Number(report.totalCost || 0),
    compiledByUserId: report.compiledByUserId,
    compiledAt: report.compiledAt,
    integrityHash: report.integrityHash || report.qrHash
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
  if (parsed.type !== QR_TYPE) throw new Error('This QR code is not a HUGPONG audit package.');
  if (Number(parsed.schemaVersion) !== QR_SCHEMA_VERSION) throw new Error('This HUGPONG audit QR version is not supported.');
  for (const field of ['reportId', 'blockFarmId', 'periodKey', 'integrityHash']) {
    if (!String(parsed[field] || '').trim()) throw new Error(`The audit QR package is missing ${field}.`);
  }
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(parsed.periodKey)) throw new Error('The audit QR reporting period is invalid.');
  if (!Number.isInteger(Number(parsed.reportVersion)) || Number(parsed.reportVersion) < 1) throw new Error('The audit QR report version is invalid.');
  return qrTransportObject(parsed);
}

module.exports = {
  AUDIT_STATUS,
  BUSINESS_TIME_ZONE,
  QR_SCHEMA_VERSION,
  QR_TYPE,
  canonicalAuditStatus,
  businessPeriod,
  rootAuditReportId,
  versionedAuditReportId,
  summarizeSnapshots,
  qrTransportObject,
  encodeQrPayload,
  decodeQrPayload
};
