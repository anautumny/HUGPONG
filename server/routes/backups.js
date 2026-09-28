'use strict';

const express = require('express');
const router = express.Router();
const { admin, db } = require('../firebase-admin');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/roleGuard');
const { createRateLimit, clientAddress } = require('../middleware/rateLimit');
const { verifyPassword } = require('../security/password');
const { COLLECTIONS, ROLES, nowIso } = require('../schema/firestoreSchema');
const { createBackupOperationId } = require('../domain/systemIds');
const { queueAuditEvent } = require('../services/auditWriter');
const {
  BACKUP_SCHEMA_VERSION,
  MAX_ARCHIVE_BYTES,
  assertBackupPassphrase,
  createBackupArchive,
  decryptBackupArchive,
  analyzeMissingRecords,
  restoreMissingRecords
} = require('../services/backupService');

const VALIDATION_TTL_MS = 10 * 60 * 1000;
const RESTORE_CONFIRMATION = 'RECOVER MISSING RECORDS';
function backupActorKey(req) {
  return req.session?.user?.employeeId || req.authUser?.employeeId || clientAddress(req);
}

const backupExportRateLimit = createRateLimit({
  name: 'backup-export',
  max: 5,
  windowMs: 60 * 60 * 1000,
  key: backupActorKey,
  rejectionCode: 'BACKUP_RATE_LIMITED',
  rejectionMessage: 'Too many backup requests. Please try again later.'
});
const backupValidationRateLimit = createRateLimit({
  name: 'backup-validation',
  max: 12,
  windowMs: 60 * 60 * 1000,
  key: backupActorKey,
  rejectionCode: 'BACKUP_RATE_LIMITED',
  rejectionMessage: 'Too many backup requests. Please try again later.'
});
const backupRestoreRateLimit = createRateLimit({
  name: 'backup-restore',
  max: 3,
  windowMs: 60 * 60 * 1000,
  key: backupActorKey,
  rejectionCode: 'BACKUP_RATE_LIMITED',
  rejectionMessage: 'Too many backup requests. Please try again later.'
});

function actorId(req) {
  return String(req.authUser?.employeeId || req.session?.user?.employeeId || '').trim();
}

function projectId() {
  return String(admin.app().options.projectId || process.env.FIREBASE_PROJECT_ID || '').trim();
}

async function verifySensitiveAction(req) {
  const userId = actorId(req);
  const password = req.body?.currentPassword;
  if (typeof password !== 'string' || password.length < 1 || password.length > 256) return false;
  const credential = await db.collection(COLLECTIONS.USER_CREDENTIALS).doc(userId).get();
  return credential.exists && verifyPassword(password, credential.data().passwordHash);
}

async function saveOperation(record) {
  await db.collection(COLLECTIONS.BACKUP_OPERATIONS).doc(record.id).set(record);
  return record;
}

async function recordFailure(req, operation, backupId, error) {
  try {
    await saveOperation({
      id: backupId,
      operation,
      status: 'FAILED',
      actorUserId: actorId(req),
      createdAt: nowIso(),
      completedAt: nowIso(),
      referenceId: String(resReference(error) || backupId),
      errorCode: String(error?.code || 'BACKUP_OPERATION_FAILED').slice(0, 80),
      schemaVersion: BACKUP_SCHEMA_VERSION
    });
  } catch (_) {}
}

function resReference(error) {
  return error?.referenceId || '';
}

async function auditOperation(input) {
  const batch = db.batch();
  queueAuditEvent(batch, db, input);
  await batch.commit();
}

function publicOperation(document) {
  const data = document.data ? document.data() : document;
  return {
    id: document.id || data.id,
    operation: data.operation || 'UNKNOWN',
    status: data.status || 'UNKNOWN',
    createdAt: data.createdAt || null,
    completedAt: data.completedAt || null,
    expiresAt: data.expiresAt || null,
    actorUserId: data.actorUserId || null,
    schemaVersion: data.schemaVersion || null,
    documentCount: Number(data.documentCount || 0),
    archiveByteSize: Number(data.archiveByteSize || 0),
    collectionCounts: data.collectionCounts || {},
    plan: data.plan || null,
    result: data.result || null,
    referenceId: data.referenceId || data.id || document.id,
    errorCode: data.errorCode || ''
  };
}

