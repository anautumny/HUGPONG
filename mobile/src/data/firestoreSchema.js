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

const canonicalAuditStatus = value => {
  const status = String(value || '').trim().toUpperCase().replace(/[\s-]+/g, '_');
  if (['PENDING', 'SUBMITTED', 'VERIFIED'].includes(status)) return 'PENDING_REVIEW';
  return ['COMPILED', 'PENDING_SUBMISSION', 'PENDING_REVIEW', 'RETURNED', 'CERTIFIED'].includes(status) ? status : 'COMPILED';
};

export const ROLES = Object.freeze({
  MEMBER_FARMER: 'MEMBER_FARMER',
  FARM_MANAGER: 'FARM_MANAGER',
  SRA_ADMIN: 'SRA_ADMIN',
  SUPER_ADMIN: 'SUPER_ADMIN'
});

const ROLE_LABELS = Object.freeze({
  [ROLES.MEMBER_FARMER]: 'Farm Member',
  [ROLES.FARM_MANAGER]: 'Farm Manager',
  [ROLES.SRA_ADMIN]: 'SRA Admin',
  [ROLES.SUPER_ADMIN]: 'Super Admin'
});

export const ROLE_ALLOWED_PLATFORMS = Object.freeze({
  [ROLES.MEMBER_FARMER]: Object.freeze(['mobile']),
  [ROLES.FARM_MANAGER]: Object.freeze(['mobile', 'web']),
  [ROLES.SRA_ADMIN]: Object.freeze(['mobile', 'web']),
  [ROLES.SUPER_ADMIN]: Object.freeze(['web'])
});

export function isRoleAllowedOnPlatform(role, platform) {
  const canonical = canonicalRole(role);
  if (!canonical) return false;
  const plat = String(platform || '').trim().toLowerCase();
  if (!plat) return true;
  const allowed = ROLE_ALLOWED_PLATFORMS[canonical];
  return Boolean(allowed && allowed.includes(plat));
}

const ROLE_ALIASES = Object.freeze({
  MEMBER: ROLES.MEMBER_FARMER,
  'MEMBER FARMER': ROLES.MEMBER_FARMER,
  'FARM MEMBER': ROLES.MEMBER_FARMER,
  MEMBER_FARMER: ROLES.MEMBER_FARMER,
  'FARM MANAGER': ROLES.FARM_MANAGER,
  FARM_MANAGER: ROLES.FARM_MANAGER,
  MANAGER: ROLES.FARM_MANAGER,
  'SRA ADMIN': ROLES.SRA_ADMIN,
  'SRA (ADMIN)': ROLES.SRA_ADMIN,
  SRA_ADMIN: ROLES.SRA_ADMIN,
  ADMIN: ROLES.SRA_ADMIN,
  'SUPER ADMIN': ROLES.SUPER_ADMIN,
  SUPER_ADMIN: ROLES.SUPER_ADMIN,
  SUPERADMIN: ROLES.SUPER_ADMIN
});

export function canonicalRole(value) {
  return ROLE_ALIASES[String(value || '').trim().toUpperCase()] || null;
}

export function roleLabel(value) {
  return ROLE_LABELS[canonicalRole(value)] || '';
}

export function createCycleId(fieldId, sequenceNumber = 1) {
  return `CYC-${String(fieldId || '').trim().toUpperCase()}-${String(Number(sequenceNumber) || 1).padStart(3, '0')}`;
}

export function fromUserDocument(id, value = {}) {
  return {
    id,
    employeeId: id,
    displayName: value.displayName,
    name: value.displayName,
    phone: value.phone,
    contact: value.phone,
    role: roleLabel(value.role),
    canonicalRole: value.role,
    status: value.status,
    phoneVerifiedAt: value.phoneVerifiedAt,
    phoneVerified: Boolean(value.phoneVerifiedAt),
    requiresPasswordChange: Boolean(value.requiresPasswordChange),
    passwordChangedAt: value.passwordChangedAt,
    approvedByUserId: value.approvedByUserId,
    approvedAt: value.approvedAt,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    assignment: value.assignment || null
  };
}

