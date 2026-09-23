'use strict';

const {
  COLLECTIONS,
  ROLES,
  canonicalRole,
  buildOperationLog,
  createCycleId,
  createOperationLogId,
  requiredString,
  integer,
  finiteNumber,
  nowIso,
  normalizeCropYear
} = require('../schema/firestoreSchema');
const { CROP_STAGE_MAX, CROP_STAGE_MIN } = require('../domain/cropStages');
const { assertBaseVersion } = require('./mutationContext');

const MAX_ATOMIC_ROLLOVER_LOGS = 497;

function serviceError(message, status = 400, data) {
  const error = new Error(message);
  error.status = status;
  if (data !== undefined) error.data = data;
  return error;
}

function actor(user) {
  return {
    actorId: String(user?.employeeId || user?.userId || '').trim(),
    actorRole: canonicalRole(user?.role || user?.roleKey)
  };
}

async function readAuthorizedField(transaction, database, fieldId, user, action) {
  const normalizedFieldId = String(fieldId || '').trim().toUpperCase();
  const identity = actor(user);
  if (![ROLES.MEMBER_FARMER, ROLES.FARM_MANAGER].includes(identity.actorRole)) {
    throw serviceError(`Role is not authorized to ${action}.`, 403);
  }

  const fieldRef = database.collection(COLLECTIONS.FIELDS).doc(normalizedFieldId);
  const fieldSnapshot = await transaction.get(fieldRef);
  if (!fieldSnapshot.exists) throw serviceError('The referenced field does not exist.', 404);
  const field = fieldSnapshot.data();

  if (identity.actorRole === ROLES.MEMBER_FARMER && field.memberUserId !== identity.actorId) {
    throw serviceError(`Member Farmers may ${action} only for their assigned field.`, 403);
  }
  if (identity.actorRole === ROLES.FARM_MANAGER) {
    if (!user?.takeoverGrant || user.takeoverGrant.fieldId !== normalizedFieldId || user.takeoverGrant.actorId !== identity.actorId) {
      throw serviceError('A recent password verification for this field is required for manager takeover changes.', 403);
    }
    const farmRef = database.collection(COLLECTIONS.BLOCK_FARMS).doc(field.blockFarmId);
    const farmSnapshot = await transaction.get(farmRef);
    if (!farmSnapshot.exists || farmSnapshot.data().managerUserId !== identity.actorId) {
      throw serviceError(`Farm Managers may ${action} only within their assigned block farm.`, 403);
    }
  }

  return { ...identity, fieldId: fieldSnapshot.id, field, fieldRef };
}

async function readActiveCurrentCycle(transaction, database, fieldAccess, cycleId) {
  const normalizedCycleId = String(cycleId || '').trim().toUpperCase();
  const cycleRef = database.collection(COLLECTIONS.CROP_CYCLES).doc(normalizedCycleId);
  const cycleSnapshot = await transaction.get(cycleRef);
  if (!cycleSnapshot.exists) throw serviceError('The referenced crop cycle does not exist.', 404);
  const cycle = cycleSnapshot.data();
  if (fieldAccess.field.status !== 'ACTIVE') {
    throw serviceError('Operations can only be changed for an ACTIVE field.', 409);
  }
  if (
    fieldAccess.field.currentCycleId !== normalizedCycleId ||
    cycle.fieldId !== fieldAccess.fieldId ||
    cycle.status !== 'ACTIVE'
  ) {
    throw serviceError('cycleId must be the field\'s explicit ACTIVE crop cycle.', 409);
  }
  return { cycle, cycleRef, cycleSnapshot };
}

