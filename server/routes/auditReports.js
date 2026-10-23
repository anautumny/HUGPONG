'use strict';

const express = require('express');
const { auditSnapshotBatch } = require('../domain/auditSnapshotBatch');
const { scanScopedDocumentIds } = require('../services/scopedQueryFallback');
const { cleanText } = require('../services/diagnosticService');
const router = express.Router();
const { db } = require('../firebase-admin');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/roleGuard');
const {
  COLLECTIONS, ROLES, canonicalRole, buildOperationSnapshot, createAuditHash,
  reportPeriod, nowIso, optionalString
} = require('../schema/firestoreSchema');
const { readMutationContext, assertBaseVersion } = require('../services/mutationContext');
const { queueAuditEvent } = require('../services/auditWriter');
const { auditMemberFollowUps } = require('../services/auditMemberFollowUpService');
const {
  AUDIT_STATUS, QR_SCHEMA_VERSION, canonicalAuditStatus, businessPeriod,
  rootAuditReportId, versionedAuditReportId, summarizeSnapshots, monthlyAuditReadiness,
  buildFieldSnapshots, auditCropYearCycles, nextCropYearCycle, validateCanonicalAuditReport,
  AUDIT_DELIVERY_METHOD, AUDIT_DELIVERY_STATUS,
  encodeQrPayload, decodeQrPayload, selectAuditCompilationBatch
} = require('../domain/auditWorkflow');

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;
let missingIndexFallbackLogged = false;

async function scanAuditLogs(query) {
  const documents = [];
  let cursor;
  do {
    let page = query.orderBy('performedOn', 'asc').orderBy('__name__', 'asc').limit(200);
    if (cursor) page = page.startAfter(cursor.data().performedOn, cursor.id);
    let snapshot;
    try { snapshot = await page.get(); }
    catch (error) {
      if (!isMissingIndexError(error)) throw error;
      return scanScopedDocumentIds(query);
    }
    documents.push(...snapshot.docs);
    cursor = snapshot.docs.length === 200 ? snapshot.docs.at(-1) : null;
  } while (cursor);
  return documents;
}

function isAuditEligibleOperation(log) {
  return ['ACTIVE', 'ARCHIVED'].includes(String(log?.status || '').toUpperCase())
    && Boolean(log?.cycleId);
}

function identity(req) {
  const actorId = String(req.session.user.employeeId || req.session.user.userId || '').trim();
  return {
    actorId,
    actorName: String(req.session.user.name || req.session.user.displayName || actorId).trim(),
    actorRole: canonicalRole(req.session.user.role || req.session.user.roleKey)
  };
}