export function toUserDocument(value = {}) {
  const role = canonicalRole(value.canonicalRole || value.role);
  if (!role) throw new Error('User role must be canonical.');
  return {
    displayName: String(value.displayName || value.name || '').trim(),
    phone: String(value.phone || value.contact || '').replace(/\D/g, ''),
    role,
    status: String(value.status || 'PENDING').toUpperCase(),
    phoneVerifiedAt: value.phoneVerifiedAt || null,
    requiresPasswordChange: Boolean(value.requiresPasswordChange),
    passwordChangedAt: value.passwordChangedAt || null,
    approvedByUserId: value.approvedByUserId || null,
    approvedAt: value.approvedAt || null,
    createdAt: value.createdAt || new Date().toISOString(),
    updatedAt: value.updatedAt || new Date().toISOString()
  };
}

export function fromBlockFarmDocument(id, value = {}) {
  return {
    id,
    ...value,
    declaredHa: Number(value.declaredAreaHa || 0),
    farmManagerId: value.managerUserId || ''
  };
}

export function toBlockFarmDocument(value = {}) {
  return {
    code: String(value.code || '').trim().toUpperCase(),
    name: String(value.name || '').trim(),
    location: String(value.location || '').trim(),
    declaredAreaHa: Number(value.declaredAreaHa ?? value.declaredHa ?? 0),
    managerUserId: value.managerUserId || value.farmManagerId || null,
    status: String(value.status || 'ACTIVE').toUpperCase(),
    createdAt: value.createdAt || new Date().toISOString(),
    updatedAt: value.updatedAt || new Date().toISOString(),
    archivedAt: value.archivedAt || null
  };
}

export function fromCycleDocument(id, value = {}) {
  return { id, ...value };
}

export function formatCropYear(val, fallback = '—') {
  if (!val) return fallback;
  const str = String(val).trim();
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

export function toCycleDocument(field = {}, cycle = {}) {
  const sequenceNumber = Number(cycle.sequenceNumber || field.cycleNumber || 1);
  if (!Number.isInteger(sequenceNumber) || sequenceNumber < 1) throw new Error('sequenceNumber must be an integer >= 1.');
  const status = String(cycle.status || 'ACTIVE').toUpperCase();
  if (status !== 'ACTIVE' && status !== 'ARCHIVED') throw new Error('Crop Year Cycle status must be ACTIVE or ARCHIVED.');
  const archivedAt = status === 'ARCHIVED' ? (cycle.archivedAt || null) : null;
  const archivedByUserId = status === 'ARCHIVED' ? (cycle.archivedByUserId || null) : null;
  if (status === 'ARCHIVED' && (!archivedAt || !archivedByUserId)) throw new Error('ARCHIVED Crop Year Cycles require archive metadata.');
  return {
    fieldId: String(field.id || cycle.fieldId || '').trim().toUpperCase(),
    sequenceNumber,
    cropType: cycle.cropType || field.cycleType || 'Plant Cane (New Plant)',
    variety: String(cycle.variety || '').trim(),
    cropYear: formatCropYear(cycle.cropYear || field.cropYear || ''),
    currentStageNumber: Number(cycle.currentStageNumber || field.stageNumber || 1),
    elapsedMonths: Number(cycle.elapsedMonths ?? field.month ?? 0),
    batchNumber: Number(cycle.batchNumber || field.batchMonth || 1),
    status,
    startedAt: cycle.startedAt || field.createdAt || new Date().toISOString(),
    updatedAt: cycle.updatedAt || new Date().toISOString(),
    archivedAt,
    archivedByUserId
  };
}

export function fromFieldDocument(id, value = {}, cycle = null) {
  const cycleStageNumber = Number(cycle?.currentStageNumber);
  const canonicalStageNumber = Number.isInteger(cycleStageNumber) && cycleStageNumber >= 1 && cycleStageNumber <= 6
    ? cycleStageNumber
    : null;
  return {
    id,
    ...value,
    memberId: value.memberUserId || '',
    memberName: value.memberName || value.member || value.memberUserId || '',
    member: value.memberName || value.member || value.memberUserId || '',
    ha: Number(value.areaHa || 0),
    stageNumber: canonicalStageNumber,
    month: Number(cycle?.elapsedMonths || 0),
    batchMonth: Number(cycle?.batchNumber || 1),
    cycleNumber: Number(cycle?.sequenceNumber || 1),
    cycleType: cycle?.cropType || '',
    cropYear: formatCropYear(cycle?.cropYear || value.cropYear || ''),
    variety: String(cycle?.variety || value.variety || '').trim(),
    varietySource: cycle?.variety ? 'CROP_YEAR_CYCLE' : (value.variety ? 'LEGACY_FIELD' : '')
  };
}

export function toFieldDocument(value = {}) {
  const blockFarmId = String(value.blockFarmId || '').trim().toUpperCase();
  const currentCycleId = String(value.currentCycleId || '').trim().toUpperCase();
  if (!blockFarmId || !currentCycleId) throw new Error('Field requires blockFarmId and currentCycleId.');
  const status = String(value.status || 'ACTIVE').toUpperCase();
  if (status !== 'ACTIVE' && status !== 'ARCHIVED') throw new Error('Field status must be ACTIVE or ARCHIVED.');
  return {
    blockFarmId,
    memberUserId: value.memberUserId || value.memberId || null,
    areaHa: Number(value.areaHa ?? value.ha ?? 0),
    soilType: String(value.soilType || '').trim(),
    currentCycleId,
    status,
    customStages: Array.isArray(value.customStages) ? value.customStages : [],
    customOperations: value.customOperations && typeof value.customOperations === 'object' ? value.customOperations : {},
    createdAt: value.createdAt || new Date().toISOString(),
    updatedAt: value.updatedAt || new Date().toISOString(),
    archivedAt: value.archivedAt || null
  };
}

function canonicalLineItems(value) {
  const input = Array.isArray(value.lineItems) ? value.lineItems : (Array.isArray(value.subItems) ? value.subItems : []);
  return input.map((item, index) => ({
    lineItemId: item.lineItemId || item.id || `LINE-${index + 1}`,
    description: String(item.description || '').trim(),
    quantity: Number(item.quantity ?? item.qty ?? 0),
    unit: String(item.unit || '').trim(),
    unitCost: Number(item.unitCost || 0),
    subtotal: Number(item.subtotal ?? item.subTotal ?? 0)
  }));
}

function canonicalAmendments(value) {
  if (!Array.isArray(value)) return [];
  return value.map(item => ({
      amendmentId: item.amendmentId,
      amendedByUserId: item.amendedByUserId || '',
      amendedByName: item.amendedByName || '',
      amendedByRole: item.amendedByRole || '',
      reason: item.reason || '',
      amendedAt: item.amendedAt,
      changes: item.changes && typeof item.changes === 'object' ? item.changes : {}
    }));
}

function canonicalPhotoEvidence(value) {
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
    capturedAt: value.capturedAt || new Date().toISOString()
  };
}

