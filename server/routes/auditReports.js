'use strict';

const express = require('express');
const router = express.Router();
const { db } = require('../firebase-admin');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/roleGuard');
const {
  COLLECTIONS,
  ROLES,
  canonicalRole,
  buildOperationSnapshot,
  createAuditHash,
  createAuditReportId,
  reportPeriod,
  nowIso,
  optionalString
} = require('../schema/firestoreSchema');
const { readMutationContext, assertBaseVersion } = require('../services/mutationContext');

router.get('/', requireAuth, requireRole([ROLES.FARM_MANAGER, ROLES.SRA_ADMIN]), async (req, res) => {
  try {
    if (!db) return res.status(503).json({ success: false, error: 'Database is unavailable.' });
    const actorId = String(req.session.user.employeeId || req.session.user.userId || '').trim();
    const actorRole = canonicalRole(req.session.user.role || req.session.user.roleKey);
    let reportQuery = db.collection(COLLECTIONS.AUDIT_REPORTS);
    if (actorRole === ROLES.FARM_MANAGER) {
      const farms = await db.collection(COLLECTIONS.BLOCK_FARMS).where('managerUserId', '==', actorId).get();
      const farmIds = farms.docs.map(doc => doc.id);
      if (!farmIds.length) return res.json({ success: true, count: 0, data: [] });
      if (farmIds.length > 10) return res.status(409).json({ success: false, error: 'Manager farm scope exceeds the Firestore query limit.' });
      reportQuery = reportQuery.where('blockFarmId', 'in', farmIds);
    }
    const snapshot = await reportQuery.get();
    return res.json({ success: true, count: snapshot.size, data: snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/', requireAuth, requireRole([ROLES.FARM_MANAGER]), async (req, res) => {
  try {
    if (!db) return res.status(503).json({ success: false, error: 'Database is unavailable.' });
    const blockFarmId = String(req.body.blockFarmId || '').trim().toUpperCase();
    const period = reportPeriod(req.body.period);
    const operationLogIds = Array.from(new Set(Array.isArray(req.body.operationLogIds) ? req.body.operationLogIds.map(String) : []));
    if (!operationLogIds.length) throw new Error('operationLogIds must contain at least one submitted operation log ID.');
    if (operationLogIds.length > 500) throw new Error('A report cannot contain more than 500 operation logs.');

    const actorId = String(req.session.user.employeeId || req.session.user.userId || '').trim();
    const mutationContext = readMutationContext(req);
    const farmSnapshot = await db.collection(COLLECTIONS.BLOCK_FARMS).doc(blockFarmId).get();
    if (!farmSnapshot.exists || farmSnapshot.data().managerUserId !== actorId) {
      return res.status(403).json({ success: false, error: 'Only the assigned Farm Manager may compile this block farm report.' });
    }

    if (req.body.id) {
      const existingById = await db.collection(COLLECTIONS.AUDIT_REPORTS).doc(String(req.body.id)).get();
      if (existingById.exists) {
        const current = existingById.data();
        const currentIds = (current.operationSnapshots || []).map(item => item.operationLogId).sort();
        const requestedIds = [...operationLogIds].sort();
        if (current.blockFarmId === blockFarmId && current.period === period && current.compiledByUserId === actorId && JSON.stringify(currentIds) === JSON.stringify(requestedIds)) {
          return res.json({ success: true, replayed: true, data: { id: existingById.id, ...current } });
        }
        return res.status(409).json({ success: false, error: 'Audit report ID already belongs to another report.' });
      }
    }

    const logSnapshots = await Promise.all(operationLogIds.map(id => db.collection(COLLECTIONS.OPERATION_LOGS).doc(id).get()));
    if (logSnapshots.some(snapshot => !snapshot.exists)) throw new Error('Every operationLogId must reference an existing log.');
    const fieldIds = Array.from(new Set(logSnapshots.map(snapshot => snapshot.data().fieldId)));
    const fieldSnapshots = await Promise.all(fieldIds.map(id => db.collection(COLLECTIONS.FIELDS).doc(id).get()));
    const fieldsById = new Map(fieldSnapshots.filter(snapshot => snapshot.exists).map(snapshot => [snapshot.id, snapshot.data()]));

    for (const logSnapshot of logSnapshots) {
      const log = logSnapshot.data();
      const field = fieldsById.get(log.fieldId);
      if (!field || field.blockFarmId !== blockFarmId) throw new Error('All report logs must belong to the selected block farm.');
      if (log.status !== 'ACTIVE') throw new Error('Only ACTIVE operation logs may be compiled.');
      if (!log.performedOn.startsWith(`${period}-`)) throw new Error('Every operation log must belong to the explicit report period.');
    }

    const existingReports = await db.collection(COLLECTIONS.AUDIT_REPORTS).where('blockFarmId', '==', blockFarmId).get();
    const existingOperationIds = new Set();
    existingReports.docs.forEach(reportDoc => {
      const report = reportDoc.data();
      if (report.period !== period) return;
      (report.operationSnapshots || []).forEach(operation => existingOperationIds.add(operation.operationLogId));
    });
    const duplicateId = operationLogIds.find(id => existingOperationIds.has(id));
    if (duplicateId) {
      return res.status(409).json({ success: false, error: `Operation log ${duplicateId} is already included in an audit report for ${period}.` });
    }

    const operationSnapshots = logSnapshots.map(snapshot => buildOperationSnapshot(snapshot.id, snapshot.data()));
    const reportId = req.body.id || createAuditReportId(blockFarmId, period);
    const now = nowIso();
    const report = {
      blockFarmId,
      period,
      status: 'PENDING',
      qrHash: createAuditHash(reportId, blockFarmId, period, operationSnapshots),
      compiledByUserId: actorId,
      compiledAt: now,
      operationSnapshots,
      certificationNotes: '',
      certifiedByUserId: null,
      certifiedAt: null,
      createdAt: now,
      updatedAt: now
    };
    await db.collection(COLLECTIONS.AUDIT_REPORTS).doc(reportId).create(report);
    return res.status(201).json({ success: true, data: { id: reportId, ...report } });
  } catch (error) {
    const status = /already exists/i.test(error.message) ? 409 : 400;
    return res.status(status).json({ success: false, error: error.message });
  }
});

router.post('/:id/certify', requireAuth, requireRole([ROLES.SRA_ADMIN]), async (req, res) => {
  try {
    if (!db) return res.status(503).json({ success: false, error: 'Database is unavailable.' });
    const reportId = String(req.params.id || '').trim();
    const actorId = String(req.session.user.employeeId || req.session.user.userId || '').trim();
    const mutationContext = readMutationContext(req);
    const now = nowIso();
    const result = await db.runTransaction(async transaction => {
      const reportRef = db.collection(COLLECTIONS.AUDIT_REPORTS).doc(reportId);
      const reportSnapshot = await transaction.get(reportRef);
      if (!reportSnapshot.exists) throw new Error('Audit report not found.');
      const report = reportSnapshot.data();
      if (report.status === 'CERTIFIED' && report.certifiedByUserId === actorId) {
        return { id: reportId, ...report, replayed: true };
      }
      if (report.status !== 'PENDING') throw new Error('Only a PENDING audit report can be certified.');
      assertBaseVersion(report.updatedAt, mutationContext, reportId, { id: reportId, ...report });
      const certificationNotes = optionalString(req.body.certificationNotes, { max: 2000 });
      const update = {
        status: 'CERTIFIED',
        certificationNotes,
        certifiedByUserId: actorId,
        certifiedAt: now,
        updatedAt: now
      };
      transaction.update(reportRef, update);
      const eventRef = db.collection(COLLECTIONS.AUDIT_LOGS).doc();
      transaction.create(eventRef, {
        eventType: 'AUDIT_REPORT_CERTIFIED',
        actorUserId: actorId,
        entityType: 'AUDIT_REPORT',
        entityId: reportId,
        details: `Certified audit report ${reportId}.`,
        outcome: 'SUCCESS',
        createdAt: now
      });
      return { id: reportId, ...report, ...update };
    });
    return res.json({ success: true, data: result });
  } catch (error) {
    return res.status(error.status || 400).json({ success: false, error: error.message, data: error.data });
  }
});

module.exports = router;