async function createOperationRecord(database, input, user, timestamp = nowIso()) {
  const fieldId = String(input.fieldId || '').trim().toUpperCase();
  const cycleId = String(input.cycleId || '').trim().toUpperCase();
  const logId = String(input.id || createOperationLogId(fieldId)).trim();

  return database.runTransaction(async transaction => {
    const targetRef = database.collection(COLLECTIONS.OPERATION_LOGS).doc(logId);
    const existingSnapshot = await transaction.get(targetRef);
    if (existingSnapshot.exists) {
      const current = existingSnapshot.data();
      const identity = actor(user);
      if (current.fieldId !== fieldId || current.cycleId !== cycleId || current.submittedByUserId !== identity.actorId) {
        throw serviceError('Operation log ID already belongs to another record.', 409);
      }
      if (current.status === 'ARCHIVED') {
        throw serviceError('ARCHIVED operation logs cannot be recreated or reactivated.', 409, { id: logId, ...current });
      }
      return { replayed: true, id: logId, record: current };
    }

    const access = await readAuthorizedField(transaction, database, fieldId, user, 'record operations');
    await readActiveCurrentCycle(transaction, database, access, cycleId);
    const payload = buildOperationLog({
      ...input,
      fieldId,
      cycleId,
      status: 'ACTIVE',
      archivedAt: null,
      archivedByUserId: null,
      createdAt: input.createdAt || timestamp,
      updatedAt: timestamp,
      submissionSource: access.actorRole === ROLES.FARM_MANAGER ? 'MANAGER_TAKEOVER' : 'MEMBER'
    }, { submittedByUserId: access.actorId, now: timestamp });
    transaction.create(targetRef, payload);
    return { replayed: false, id: logId, record: payload };
  });
}

async function amendOperationRecord(database, logId, changes, amendment, user, timestamp = nowIso(), mutationContext = null) {
  if (!amendment || !String(amendment.reason || '').trim()) {
    throw serviceError('An amendment reason is required.');
  }

  return database.runTransaction(async transaction => {
    const normalizedLogId = String(logId || '').trim();
    const ref = database.collection(COLLECTIONS.OPERATION_LOGS).doc(normalizedLogId);
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) throw serviceError('Operation log not found.', 404);
    const existing = snapshot.data();
    if (existing.status !== 'ACTIVE') {
      throw serviceError('ARCHIVED operation logs cannot be amended or reactivated.', 409, { id: snapshot.id, ...existing });
    }

    const access = await readAuthorizedField(transaction, database, existing.fieldId, user, 'amend operations');
    await readActiveCurrentCycle(transaction, database, access, existing.cycleId);
    if (access.actorRole === ROLES.MEMBER_FARMER && existing.submittedByUserId !== access.actorId) {
      throw serviceError('Member Farmers may amend only operations they submitted.', 403);
    }
    if (amendment.amendmentId && (existing.amendments || []).some(item => item.amendmentId === amendment.amendmentId)) {
      return { replayed: true, id: snapshot.id, record: existing };
    }
    assertBaseVersion(existing.updatedAt, mutationContext, snapshot.id, { id: snapshot.id, ...existing });

    const requested = changes && typeof changes === 'object' ? changes : {};
    const immutable = ['fieldId', 'cycleId', 'submittedByUserId', 'submissionSource', 'createdAt'];
    for (const key of immutable) {
      if (requested[key] != null && requested[key] !== existing[key]) {
        throw serviceError(`${key} is immutable for submitted operation logs.`, 409);
      }
    }
    if (requested.status != null && String(requested.status).toUpperCase() !== 'ACTIVE') {
      throw serviceError('Operation lifecycle cannot be changed through an amendment.', 409);
    }
    if (requested.archivedAt || requested.archivedByUserId) {
      throw serviceError('Archive metadata cannot be changed through an amendment.', 409);
    }

    const merged = {
      ...existing,
      ...requested,
      status: 'ACTIVE',
      fieldId: existing.fieldId,
      cycleId: existing.cycleId,
      submittedByUserId: existing.submittedByUserId,
      submissionSource: existing.submissionSource,
      createdAt: existing.createdAt,
      archivedAt: null,
      archivedByUserId: null,
      updatedAt: timestamp,
      amendments: [
        ...(existing.amendments || []),
        {
          amendmentId: amendment.amendmentId || `AMD-${Date.now().toString(36).toUpperCase()}`,
          amendedByUserId: access.actorId,
          reason: String(amendment.reason).trim(),
          amendedAt: timestamp,
          changes: amendment.changes || {}
        }
      ]
    };
    const payload = buildOperationLog(merged, { submittedByUserId: existing.submittedByUserId, now: timestamp });
    transaction.set(ref, payload);
    return { replayed: false, id: snapshot.id, record: payload };
  });
}

