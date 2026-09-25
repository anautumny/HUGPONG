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
  normalizeCropYear,
  cropYearParts
} = require('../schema/firestoreSchema');
const { CROP_STAGE_MAX, CROP_STAGE_MIN } = require('../domain/cropStages');
const { getOperationDefinition } = require('../domain/operationCatalogue');
const { canonicalSugarcaneVariety } = require('../domain/sugarcaneVarieties');
const { operationAuthorization } = require('../domain/operationAuthorization');
const { assertBaseVersion } = require('./mutationContext');

const MAX_ATOMIC_ROLLOVER_LOGS = 497;

function serviceError(message, status = 400, data) {
  const error = new Error(message);
  error.status = status;
  if (data !== undefined) error.data = data;
  return error;
}

function cycleClosedConflict(cycleId, fieldId) {
  return serviceError(
    'cycleId must be the field\'s explicit ACTIVE Crop Year Cycle. The original cycle is closed, and the operation was not moved to the field\'s newer cycle.',
    409,
    { code: 'CYCLE_CLOSED_CONFLICT', cycleId, fieldId }
  );
}

function actor(user) {
  return {
    actorId: String(user?.employeeId || user?.userId || '').trim(),
    actorRole: canonicalRole(user?.role || user?.roleKey),
    actorName: String(user?.name || user?.displayName || '').trim()
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
  let managedBlockFarm = false;
  if (identity.actorRole === ROLES.FARM_MANAGER && field.memberUserId !== identity.actorId) {
    const farmRef = database.collection(COLLECTIONS.BLOCK_FARMS).doc(field.blockFarmId);
    const farmSnapshot = await transaction.get(farmRef);
    managedBlockFarm = Boolean(farmSnapshot.exists && farmSnapshot.data().managerUserId === identity.actorId);
    if (!managedBlockFarm) {
      throw serviceError(`Farm Managers may ${action} only within their assigned block farm.`, 403);
    }
  }

  const authorization = operationAuthorization(user, { id: fieldSnapshot.id, ...field }, { managedBlockFarm });
  if (!authorization.canCreate) {
    if (identity.actorRole === ROLES.MEMBER_FARMER) {
      throw serviceError(`Farm Members may ${action} only for their assigned field.`, 403);
    }
    throw serviceError('A valid takeover authorization for this field is required for manager changes.', 403, {
      code: 'TAKEOVER_AUTHORIZATION_REQUIRED', fieldId: normalizedFieldId
    });
  }

  return { ...identity, fieldId: fieldSnapshot.id, field, fieldRef, authorization };
}

async function readActiveCurrentCycle(transaction, database, fieldAccess, cycleId) {
  const normalizedCycleId = String(cycleId || '').trim().toUpperCase();
  const cycleRef = database.collection(COLLECTIONS.CROP_CYCLES).doc(normalizedCycleId);
  const cycleSnapshot = await transaction.get(cycleRef);
  if (!cycleSnapshot.exists) throw serviceError('The referenced Crop Year Cycle does not exist.', 404);
  const cycle = cycleSnapshot.data();
  if (fieldAccess.field.status !== 'ACTIVE') {
    throw serviceError('Operations can only be changed for an ACTIVE field.', 409);
  }
  if (
    fieldAccess.field.currentCycleId !== normalizedCycleId ||
    cycle.fieldId !== fieldAccess.fieldId ||
    cycle.status !== 'ACTIVE'
  ) {
    if (cycle.fieldId === fieldAccess.fieldId && cycle.status === 'ARCHIVED') {
      throw cycleClosedConflict(normalizedCycleId, fieldAccess.fieldId);
    }
    throw serviceError('cycleId must be the field\'s explicit ACTIVE Crop Year Cycle.', 409);
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
    const activeCycle = await readActiveCurrentCycle(transaction, database, access, cycleId);
    const selectedStageNumber = integer(input.stageNumber, 'stageNumber', { min: CROP_STAGE_MIN, max: CROP_STAGE_MAX });
    const definition = validateOperationForStage(input, access.field, selectedStageNumber);
    const variety = plantingVariety(input, selectedStageNumber);
    const existingCycleVariety = String(activeCycle.cycle.variety || '').trim();
    if (variety && existingCycleVariety && variety !== existingCycleVariety) {
      throw serviceError('This Crop Year Cycle already has a different sugarcane variety. Use an operation amendment to correct it.', 409, {
        code: 'CYCLE_VARIETY_CONFLICT', variety: existingCycleVariety
      });
    }
    const payload = buildOperationLog({
      ...input,
      fieldId,
      cycleId,
      blockFarmId: access.field.blockFarmId,
      cropYearCycle: normalizeCropYear(activeCycle.cycle.cropYear),
      operationDefinitionId: definition.id,
      operationName: definition.name,
      category: definition.category,
      stageNumber: selectedStageNumber,
      stageNumberAtRecord: selectedStageNumber,
      variety,
      status: 'ACTIVE',
      archivedAt: null,
      archivedByUserId: null,
      createdAt: input.createdAt || timestamp,
      updatedAt: timestamp,
      submissionSource: access.authorization.submissionSource,
      photoEvidence: null
    }, { submittedByUserId: access.actorId, now: timestamp });
    if (variety && !existingCycleVariety) {
      transaction.update(activeCycle.cycleRef, { variety, updatedAt: timestamp });
    }
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
    const activeCycle = await readActiveCurrentCycle(transaction, database, access, existing.cycleId);
    if (access.actorRole === ROLES.MEMBER_FARMER && existing.submittedByUserId !== access.actorId) {
      throw serviceError('Farm Members may amend only operations they submitted.', 403);
    }
    if (amendment.amendmentId && (existing.amendments || []).some(item => item.amendmentId === amendment.amendmentId)) {
      return { replayed: true, id: snapshot.id, record: existing };
    }
    assertBaseVersion(existing.updatedAt, mutationContext, snapshot.id, { id: snapshot.id, ...existing });

    const requested = changes && typeof changes === 'object' ? changes : {};
    const immutable = ['fieldId', 'cycleId', 'blockFarmId', 'cropYearCycle', 'stageNumber', 'stageNumberAtRecord', 'submittedByUserId', 'submissionSource', 'createdAt'];
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

    const fixedStageNumber = Number(existing.stageNumberAtRecord || existing.stageNumber || activeCycle.cycle.currentStageNumber);
    const definition = validateOperationForStage({
      operationDefinitionId: requested.operationDefinitionId || existing.operationDefinitionId,
      operationName: requested.operationName || existing.operationName,
      category: requested.category || existing.category
    }, access.field, fixedStageNumber);
    let variety = String(existing.variety || '').trim();
    if (fixedStageNumber === 2) {
      if (Object.prototype.hasOwnProperty.call(requested, 'variety')) {
        variety = validatedSugarcaneVariety(requested.variety);
      }
    } else if (String(requested.variety || '').trim()) {
      throw serviceError('Sugarcane variety may be corrected only on Planting-stage operations.');
    }

    const amendmentId = amendment.amendmentId || `AMD-${Date.now().toString(36).toUpperCase()}`;
    const merged = {
      ...existing,
      ...requested,
      operationDefinitionId: definition.id,
      operationName: definition.name,
      category: definition.category,
      stageNumber: fixedStageNumber,
      variety: fixedStageNumber === 2 ? variety : '',
      status: 'ACTIVE',
      fieldId: existing.fieldId,
      cycleId: existing.cycleId,
      blockFarmId: existing.blockFarmId || access.field.blockFarmId,
      cropYearCycle: existing.cropYearCycle || normalizeCropYear(activeCycle.cycle.cropYear),
      stageNumberAtRecord: existing.stageNumberAtRecord == null ? activeCycle.cycle.currentStageNumber : existing.stageNumberAtRecord,
      submittedByUserId: existing.submittedByUserId,
      submissionSource: existing.submissionSource,
      photoEvidence: existing.photoEvidence || null,
      createdAt: existing.createdAt,
      archivedAt: null,
      archivedByUserId: null,
      updatedAt: timestamp,
      amendments: [
        ...(existing.amendments || []),
        {
          amendmentId,
          amendedByUserId: access.actorId,
          amendedByName: access.actorName,
          amendedByRole: access.actorRole,
          authorizationMode: access.authorization.submissionSource,
          takeoverFieldId: access.authorization.takeover ? access.fieldId : null,
          reason: String(amendment.reason).trim(),
          amendedAt: timestamp,
          changes: amendment.changes || {}
        }
      ]
    };
    const payload = buildOperationLog(merged, { submittedByUserId: existing.submittedByUserId, now: timestamp });
    if (fixedStageNumber === 2 && variety && variety !== String(activeCycle.cycle.variety || '').trim()) {
      transaction.update(activeCycle.cycleRef, { variety, updatedAt: timestamp });
    }
    transaction.set(ref, payload);
    const auditEventId = `OP-AMEND-${normalizedLogId}-${amendmentId}`.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 500);
    const auditEventRef = database.collection(COLLECTIONS.AUDIT_LOGS).doc(auditEventId);
    transaction.create(auditEventRef, {
      eventType: 'OPERATION_LOG_CORRECTION',
      actorUserId: access.actorId,
      entityType: 'OPERATION_LOG',
      entityId: normalizedLogId,
      details: `Amended operation record ${normalizedLogId}. Reason: ${String(amendment.reason).trim()}`,
      outcome: 'SUCCESS',
      createdAt: timestamp
    });
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
        throw serviceError('Farm Members may archive only operations they submitted.', 403);
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
    if (!cycleSnapshot.exists) throw serviceError('Crop Year Cycle not found.', 404);
    const cycle = cycleSnapshot.data();
    if (cycle.status !== 'ACTIVE') throw serviceError('ARCHIVED Crop Year Cycles cannot be changed.', 409);
    const access = await readAuthorizedField(transaction, database, cycle.fieldId, user, 'update crop stages');
    if (access.field.currentCycleId !== normalizedCycleId) {
      throw serviceError('The Crop Year Cycle is not the field current cycle.', 409);
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
    const access = await readAuthorizedField(transaction, database, normalizedFieldId, user, 'roll over Crop Year Cycles');
    const { field, fieldRef, actorId } = access;
    if (field.status !== 'ACTIVE') throw serviceError('Only an ACTIVE field can start a new Crop Year Cycle.', 409);
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
      throw serviceError('The referenced current Crop Year Cycle is not ACTIVE for this field.', 409);
    }
    if (Number(oldCycle.currentStageNumber) !== CROP_STAGE_MAX) {
      throw serviceError('The current Crop Year Cycle must reach Harvest before rollover.', 409);
    }

    const fieldCycles = await transaction.get(
      database.collection(COLLECTIONS.CROP_CYCLES).where('fieldId', '==', normalizedFieldId)
    );
    const activeCycles = fieldCycles.docs.filter(doc => doc.data().status === 'ACTIVE');
    if (activeCycles.length !== 1 || activeCycles[0].id !== previousCycleId) {
      throw serviceError('The field must have exactly one canonical ACTIVE Crop Year Cycle before rollover.', 409);
    }

    const nextSequence = integer(oldCycle.sequenceNumber, 'sequenceNumber', { min: 1, max: 9998 }) + 1;
    const newCycleId = createCycleId(normalizedFieldId, nextSequence);
    const newCycleRef = database.collection(COLLECTIONS.CROP_CYCLES).doc(newCycleId);
    const newCycleSnapshot = await transaction.get(newCycleRef);
    if (newCycleSnapshot.exists) throw serviceError('The next Crop Year Cycle already exists.', 409);

    const cycleLogs = await transaction.get(
      database.collection(COLLECTIONS.OPERATION_LOGS).where('cycleId', '==', previousCycleId)
    );
    const activeLogs = cycleLogs.docs.filter(doc => doc.data().status === 'ACTIVE');
    if (activeLogs.length > MAX_ATOMIC_ROLLOVER_LOGS) {
      throw serviceError(`Crop Year Cycle rollover supports at most ${MAX_ATOMIC_ROLLOVER_LOGS} ACTIVE operation records in one atomic transaction.`, 409);
    }

    const archivedOldCycle = {
      ...oldCycle,
      status: 'ARCHIVED',
      archivedAt: timestamp,
      archivedByUserId: actorId,
      updatedAt: timestamp
    };
    const nextCropYear = cropYearParts(null, timestamp);
    const duplicateAnnualCycle = fieldCycles.docs.find(doc => normalizeCropYear(doc.data().cropYear) === nextCropYear.cropYear);
    if (duplicateAnnualCycle) {
      throw serviceError('This field already has a Crop Year Cycle for the server-generated annual range.', 409, {
        code: 'DUPLICATE_CROP_YEAR_CYCLE',
        cropYearCycle: nextCropYear.cropYear,
        cycleId: duplicateAnnualCycle.id
      });
    }
    const newCycle = {
      fieldId: normalizedFieldId,
      blockFarmId: field.blockFarmId,
      farmMemberId: field.memberUserId || null,
      sequenceNumber: nextSequence,
      cropType: requiredString(input.cropType || oldCycle.cropType, 'cropType', { max: 120 }),
      variety: '',
      cropYear: nextCropYear.cropYear,
      cropYearStart: nextCropYear.cropYearStart,
      cropYearEnd: nextCropYear.cropYearEnd,
      currentStageNumber: CROP_STAGE_MIN,
      elapsedMonths: 0,
      batchNumber: integer(input.batchNumber == null ? 1 : input.batchNumber, 'batchNumber', { min: 1, max: 9999 }),
      status: 'ACTIVE',
      startedAt: timestamp,
      updatedAt: timestamp,
      archivedAt: null,
      archivedByUserId: null,
      completedAt: null
    };

    transaction.update(oldCycleRef, {
      status: archivedOldCycle.status,
      archivedAt: archivedOldCycle.archivedAt,
      archivedByUserId: archivedOldCycle.archivedByUserId,
      completedAt: timestamp,
      updatedAt: archivedOldCycle.updatedAt
    });
    for (const logSnapshot of activeLogs) {
      transaction.update(logSnapshot.ref, {
        status: 'ARCHIVED',
        archivedAt: timestamp,
        archivedByUserId: actorId,
        archivedReason: 'CYCLE_COMPLETED',
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

async function createInitialFieldCycle(database, fieldId, input, user, timestamp = nowIso(), mutationContext = null) {
  const normalizedFieldId = String(fieldId || '').trim().toUpperCase();
  return database.runTransaction(async transaction => {
    const access = await readAuthorizedField(transaction, database, normalizedFieldId, user, 'start Crop Year Cycles');
    const { field, fieldRef } = access;
    if (field.status !== 'ACTIVE') throw serviceError('Only an ACTIVE field can start a Crop Year Cycle.', 409);
    if (field.currentCycleId) throw serviceError('The field already has an active Crop Year Cycle pointer.', 409);
    assertBaseVersion(field.updatedAt, mutationContext, normalizedFieldId, { id: normalizedFieldId, ...field });

    const fieldCycles = await transaction.get(
      database.collection(COLLECTIONS.CROP_CYCLES).where('fieldId', '==', normalizedFieldId)
    );
    if (fieldCycles.docs.some(doc => doc.data().status === 'ACTIVE')) {
      throw serviceError('The field already owns an ACTIVE Crop Year Cycle.', 409);
    }
    const annual = cropYearParts(null, timestamp);
    const duplicate = fieldCycles.docs.find(doc => normalizeCropYear(doc.data().cropYear) === annual.cropYear);
    if (duplicate) {
      throw serviceError('This field already has a Crop Year Cycle for the server-generated annual range.', 409, {
        code: 'DUPLICATE_CROP_YEAR_CYCLE', cycleId: duplicate.id, cropYearCycle: annual.cropYear
      });
    }

    const sequenceNumber = fieldCycles.docs.reduce(
      (maximum, doc) => Math.max(maximum, Number(doc.data().sequenceNumber) || 0), 0
    ) + 1;
    const cycleId = createCycleId(normalizedFieldId, sequenceNumber);
    const cycleRef = database.collection(COLLECTIONS.CROP_CYCLES).doc(cycleId);
    if ((await transaction.get(cycleRef)).exists) throw serviceError('The canonical Crop Year Cycle ID already exists.', 409);
    const cycle = {
      fieldId: normalizedFieldId,
      blockFarmId: field.blockFarmId,
      farmMemberId: field.memberUserId || null,
      sequenceNumber,
      cropType: requiredString(input.cropType || 'Plant Cane (New Plant)', 'cropType', { max: 120 }),
      variety: '',
      cropYear: annual.cropYear,
      cropYearStart: annual.cropYearStart,
      cropYearEnd: annual.cropYearEnd,
      currentStageNumber: CROP_STAGE_MIN,
      elapsedMonths: 0,
      batchNumber: integer(input.batchNumber == null ? 1 : input.batchNumber, 'batchNumber', { min: 1, max: 9999 }),
      status: 'ACTIVE',
      startedAt: timestamp,
      updatedAt: timestamp,
      archivedAt: null,
      archivedByUserId: null,
      completedAt: null
    };
    const updatedField = { ...field, currentCycleId: cycleId, cropYear: annual.cropYear, updatedAt: timestamp };
    transaction.create(cycleRef, cycle);
    transaction.update(fieldRef, { currentCycleId: cycleId, cropYear: annual.cropYear, updatedAt: timestamp });
    return { cycleId, cycle, field: updatedField };
  });
}

function customOperationForStage(field, operationDefinitionId, stageNumber) {
  const id = String(operationDefinitionId || '').trim();
  if (id.toUpperCase() === 'CUSTOM') return true;
  const configured = field?.customOperations?.[String(stageNumber)] || [];
  return configured.some(operation => String(operation.id || '').trim() === id);
}

function validateOperationForStage(input, field, stageNumber) {
  const operationDefinitionId = requiredString(input.operationDefinitionId, 'operationDefinitionId', { max: 120 });
  const canonical = getOperationDefinition(operationDefinitionId);
  if (canonical && canonical.stageNumber !== stageNumber) {
    throw serviceError(`${canonical.id} belongs to Stage ${canonical.stageNumber}, not Stage ${stageNumber}.`, 400, {
      code: 'INVALID_STAGE_OPERATION', operationDefinitionId: canonical.id, stageNumber
    });
  }
  if (!canonical && !customOperationForStage(field, operationDefinitionId, stageNumber)) {
    throw serviceError('The selected custom operation is not configured for this field and stage.', 400, {
      code: 'INVALID_STAGE_OPERATION', operationDefinitionId, stageNumber
    });
  }
  return canonical || {
    id: operationDefinitionId,
    name: requiredString(input.operationName, 'operationName', { max: 300 }),
    category: requiredString(input.category || 'General Care', 'category', { max: 80 }),
    stageNumber
  };
}

function plantingVariety(input, stageNumber) {
  const value = String(input.variety || '').trim();
  if (stageNumber === 2) return validatedSugarcaneVariety(value);
  if (value) throw serviceError('Sugarcane variety may be recorded only for Planting-stage operations.');
  return '';
}

function validatedSugarcaneVariety(value) {
  const requiredValue = requiredString(value, 'variety', { max: 120 });
  const canonicalValue = canonicalSugarcaneVariety(requiredValue);
  if (!canonicalValue) {
    throw serviceError('variety must be selected from the authorized sugarcane variety catalogue.', 400, {
      code: 'INVALID_SUGARCANE_VARIETY'
    });
  }
  return canonicalValue;
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
  createInitialFieldCycle,
  archiveFieldWithOperations
};