router.get('/', requireAuth, requireRole([ROLES.SUPER_ADMIN]), async (req, res) => {
  try {
    if (!db) return res.status(503).json({ success: false, error: 'Database is unavailable.', code: 'DATABASE_UNAVAILABLE' });
    const snapshot = await db.collection(COLLECTIONS.BACKUP_OPERATIONS).orderBy('createdAt', 'desc').limit(50).get();
    const operations = snapshot.docs.map(publicOperation);
    const lastSuccessfulExport = operations.find(item => item.operation === 'EXPORT' && item.status === 'READY') || null;
    const overdue = !lastSuccessfulExport || Date.now() - new Date(lastSuccessfulExport.completedAt || lastSuccessfulExport.createdAt).getTime() > 7 * 24 * 60 * 60 * 1000;
    return res.json({
      success: true,
      data: operations,
      policy: {
        mode: 'MANUAL_ENCRYPTED_LOGICAL_BACKUP',
        recommendedIntervalDays: 7,
        restoreMode: 'MISSING_RECORDS_ONLY',
        schemaVersion: BACKUP_SCHEMA_VERSION,
        maximumArchiveBytes: MAX_ARCHIVE_BYTES
      },
      lastSuccessfulExport,
      overdue
    });
  } catch (error) {
    res.locals.diagnosticError = error;
    return res.status(500).json({ success: false, error: 'Backup status could not be loaded.', code: 'BACKUP_STATUS_FAILED', module: 'BACKUP' });
  }
});

router.post('/export', requireAuth, requireRole([ROLES.SUPER_ADMIN]), backupExportRateLimit, async (req, res) => {
  const backupId = createBackupOperationId();
  try {
    if (!db) throw Object.assign(new Error('Database is unavailable.'), { status: 503, code: 'DATABASE_UNAVAILABLE' });
    if (!(await verifySensitiveAction(req))) {
      return res.status(403).json({ success: false, error: 'Password verification failed.', code: 'INVALID_CURRENT_PASSWORD', module: 'BACKUP' });
    }
    const passphrase = assertBackupPassphrase(req.body?.backupPassphrase, req.body?.currentPassword);
    const createdAt = nowIso();
    const result = await createBackupArchive(db, {
      passphrase,
      projectId: projectId(),
      actorUserId: actorId(req),
      now: new Date(createdAt)
    });
    const operation = {
      id: backupId,
      operation: 'EXPORT',
      status: 'READY',
      actorUserId: actorId(req),
      createdAt,
      completedAt: nowIso(),
      schemaVersion: result.metadata.schemaVersion,
      documentCount: result.metadata.documentCount,
      collectionCounts: result.metadata.collectionCounts,
      archiveByteSize: result.metadata.archiveByteSize,
      archiveSha256: result.metadata.archiveSha256,
      referenceId: backupId
    };
    await saveOperation(operation);
    await auditOperation({
      eventType: 'BACKUP_EXPORTED', actorUserId: actorId(req), entityType: 'BACKUP', entityId: backupId,
      details: `Created encrypted logical backup ${backupId} containing ${operation.documentCount} business records.`, createdAt: operation.completedAt
    });
    return res.json({ success: true, backupId, fileName: result.fileName, archiveBase64: result.archiveBase64, metadata: publicOperation(operation) });
  } catch (error) {
    await recordFailure(req, 'EXPORT', backupId, error);
    res.locals.diagnosticError = error;
    return res.status(error.status || 500).json({ success: false, error: error.message, code: error.code || 'BACKUP_EXPORT_FAILED', module: 'BACKUP' });
  }
});

router.post('/validate', requireAuth, requireRole([ROLES.SUPER_ADMIN]), backupValidationRateLimit, async (req, res) => {
  const validationId = createBackupOperationId();
  try {
    if (!db) throw Object.assign(new Error('Database is unavailable.'), { status: 503, code: 'DATABASE_UNAVAILABLE' });
    if (!(await verifySensitiveAction(req))) {
      return res.status(403).json({ success: false, error: 'Password verification failed.', code: 'INVALID_CURRENT_PASSWORD', module: 'BACKUP' });
    }
    assertBackupPassphrase(req.body?.backupPassphrase, req.body?.currentPassword);
    const decrypted = await decryptBackupArchive(db, req.body?.archiveBase64, req.body.backupPassphrase, projectId());
    const plan = await analyzeMissingRecords(db, decrypted.payload);
    const createdAt = nowIso();
    const operation = {
      id: validationId,
      operation: 'VALIDATION',
      status: 'VALIDATED',
      actorUserId: actorId(req),
      createdAt,
      completedAt: createdAt,
      expiresAt: new Date(Date.now() + VALIDATION_TTL_MS).toISOString(),
      schemaVersion: decrypted.payload.schemaVersion,
      documentCount: decrypted.payload.documentCount,
      archiveByteSize: decrypted.archiveByteSize,
      archiveSha256: decrypted.archiveSha256,
      sourceCreatedAt: decrypted.payload.createdAt,
      plan,
      referenceId: validationId
    };
    await saveOperation(operation);
    await auditOperation({
      eventType: 'BACKUP_VALIDATED', actorUserId: actorId(req), entityType: 'BACKUP', entityId: validationId,
      details: `Validated an encrypted backup; ${plan.missingCount} missing records are eligible for non-destructive recovery.`, createdAt
    });
    return res.json({ success: true, validationId, expiresAt: operation.expiresAt, backupCreatedAt: decrypted.payload.createdAt, plan });
  } catch (error) {
    await recordFailure(req, 'VALIDATION', validationId, error);
    res.locals.diagnosticError = error;
    return res.status(error.status || 500).json({ success: false, error: error.message, code: error.code || 'BACKUP_VALIDATION_FAILED', module: 'BACKUP' });
  }
});

