'use strict';

const express = require('express');
const router = express.Router();
const { db } = require('../firebase-admin');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/roleGuard');
const {
  COLLECTIONS, ROLES, canonicalRole, buildOperationSnapshot, createAuditHash,
  reportPeriod, nowIso, optionalString
} = require('../schema/firestoreSchema');
const { readMutationContext, assertBaseVersion } = require('../services/mutationContext');
const {
  AUDIT_STATUS, QR_SCHEMA_VERSION, canonicalAuditStatus, businessPeriod,
  rootAuditReportId, versionedAuditReportId, summarizeSnapshots,
  buildFieldSnapshots, validateCanonicalAuditReport,
  AUDIT_DELIVERY_METHOD, AUDIT_DELIVERY_STATUS,
  encodeQrPayload, decodeQrPayload, selectAuditCompilationBatch
} = require('../domain/auditWorkflow');

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;
let missingIndexFallbackLogged = false;

function identity(req) {
  return {
    actorId: String(req.session.user.employeeId || req.session.user.userId || '').trim(),
    actorName: String(req.session.user.name || req.session.user.displayName || 'HUGPONG User').trim(),
    actorRole: canonicalRole(req.session.user.role || req.session.user.roleKey)
  };
}

function normalizedReport(document) {
  const value = document.data ? document.data() : document;
  const id = document.id || value.id;
  const periodKey = value.periodKey || value.period;
  return {
    id,
    ...value,
    status: canonicalAuditStatus(value.status) || value.status,
    periodKey,
    period: periodKey,
    reportVersion: Number(value.reportVersion || 1),
    rootReportId: value.rootReportId || rootAuditReportId(value.blockFarmId, periodKey)
  };
}

async function assignedFarmsForManager(actorId) {
  const snapshot = await db.collection(COLLECTIONS.BLOCK_FARMS).where('managerUserId', '==', actorId).get();
  return snapshot.docs.map(document => ({ id: document.id, ...document.data() }));
}

async function resolveAssignedFarm(req) {
  const { actorId } = identity(req);
  const farms = await assignedFarmsForManager(actorId);
  if (!farms.length) throw Object.assign(new Error('No Block Farm is assigned to this Farm Manager.'), { status: 403 });
  const requestedId = String(req.body?.blockFarmId || req.query?.blockFarmId || '').trim().toUpperCase();
  if (!requestedId && farms.length === 1) return farms[0];
  const assigned = farms.find(farm => farm.id === requestedId);
  if (!assigned) throw Object.assign(new Error('Only the assigned Farm Manager may access this Block Farm audit.'), { status: 403 });
  return assigned;
}

async function loadFarmAuditData(blockFarmId, period) {
  const fieldSnapshot = await db.collection(COLLECTIONS.FIELDS).where('blockFarmId', '==', blockFarmId).get();
  const activeFields = fieldSnapshot.docs
    .filter(document => String(document.data().status || 'ACTIVE').toUpperCase() === 'ACTIVE')
    .map(document => ({ id: document.id, ...document.data() }));
  if (!activeFields.length) throw new Error('The assigned Block Farm has no active fields to audit.');

  const memberIds = Array.from(new Set(activeFields.map(field => field.memberUserId).filter(Boolean)));
  if (memberIds.length) {
    try {
      const memberDocuments = typeof db.getAll === 'function'
        ? await db.getAll(...memberIds.map(id => db.collection(COLLECTIONS.USERS).doc(id)))
        : await Promise.all(memberIds.map(id => db.collection(COLLECTIONS.USERS).doc(id).get()));
      const memberNames = new Map(memberDocuments.filter(document => document.exists).map(document => [
        document.id,
        document.data().displayName || document.data().name || document.id
      ]));
      activeFields.forEach(field => { field.memberName = memberNames.get(field.memberUserId) || field.memberUserId || null; });
    } catch (error) {
      console.warn('[Audit Reports] Member names could not be embedded in the snapshot:', error.message);
      activeFields.forEach(field => { field.memberName = field.memberName || field.memberUserId || null; });
    }
  }

  const logDocuments = [];
  for (let index = 0; index < activeFields.length; index += 10) {
    const fieldIds = activeFields.slice(index, index + 10).map(field => field.id);
    const snapshot = await db.collection(COLLECTIONS.OPERATION_LOGS).where('fieldId', 'in', fieldIds).get();
    logDocuments.push(...snapshot.docs);
  }
  const eligibleLogDocuments = logDocuments.filter(document => {
    const log = document.data();
    return String(log.status || '').toUpperCase() === 'ACTIVE'
      && Boolean(log.cycleId)
      && String(log.performedOn || '').startsWith(`${period}-`);
  });
  return { activeFields, eligibleLogDocuments };
}