export function toOperationLogDocument(value = {}, context = {}) {
  const status = String(context.status || value.status || 'ACTIVE').toUpperCase();
  if (status !== 'ACTIVE' && status !== 'ARCHIVED') throw new Error('Operation log status must be ACTIVE or ARCHIVED.');
  const quantityValue = value.quantity && typeof value.quantity === 'object'
    ? value.quantity
    : ((value.inputQty || value.qty) ? { value: Number(value.inputQty || value.qty), unit: value.inputUnit || value.unit || '', inputName: value.inputName || '' } : null);
  const fieldId = String(value.fieldId || '').trim().toUpperCase();
  const cycleId = String(context.cycleId || value.cycleId || '').trim().toUpperCase();
  const submittedByUserId = context.submittedByUserId || value.submittedByUserId || value.loggedById || '';
  if (!fieldId || !cycleId || !submittedByUserId) throw new Error('Operation log requires fieldId, cycleId, and submittedByUserId.');
  const archivedAt = status === 'ARCHIVED' ? (context.archivedAt || value.archivedAt || null) : null;
  const archivedByUserId = status === 'ARCHIVED' ? (context.archivedByUserId || value.archivedByUserId || null) : null;
  if (status === 'ARCHIVED' && (!archivedAt || !archivedByUserId)) throw new Error('ARCHIVED operation logs require archive metadata.');
  return {
    fieldId,
    cycleId,
    blockFarmId: String(context.blockFarmId || value.blockFarmId || '').trim().toUpperCase() || null,
    cropYearCycle: formatCropYear(context.cropYearCycle || value.cropYearCycle || value.cropYear || '', '') || null,
    stageNumberAtRecord: (context.stageNumberAtRecord ?? value.stageNumberAtRecord) == null
      ? null
      : Number(context.stageNumberAtRecord ?? value.stageNumberAtRecord),
    submittedByUserId,
    submissionSource: context.submissionSource || value.submissionSource || '',
    operationDefinitionId: value.operationDefinitionId || value.sraOperationId || 'CUSTOM',
    operationName: String(value.operationName || value.activity || '').trim(),
    category: String(value.category || '').trim(),
    variety: String(value.variety || '').trim(),
    stageNumber: Number(value.stageNumber || 1),
    performedOn: value.performedOn || value.isoDate || String(value.date || '').slice(0, 10),
    areaHa: Number(value.areaHa ?? value.hectares ?? value.ha ?? 0),
    peopleCount: Number(value.peopleCount ?? value.people ?? 0),
    quantity: quantityValue,
    totalCost: Number(value.totalCost ?? value.cost ?? 0),
    lineItems: canonicalLineItems(value),
    photoEvidence: canonicalPhotoEvidence(value.photoEvidence),
    isSupplemental: Boolean(value.isSupplemental),
    amendments: canonicalAmendments(value.amendments),
    status,
    createdAt: value.createdAt || new Date().toISOString(),
    updatedAt: context.updatedAt || value.updatedAt || new Date().toISOString(),
    archivedAt,
    archivedByUserId
  };
}

