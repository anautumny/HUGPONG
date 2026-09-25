'use strict';

const crypto = require('crypto');
const { CROP_STAGE_MAX, CROP_STAGE_MIN } = require('../domain/cropStages');
const { ROLE_DISPLAY_LABELS } = require('../domain/presentationContract');

const COLLECTIONS = Object.freeze({
  USERS: 'users',
  USER_CREDENTIALS: 'user_credentials',
  BLOCK_FARMS: 'block_farms',
  FIELDS: 'fields',
  CROP_CYCLES: 'crop_cycles',
  OPERATION_LOGS: 'operation_logs',
  AUDIT_REPORTS: 'audit_reports',
  AUDIT_LOGS: 'audit_logs',
  SRA_PRICES: 'sra_prices',
  SUPPORT_TICKETS: 'support_tickets',
  TERMINAL_DIAGNOSTICS: 'terminal_diagnostics'
});

const ROLES = Object.freeze({
  MEMBER_FARMER: 'MEMBER_FARMER',
  FARM_MANAGER: 'FARM_MANAGER',
  SRA_ADMIN: 'SRA_ADMIN',
  SUPER_ADMIN: 'SUPER_ADMIN'
});

const ROLE_ALLOWED_PLATFORMS = Object.freeze({
  [ROLES.MEMBER_FARMER]: Object.freeze(['mobile']),
  [ROLES.FARM_MANAGER]: Object.freeze(['mobile', 'web']),
  [ROLES.SRA_ADMIN]: Object.freeze(['mobile', 'web']),
  [ROLES.SUPER_ADMIN]: Object.freeze(['web'])
});

