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
  encodeQrPayload, decodeQrPayload
} = require('../domain/auditWorkflow');

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

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
    const payload = decodeQrPayload(rawPayload);
    return { payload, snapshot: await db.collection(COLLECTIONS.AUDIT_REPORTS).doc(payload.reportId).get() };
  } catch (decodeError) {
    const code = String(rawPayload || '').trim().toUpperCase();
    if (/^(AUD|RPT)-[A-Z0-9-]+$/.test(code)) {
      const snapshot = await db.collection(COLLECTIONS.AUDIT_REPORTS).doc(code).get();
      if (!snapshot.exists) throw Object.assign(new Error('Audit report not found.'), { status: 404 });
      const report = normalizedReport(snapshot);
      return { payload: JSON.parse(encodeQrPayload(report)), snapshot };
    }
    if (/^HUG-[A-Z0-9-]+$/.test(code)) {
      const query = await db.collection(COLLECTIONS.AUDIT_REPORTS).where('qrHash', '==', code).limit(1).get();
      if (query.empty) throw Object.assign(new Error('Audit hash not found.'), { status: 404 });
      const snapshot = query.docs[0];
      const report = normalizedReport(snapshot);
      return { payload: JSON.parse(encodeQrPayload(report)), snapshot };
    }
    throw decodeError;
  }
}

function pageSize(value) {
  const parsed = Number(value || DEFAULT_PAGE_SIZE);
  return Number.isInteger(parsed) ? Math.min(MAX_PAGE_SIZE, Math.max(1, parsed)) : DEFAULT_PAGE_SIZE;
}

async function listReports(req) {
  const { actorId, actorRole } = identity(req);
  const view = String(req.query.view || (actorRole === ROLES.SRA_ADMIN ? 'inbox' : 'manager')).toLowerCase();
  const limit = pageSize(req.query.limit);
  let query = db.collection(COLLECTIONS.AUDIT_REPORTS);

  if (actorRole === ROLES.FARM_MANAGER) {
    const farmIds = (await assignedFarmsForManager(actorId)).map(farm => farm.id);
    if (!farmIds.length) return { data: [], hasMore: false, nextCursor: null };
    if (farmIds.length > 10) throw Object.assign(new Error('Manager Block Farm scope exceeds the supported query limit.'), { status: 409 });
    query = query.where('blockFarmId', 'in', farmIds).orderBy('compiledAt', 'desc').limit(limit + 1);
  } else if (view === 'history') {
    query = query.where('status', '==', AUDIT_STATUS.CERTIFIED).orderBy('certifiedAt', 'desc').limit(limit + 1);
  } else {
    let primaryQuery = query.where('status', '==', AUDIT_STATUS.PENDING_REVIEW).orderBy('submittedAt', 'desc').limit(limit + 1);
    if (req.query.cursor) {
      const cursor = await db.collection(COLLECTIONS.AUDIT_REPORTS).doc(String(req.query.cursor)).get();
      if (cursor.exists) primaryQuery = primaryQuery.startAfter(cursor);
    }
    const [primarySnapshot, legacySnapshot] = await Promise.all([
      primaryQuery.get(),
      req.query.cursor
        ? Promise.resolve({ docs: [] })
        : db.collection(COLLECTIONS.AUDIT_REPORTS).where('status', '==', 'PENDING').limit(limit + 1).get()
    ]);
    const unique = new Map([...primarySnapshot.docs, ...legacySnapshot.docs].map(document => [document.id, normalizedReport(document)]));
    const rows = Array.from(unique.values()).sort((left, right) => String(right.submittedAt || right.compiledAt || '').localeCompare(String(left.submittedAt || left.compiledAt || '')));
    const data = rows.slice(0, limit);
    return { data, hasMore: rows.length > limit, nextCursor: rows.length > limit ? data[data.length - 1]?.id || null : null };
  }

  if (req.query.cursor) {
    const cursor = await db.collection(COLLECTIONS.AUDIT_REPORTS).doc(String(req.query.cursor)).get();
    if (cursor.exists) query = query.startAfter(cursor);
  }
  const snapshot = await query.get();
  const rows = snapshot.docs.map(normalizedReport);
  const hasMore = rows.length > limit;
  const data = rows.slice(0, limit);
  return { data, hasMore, nextCursor: hasMore ? data[data.length - 1]?.id || null : null };
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
      const matching = reports.filter(report => report.periodKey === period).sort((a, b) => b.reportVersion - a.reportVersion);
      return !matching.length || matching[0].status === AUDIT_STATUS.RETURNED;
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
    if (eligibleLogDocuments.length > 500) throw new Error('A report cannot contain more than 500 operation logs.');
    const existing = await reportsForFarmPeriod(farm.id, period);
    const latest = existing[0] || null;
    if (latest && latest.status !== AUDIT_STATUS.RETURNED) return res.json({ success: true, replayed: true, data: latest });

    const version = latest ? latest.reportVersion + 1 : 1;
    const reportId = versionedAuditReportId(farm.id, period, version);
    if (req.body.id && String(req.body.id) !== reportId) return res.status(409).json({ success: false, error: `The canonical report identity for this audit is ${reportId}.` });
    const operationSnapshots = eligibleLogDocuments.sort((left, right) => left.id.localeCompare(right.id))
      .map(document => buildOperationSnapshot(document.id, document.data()));
    const now = nowIso();
    const integrityHash = createAuditHash(reportId, farm.id, period, operationSnapshots);
    const report = {
      rootReportId: rootAuditReportId(farm.id, period), reportVersion: version, previousVersionId: latest?.id || null,
      blockFarmId: farm.id, blockFarmName: farm.name || farm.code || farm.id, periodKey: period,
      status: AUDIT_STATUS.COMPILED, operationSnapshots, ...summarizeSnapshots(operationSnapshots, activeFields),
      compiledByUserId: actorId, compiledByName: actorName, compiledAt: now,
      qrSchemaVersion: QR_SCHEMA_VERSION, integrityHash, qrHash: integrityHash, integrityAlgorithm: 'SHA-256',
      submittedAt: null, submittedByUserId: null, submissionMethod: null, submissionMethods: [],
      returnReason: '', returnedByUserId: null, returnedAt: null,
      certificationNotes: '', certifiedByUserId: null, certifiedByName: '', certifiedAt: null,
      createdAt: now, updatedAt: now
    };
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
    if (!snapshot.exists) return res.status(404).json({ success: false, code: 'AUDIT_NOT_FOUND', error: 'Audit package decoded, but the authoritative audit is not available in HUGPONG yet.' });
    const report = normalizedReport(snapshot);
    const expectedHash = createAuditHash(snapshot.id, report.blockFarmId, report.periodKey, report.operationSnapshots || []);
    const identityMatches = report.blockFarmId === payload.blockFarmId && report.periodKey === payload.periodKey
      && report.reportVersion === Number(payload.reportVersion);
    const integrityVerified = identityMatches && expectedHash === payload.integrityHash && expectedHash === (report.integrityHash || report.qrHash);
    if (!integrityVerified) return res.status(422).json({ success: false, code: 'AUDIT_INTEGRITY_FAILED', error: 'The audit QR integrity check failed.' });
    return res.json({ success: true, data: { report, integrityVerified: true, alreadyImported: report.status !== AUDIT_STATUS.COMPILED } });
  } catch (error) {
    return res.status(error.status || 400).json({ success: false, error: error.message });
  }
});