export function fromOperationLogDocument(id, value = {}) {
  return {
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
    subItems: (value.lineItems || []).map(item => ({
      id: item.lineItemId,
      description: item.description,
      qty: item.quantity,
      unit: item.unit,
      unitCost: item.unitCost,
      subTotal: item.subtotal
    })),
    inputQty: value.quantity?.value ?? '',
    inputUnit: value.quantity?.unit || '',
    inputName: value.quantity?.inputName || '',
    loggedById: value.submittedByUserId,
    archivedAt: value.archivedAt || null
  };
}

export function operationSnapshot(id, value) {
  const log = toOperationLogDocument(value, { cycleId: value.cycleId, submittedByUserId: value.submittedByUserId || value.loggedById, status: value.status || 'ACTIVE' });
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
    variety: log.variety,
    stageNumber: log.stageNumber,
    performedOn: log.performedOn,
    areaHa: log.areaHa,
    peopleCount: log.peopleCount,
    quantity: log.quantity,
    totalCost: log.totalCost,
    lineItems: log.lineItems,
    amendments: log.amendments,
    submittedByUserId: log.submittedByUserId || null,
    submissionSource: log.submissionSource || null,
    createdAt: log.createdAt || null,
    updatedAt: log.updatedAt || null
  };
}

export function toReportPeriod(value) {
  const input = String(value || '').trim().replace(/\s*\([^)]*\)\s*$/, '');
  const isoPeriod = input.match(/^(\d{4})-(0[1-9]|1[0-2])(?:-|T|$)/);
  if (isoPeriod) return `${isoPeriod[1]}-${isoPeriod[2]}`;

  const namedPeriod = input.replace(/,/g, ' ').replace(/\s+/g, ' ').match(/^([A-Za-z]+) (\d{4})$/);
  if (!namedPeriod) return '';
  const monthToken = namedPeriod[1].toLowerCase();
  const monthNames = [
    'january', 'february', 'march', 'april', 'may', 'june',
    'july', 'august', 'september', 'october', 'november', 'december'
  ];
  const monthIndex = monthNames.findIndex(month => month === monthToken || (monthToken.length >= 3 && month.startsWith(monthToken)));
  return monthIndex < 0 ? '' : `${namedPeriod[2]}-${String(monthIndex + 1).padStart(2, '0')}`;
}