async function reportsForFarmPeriod(blockFarmId, period) {
  const snapshot = await db.collection(COLLECTIONS.AUDIT_REPORTS).where('blockFarmId', '==', blockFarmId).get();
  return snapshot.docs.map(normalizedReport)
    .filter(report => report.periodKey === period)
    .sort((left, right) => right.reportVersion - left.reportVersion);
}

async function resolveQrInput(rawPayload) {
  try {
    let payload = decodeQrPayload(rawPayload);
    const snapshot = await db.collection(COLLECTIONS.AUDIT_REPORTS).doc(payload.reportId).get();
    // Legacy v1 codes contained only an identifier and summary. Keep them as an
    // online lookup path, but never mistake them for a complete offline transfer.
    if (payload.legacyLookupOnly) {
      if (!snapshot.exists) throw Object.assign(new Error('This legacy QR code requires its authoritative audit report to be online.'), { status: 404 });
      payload = validateCanonicalAuditReport(normalizedReport(snapshot));
    }
    return { payload, snapshot };
  } catch (decodeError) {
    const code = String(rawPayload || '').trim().toUpperCase();
    if (/^(AUD|RPT)-[A-Z0-9-]+$/.test(code)) {
      const snapshot = await db.collection(COLLECTIONS.AUDIT_REPORTS).doc(code).get();
      if (!snapshot.exists) throw Object.assign(new Error('Audit report not found.'), { status: 404 });
      const report = normalizedReport(snapshot);
      return { payload: validateCanonicalAuditReport(report), snapshot };
    }
    if (/^HUG-[A-Z0-9-]+$/.test(code)) {
      const query = await db.collection(COLLECTIONS.AUDIT_REPORTS).where('qrHash', '==', code).limit(1).get();
      if (query.empty) throw Object.assign(new Error('Audit hash not found.'), { status: 404 });
      const snapshot = query.docs[0];
      const report = normalizedReport(snapshot);
      return { payload: validateCanonicalAuditReport(report), snapshot };
    }
    throw decodeError;
  }
}

function pageSize(value) {
  const parsed = Number(value || DEFAULT_PAGE_SIZE);
  return Number.isInteger(parsed) ? Math.min(MAX_PAGE_SIZE, Math.max(1, parsed)) : DEFAULT_PAGE_SIZE;
}

function isMissingIndexError(error) {
  const code = String(error?.code ?? '').toLowerCase();
  return code === '9'
    || code === 'failed-precondition'
    || code === 'failed_precondition'
    || /requires an index/i.test(String(error?.message || ''));
}

function reportTimestampMillis(report, field) {
  const value = report?.[field];
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (typeof value?._seconds === 'number') return value._seconds * 1000;
  const parsed = Date.parse(value || '');
  return Number.isFinite(parsed) ? parsed : 0;
}