async function archiveOperationRecords(database, logIds, user, timestamp = nowIso(), mutationContext = null) {
  const ids = Array.from(new Set((Array.isArray(logIds) ? logIds : []).map(id => String(id).trim()).filter(Boolean)));
  if (!ids.length || ids.length > 500) {
    throw serviceError('ids must contain between 1 and 500 operation log IDs.');
  }

  return database.runTransaction(async transaction => {
    const snapshots = [];
    for (const id of ids) {
      snapshots.push(await transaction.get(database.collection(COLLECTIONS.OPERATION_LOGS).doc(id)));
    }
    if (snapshots.some(snapshot => !snapshot.exists)) {
      throw serviceError('One or more operation logs were not found.', 404);
    }

    const accessByField = new Map();
    const cycleById = new Map();
    for (const snapshot of snapshots) {
      const log = snapshot.data();
      let access = accessByField.get(log.fieldId);
      if (!access) {
        access = await readAuthorizedField(transaction, database, log.fieldId, user, 'archive operations');
        accessByField.set(log.fieldId, access);
      }
      if (access.actorRole === ROLES.MEMBER_FARMER && log.submittedByUserId !== access.actorId) {
        throw serviceError('Member Farmers may archive only operations they submitted.', 403);
      }
      if (log.status === 'ACTIVE' && !cycleById.has(log.cycleId)) {
        cycleById.set(log.cycleId, await readActiveCurrentCycle(transaction, database, access, log.cycleId));
      }
      if (log.status === 'ACTIVE') {
        assertBaseVersion(log.updatedAt, mutationContext, snapshot.id, { id: snapshot.id, ...log });
      }
    }

    const identity = actor(user);
    let archivedCount = 0;
    for (const snapshot of snapshots) {
      if (snapshot.data().status !== 'ACTIVE') continue;
      archivedCount += 1;
      transaction.update(snapshot.ref, {
        status: 'ARCHIVED',
        archivedAt: timestamp,
        archivedByUserId: identity.actorId,
        updatedAt: timestamp
      });
    }
    return { archivedCount, archivedAt: timestamp };
  });
}

async function updateCycleStage(database, cycleId, input, user, timestamp = nowIso(), mutationContext = null) {
  const normalizedCycleId = String(cycleId || '').trim().toUpperCase();
  return database.runTransaction(async transaction => {
    const cycleRef = database.collection(COLLECTIONS.CROP_CYCLES).doc(normalizedCycleId);
    const cycleSnapshot = await transaction.get(cycleRef);
    if (!cycleSnapshot.exists) throw serviceError('Crop cycle not found.', 404);
    const cycle = cycleSnapshot.data();
    if (cycle.status !== 'ACTIVE') throw serviceError('ARCHIVED crop cycles cannot be changed.', 409);
    const access = await readAuthorizedField(transaction, database, cycle.fieldId, user, 'update crop stages');
    if (access.field.currentCycleId !== normalizedCycleId) {
      throw serviceError('The crop cycle is not the field current cycle.', 409);
    }
    const requestedStage = integer(input.currentStageNumber, 'currentStageNumber', {
      min: CROP_STAGE_MIN,
      max: CROP_STAGE_MAX
    });
    const requestedElapsed = finiteNumber(input.elapsedMonths == null ? cycle.elapsedMonths : input.elapsedMonths, 'elapsedMonths', { min: 0, max: 36 });
    if (cycle.currentStageNumber === requestedStage && cycle.elapsedMonths === requestedElapsed) {
      return { id: cycleSnapshot.id, ...cycle, replayed: true };
    }
    assertBaseVersion(cycle.updatedAt, mutationContext, cycleSnapshot.id, { id: cycleSnapshot.id, ...cycle });
    const update = {
      currentStageNumber: requestedStage,
      elapsedMonths: requestedElapsed,
      updatedAt: timestamp
    };
    transaction.update(cycleRef, update);
    return { id: cycleSnapshot.id, ...cycle, ...update };
  });
}