function normalizedReport(document) {
  const value = document.data ? document.data() : document;
  const id = document.id || value.id;
  const periodKey = value.periodKey || value.period;
  const cropYearCycles = auditCropYearCycles(value, value.operationSnapshots || [], value.fieldSnapshots || []);
  return {
    id,
    ...value,
    cropYearCycle: cropYearCycles.length === 1 ? cropYearCycles[0] : null,
    cropYearCycles,
    continuationCropYearCycle: nextCropYearCycle(cropYearCycles[cropYearCycles.length - 1]),
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
  let logSnapshot;
  const query = db.collection(COLLECTIONS.OPERATION_LOGS).where('blockFarmId', '==', blockFarmId);
  const [year, month] = period.split('-').map(Number);
  const nextPeriod = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 7);
  try {
    logSnapshot = await query.where('performedOn', '>=', `${period}-01`).where('performedOn', '<', `${nextPeriod}-01`).get();
  } catch (error) {
    if (!isMissingIndexError(error)) throw error;
    logSnapshot = { docs: await scanScopedDocumentIds(query, {
      accept: document => String(document.data().performedOn || '').startsWith(`${period}-`),
    }) };
  }
  const eligibleLogDocuments = logSnapshot.docs.filter(document => isAuditEligibleOperation(document.data())
    && String(document.data().performedOn || '').startsWith(`${period}-`));
  const historicalIds = new Set(eligibleLogDocuments.map(document => document.data().fieldId));
  const fieldMap = new Map(fieldSnapshot.docs.map(document => [document.id, { ...document.data(), id: document.id }]));
  const missingIds = [...historicalIds].filter(id => !fieldMap.has(id));
  if (missingIds.length) {
    const historical = await db.getAll(...missingIds.map(id => db.collection(COLLECTIONS.FIELDS).doc(id)));
    historical.filter(document => document.exists).forEach(document => fieldMap.set(document.id, { ...document.data(), id: document.id }));
  }
  // Historical farm identity is carried by the operation, regardless of the
  // plot's present lifecycle or assignment. Idle archived plots add no rows.
  const activeFields = [...fieldMap.values()].filter(field => historicalIds.has(field.id)
    || (field.blockFarmId === blockFarmId && String(field.status || 'ACTIVE').toUpperCase() === 'ACTIVE'));

  const memberIds = Array.from(new Set(activeFields.map(field => field.memberUserId).filter(Boolean)));
  if (memberIds.length) {
    try {
      const memberDocuments = typeof db.getAll === 'function'
        ? await db.getAll(...memberIds.map(id => db.collection(COLLECTIONS.USERS).doc(id)))
        : await Promise.all(memberIds.map(id => db.collection(COLLECTIONS.USERS).doc(id).get()));
      const memberDirectory = new Map(memberDocuments.filter(document => document.exists).map(document => [
        document.id,
        {
          name: document.data().displayName || document.data().name || '',
          phone: document.data().phone || document.data().contact || ''
        }
      ]));
      activeFields.forEach(field => {
        const member = memberDirectory.get(field.memberUserId);
        field.memberName = member?.name || 'Member name unavailable';
        field.memberPhone = member?.phone || null;
      });
    } catch (error) {
      console.warn('[Audit Reports] Member names could not be embedded in the snapshot:', cleanText(error.message));
      activeFields.forEach(field => {
        field.memberName = field.memberName || 'Member name unavailable';
        field.memberPhone = null;
      });
    }
  }
  activeFields.forEach(field => {
    if (!field.memberUserId) {
      field.memberName = 'Unassigned member';
      field.memberPhone = null;
    }
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
    // Every QR version is a lookup, including legacy embedded transfers.
    // A sender can recompute an unkeyed hash; embedded data is never authority.
    if (!snapshot.exists) throw Object.assign(new Error('The authoritative audit report is not available. Ask the Farm Manager to synchronize it before scanning again.'), { status: 404, code: 'AUDIT_REPORT_NOT_FOUND' });
    const authoritative = validateCanonicalAuditReport(normalizedReport(snapshot));
    const expectedHash = createAuditHash(snapshot.id, authoritative.blockFarmId, authoritative.periodKey, authoritative.operationSnapshots);
    if (expectedHash !== authoritative.integrityHash || (!payload.legacyLookupOnly && payload.integrityHash !== authoritative.integrityHash)) {
      throw Object.assign(new Error('The audit QR reference does not match the authoritative report.'), { status: 422, code: 'AUDIT_INTEGRITY_FAILED' });
    }
    payload = authoritative;
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
    const logDocuments = await scanAuditLogs(db.collection(COLLECTIONS.OPERATION_LOGS).where('blockFarmId', '==', farm.id));
    const periods = Array.from(new Set(logDocuments
      .filter(document => isAuditEligibleOperation(document.data()))
      .map(document => String(document.data().performedOn || '').slice(0, 7))
      .filter(period => /^\d{4}-(0[1-9]|1[0-2])$/.test(period) && period <= currentPeriod)))
      .sort();
    const reportsSnapshot = await db.collection(COLLECTIONS.AUDIT_REPORTS).where('blockFarmId', '==', farm.id).get();
    const reports = reportsSnapshot.docs.map(normalizedReport);
    const unresolvedPeriod = periods.find(period => {
      const eligibleForPeriod = logDocuments.filter(document => isAuditEligibleOperation(document.data())
        && String(document.data().performedOn || '').startsWith(`${period}-`));
      const matching = reports.filter(report => report.periodKey === period);
      const batch = selectAuditCompilationBatch(eligibleForPeriod, matching);
      return !matching.length || (!batch.replay && batch.operations.length > 0);
    });
    const periodKey = unresolvedPeriod || currentPeriod;
    const {
      activeFields: readinessFields,
      eligibleLogDocuments: readinessLogDocuments
    } = await loadFarmAuditData(farm.id, periodKey);
    const snapshots = readinessLogDocuments.map(document => buildOperationSnapshot(document.id, document.data()));
    const readiness = monthlyAuditReadiness(snapshots, readinessFields);
    const followUps = await auditMemberFollowUps(db, { blockFarmId: farm.id, activeFields: readinessFields, operationSnapshots: snapshots });
    return res.json({ success: true, data: {
      blockFarmId: farm.id,
      blockFarmName: farm.name || farm.code || farm.id,
      periodKey,
      currentPeriod,
      isCarryover: periodKey < currentPeriod,
      ...readiness,
      ...followUps,
      ...summarizeSnapshots(snapshots, readinessFields)
    } });
  } catch (error) {
    return res.status(error.status || 400).json({ success: false, error: error.message });
  }
});