function sortAndPageReports(reports, field, cursor, limit) {
  let rows = [...reports].sort((left, right) => reportTimestampMillis(right, field) - reportTimestampMillis(left, field)
    || String(right.id).localeCompare(String(left.id)));
  if (cursor) {
    const cursorIndex = rows.findIndex(report => report.id === String(cursor));
    if (cursorIndex >= 0) rows = rows.slice(cursorIndex + 1);
  }
  const hasMore = rows.length > limit;
  const data = rows.slice(0, limit);
  return { data, hasMore, nextCursor: hasMore ? data[data.length - 1]?.id || null : null };
}

function logMissingIndexFallback() {
  if (missingIndexFallbackLogged) return;
  missingIndexFallbackLogged = true;
  console.warn('[Audit Reports] Composite index unavailable; using the authorization-scoped fallback query.');
}

async function listReports(req) {
  const { actorId, actorRole } = identity(req);
  const view = String(req.query.view || (actorRole === ROLES.SRA_ADMIN ? 'inbox' : 'manager')).toLowerCase();
  const limit = pageSize(req.query.limit);
  let query = db.collection(COLLECTIONS.AUDIT_REPORTS);
  let fallbackQuery = query;
  let sortField = 'compiledAt';

  if (actorRole === ROLES.FARM_MANAGER) {
    const farmIds = (await assignedFarmsForManager(actorId)).map(farm => farm.id);
    if (!farmIds.length) return { data: [], hasMore: false, nextCursor: null };
    if (farmIds.length > 10) throw Object.assign(new Error('Manager Block Farm scope exceeds the supported query limit.'), { status: 409 });
    fallbackQuery = query.where('blockFarmId', 'in', farmIds);
    query = fallbackQuery.orderBy('compiledAt', 'desc').limit(limit + 1);
  } else if (view === 'history') {
    sortField = 'certifiedAt';
    fallbackQuery = query.where('status', '==', AUDIT_STATUS.CERTIFIED);
    query = fallbackQuery.orderBy('certifiedAt', 'desc').limit(limit + 1);
  } else {
    let primaryQuery = query.where('status', '==', AUDIT_STATUS.PENDING_REVIEW).orderBy('submittedAt', 'desc').limit(limit + 1);
    if (req.query.cursor) {
      const cursor = await db.collection(COLLECTIONS.AUDIT_REPORTS).doc(String(req.query.cursor)).get();
      if (cursor.exists) primaryQuery = primaryQuery.startAfter(cursor);
    }
    let primarySnapshot;
    let legacySnapshot;
    try {
      [primarySnapshot, legacySnapshot] = await Promise.all([
        primaryQuery.get(),
        req.query.cursor
          ? Promise.resolve({ docs: [] })
          : db.collection(COLLECTIONS.AUDIT_REPORTS).where('status', '==', 'PENDING').limit(limit + 1).get()
      ]);
    } catch (error) {
      if (!isMissingIndexError(error)) throw error;
      logMissingIndexFallback();
      [primarySnapshot, legacySnapshot] = await Promise.all([
        db.collection(COLLECTIONS.AUDIT_REPORTS).where('status', '==', AUDIT_STATUS.PENDING_REVIEW).get(),
        req.query.cursor
          ? Promise.resolve({ docs: [] })
          : db.collection(COLLECTIONS.AUDIT_REPORTS).where('status', '==', 'PENDING').get()
      ]);
    }
    const unique = new Map([...primarySnapshot.docs, ...legacySnapshot.docs].map(document => [document.id, normalizedReport(document)]));
    return sortAndPageReports(Array.from(unique.values()).filter(report => Array.isArray(report.operationSnapshots) && report.operationSnapshots.length > 0).map(report => ({
      ...report,
      submittedAt: report.submittedAt || report.compiledAt
    })), 'submittedAt', req.query.cursor, limit);
  }

  if (req.query.cursor) {
    const cursor = await db.collection(COLLECTIONS.AUDIT_REPORTS).doc(String(req.query.cursor)).get();
    if (cursor.exists) query = query.startAfter(cursor);
  }
  try {
    const snapshot = await query.get();
    const rows = snapshot.docs.map(normalizedReport);
    const hasMore = rows.length > limit;
    const data = rows.slice(0, limit);
    return { data, hasMore, nextCursor: hasMore ? data[data.length - 1]?.id || null : null };
  } catch (error) {
    if (!isMissingIndexError(error)) throw error;
    logMissingIndexFallback();
    const snapshot = await fallbackQuery.get();
    return sortAndPageReports(snapshot.docs.map(normalizedReport), sortField, req.query.cursor, limit);
  }
}