const USER_STATUSES = Object.freeze(['PENDING', 'ACTIVE', 'DISABLED']);
const ENTITY_STATUSES = Object.freeze(['ACTIVE', 'ARCHIVED']);
const OPERATION_LOG_STATUSES = Object.freeze(['ACTIVE', 'ARCHIVED']);
const CROP_CYCLE_STATUSES = Object.freeze(['ACTIVE', 'ARCHIVED']);
const AUDIT_REPORT_STATUSES = Object.freeze(['COMPILED', 'PENDING_SUBMISSION', 'PENDING_REVIEW', 'RETURNED', 'CERTIFIED']);
const SUBMISSION_SOURCES = Object.freeze(['MEMBER', 'FIELD_OWNER', 'MANAGER_TAKEOVER']);
const TICKET_PRIORITIES = Object.freeze(['LOW', 'NORMAL', 'HIGH', 'URGENT']);
const TICKET_STATUSES = Object.freeze(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']);

const ROLE_ALIASES = Object.freeze({
  MEMBER_FARMER: ROLES.MEMBER_FARMER,
  MEMBER: ROLES.MEMBER_FARMER,
  'MEMBER FARMER': ROLES.MEMBER_FARMER,
  'FARM MEMBER': ROLES.MEMBER_FARMER,
  FARM_MANAGER: ROLES.FARM_MANAGER,
  'FARM MANAGER': ROLES.FARM_MANAGER,
  MANAGER: ROLES.FARM_MANAGER,
  SRA_ADMIN: ROLES.SRA_ADMIN,
  'SRA ADMIN': ROLES.SRA_ADMIN,
  'SRA (ADMIN)': ROLES.SRA_ADMIN,
  ADMIN: ROLES.SRA_ADMIN,
  SUPER_ADMIN: ROLES.SUPER_ADMIN,
  'SUPER ADMIN': ROLES.SUPER_ADMIN,
  SUPERADMIN: ROLES.SUPER_ADMIN
});

function nowIso() {
  return new Date().toISOString();
}

function canonicalRole(value) {
  return ROLE_ALIASES[String(value || '').trim().toUpperCase()] || null;
}

function publicRoleLabel(role) {
  const canonical = canonicalRole(role);
  return ROLE_DISPLAY_LABELS[canonical] || '';
}

function isRoleAllowedOnPlatform(role, platform) {
  const canonical = canonicalRole(role);
  if (!canonical) return false;
  const plat = String(platform || '').trim().toLowerCase();
  if (!plat) return true;
  const allowed = ROLE_ALLOWED_PLATFORMS[canonical];
  return Boolean(allowed && allowed.includes(plat));
}

function requiredString(value, fieldName, { max = 500 } = {}) {
  const result = String(value == null ? '' : value).trim();
  if (!result) throw new Error(`${fieldName} is required.`);
  if (result.length > max) throw new Error(`${fieldName} must not exceed ${max} characters.`);
  return result;
}

function optionalString(value, { max = 2000 } = {}) {
  if (value == null || value === '') return '';
  const result = String(value).trim();
  if (result.length > max) throw new Error(`Value must not exceed ${max} characters.`);
  return result;
}

function nullableId(value) {
  const result = String(value == null ? '' : value).trim();
  return result || null;
}

function finiteNumber(value, fieldName, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const result = Number(value);
  if (!Number.isFinite(result) || result < min || result > max) {
    throw new Error(`${fieldName} must be a number between ${min} and ${max}.`);
  }
  return result;
}

function integer(value, fieldName, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const result = finiteNumber(value, fieldName, { min, max });
  if (!Number.isInteger(result)) throw new Error(`${fieldName} must be an integer.`);
  return result;
}

function enumValue(value, values, fieldName) {
  const result = String(value || '').trim().toUpperCase();
  if (!values.includes(result)) throw new Error(`${fieldName} must be one of: ${values.join(', ')}.`);
  return result;
}

function isoTimestamp(value, fieldName, { nullable = false } = {}) {
  if ((value == null || value === '') && nullable) return null;
  const result = requiredString(value, fieldName);
  const parsed = new Date(result);
  if (Number.isNaN(parsed.getTime()) || !result.includes('T')) {
    throw new Error(`${fieldName} must be a UTC ISO-8601 timestamp.`);
  }
  return parsed.toISOString();
}

function calendarDate(value, fieldName) {
  const result = requiredString(value, fieldName);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result)) throw new Error(`${fieldName} must use YYYY-MM-DD.`);
  const date = new Date(`${result}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== result) {
    throw new Error(`${fieldName} is not a valid calendar date.`);
  }
  return result;
}

function reportPeriod(value) {
  const result = requiredString(value, 'period');
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(result)) throw new Error('period must use YYYY-MM.');
  return result;
}

function cropYearCycleForDate(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('A valid server date is required to generate the Crop Year Cycle.');
  const startYear = Number(new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila',
    year: 'numeric'
  }).format(date));
  return `${startYear}-${startYear + 1}`;
}

function normalizeCropYear(value, date = new Date()) {
  if (value == null || value === '') return cropYearCycleForDate(date);
  const str = String(value).trim();
  const rangeMatch = str.match(/(\d{4})\s*[-–—/]\s*(\d{2,4})/);
  if (rangeMatch) {
    const startYear = parseInt(rangeMatch[1], 10);
    let endYear = parseInt(rangeMatch[2], 10);
    if (endYear < 100) endYear = Math.floor(startYear / 100) * 100 + endYear;
    return `${startYear}-${endYear}`;
  }
  const singleMatch = str.match(/(\d{4})/);
  if (singleMatch) {
    const year = parseInt(singleMatch[1], 10);
    return `${year}-${year + 1}`;
  }
  return str;
}

function cropYearParts(value, date = new Date()) {
  const cropYear = normalizeCropYear(value, date);
  const match = cropYear.match(/^(\d{4})-(\d{4})$/);
  if (!match || Number(match[2]) !== Number(match[1]) + 1) {
    throw new Error('Crop Year Cycle must use the canonical YYYY-YYYY annual range.');
  }
  return {
    cropYear,
    cropYearStart: Number(match[1]),
    cropYearEnd: Number(match[2])
  };
}

function cleanObject(value) {
  if (Array.isArray(value)) return value.map(cleanObject);
  if (!value || typeof value !== 'object') return value;
  const clean = {};
  for (const [key, child] of Object.entries(value)) {
    if (child !== undefined) clean[key] = cleanObject(child);
  }
  return clean;
}

function lineItems(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item, index) => ({
    lineItemId: requiredString(item.lineItemId, `lineItems[${index}].lineItemId`, { max: 120 }),
    description: requiredString(item.description, `lineItems[${index}].description`, { max: 300 }),
    quantity: finiteNumber(item.quantity, `lineItems[${index}].quantity`),
    unit: requiredString(item.unit, `lineItems[${index}].unit`, { max: 40 }),
    unitCost: finiteNumber(item.unitCost, `lineItems[${index}].unitCost`),
    subtotal: finiteNumber(item.subtotal, `lineItems[${index}].subtotal`)
  }));
}

function quantity(value) {
  if (value == null) return null;
  return {
    value: finiteNumber(value.value, 'quantity.value'),
    unit: requiredString(value.unit, 'quantity.unit', { max: 40 }),
    inputName: optionalString(value.inputName, { max: 120 })
  };
}

function amendments(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item, index) => ({
    amendmentId: requiredString(item.amendmentId, `amendments[${index}].amendmentId`, { max: 120 }),
    amendedByUserId: requiredString(item.amendedByUserId, `amendments[${index}].amendedByUserId`, { max: 80 }),
    amendedByName: optionalString(item.amendedByName, { max: 200 }),
    amendedByRole: optionalString(item.amendedByRole, { max: 80 }),
    reason: requiredString(item.reason, `amendments[${index}].reason`, { max: 1000 }),
    amendedAt: isoTimestamp(item.amendedAt, `amendments[${index}].amendedAt`),
    changes: cleanObject(item.changes && typeof item.changes === 'object' ? item.changes : {})
  }));
}

function photoEvidence(value) {
  if (!value) return null;
  const dataUrl = requiredString(value.dataUrl, 'photoEvidence.dataUrl', { max: 850000 });
  if (!/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(dataUrl)) {
    throw new Error('photoEvidence.dataUrl must be a JPEG, PNG, or WebP data URL.');
  }
  const encoded = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const inferredBytes = Math.floor((encoded.length * 3) / 4);
  const byteSize = value.byteSize == null ? inferredBytes : Number(value.byteSize);
  if (!Number.isInteger(byteSize) || byteSize < 1 || inferredBytes > 614400 || byteSize > 614400) {
    throw new Error('Photo evidence must not exceed 600 KB after resizing.');
  }
  return {
    dataUrl,
    mimeType: enumValue(value.mimeType || 'image/jpeg', ['IMAGE/JPEG', 'IMAGE/PNG', 'IMAGE/WEBP'], 'photoEvidence.mimeType').toLowerCase(),
    fileName: optionalString(value.fileName || 'field-evidence.jpg', { max: 180 }),
    byteSize,
    capturedAt: value.capturedAt ? isoTimestamp(value.capturedAt, 'photoEvidence.capturedAt') : nowIso()
  };
}

function buildOperationLog(input, context = {}) {
  const createdAt = input.createdAt ? isoTimestamp(input.createdAt, 'createdAt') : (context.now || nowIso());
  const updatedAt = input.updatedAt ? isoTimestamp(input.updatedAt, 'updatedAt') : (context.now || nowIso());
  const status = enumValue(input.status || 'ACTIVE', OPERATION_LOG_STATUSES, 'status');
  const archiveActor = nullableId(input.archivedByUserId);
  const archiveTime = input.archivedAt ? isoTimestamp(input.archivedAt, 'archivedAt') : null;
  if (status === 'ACTIVE' && (archiveActor || archiveTime)) {
    throw new Error('ACTIVE operation logs cannot have archive metadata.');
  }
  if (status === 'ARCHIVED' && (!archiveActor || !archiveTime)) {
    throw new Error('ARCHIVED operation logs require archivedAt and archivedByUserId.');
  }

  const payload = {
    fieldId: requiredString(input.fieldId, 'fieldId', { max: 80 }).toUpperCase(),
    cycleId: requiredString(input.cycleId, 'cycleId', { max: 120 }).toUpperCase(),
    blockFarmId: nullableId(input.blockFarmId),
    cropYearCycle: input.cropYearCycle ? normalizeCropYear(input.cropYearCycle) : null,
    stageNumberAtRecord: input.stageNumberAtRecord == null
      ? null
      : integer(input.stageNumberAtRecord, 'stageNumberAtRecord', { min: CROP_STAGE_MIN, max: CROP_STAGE_MAX }),
    submittedByUserId: requiredString(context.submittedByUserId || input.submittedByUserId, 'submittedByUserId', { max: 80 }),
    submissionSource: enumValue(input.submissionSource || 'MEMBER', SUBMISSION_SOURCES, 'submissionSource'),
    operationDefinitionId: requiredString(input.operationDefinitionId, 'operationDefinitionId', { max: 120 }),
    operationName: requiredString(input.operationName, 'operationName', { max: 300 }),
    category: requiredString(input.category, 'category', { max: 80 }),
    variety: optionalString(input.variety, { max: 120 }),
    stageNumber: integer(input.stageNumber, 'stageNumber', { min: CROP_STAGE_MIN, max: CROP_STAGE_MAX }),
    performedOn: calendarDate(input.performedOn, 'performedOn'),
    areaHa: finiteNumber(input.areaHa, 'areaHa', { min: 0.01, max: 500 }),
    peopleCount: integer(input.peopleCount, 'peopleCount', { min: 0, max: 10000 }),
    quantity: quantity(input.quantity),
    totalCost: finiteNumber(input.totalCost, 'totalCost'),
    lineItems: lineItems(input.lineItems),
    photoEvidence: photoEvidence(input.photoEvidence),
    isSupplemental: Boolean(input.isSupplemental),
    amendments: amendments(input.amendments),
    status,
    createdAt,
    updatedAt,
    archivedAt: archiveTime,
    archivedByUserId: archiveActor
  };

  const lineTotal = payload.lineItems.reduce((sum, item) => sum + item.subtotal, 0);
  if (payload.lineItems.length && Math.abs(lineTotal - payload.totalCost) > 0.01) {
    throw new Error('totalCost must equal the sum of lineItems subtotals.');
  }
  return payload;
}

function buildOperationSnapshot(logId, log) {
  return {
    operationLogId: requiredString(logId, 'operationLogId', { max: 120 }),
    fieldId: log.fieldId,
    cycleId: log.cycleId,
    blockFarmId: log.blockFarmId || null,
    cropYearCycle: log.cropYearCycle || null,
    stageNumberAtRecord: log.stageNumberAtRecord == null ? null : log.stageNumberAtRecord,
    operationDefinitionId: log.operationDefinitionId,
    operationName: log.operationName,
    category: log.category,
    variety: log.variety || '',
    stageNumber: log.stageNumber,
    performedOn: log.performedOn,
    areaHa: log.areaHa,
    peopleCount: log.peopleCount,
    quantity: log.quantity || null,
    totalCost: log.totalCost,
    lineItems: Array.isArray(log.lineItems) ? log.lineItems : [],
    amendments: amendments(log.amendments),
    submittedByUserId: log.submittedByUserId || null,
    submissionSource: log.submissionSource || null,
    createdAt: log.createdAt || null,
    updatedAt: log.updatedAt || null
  };
}

function buildSraPrice(input, context = {}) {
  for (const fieldName of [
    'sugarPricePerLkg',
    'sugarPriceChange',
    'molassesPricePerMetricTon',
    'molassesPriceChange'
  ]) {
    if (input[fieldName] == null || input[fieldName] === '') {
      throw new Error(`${fieldName} is required.`);
    }
  }
  return {
    effectiveDate: calendarDate(input.effectiveDate, 'effectiveDate'),
    weekLabel: requiredString(input.weekLabel, 'weekLabel', { max: 100 }),
    sugarPricePerLkg: finiteNumber(input.sugarPricePerLkg, 'sugarPricePerLkg'),
    sugarPriceChange: finiteNumber(input.sugarPriceChange, 'sugarPriceChange', { min: -1000000, max: 1000000 }),
    molassesPricePerMetricTon: finiteNumber(input.molassesPricePerMetricTon, 'molassesPricePerMetricTon'),
    molassesPriceChange: finiteNumber(input.molassesPriceChange, 'molassesPriceChange', { min: -1000000, max: 1000000 }),
    circularNumber: requiredString(input.circularNumber, 'circularNumber', { max: 120 }),
    source: requiredString(input.source, 'source', { max: 300 }),
    publishedByUserId: requiredString(context.publishedByUserId || input.publishedByUserId, 'publishedByUserId', { max: 80 }),
    publishedAt: isoTimestamp(context.publishedAt || input.publishedAt, 'publishedAt')
  };
}

function createAuditHash(reportId, blockFarmId, period, snapshots) {
  const canonical = JSON.stringify({ reportId, blockFarmId, period, operationSnapshots: snapshots });
  return `HUG-${crypto.createHash('sha256').update(canonical).digest('hex').slice(0, 24).toUpperCase()}`;
}

function createCycleId(fieldId, sequenceNumber) {
  return `CYC-${requiredString(fieldId, 'fieldId').toUpperCase()}-${String(integer(sequenceNumber, 'sequenceNumber', { min: 1, max: 9999 })).padStart(3, '0')}`;
}

function createOperationLogId(fieldId) {
  return `LOG-${requiredString(fieldId, 'fieldId').replace(/[^A-Za-z0-9]/g, '').toUpperCase()}-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}

function createAuditReportId(blockFarmId, period) {
  const farm = requiredString(blockFarmId, 'blockFarmId').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  return `RPT-${reportPeriod(period)}-${farm}-${Date.now().toString(36).toUpperCase()}`;
}

module.exports = {
  COLLECTIONS,
  ROLES,
  USER_STATUSES,
  ENTITY_STATUSES,
  OPERATION_LOG_STATUSES,
  CROP_CYCLE_STATUSES,
  AUDIT_REPORT_STATUSES,
  SUBMISSION_SOURCES,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  nowIso,
  canonicalRole,
  publicRoleLabel,
  requiredString,
  optionalString,
  nullableId,
  finiteNumber,
  integer,
  enumValue,
  isoTimestamp,
  calendarDate,
  reportPeriod,
  normalizeCropYear,
  cropYearCycleForDate,
  cropYearParts,
  cleanObject,
  buildOperationLog,
  buildOperationSnapshot,
  buildSraPrice,
  createAuditHash,
  createCycleId,
  createOperationLogId,
  createAuditReportId,
  ROLE_ALLOWED_PLATFORMS,
  isRoleAllowedOnPlatform
};