export function toAuditReportDocument(value = {}, context = {}) {
  const sourceOperations = value.operationSnapshots || value.operations || value.logs || [];
  const operationSnapshots = sourceOperations.map(item => {
    if (item.operationLogId && item.cycleId) return {
      operationLogId: item.operationLogId,
      fieldId: String(item.fieldId || '').trim().toUpperCase(),
      cycleId: String(item.cycleId || '').trim().toUpperCase(),
      blockFarmId: String(item.blockFarmId || '').trim().toUpperCase() || null,
      cropYearCycle: formatCropYear(item.cropYearCycle || '', '') || null,
      stageNumberAtRecord: item.stageNumberAtRecord == null ? null : Number(item.stageNumberAtRecord),
      operationDefinitionId: item.operationDefinitionId || 'CUSTOM',
      operationName: String(item.operationName || '').trim(),
      category: String(item.category || '').trim(),
      variety: String(item.variety || '').trim(),
      stageNumber: Number(item.stageNumber || 1),
      performedOn: item.performedOn,
      areaHa: Number(item.areaHa || 0),
      peopleCount: Number(item.peopleCount || 0),
      quantity: item.quantity && typeof item.quantity === 'object' ? item.quantity : null,
      totalCost: Number(item.totalCost || 0),
      lineItems: canonicalLineItems(item),
      amendments: canonicalAmendments(item.amendments),
      submittedByUserId: item.submittedByUserId || null,
      submissionSource: item.submissionSource || null,
      createdAt: item.createdAt || null,
      updatedAt: item.updatedAt || null
    };
    return operationSnapshot(item.id || item.operationLogId, item);
  });
  const status = canonicalAuditStatus(context.status || value.status || 'COMPILED');
  const blockFarmId = String(value.blockFarmId || '').trim().toUpperCase();
  const period = toReportPeriod(value.periodKey || value.period || value.month);
  const qrHash = value.qrHash || value.qrSignature || '';
  const compiledByUserId = context.compiledByUserId || value.compiledByUserId || '';
  if (!blockFarmId || !period) throw new Error('Audit report requires blockFarmId and YYYY-MM period.');
  if (!qrHash || !compiledByUserId || operationSnapshots.length === 0) throw new Error('Audit report requires qrHash, compiledByUserId, and operation snapshots.');
  const certifiedByUserId = status === 'CERTIFIED' ? (context.certifiedByUserId || value.certifiedByUserId || null) : null;
  const certifiedAt = status === 'CERTIFIED' ? (context.certifiedAt || value.certifiedAt || null) : null;
  if (status === 'CERTIFIED' && (!certifiedByUserId || !certifiedAt)) throw new Error('CERTIFIED audit reports require certification metadata.');
  return {
    blockFarmId,
    period,
    periodKey: period,
    status,
    qrHash,
    compiledByUserId,
    compiledAt: value.compiledAt || value.createdAt || new Date().toISOString(),
    operationSnapshots,
    fieldSnapshots: Array.isArray(value.fieldSnapshots) ? value.fieldSnapshots : [],
    sourceLogIds: Array.isArray(value.sourceLogIds) ? value.sourceLogIds : operationSnapshots.map(item => item.operationLogId),
    blockFarmName: value.blockFarmName || value.blockFarm || blockFarmId,
    compiledByName: value.compiledByName || '',
    certificationNotes: value.certificationNotes || '',
    certifiedByUserId,
    certifiedAt,
    createdAt: value.createdAt || value.compiledAt || new Date().toISOString(),
    updatedAt: context.updatedAt || value.updatedAt || new Date().toISOString(),
    reportVersion: Number(value.reportVersion || 1),
    rootReportId: value.rootReportId || '',
    integrityHash: value.integrityHash || qrHash,
    operationCount: Number(value.operationCount || operationSnapshots.length),
    fieldCount: Number(value.fieldCount || new Set(operationSnapshots.map(item => item.fieldId)).size),
    memberCount: Number(value.memberCount || 0),
    hectaresAudited: Number(value.hectaresAudited || 0),
    totalCost: Number(value.totalCost || operationSnapshots.reduce((sum, item) => sum + Number(item.totalCost || 0), 0)),
    submittedAt: value.submittedAt || null,
    submittedByUserId: value.submittedByUserId || null,
    submissionMethod: value.submissionMethod || null,
    submissionMethods: Array.isArray(value.submissionMethods) ? value.submissionMethods : [],
    deliveryMethod: value.deliveryMethod || null,
    deliveryStatus: value.deliveryStatus || 'READY',
    returnReason: value.returnReason || ''
  };
}

export function fromAuditReportDocument(id, value = {}) {
  const operations = Array.isArray(value.operationSnapshots) ? value.operationSnapshots : [];
  const fieldAreas = new Map();
  operations.forEach(item => fieldAreas.set(item.fieldId, Math.max(fieldAreas.get(item.fieldId) || 0, Number(item.areaHa || 0))));
  return {
    id,
    ...value,
    status: canonicalAuditStatus(value.status),
    reportId: id,
    periodKey: value.periodKey || value.period,
    month: value.periodKey || value.period,
    totalLogs: operations.length,
    logsCount: operations.length,
    totalCost: operations.reduce((sum, item) => sum + Number(item.totalCost || 0), 0),
    totalHectares: Number(value.hectaresAudited || Array.from(fieldAreas.values()).reduce((sum, area) => sum + area, 0)),
    operations,
    logs: operations,
    qrSignature: value.qrHash,
    certifiedBy: value.certifiedByUserId,
    compiledBy: value.compiledByUserId
  };
}