router.get('/readiness', requireAuth, requireRole([ROLES.FARM_MANAGER]), async (req, res) => {
  try {
    if (!db) return res.status(503).json({ success: false, error: 'Database is unavailable.' });
    const farm = await resolveAssignedFarm(req);
    const periodKey = reportPeriod(req.query.periodKey || businessPeriod());
    if (periodKey > businessPeriod()) throw new Error('A future reporting period cannot be checked.');
    const { activeFields, eligibleLogDocuments } = await loadFarmAuditData(farm.id, periodKey);
    const operationSnapshots = eligibleLogDocuments.map(document => buildOperationSnapshot(document.id, document.data()));
    const followUps = await auditMemberFollowUps(db, { blockFarmId: farm.id, activeFields, operationSnapshots });
    return res.json({
      success: true,
      data: {
        blockFarmId: farm.id,
        blockFarmName: farm.name || farm.code || farm.id,
        periodKey,
        ...monthlyAuditReadiness(operationSnapshots, activeFields),
        ...followUps,
        ...summarizeSnapshots(operationSnapshots, activeFields)
      }
    });
  } catch (error) {
    return res.status(error.status || 400).json({ success: false, error: error.message, data: error.data });
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
    // Compile recorded monthly activity. Active plots without an operation do
    // not block other plots, and never receive fabricated zero-activity logs.
    if (!eligibleLogDocuments.length) throw new Error(`No synchronized eligible operation logs were found for ${period} in the assigned Block Farm.`);
    const existing = await reportsForFarmPeriod(farm.id, period);
    const batch = selectAuditCompilationBatch(eligibleLogDocuments, existing);
    const latest = batch.latest;
    if (batch.replay) return res.json({ success: true, replayed: true, data: batch.replay });
    if (!batch.operations.length) throw new Error(`No new eligible operation logs were found for ${period}.`);

    const version = latest ? latest.reportVersion + 1 : 1;
    const reportId = versionedAuditReportId(farm.id, period, version);
    if (req.body.id && String(req.body.id) !== reportId) return res.status(409).json({ success: false, error: `The canonical report identity for this audit is ${reportId}.` });
    const { operationSnapshots, fieldSnapshots, sourceLogIds, remainingOperationCount } = auditSnapshotBatch(batch.operations, activeFields);
    const cropYearCycles = auditCropYearCycles({}, operationSnapshots, fieldSnapshots);
    if (!cropYearCycles.length) throw new Error('Eligible operation records are missing their Crop Year Cycle. Correct the source records before compiling this audit.');
    const now = nowIso();
    const integrityHash = createAuditHash(reportId, farm.id, period, operationSnapshots);
    const report = {
      rootReportId: rootAuditReportId(farm.id, period), reportVersion: version, previousVersionId: latest?.id || null,
      blockFarmId: farm.id, blockFarmName: farm.name || farm.code || farm.id, periodKey: period,
      cropYearCycle: cropYearCycles.length === 1 ? cropYearCycles[0] : null, cropYearCycles,
      continuationCropYearCycle: nextCropYearCycle(cropYearCycles[cropYearCycles.length - 1]),
      status: AUDIT_STATUS.COMPILED, reviewStatus: 'not_submitted', certificationStatus: 'not_certified',
      operationSnapshots, fieldSnapshots, sourceLogIds,
      remainingOperationCount,
      memberCount: new Set(fieldSnapshots.map(field => field.memberId).filter(Boolean)).size,
      ...summarizeSnapshots(operationSnapshots, activeFields),
      compiledByUserId: actorId, compiledByName: actorName, compiledAt: now,
      qrSchemaVersion: QR_SCHEMA_VERSION, integrityHash, qrHash: integrityHash, integrityAlgorithm: 'SHA-256',
      deliveryMethod: null, deliveryStatus: AUDIT_DELIVERY_STATUS.READY,
      deliverySelectedAt: null, deliverySelectedByUserId: null,
      submittedAt: null, submittedByUserId: null, submissionMethod: null, submissionMethods: [],
      returnReason: '', returnedByUserId: null, returnedAt: null,
      certificationNotes: '', certifiedByUserId: null, certifiedByName: '', certifiedAt: null,
      createdAt: now, updatedAt: now
    };
    validateCanonicalAuditReport({ id: reportId, ...report });
    try {
      const writeBatch = db.batch();
      writeBatch.create(db.collection(COLLECTIONS.AUDIT_REPORTS).doc(reportId), report);
      queueAuditEvent(writeBatch, db, {
        eventType: 'AUDIT_REPORT_COMPILED', actorUserId: actorId,
        entityType: 'AUDIT_REPORT', entityId: reportId, blockFarmId: farm.id,
        details: `Compiled audit report ${reportId} from ${sourceLogIds.length} operation records.`, createdAt: now
      });
      await writeBatch.commit();
    } catch (error) {
      if (!/already exists/i.test(error.message) && Number(error.code) !== 6) throw error;
      const replay = await db.collection(COLLECTIONS.AUDIT_REPORTS).doc(reportId).get();
      if (replay.exists) return res.json({ success: true, replayed: true, data: normalizedReport(replay) });
      throw error;
    }
    return res.status(201).json({ success: true, data: { id: reportId, ...report, qrPayload: encodeQrPayload({ id: reportId, ...report }) } });
  } catch (error) {
    return res.status(error.status || (/already exists/i.test(error.message) ? 409 : 400)).json({
      success: false,
      error: error.message,
      code: error.data?.code,
      data: error.data
    });
  }
});