async function rolloverFieldCycle(database, fieldId, input, user, timestamp = nowIso(), mutationContext = null) {
  const normalizedFieldId = String(fieldId || '').trim().toUpperCase();
  const previousCycleId = requiredString(input.previousCycleId, 'previousCycleId', { max: 120 }).toUpperCase();

  return database.runTransaction(async transaction => {
    const access = await readAuthorizedField(transaction, database, normalizedFieldId, user, 'roll over crop cycles');
    const { field, fieldRef, actorId } = access;
    if (field.status !== 'ACTIVE') throw serviceError('Only an ACTIVE field can start a new crop cycle.', 409);
    if (!field.currentCycleId) throw serviceError('Field has no explicit currentCycleId.', 409);

    if (field.currentCycleId !== previousCycleId) {
      const previousRef = database.collection(COLLECTIONS.CROP_CYCLES).doc(previousCycleId);
      const currentRef = database.collection(COLLECTIONS.CROP_CYCLES).doc(field.currentCycleId);
      const previousSnapshot = await transaction.get(previousRef);
      const currentSnapshot = await transaction.get(currentRef);
      if (
        previousSnapshot.exists && previousSnapshot.data().fieldId === normalizedFieldId && previousSnapshot.data().status === 'ARCHIVED' &&
        currentSnapshot.exists && currentSnapshot.data().fieldId === normalizedFieldId && currentSnapshot.data().status === 'ACTIVE' &&
        Number(currentSnapshot.data().sequenceNumber) === Number(previousSnapshot.data().sequenceNumber) + 1
      ) {
        const previousLogs = await transaction.get(
          database.collection(COLLECTIONS.OPERATION_LOGS).where('cycleId', '==', previousCycleId)
        );
        if (previousLogs.docs.some(doc => doc.data().status !== 'ARCHIVED')) {
          throw serviceError('The previous cycle still contains non-archived operation records.', 409);
        }
        return {
          oldCycleId: previousCycleId,
          newCycleId: currentSnapshot.id,
          archivedLogCount: 0,
          archivedOperationLogIds: previousLogs.docs.map(doc => doc.id),
          oldCycle: previousSnapshot.data(),
          newCycle: currentSnapshot.data(),
          replayed: true
        };
      }
      throw serviceError('previousCycleId no longer matches the field current cycle.', 409);
    }
    assertBaseVersion(field.updatedAt, mutationContext, normalizedFieldId, { id: normalizedFieldId, ...field });

    const oldCycleRef = database.collection(COLLECTIONS.CROP_CYCLES).doc(previousCycleId);
    const oldCycleSnapshot = await transaction.get(oldCycleRef);
    if (!oldCycleSnapshot.exists) throw serviceError('The field currentCycleId does not reference an existing cycle.', 409);
    const oldCycle = oldCycleSnapshot.data();
    if (oldCycle.fieldId !== normalizedFieldId || oldCycle.status !== 'ACTIVE') {
      throw serviceError('The referenced current crop cycle is not ACTIVE for this field.', 409);
    }

    const nextSequence = integer(oldCycle.sequenceNumber, 'sequenceNumber', { min: 1, max: 9998 }) + 1;
    const newCycleId = createCycleId(normalizedFieldId, nextSequence);
    const newCycleRef = database.collection(COLLECTIONS.CROP_CYCLES).doc(newCycleId);
    const newCycleSnapshot = await transaction.get(newCycleRef);
    if (newCycleSnapshot.exists) throw serviceError('The next crop cycle already exists.', 409);

    const cycleLogs = await transaction.get(
      database.collection(COLLECTIONS.OPERATION_LOGS).where('cycleId', '==', previousCycleId)
    );
    const activeLogs = cycleLogs.docs.filter(doc => doc.data().status === 'ACTIVE');
    if (activeLogs.length > MAX_ATOMIC_ROLLOVER_LOGS) {
      throw serviceError(`Crop-cycle rollover supports at most ${MAX_ATOMIC_ROLLOVER_LOGS} ACTIVE operation records in one atomic transaction.`, 409);
    }

    const archivedOldCycle = {
      ...oldCycle,
      status: 'ARCHIVED',
      archivedAt: timestamp,
      archivedByUserId: actorId,
      updatedAt: timestamp
    };
    const newCycle = {
      fieldId: normalizedFieldId,
      sequenceNumber: nextSequence,
      cropType: requiredString(input.cropType || oldCycle.cropType, 'cropType', { max: 120 }),
      cropYear: normalizeCropYear(input.cropYear),
      currentStageNumber: CROP_STAGE_MIN,
      elapsedMonths: 0,
      batchNumber: integer(input.batchNumber == null ? 1 : input.batchNumber, 'batchNumber', { min: 1, max: 9999 }),
      status: 'ACTIVE',
      startedAt: timestamp,
      updatedAt: timestamp,
      archivedAt: null,
      archivedByUserId: null
    };

    transaction.update(oldCycleRef, {
      status: archivedOldCycle.status,
      archivedAt: archivedOldCycle.archivedAt,
      archivedByUserId: archivedOldCycle.archivedByUserId,
      updatedAt: archivedOldCycle.updatedAt
    });
    for (const logSnapshot of activeLogs) {
      transaction.update(logSnapshot.ref, {
        status: 'ARCHIVED',
        archivedAt: timestamp,
        archivedByUserId: actorId,
        updatedAt: timestamp
      });
    }
    transaction.create(newCycleRef, newCycle);
    transaction.update(fieldRef, { currentCycleId: newCycleId, cropYear: newCycle.cropYear, updatedAt: timestamp });

    return {
      oldCycleId: oldCycleSnapshot.id,
      newCycleId,
      archivedLogCount: activeLogs.length,
      archivedOperationLogIds: activeLogs.map(doc => doc.id),
      oldCycle: archivedOldCycle,
      newCycle,
      replayed: false
    };
  });
}