router.post('/qr/import', requireAuth, requireRole([ROLES.SRA_ADMIN]), async (req, res) => {
  try {
    const { payload } = await resolveQrInput(req.body.payload);
    const now = nowIso();
    const result = await db.runTransaction(async transaction => {
      const ref = db.collection(COLLECTIONS.AUDIT_REPORTS).doc(payload.reportId);
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists) throw Object.assign(new Error('The authoritative audit is not available yet. Reconnect after the Farm Manager synchronizes it.'), { status: 404 });
      const report = normalizedReport(snapshot);
      const expectedHash = createAuditHash(snapshot.id, report.blockFarmId, report.periodKey, report.operationSnapshots || []);
      if (expectedHash !== payload.integrityHash || expectedHash !== (report.integrityHash || report.qrHash)) throw Object.assign(new Error('The audit QR integrity check failed.'), { status: 422 });
      if (report.status !== AUDIT_STATUS.COMPILED) return { report, integrityVerified: true, alreadyImported: true };
      const update = { status: AUDIT_STATUS.PENDING_REVIEW, submittedAt: now, submissionMethod: 'QR', submissionMethods: Array.from(new Set([...(report.submissionMethods || []), 'QR'])), updatedAt: now };
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
    if (!['CLOUD', 'QR'].includes(method)) throw new Error('submissionMethod must be CLOUD or QR.');
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
      const update = { status: AUDIT_STATUS.PENDING_REVIEW, submittedAt: now, submittedByUserId: actorId, submissionMethod: method, submissionMethods: Array.from(new Set([...(report.submissionMethods || []), method])), updatedAt: now };
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