router.post('/qr/verify', requireAuth, requireRole([ROLES.SRA_ADMIN]), async (req, res) => {
  try {
    const { payload, snapshot } = await resolveQrInput(req.body.payload);
    const transferHash = createAuditHash(payload.reportId, payload.blockFarmId, payload.periodKey, payload.operationSnapshots || []);
    if (transferHash !== payload.integrityHash) return res.status(422).json({ success: false, code: 'AUDIT_INTEGRITY_FAILED', error: 'The transferred audit data does not match its integrity hash.' });
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
      if (!snapshot.exists) throw Object.assign(new Error('The authoritative audit report is no longer available.'), { status: 404, code: 'AUDIT_REPORT_NOT_FOUND' });
      const report = validateCanonicalAuditReport(normalizedReport(snapshot));
      const expectedHash = createAuditHash(snapshot.id, report.blockFarmId, report.periodKey, report.operationSnapshots || []);
      if (expectedHash !== payload.integrityHash || expectedHash !== (report.integrityHash || report.qrHash)) throw Object.assign(new Error('The audit QR integrity check failed.'), { status: 422 });
      if (report.status !== AUDIT_STATUS.COMPILED) return { report, integrityVerified: true, alreadyImported: true };
      const update = { status: AUDIT_STATUS.PENDING_REVIEW, reviewStatus: 'pending_review', certificationStatus: 'not_certified', submittedAt: now, submissionMethod: AUDIT_DELIVERY_METHOD.QR, submissionMethods: Array.from(new Set([...(report.submissionMethods || []), AUDIT_DELIVERY_METHOD.QR])), deliveryMethod: AUDIT_DELIVERY_METHOD.QR, deliveryStatus: AUDIT_DELIVERY_STATUS.RECEIVED, updatedAt: now };
      transaction.update(ref, update);
      queueAuditEvent(transaction, db, {
        eventType: 'AUDIT_REPORT_QR_IMPORTED', actorUserId: actorId,
        entityType: 'AUDIT_REPORT', entityId: snapshot.id, blockFarmId: report.blockFarmId,
        details: `Received audit report ${snapshot.id} by QR transfer.`, createdAt: now
      });
      return { report: { ...report, ...update }, integrityVerified: true, alreadyImported: false };
    });
    return res.json({ success: true, data: result });
  } catch (error) {
    return res.status(error.status || 400).json({ success: false, error: error.message });
  }
});