export function toPriceDocument(value = {}, userId = '') {
  const requiredText = (fieldValue, fieldName) => {
    const result = String(fieldValue == null ? '' : fieldValue).trim();
    if (!result) throw new Error(`Invalid sra_prices record: ${fieldName} is required.`);
    return result;
  };
  const requiredNumber = (fieldValue, fieldName) => {
    if (fieldValue == null || fieldValue === '') throw new Error(`Invalid sra_prices record: ${fieldName} is required.`);
    const result = Number(fieldValue);
    if (!Number.isFinite(result)) throw new Error(`Invalid sra_prices record: ${fieldName} must be numeric.`);
    return result;
  };
  const effectiveDate = requiredText(value.effectiveDate, 'effectiveDate');
  const parsedEffectiveDate = new Date(`${effectiveDate}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)
    || Number.isNaN(parsedEffectiveDate.getTime())
    || parsedEffectiveDate.toISOString().slice(0, 10) !== effectiveDate) {
    throw new Error('Invalid sra_prices record: effectiveDate must use YYYY-MM-DD.');
  }
  const publishedAt = requiredText(value.publishedAt || new Date().toISOString(), 'publishedAt');
  const parsedPublishedAt = new Date(publishedAt);
  if (Number.isNaN(parsedPublishedAt.getTime()) || !publishedAt.includes('T')) {
    throw new Error('Invalid sra_prices record: publishedAt must be an ISO-8601 timestamp.');
  }
  return {
    effectiveDate,
    weekLabel: requiredText(value.weekLabel, 'weekLabel'),
    sugarPricePerLkg: requiredNumber(value.sugarPricePerLkg, 'sugarPricePerLkg'),
    sugarPriceChange: requiredNumber(value.sugarPriceChange, 'sugarPriceChange'),
    molassesPricePerMetricTon: requiredNumber(value.molassesPricePerMetricTon, 'molassesPricePerMetricTon'),
    molassesPriceChange: requiredNumber(value.molassesPriceChange, 'molassesPriceChange'),
    circularNumber: requiredText(value.circularNumber, 'circularNumber'),
    source: requiredText(value.source, 'source'),
    publishedByUserId: requiredText(value.publishedByUserId || userId, 'publishedByUserId'),
    publishedAt: parsedPublishedAt.toISOString()
  };
}

export function fromPriceDocument(id, value = {}) {
  return {
    id,
    ...toPriceDocument(value, value.publishedByUserId)
  };
}

export function toSupportTicketDocument(value = {}, userId = '') {
  const status = String(value.status || 'OPEN').replace(/\s+/g, '_').toUpperCase();
  const priority = String(value.priority || 'NORMAL').toUpperCase();
  return {
    createdByUserId: value.createdByUserId || value.memberId || userId,
    requesterName: value.requesterName || value.memberName || '',
    requesterRole: value.requesterRole || '',
    blockFarmId: value.blockFarmId || null,
    fieldId: value.fieldId || null,
    operationId: value.operationId || null,
    auditReportId: value.auditReportId || null,
    title: value.title || value.subject || '',
    category: value.category || 'Other',
    priority,
    status,
    details: value.details || '',
    messages: Array.isArray(value.messages) ? value.messages : [],
    statusHistory: Array.isArray(value.statusHistory) ? value.statusHistory : [],
    resolutionNotes: value.resolutionNotes || '',
    createdAt: value.createdAt || new Date().toISOString(),
    updatedAt: value.updatedAt || new Date().toISOString(),
    resolvedAt: value.resolvedAt || null,
    resolvedByUserId: value.resolvedByUserId || null
  };
}

export function fromSupportTicketDocument(id, value = {}) {
  return {
    id,
    ...value,
    status: String(value.status || 'OPEN').replace(/[\s-]+/g, '_').toUpperCase(),
    messages: Array.isArray(value.messages) ? value.messages : [],
    statusHistory: Array.isArray(value.statusHistory) ? value.statusHistory : [],
    subject: value.title,
    memberId: value.createdByUserId
  };
}