router.post('/restore-missing', requireAuth, requireRole([ROLES.SUPER_ADMIN]), backupRestoreRateLimit, async (req, res) => {
  const restoreId = createBackupOperationId();
  try {
    if (!db) throw Object.assign(new Error('Database is unavailable.'), { status: 503, code: 'DATABASE_UNAVAILABLE' });
    if (!(await verifySensitiveAction(req))) {
      return res.status(403).json({ success: false, error: 'Password verification failed.', code: 'INVALID_CURRENT_PASSWORD', module: 'BACKUP' });
    }
    if (req.body?.confirmation !== RESTORE_CONFIRMATION) {
      return res.status(400).json({ success: false, error: `Type ${RESTORE_CONFIRMATION} to confirm recovery.`, code: 'BACKUP_CONFIRMATION_REQUIRED', module: 'BACKUP' });
    }
    const validationId = String(req.body?.validationId || '').trim();
    if (!/^BKP-[A-F0-9]{20}$/.test(validationId)) {
      return res.status(400).json({ success: false, error: 'Backup validation reference is invalid.', code: 'BACKUP_VALIDATION_REQUIRED', module: 'BACKUP' });
    }
    assertBackupPassphrase(req.body?.backupPassphrase, req.body?.currentPassword);
    const decrypted = await decryptBackupArchive(db, req.body?.archiveBase64, req.body.backupPassphrase, projectId());
    const validation = await db.collection(COLLECTIONS.BACKUP_OPERATIONS).doc(validationId).get();
    const validationData = validation.exists ? validation.data() : null;
    if (!validationData || validationData.operation !== 'VALIDATION' || validationData.status !== 'VALIDATED'
      || validationData.actorUserId !== actorId(req) || validationData.archiveSha256 !== decrypted.archiveSha256
      || new Date(validationData.expiresAt).getTime() <= Date.now()) {
      return res.status(409).json({ success: false, error: 'Backup validation has expired or does not match this archive.', code: 'BACKUP_VALIDATION_REQUIRED', module: 'BACKUP' });
    }
    const result = await restoreMissingRecords(db, decrypted.payload);
    const completedAt = nowIso();
    const operation = {
      id: restoreId,
      operation: 'RESTORE_MISSING',
      status: 'SUCCESS',
      actorUserId: actorId(req),
      createdAt: completedAt,
      completedAt,
      validationId,
      sourceCreatedAt: decrypted.payload.createdAt,
      archiveSha256: decrypted.archiveSha256,
      schemaVersion: decrypted.payload.schemaVersion,
      documentCount: decrypted.payload.documentCount,
      result,
      referenceId: restoreId
    };
    const batch = db.batch();
    batch.set(db.collection(COLLECTIONS.BACKUP_OPERATIONS).doc(restoreId), operation);
    batch.update(validation.ref, { status: 'USED', usedAt: completedAt, restoreId });
    queueAuditEvent(batch, db, {
      eventType: 'BACKUP_MISSING_RECORDS_RECOVERED', actorUserId: actorId(req), entityType: 'BACKUP', entityId: restoreId,
      details: `Recovered ${result.restoredCount} missing records and preserved ${result.skippedExistingCount} existing records.`, createdAt: completedAt
    });
    await batch.commit();
    return res.json({
      success: true,
      restoreId,
      result,
      message: 'Missing records were recovered. Existing records were not overwritten or deleted.'
    });
  } catch (error) {
    await recordFailure(req, 'RESTORE_MISSING', restoreId, error);
    res.locals.diagnosticError = error;
    return res.status(error.status || 500).json({ success: false, error: error.message, code: error.code || 'BACKUP_RESTORE_FAILED', module: 'BACKUP' });
  }
});

module.exports = router;
module.exports._test = { RESTORE_CONFIRMATION, publicOperation };