router.get('/', requireAuth, requireRole([ROLES.FARM_MANAGER, ROLES.SRA_ADMIN]), async (req, res) => {
  try {
    if (!db) return res.status(503).json({ success: false, error: 'Database is unavailable.' });
    const page = await listReports(req);
    return res.json({ success: true, count: page.data.length, ...page });
  } catch (error) {
    return res.status(error.status || 500).json({ success: false, error: error.message });
  }
});

router.get('/next-period', requireAuth, requireRole([ROLES.FARM_MANAGER]), async (req, res) => {
  try {
    if (!db) return res.status(503).json({ success: false, error: 'Database is unavailable.' });
    const farm = await resolveAssignedFarm(req);
    const currentPeriod = businessPeriod();
    const fieldSnapshot = await db.collection(COLLECTIONS.FIELDS).where('blockFarmId', '==', farm.id).get();
    const activeFields = fieldSnapshot.docs
      .filter(document => String(document.data().status || 'ACTIVE').toUpperCase() === 'ACTIVE')
      .map(document => ({ id: document.id, ...document.data() }));
    const logDocuments = [];
    for (let index = 0; index < activeFields.length; index += 10) {
      const ids = activeFields.slice(index, index + 10).map(field => field.id);
      if (!ids.length) continue;
      const snapshot = await db.collection(COLLECTIONS.OPERATION_LOGS).where('fieldId', 'in', ids).get();
      logDocuments.push(...snapshot.docs);
    }
    const periods = Array.from(new Set(logDocuments
      .filter(document => String(document.data().status || '').toUpperCase() === 'ACTIVE' && Boolean(document.data().cycleId))
      .map(document => String(document.data().performedOn || '').slice(0, 7))
      .filter(period => /^\d{4}-(0[1-9]|1[0-2])$/.test(period) && period <= currentPeriod)))
      .sort();
    const reportsSnapshot = await db.collection(COLLECTIONS.AUDIT_REPORTS).where('blockFarmId', '==', farm.id).get();
    const reports = reportsSnapshot.docs.map(normalizedReport);
    const unresolvedPeriod = periods.find(period => {
      const eligibleForPeriod = logDocuments.filter(document => String(document.data().status || '').toUpperCase() === 'ACTIVE'
        && Boolean(document.data().cycleId)
        && String(document.data().performedOn || '').startsWith(`${period}-`));
      const matching = reports.filter(report => report.periodKey === period);
      const batch = selectAuditCompilationBatch(eligibleForPeriod, matching);
      return !matching.length || (!batch.replay && batch.operations.length > 0);
    });
    const periodKey = unresolvedPeriod || currentPeriod;
    const eligible = logDocuments.filter(document => String(document.data().status || '').toUpperCase() === 'ACTIVE'
      && Boolean(document.data().cycleId)
      && String(document.data().performedOn || '').startsWith(`${periodKey}-`));
    const snapshots = eligible.map(document => buildOperationSnapshot(document.id, document.data()));
    return res.json({ success: true, data: {
      blockFarmId: farm.id,
      blockFarmName: farm.name || farm.code || farm.id,
      periodKey,
      currentPeriod,
      isCarryover: periodKey < currentPeriod,
      ...summarizeSnapshots(snapshots, activeFields)
    } });
  } catch (error) {
    return res.status(error.status || 400).json({ success: false, error: error.message });
  }
});

