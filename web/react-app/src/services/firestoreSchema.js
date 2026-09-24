/**
 * ══════════════════════════════════════════════════════════════
 * HUGPONG — Canonical Firestore Schema Converters & Enums
 * Authoritative schema definitions ported from Stage 7 baseline.
 * ══════════════════════════════════════════════════════════════
 */

import { formatCropYear as formatCropYearValue } from '../utils/formatters.js';

export const COLLECTIONS = Object.freeze({
  USERS: 'users',
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

export const ROLE_ALIASES = Object.freeze({
  MEMBER: 'MEMBER_FARMER',
  'MEMBER FARMER': 'MEMBER_FARMER',
  MEMBER_FARMER: 'MEMBER_FARMER',
  'FARM MANAGER': 'FARM_MANAGER',
  FARM_MANAGER: 'FARM_MANAGER',
  MANAGER: 'FARM_MANAGER',
  'SRA ADMIN': 'SRA_ADMIN',
  'SRA (ADMIN)': 'SRA_ADMIN',
  SRA_ADMIN: 'SRA_ADMIN',
  ADMIN: 'SRA_ADMIN',
  'SUPER ADMIN': 'SUPER_ADMIN',
  SUPER_ADMIN: 'SUPER_ADMIN',
  SUPERADMIN: 'SUPER_ADMIN'
});

export const ROLE_LABELS = Object.freeze({
  MEMBER_FARMER: 'Member Farmer',
  FARM_MANAGER: 'Farm Manager',
  SRA_ADMIN: 'SRA Admin',
  SUPER_ADMIN: 'Super Admin'
});

export const ROLE_ALLOWED_PLATFORMS = Object.freeze({
  MEMBER_FARMER: Object.freeze(['mobile']),
  FARM_MANAGER: Object.freeze(['mobile', 'web']),
  SRA_ADMIN: Object.freeze(['mobile', 'web']),
  SUPER_ADMIN: Object.freeze(['web'])
});

const now = () => new Date().toISOString();

export const role = value => ROLE_ALIASES[String(value || '').trim().toUpperCase()] || null;
export const roleLabel = value => ROLE_LABELS[role(value)] || '';
export const isRoleAllowedOnPlatform = (r, platform) => {
  const canonical = role(r);
  if (!canonical) return false;
  const plat = String(platform || '').trim().toLowerCase();
  if (!plat) return true;
  const allowed = ROLE_ALLOWED_PLATFORMS[canonical];
  return Boolean(allowed && allowed.includes(plat));
};
export const cycleId = (fieldId, sequenceNumber) =>
  `CYC-${String(fieldId || '').trim().toUpperCase()}-${String(Number(sequenceNumber) || 1).padStart(3, '0')}`;

export const reportPeriod = value => {
  const input = String(value || '').trim();
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(input)) return input;
  const parsed = new Date(`1 ${input}`);
  return Number.isNaN(parsed.getTime()) ? '' : `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}`;
};

export const lineItems = value =>
  (Array.isArray(value?.lineItems) ? value.lineItems : (value?.subItems || [])).map((item, index) => ({
    lineItemId: item.lineItemId || item.id || `LINE-${index + 1}`,
    description: String(item.description || '').trim(),
    quantity: Number(item.quantity ?? item.qty ?? 0),
    unit: String(item.unit || '').trim(),
    unitCost: Number(item.unitCost || 0),
    subtotal: Number(item.subtotal ?? item.subTotal ?? 0)
  }));

export const amendments = value =>
  (Array.isArray(value) ? value : []).map(item => ({
    amendmentId: item.amendmentId,
    amendedByUserId: item.amendedByUserId || '',
    reason: item.reason || '',
    amendedAt: item.amendedAt,
    changes: item.changes && typeof item.changes === 'object' ? item.changes : {}
  }));

export const photoEvidence = value => {
  if (!value) return null;
  const dataUrl = String(value.dataUrl || '');
  if (!/^data:image\/(?:jpeg|png|webp);base64,/i.test(dataUrl)) {
    throw new Error('Photo evidence must be a JPEG, PNG, or WebP image.');
  }
  const encoded = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const byteSize = Number(value.byteSize || Math.floor((encoded.length * 3) / 4));
  if (!Number.isFinite(byteSize) || byteSize <= 0 || byteSize > 614400) {
    throw new Error('Photo evidence must not exceed 600 KB after resizing.');
  }
  return {
    dataUrl,
    mimeType: String(value.mimeType || 'image/jpeg').toLowerCase(),
    fileName: String(value.fileName || 'field-evidence.jpg').slice(0, 180),
    byteSize,
    capturedAt: value.capturedAt || now()
  };
};

export const toUser = value => {
  const canonicalRole = role(value.canonicalRole || value.role);
  if (!canonicalRole) throw new Error('User role must be canonical.');
  return {
    displayName: String(value.displayName || value.name || '').trim(),
    phone: String(value.phone || value.contact || '').replace(/\D/g, ''),
    role: canonicalRole,
    status: String(value.status || 'PENDING').toUpperCase(),
    phoneVerifiedAt: value.phoneVerifiedAt || null,
    requiresPasswordChange: Boolean(value.requiresPasswordChange),
    passwordChangedAt: value.passwordChangedAt || null,
    approvedByUserId: value.approvedByUserId || null,
    approvedAt: value.approvedAt || null,
    createdAt: value.createdAt || now(),
    updatedAt: value.updatedAt || now()
  };
};

export const fromUser = (id, value) => ({
  id,
  employeeId: id,
  ...value,
  name: value.displayName,
  contact: value.phone,
  canonicalRole: value.role,
  role: roleLabel(value.role),
  phoneVerified: Boolean(value.phoneVerifiedAt)
});

export const toBlockFarm = value => ({
  code: String(value.code || '').trim().toUpperCase(),
  name: String(value.name || '').trim(),
  location: String(value.location || '').trim(),
  declaredAreaHa: Number(value.declaredAreaHa ?? value.declaredHa ?? 0),
  managerUserId: value.managerUserId || value.farmManagerId || null,
  status: String(value.status || 'ACTIVE').toUpperCase(),
  createdAt: value.createdAt || now(),
  updatedAt: value.updatedAt || now(),
  archivedAt: value.archivedAt || null
});

export const fromBlockFarm = (id, value) => ({
  id,
  ...value,
  declaredHa: Number(value.declaredAreaHa || 0),
  farmManagerId: value.managerUserId || ''
});

export const toField = value => {
  const blockFarmId = String(value.blockFarmId || '').trim().toUpperCase();
  const currentCycleId = String(value.currentCycleId || '').trim().toUpperCase();
  if (!blockFarmId || !currentCycleId) throw new Error('Field requires blockFarmId and currentCycleId.');
  const status = String(value.status || 'ACTIVE').toUpperCase();
  if (!['ACTIVE', 'ARCHIVED'].includes(status)) throw new Error('Field status must be ACTIVE or ARCHIVED.');
  return {
    blockFarmId,
    memberUserId: value.memberUserId || value.memberId || null,
    areaHa: Number(value.areaHa ?? value.ha ?? 0),
    variety: String(value.variety || '').trim(),
    soilType: String(value.soilType || '').trim(),
    currentCycleId,
    status,
    customStages: Array.isArray(value.customStages) ? value.customStages : [],
    customOperations: value.customOperations && typeof value.customOperations === 'object' ? value.customOperations : {},
    createdAt: value.createdAt || now(),
    updatedAt: value.updatedAt || now(),
    archivedAt: value.archivedAt || null
  };
};

export const fromField = (id, value, cycle) => {
  const stageNumber = Number(cycle?.currentStageNumber);
  return {
    id,
    ...value,
    memberId: value.memberUserId || '',
    ha: Number(value.areaHa || 0),
    stageNumber: Number.isInteger(stageNumber) && stageNumber >= 1 && stageNumber <= 6 ? stageNumber : null,
    month: Number(cycle?.elapsedMonths || 0),
    batchMonth: Number(cycle?.batchNumber || 1),
    cycleNumber: Number(cycle?.sequenceNumber || 1),
    cycleType: cycle?.cropType || '',
    cropYear: formatCropYear(cycle?.cropYear || value.cropYear || '')
  };
};

export function formatCropYear(val, fallback = '') {
  return formatCropYearValue(val, fallback);
}

export const toCycle = (field, value) => {
  const status = String(value.status || 'ACTIVE').toUpperCase();
  if (!['ACTIVE', 'ARCHIVED'].includes(status)) throw new Error('Crop Year Cycle status must be ACTIVE or ARCHIVED.');
  const archivedAt = status === 'ARCHIVED' ? (value.archivedAt || null) : null;
  const archivedByUserId = status === 'ARCHIVED' ? (value.archivedByUserId || null) : null;
  if (status === 'ARCHIVED' && (!archivedAt || !archivedByUserId)) throw new Error('ARCHIVED Crop Year Cycles require archive metadata.');
  return {
    fieldId: String(value.fieldId || field.id || '').trim().toUpperCase(),
    sequenceNumber: Number(value.sequenceNumber || field.cycleNumber || 1),
    cropType: value.cropType || field.cycleType || '',
    cropYear: formatCropYear(value.cropYear || field.cropYear || ''),
    currentStageNumber: Number(value.currentStageNumber || field.stageNumber || 1),
    elapsedMonths: Number(value.elapsedMonths ?? field.month ?? 0),
    batchNumber: Number(value.batchNumber || field.batchMonth || 1),
    status,
    startedAt: value.startedAt || field.createdAt || now(),
    updatedAt: value.updatedAt || now(),
    archivedAt,
    archivedByUserId
  };
};

export const toOperation = (value, context = {}) => {
  const status = String(context.status || value.status || 'ACTIVE').toUpperCase();
  if (!['ACTIVE', 'ARCHIVED'].includes(status)) throw new Error('Operation log status must be ACTIVE or ARCHIVED.');
  const quantity = value.quantity && typeof value.quantity === 'object' ? value.quantity :
    ((value.inputQty || value.qty) ? { value: Number(value.inputQty || value.qty), unit: value.inputUnit || value.unit || '', inputName: value.inputName || '' } : null);
  const fieldId = String(value.fieldId || '').trim().toUpperCase();
  const operationCycleId = String(context.cycleId || value.cycleId || '').trim().toUpperCase();
  const submittedByUserId = context.submittedByUserId || value.submittedByUserId || value.loggedById || '';
  if (!fieldId || !operationCycleId || !submittedByUserId) throw new Error('Operation log requires fieldId, cycleId, and submittedByUserId.');
  const archivedAt = status === 'ARCHIVED' ? (context.archivedAt || value.archivedAt || null) : null;
  const archivedByUserId = status === 'ARCHIVED' ? (context.archivedByUserId || value.archivedByUserId || null) : null;
  if (status === 'ARCHIVED' && (!archivedAt || !archivedByUserId)) throw new Error('ARCHIVED operation logs require archive metadata.');
  return {
    fieldId,
    cycleId: operationCycleId,
    blockFarmId: String(context.blockFarmId || value.blockFarmId || '').trim().toUpperCase() || null,
    cropYearCycle: formatCropYear(context.cropYearCycle || value.cropYearCycle || value.cropYear || '', '') || null,
    stageNumberAtRecord: (context.stageNumberAtRecord ?? value.stageNumberAtRecord) == null
      ? null
      : Number(context.stageNumberAtRecord ?? value.stageNumberAtRecord),
    submittedByUserId,
    submissionSource: context.submissionSource || value.submissionSource || 'MEMBER',
    operationDefinitionId: value.operationDefinitionId || value.sraOperationId || 'CUSTOM',
    operationName: String(value.operationName || value.activity || value.task || '').trim(),
    category: String(value.category || '').trim(),
    stageNumber: Number(value.stageNumber || 1),
    performedOn: value.performedOn || value.isoDate || String(value.date || '').slice(0, 10),
    areaHa: Number(value.areaHa ?? value.hectares ?? value.ha ?? 0),
    peopleCount: Number(value.peopleCount ?? value.people ?? 0),
    quantity,
    totalCost: Number(value.totalCost ?? value.cost ?? 0),
    lineItems: lineItems(value),
    photoEvidence: photoEvidence(value.photoEvidence),
    isSupplemental: Boolean(value.isSupplemental),
    amendments: amendments(value.amendments),
    status,
    createdAt: value.createdAt || now(),
    updatedAt: context.updatedAt || value.updatedAt || now(),
    archivedAt,
    archivedByUserId
  };
};

export const fromOperation = (id, value) => ({
  id,
  ...value,
  sraOperationId: value.operationDefinitionId,
  activity: value.operationName,
  cost: Number(value.totalCost || 0),
  hectares: Number(value.areaHa || 0),
  people: Number(value.peopleCount || 0),
  date: value.performedOn,
  period: value.performedOn,
  isoDate: value.performedOn,
  loggedById: value.submittedByUserId,
  subItems: (value.lineItems || []).map(item => ({
    id: item.lineItemId,
    description: item.description,
    qty: item.quantity,
    unit: item.unit,
    unitCost: item.unitCost,
    subTotal: item.subtotal
  }))
});

export const snapshot = (id, value) => {
  const log = toOperation(value, { status: value.status || 'ACTIVE' });
  return {
    operationLogId: id,
    fieldId: log.fieldId,
    cycleId: log.cycleId,
    blockFarmId: log.blockFarmId,
    cropYearCycle: log.cropYearCycle,
    stageNumberAtRecord: log.stageNumberAtRecord,
    operationDefinitionId: log.operationDefinitionId,
    operationName: log.operationName,
    category: log.category,
    stageNumber: log.stageNumber,
    performedOn: log.performedOn,
    areaHa: log.areaHa,
    peopleCount: log.peopleCount,
    quantity: log.quantity,
    totalCost: log.totalCost,
    lineItems: log.lineItems
  };
};

export const canonicalSnapshot = item => item.operationLogId && item.cycleId ? ({
  operationLogId: item.operationLogId,
  fieldId: String(item.fieldId || '').trim().toUpperCase(),
  cycleId: String(item.cycleId || '').trim().toUpperCase(),
  blockFarmId: String(item.blockFarmId || '').trim().toUpperCase() || null,
  cropYearCycle: formatCropYear(item.cropYearCycle || '', '') || null,
  stageNumberAtRecord: item.stageNumberAtRecord == null ? null : Number(item.stageNumberAtRecord),
  operationDefinitionId: item.operationDefinitionId || 'CUSTOM',
  operationName: String(item.operationName || '').trim(),
  category: String(item.category || '').trim(),
  stageNumber: Number(item.stageNumber || 1),
  performedOn: item.performedOn,
  areaHa: Number(item.areaHa || 0),
  peopleCount: Number(item.peopleCount || 0),
  quantity: item.quantity && typeof item.quantity === 'object' ? item.quantity : null,
  totalCost: Number(item.totalCost || 0),
  lineItems: lineItems(item)
}) : snapshot(item.id || item.operationLogId, item);

export const toReport = (value, context = {}) => {
  const status = String(context.status || value.status || 'PENDING').replace(/\s+SRA$/i, '').toUpperCase() === 'CERTIFIED' ? 'CERTIFIED' : 'PENDING';
  const operations = value.operationSnapshots || value.operations || value.logs || [];
  const blockFarmId = String(value.blockFarmId || '').trim().toUpperCase();
  const period = reportPeriod(value.period || value.month);
  const qrHash = value.qrHash || value.qrSignature || '';
  const compiledByUserId = context.compiledByUserId || value.compiledByUserId || '';
  if (!blockFarmId || !period) throw new Error('Audit report requires blockFarmId and YYYY-MM period.');
  if (!qrHash || !compiledByUserId || operations.length === 0) throw new Error('Audit report requires qrHash, compiledByUserId, and operation snapshots.');
  const certifiedByUserId = status === 'CERTIFIED' ? (context.certifiedByUserId || value.certifiedByUserId || null) : null;
  const certifiedAt = status === 'CERTIFIED' ? (context.certifiedAt || value.certifiedAt || null) : null;
  if (status === 'CERTIFIED' && (!certifiedByUserId || !certifiedAt)) throw new Error('CERTIFIED audit reports require certification metadata.');
  return {
    blockFarmId,
    period,
    status,
    qrHash,
    compiledByUserId,
    compiledAt: value.compiledAt || value.createdAt || now(),
    operationSnapshots: operations.map(canonicalSnapshot),
    certificationNotes: value.certificationNotes || '',
    certifiedByUserId,
    certifiedAt,
    createdAt: value.createdAt || value.compiledAt || now(),
    updatedAt: context.updatedAt || value.updatedAt || now()
  };
};

export const fromReport = (id, value) => {
  const operations = Array.isArray(value.operationSnapshots) ? value.operationSnapshots : [];
  return {
    id,
    reportId: id,
    ...value,
    month: value.period,
    totalLogs: operations.length,
    logsCount: operations.length,
    totalCost: operations.reduce((sum, item) => sum + Number(item.totalCost || 0), 0),
    operations,
    logs: operations,
    qrSignature: value.qrHash,
    certifiedBy: value.certifiedByUserId,
    compiledBy: value.compiledByUserId
  };
};

const priceString = (value, fieldName) => {
  const result = String(value == null ? '' : value).trim();
  if (!result) throw new Error(`Invalid sra_prices record: ${fieldName} is required.`);
  return result;
};

const priceNumber = (value, fieldName) => {
  if (value == null || value === '') throw new Error(`Invalid sra_prices record: ${fieldName} is required.`);
  const result = Number(value);
  if (!Number.isFinite(result)) throw new Error(`Invalid sra_prices record: ${fieldName} must be numeric.`);
  return result;
};

const priceTimestamp = value => {
  const result = priceString(value, 'publishedAt');
  const parsed = new Date(result);
  if (Number.isNaN(parsed.getTime()) || !result.includes('T')) {
    throw new Error('Invalid sra_prices record: publishedAt must be an ISO-8601 timestamp.');
  }
  return parsed.toISOString();
};

export const canonicalPrice = (value, userId) => {
  const effectiveDate = priceString(value.effectiveDate, 'effectiveDate');
  const parsedEffectiveDate = new Date(`${effectiveDate}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)
    || Number.isNaN(parsedEffectiveDate.getTime())
    || parsedEffectiveDate.toISOString().slice(0, 10) !== effectiveDate) {
    throw new Error('Invalid sra_prices record: effectiveDate must use YYYY-MM-DD.');
  }
  return {
    effectiveDate,
    weekLabel: priceString(value.weekLabel, 'weekLabel'),
    sugarPricePerLkg: priceNumber(value.sugarPricePerLkg, 'sugarPricePerLkg'),
    sugarPriceChange: priceNumber(value.sugarPriceChange, 'sugarPriceChange'),
    molassesPricePerMetricTon: priceNumber(value.molassesPricePerMetricTon, 'molassesPricePerMetricTon'),
    molassesPriceChange: priceNumber(value.molassesPriceChange, 'molassesPriceChange'),
    circularNumber: priceString(value.circularNumber, 'circularNumber'),
    source: priceString(value.source, 'source'),
    publishedByUserId: priceString(value.publishedByUserId || userId, 'publishedByUserId'),
    publishedAt: priceTimestamp(value.publishedAt || now())
  };
};

export const toPrice = (value, userId) => canonicalPrice(value || {}, userId);
export const fromPrice = (id, value) => ({ id: priceString(id, 'id'), ...canonicalPrice(value || {}) });

export const toTicket = (value, userId) => ({
  createdByUserId: value.createdByUserId || value.memberId || userId || '',
  fieldId: value.fieldId || null,
  title: value.title || value.subject || '',
  category: value.category || 'General Support',
  priority: String(value.priority || 'NORMAL').toUpperCase(),
  status: String(value.status || 'OPEN').replace(/\s+/g, '_').toUpperCase(),
  details: value.details || '',
  resolutionNotes: value.resolutionNotes || '',
  createdAt: value.createdAt || now(),
  updatedAt: value.updatedAt || now(),
  resolvedAt: value.resolvedAt || null,
  resolvedByUserId: value.resolvedByUserId || null
});

export const fromTicket = (id, value) => ({
  id,
  ...value,
  subject: value.title,
  memberId: value.createdByUserId
});