router.post('/:id/delivery-selection', requireAuth, requireRole([ROLES.FARM_MANAGER]), async (req, res) => {
  try {
    const { actorId } = identity(req);
    const method = String(req.body.deliveryMethod || '').trim().toLowerCase();
    if (method !== AUDIT_DELIVERY_METHOD.QR) {
      throw new Error('Choose QR Transfer here. Cloud delivery is completed through Submit to SRA.');
    }
    const mutationContext = readMutationContext(req);
    const now = nowIso();
    const result = await db.runTransaction(async transaction => {
      const ref = db.collection(COLLECTIONS.AUDIT_REPORTS).doc(String(req.params.id || ''));
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists) throw Object.assign(new Error('Audit report not found.'), { status: 404 });
      const report = normalizedReport(snapshot);
      const farm = await transaction.get(db.collection(COLLECTIONS.BLOCK_FARMS).doc(report.blockFarmId));
      if (!farm.exists || farm.data().managerUserId !== actorId) {
        throw Object.assign(new Error('Only the assigned Farm Manager may choose this audit delivery method.'), { status: 403 });
      }
      if (report.status !== AUDIT_STATUS.COMPILED) {
        if (report.deliveryMethod === method) return { ...report, replayed: true };
        throw new Error('Only a compiled audit awaiting delivery can use QR Transfer.');
      }
      if (report.deliveryMethod === method && report.deliveryStatus === AUDIT_DELIVERY_STATUS.READY) {
        return { ...report, replayed: true };
      }
      assertBaseVersion(report.updatedAt, mutationContext, snapshot.id, report);
      const update = {
        deliveryMethod: method,
        deliveryStatus: AUDIT_DELIVERY_STATUS.READY,
        deliverySelectedAt: now,
        deliverySelectedByUserId: actorId,
        updatedAt: now
      };
      transaction.update(ref, update);
      queueAuditEvent(transaction, db, {
        eventType: 'AUDIT_REPORT_DELIVERY_SELECTED', actorUserId: actorId,
        entityType: 'AUDIT_REPORT', entityId: snapshot.id, blockFarmId: report.blockFarmId,
        details: `Selected QR Transfer for audit report ${snapshot.id}.`, createdAt: now
      });
      return { ...report, ...update };
    });
    return res.json({ success: true, data: result });
  } catch (error) {
    return res.status(error.status || 400).json({ success: false, error: error.message, data: error.data });
  }
});

router.post('/:id/submit', requireAuth, requireRole([ROLES.FARM_MANAGER]), async (req, res) => {
  try {
    const { actorId } = identity(req);
    const method = String(req.body.submissionMethod || 'cloud').trim().toLowerCase();
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
      const update = { status: AUDIT_STATUS.PENDING_REVIEW, reviewStatus: 'pending_review', certificationStatus: 'not_certified', submittedAt: now, submittedByUserId: actorId, submissionMethod: method, submissionMethods: Array.from(new Set([...(report.submissionMethods || []), method])), deliveryMethod: method, deliveryStatus: AUDIT_DELIVERY_STATUS.SUBMITTED, deliverySelectedAt: now, deliverySelectedByUserId: actorId, updatedAt: now };
      transaction.update(ref, update);
      queueAuditEvent(transaction, db, {
        eventType: 'AUDIT_REPORT_SUBMITTED', actorUserId: actorId,
        entityType: 'AUDIT_REPORT', entityId: snapshot.id, blockFarmId: report.blockFarmId,
        details: `Submitted audit report ${snapshot.id} for SRA review.`, createdAt: now
      });
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
      const update = { status: AUDIT_STATUS.RETURNED, reviewStatus: 'returned', certificationStatus: 'not_certified', returnReason, returnedByUserId: actorId, returnedByName: actorName, returnedAt: now, updatedAt: now };
      transaction.update(ref, update);
      queueAuditEvent(transaction, db, { eventType: 'AUDIT_REPORT_RETURNED', actorUserId: actorId, entityType: 'AUDIT_REPORT', entityId: snapshot.id, blockFarmId: report.blockFarmId, details: returnReason, createdAt: now });
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
      const update = { status: AUDIT_STATUS.CERTIFIED, reviewStatus: 'complete', certificationStatus: 'certified', certificationNotes, certifiedByUserId: actorId, certifiedByName: actorName, certifiedAt: now, certifiedReportVersion: report.reportVersion, certifiedIntegrityHash: expectedHash, updatedAt: now };
      transaction.update(reportRef, update);
      queueAuditEvent(transaction, db, { eventType: 'AUDIT_REPORT_CERTIFIED', actorUserId: actorId, entityType: 'AUDIT_REPORT', entityId: reportId, blockFarmId: report.blockFarmId, details: `Certified audit report ${reportId}, version ${report.reportVersion}.`, createdAt: now });
      return { ...report, ...update };
    });
    return res.json({ success: true, data: result });
  } catch (error) {
    return res.status(error.status || 400).json({ success: false, error: error.message, data: error.data });
  }
});

module.exports = router;