router.get('/:id', requireAuth, requireRole([ROLES.FARM_MANAGER, ROLES.SRA_ADMIN]), async (req, res) => {
  try {
    const document = await db.collection(COLLECTIONS.AUDIT_REPORTS).doc(String(req.params.id || '')).get();
    if (!document.exists) return res.status(404).json({ success: false, error: 'Audit report not found.' });
    const report = normalizedReport(document);
    const { actorId, actorRole } = identity(req);
    if (actorRole === ROLES.FARM_MANAGER) {
      const farms = await assignedFarmsForManager(actorId);
      if (!farms.some(farm => farm.id === report.blockFarmId)) return res.status(403).json({ success: false, error: 'Audit report is outside your assigned Block Farm.' });
    }
    return res.json({ success: true, data: report });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/', requireAuth, requireRole([ROLES.FARM_MANAGER]), async (req, res) => {
  try {
    if (!db) return res.status(503).json({ success: false, error: 'Database is unavailable.' });
    const farm = await resolveAssignedFarm(req);
    const rawPeriod = req.body.periodKey ?? req.body.period;
    const period = reportPeriod(rawPeriod || businessPeriod());
    if (period > businessPeriod()) throw new Error('A future reporting period cannot be compiled.');
    const { actorId, actorName } = identity(req);
    const { activeFields, eligibleLogDocuments } = await loadFarmAuditData(farm.id, period);
    if (!eligibleLogDocuments.length) throw new Error(`No synchronized eligible operation logs were found for ${period} in the assigned Block Farm.`);
    const existing = await reportsForFarmPeriod(farm.id, period);
    const batch = selectAuditCompilationBatch(eligibleLogDocuments, existing);
    const latest = batch.latest;
    if (batch.replay) return res.json({ success: true, replayed: true, data: batch.replay });
    if (!batch.operations.length) throw new Error(`No new eligible operation logs were found for ${period}.`);
    if (batch.operations.length > 500) throw new Error('A report cannot contain more than 500 operation logs.');

    const version = latest ? latest.reportVersion + 1 : 1;
    const reportId = versionedAuditReportId(farm.id, period, version);
    if (req.body.id && String(req.body.id) !== reportId) return res.status(409).json({ success: false, error: `The canonical report identity for this audit is ${reportId}.` });
    const operationSnapshots = batch.operations.sort((left, right) => left.id.localeCompare(right.id))
      .map(document => buildOperationSnapshot(document.id, document.data()));
    const fieldSnapshots = buildFieldSnapshots(operationSnapshots, activeFields);
    const sourceLogIds = operationSnapshots.map(operation => operation.operationLogId);
    const now = nowIso();
    const integrityHash = createAuditHash(reportId, farm.id, period, operationSnapshots);
    const report = {
      rootReportId: rootAuditReportId(farm.id, period), reportVersion: version, previousVersionId: latest?.id || null,
      blockFarmId: farm.id, blockFarmName: farm.name || farm.code || farm.id, periodKey: period,
      status: AUDIT_STATUS.COMPILED, operationSnapshots, fieldSnapshots, sourceLogIds,
      memberCount: new Set(fieldSnapshots.map(field => field.memberId).filter(Boolean)).size,
      ...summarizeSnapshots(operationSnapshots, activeFields),
      compiledByUserId: actorId, compiledByName: actorName, compiledAt: now,
      qrSchemaVersion: QR_SCHEMA_VERSION, integrityHash, qrHash: integrityHash, integrityAlgorithm: 'SHA-256',
      deliveryMethod: null, deliveryStatus: AUDIT_DELIVERY_STATUS.READY,
      submittedAt: null, submittedByUserId: null, submissionMethod: null, submissionMethods: [],
      returnReason: '', returnedByUserId: null, returnedAt: null,
      certificationNotes: '', certifiedByUserId: null, certifiedByName: '', certifiedAt: null,
      createdAt: now, updatedAt: now
    };
    validateCanonicalAuditReport({ id: reportId, ...report });
    try {
      await db.collection(COLLECTIONS.AUDIT_REPORTS).doc(reportId).create(report);
    } catch (error) {
      if (!/already exists/i.test(error.message) && Number(error.code) !== 6) throw error;
      const replay = await db.collection(COLLECTIONS.AUDIT_REPORTS).doc(reportId).get();
      if (replay.exists) return res.json({ success: true, replayed: true, data: normalizedReport(replay) });
      throw error;
    }
    return res.status(201).json({ success: true, data: { id: reportId, ...report, qrPayload: encodeQrPayload({ id: reportId, ...report }) } });
  } catch (error) {
    return res.status(error.status || (/already exists/i.test(error.message) ? 409 : 400)).json({ success: false, error: error.message });
  }
});

router.post('/qr/verify', requireAuth, requireRole([ROLES.SRA_ADMIN]), async (req, res) => {
  try {
    const { payload, snapshot } = await resolveQrInput(req.body.payload);
    const transferHash = createAuditHash(payload.reportId, payload.blockFarmId, payload.periodKey, payload.operationSnapshots || []);
    if (transferHash !== payload.integrityHash) return res.status(422).json({ success: false, code: 'AUDIT_INTEGRITY_FAILED', error: 'The transferred audit data does not match its integrity hash.' });
    if (!snapshot.exists) return res.json({ success: true, data: { report: payload, integrityVerified: true, authoritativeFound: false, alreadyImported: false } });
    const report = validateCanonicalAuditReport(normalizedReport(snapshot));
    const expectedHash = createAuditHash(snapshot.id, report.blockFarmId, report.periodKey, report.operationSnapshots || []);
    const identityMatches = report.blockFarmId === payload.blockFarmId && report.periodKey === payload.periodKey
      && report.reportVersion === Number(payload.reportVersion) && report.reportId === payload.reportId;
    const integrityVerified = identityMatches && expectedHash === payload.integrityHash && expectedHash === report.integrityHash;
    if (!integrityVerified) return res.status(422).json({ success: false, code: 'AUDIT_INTEGRITY_FAILED', error: 'The audit QR integrity check failed.' });
    return res.json({ success: true, data: { report, integrityVerified: true, authoritativeFound: true, alreadyImported: report.status !== AUDIT_STATUS.COMPILED } });
  } catch (error) {
    return res.status(error.status || 400).json({ success: false, error: error.message });
  }
});

router.post('/qr/import', requireAuth, requireRole([ROLES.SRA_ADMIN]), async (req, res) => {
  try {
    const { payload } = await resolveQrInput(req.body.payload);
    const transferHash = createAuditHash(payload.reportId, payload.blockFarmId, payload.periodKey, payload.operationSnapshots || []);
    if (transferHash !== payload.integrityHash) throw Object.assign(new Error('The transferred audit data does not match its integrity hash.'), { status: 422 });
    const now = nowIso();
    const { actorId } = identity(req);
    const result = await db.runTransaction(async transaction => {
      const ref = db.collection(COLLECTIONS.AUDIT_REPORTS).doc(payload.reportId);
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists) {
        const { reportId, ...canonicalPayload } = validateCanonicalAuditReport(payload);
        const imported = {
          ...canonicalPayload,
          rootReportId: canonicalPayload.rootReportId || rootAuditReportId(canonicalPayload.blockFarmId, canonicalPayload.periodKey),
          status: AUDIT_STATUS.PENDING_REVIEW,
          qrSchemaVersion: QR_SCHEMA_VERSION,
          integrityHash: canonicalPayload.integrityHash,
          qrHash: canonicalPayload.qrHash || canonicalPayload.integrityHash,
          integrityAlgorithm: 'SHA-256',
          submissionMethod: AUDIT_DELIVERY_METHOD.QR,
          submissionMethods: [AUDIT_DELIVERY_METHOD.QR],
          deliveryMethod: AUDIT_DELIVERY_METHOD.QR,
          deliveryStatus: AUDIT_DELIVERY_STATUS.RECEIVED,
          submittedAt: now,
          submittedByUserId: canonicalPayload.compiledByUserId,
          importedAt: now,
          importedByUserId: actorId,
          createdAt: canonicalPayload.createdAt || canonicalPayload.compiledAt,
          updatedAt: now
        };
        transaction.create(ref, imported);
        return { report: { id: reportId, reportId, ...imported }, integrityVerified: true, alreadyImported: false };
      }
      const report = validateCanonicalAuditReport(normalizedReport(snapshot));
      const expectedHash = createAuditHash(snapshot.id, report.blockFarmId, report.periodKey, report.operationSnapshots || []);
      if (expectedHash !== payload.integrityHash || expectedHash !== (report.integrityHash || report.qrHash)) throw Object.assign(new Error('The audit QR integrity check failed.'), { status: 422 });
      if (report.status !== AUDIT_STATUS.COMPILED) return { report, integrityVerified: true, alreadyImported: true };
      const update = { status: AUDIT_STATUS.PENDING_REVIEW, submittedAt: now, submissionMethod: AUDIT_DELIVERY_METHOD.QR, submissionMethods: Array.from(new Set([...(report.submissionMethods || []), AUDIT_DELIVERY_METHOD.QR])), deliveryMethod: AUDIT_DELIVERY_METHOD.QR, deliveryStatus: AUDIT_DELIVERY_STATUS.RECEIVED, updatedAt: now };
      transaction.update(ref, update);
      return { report: { ...report, ...update }, integrityVerified: true, alreadyImported: false };
    });
    return res.json({ success: true, data: result });
  } catch (error) {
    return res.status(error.status || 400).json({ success: false, error: error.message });
  }
});