async function archiveFieldWithOperations(database, fieldId, user, timestamp = nowIso(), mutationContext = null) {
  const normalizedFieldId = String(fieldId || '').trim().toUpperCase();
  return database.runTransaction(async transaction => {
    const identity = actor(user);
    if (identity.actorRole !== ROLES.FARM_MANAGER) {
      throw serviceError('Role is not authorized to archive fields.', 403);
    }
    const fieldRef = database.collection(COLLECTIONS.FIELDS).doc(normalizedFieldId);
    const fieldSnapshot = await transaction.get(fieldRef);
    if (!fieldSnapshot.exists) throw serviceError('Field not found.', 404);
    const field = fieldSnapshot.data();
    const farmSnapshot = await transaction.get(database.collection(COLLECTIONS.BLOCK_FARMS).doc(field.blockFarmId));
    if (!farmSnapshot.exists || farmSnapshot.data().managerUserId !== identity.actorId) {
      throw serviceError('Farm Managers may archive only fields in their assigned block farm.', 403);
    }
    if (field.status === 'ARCHIVED') {
      return { replayed: true, field: { id: fieldSnapshot.id, ...field }, archivedLogCount: 0 };
    }
    assertBaseVersion(field.updatedAt, mutationContext, fieldSnapshot.id, { id: fieldSnapshot.id, ...field });

    let cycleSnapshot = null;
    if (field.currentCycleId) {
      cycleSnapshot = await transaction.get(database.collection(COLLECTIONS.CROP_CYCLES).doc(field.currentCycleId));
    }
    const logSnapshot = await transaction.get(
      database.collection(COLLECTIONS.OPERATION_LOGS)
        .where('fieldId', '==', normalizedFieldId)
        .where('status', '==', 'ACTIVE')
    );
    const extraWrites = cycleSnapshot?.exists && cycleSnapshot.data().status === 'ACTIVE' ? 2 : 1;
    if (logSnapshot.size + extraWrites > 500) {
      throw serviceError('Field archival exceeds the Firestore atomic write limit.', 409);
    }

    const archivedField = { ...field, status: 'ARCHIVED', archivedAt: timestamp, updatedAt: timestamp };
    transaction.update(fieldRef, { status: 'ARCHIVED', archivedAt: timestamp, updatedAt: timestamp });
    if (cycleSnapshot?.exists && cycleSnapshot.data().status === 'ACTIVE') {
      transaction.update(cycleSnapshot.ref, {
        status: 'ARCHIVED',
        archivedAt: timestamp,
        archivedByUserId: identity.actorId,
        updatedAt: timestamp
      });
    }
    for (const logSnapshotItem of logSnapshot.docs) {
      transaction.update(logSnapshotItem.ref, {
        status: 'ARCHIVED',
        archivedAt: timestamp,
        archivedByUserId: identity.actorId,
        updatedAt: timestamp
      });
    }
    return {
      replayed: false,
      field: { id: fieldSnapshot.id, ...archivedField },
      archivedLogCount: logSnapshot.size
    };
  });
}

module.exports = {
  MAX_ATOMIC_ROLLOVER_LOGS,
  createOperationRecord,
  amendOperationRecord,
  archiveOperationRecords,
  updateCycleStage,
  rolloverFieldCycle,
  archiveFieldWithOperations
};