router.post('/:id/submit', requireAuth, requireRole([ROLES.FARM_MANAGER]), async (req, res) => {
  try {
    const { actorId } = identity(req);
    const method = String(req.body.submissionMethod || 'CLOUD').trim().toUpperCase();
    if (method !== AUDIT_DELIVERY_METHOD.CLOUD) throw new Error('This endpoint accepts Cloud Submission only. QR Transfer is received through the SRA import workflow.');
    const now = nowIso();
    const result = await db.runTransaction(async transaction => {
      const ref = db.collection(COLLECTIONS.AUDIT_REPORTS).doc(String(req.params.id || ''));
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists) throw Object.assign(new Error('Audit report not found.'), { status: 404 });
      const report = normalizedReport(snapshot);
      const farm = await transaction.get(db.collection(COLLECTIONS.BLOCK_FARMS).doc(report.blockFarmId));
      if (!farm.exists || farm.data().managerUserId !== actorId) throw Object.assign(new Error('Only the assigned Farm Manager may submit this audit.'), { status: 403 });
      if ([AUDIT_STATUS.PENDING_REVIEW, AUDIT_STATUS.CERTIFIED].includes(report.status)) return { ...report, replayed: true };
      if (report.status !== AUDIT_STATUS.COMPILED) throw new Error('Only a compiled audit can be submitted to SRA.');
      validateCanonicalAuditReport(report);
      const update = { status: AUDIT_STATUS.PENDING_REVIEW, submittedAt: now, submittedByUserId: actorId, submissionMethod: method, submissionMethods: Array.from(new Set([...(report.submissionMethods || []), method])), deliveryMethod: method, deliveryStatus: AUDIT_DELIVERY_STATUS.SUBMITTED, updatedAt: now };
      transaction.update(ref, update);
      return { ...report, ...update };
    });
    return res.json({ success: true, data: result });
  } catch (error) {
    return res.status(error.status || 400).json({ success: false, error: error.message });
  }
});

router.post('/:id/return', requireAuth, requireRole([ROLES.SRA_ADMIN]), async (req, res) => {
  try {
    const { actorId, actorName } = identity(req);
    const returnReason = optionalString(req.body.returnReason, { max: 2000 });
    if (!returnReason) throw new Error('A return reason is required.');
    const mutationContext = readMutationContext(req);
    const now = nowIso();
    const result = await db.runTransaction(async transaction => {
      const ref = db.collection(COLLECTIONS.AUDIT_REPORTS).doc(String(req.params.id || ''));
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists) throw Object.assign(new Error('Audit report not found.'), { status: 404 });
      const report = normalizedReport(snapshot);
      if (report.status === AUDIT_STATUS.RETURNED && report.returnReason === returnReason) return { ...report, replayed: true };
      if (report.status !== AUDIT_STATUS.PENDING_REVIEW) throw new Error('Only an audit awaiting review can be returned.');
      assertBaseVersion(report.updatedAt, mutationContext, snapshot.id, report);
      const update = { status: AUDIT_STATUS.RETURNED, returnReason, returnedByUserId: actorId, returnedByName: actorName, returnedAt: now, updatedAt: now };
      transaction.update(ref, update);
      transaction.create(db.collection(COLLECTIONS.AUDIT_LOGS).doc(), { eventType: 'AUDIT_REPORT_RETURNED', actorUserId: actorId, entityType: 'AUDIT_REPORT', entityId: snapshot.id, blockFarmId: report.blockFarmId, details: returnReason, outcome: 'SUCCESS', createdAt: now });
      return { ...report, ...update };
    });
    return res.json({ success: true, data: result });
  } catch (error) {
    return res.status(error.status || 400).json({ success: false, error: error.message, data: error.data });
  }
});

router.post('/:id/certify', requireAuth, requireRole([ROLES.SRA_ADMIN]), async (req, res) => {
  try {
    if (!db) return res.status(503).json({ success: false, error: 'Database is unavailable.' });
    const reportId = String(req.params.id || '').trim();
    const { actorId, actorName } = identity(req);
    const mutationContext = readMutationContext(req);
    const now = nowIso();
    const result = await db.runTransaction(async transaction => {
      const reportRef = db.collection(COLLECTIONS.AUDIT_REPORTS).doc(reportId);
      const reportSnapshot = await transaction.get(reportRef);
      if (!reportSnapshot.exists) throw Object.assign(new Error('Audit report not found.'), { status: 404 });
      const report = normalizedReport(reportSnapshot);
      if (report.status === AUDIT_STATUS.CERTIFIED) return { ...report, replayed: true };
      if (report.status !== AUDIT_STATUS.PENDING_REVIEW) throw new Error('Only an audit awaiting SRA review can be certified.');
      assertBaseVersion(report.updatedAt, mutationContext, reportId, report);
      const expectedHash = createAuditHash(reportId, report.blockFarmId, report.periodKey, report.operationSnapshots || []);
      if (expectedHash !== (report.integrityHash || report.qrHash)) throw new Error('Audit snapshot integrity validation failed. Certification was blocked.');
      const certificationNotes = optionalString(req.body.certificationNotes, { max: 2000 });
      const update = { status: AUDIT_STATUS.CERTIFIED, certificationNotes, certifiedByUserId: actorId, certifiedByName: actorName, certifiedAt: now, certifiedReportVersion: report.reportVersion, certifiedIntegrityHash: expectedHash, updatedAt: now };
      transaction.update(reportRef, update);
      transaction.create(db.collection(COLLECTIONS.AUDIT_LOGS).doc(), { eventType: 'AUDIT_REPORT_CERTIFIED', actorUserId: actorId, entityType: 'AUDIT_REPORT', entityId: reportId, blockFarmId: report.blockFarmId, details: `Certified audit report ${reportId}, version ${report.reportVersion}.`, outcome: 'SUCCESS', createdAt: now });
      return { ...report, ...update };
    });
    return res.json({ success: true, data: result });
  } catch (error) {
    return res.status(error.status || 400).json({ success: false, error: error.message, data: error.data });
  }
});

module.exports = router;
