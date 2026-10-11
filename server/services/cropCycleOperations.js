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
  cropYearParts,
  nextCropYearParts,
  CYCLE_CLOSURE_STATUS
} = require('../schema/firestoreSchema');
const { CROP_STAGE_MAX, CROP_STAGE_MIN } = require('../domain/cropStages');
const { getOperationDefinition } = require('../domain/operationCatalogue');
const { canonicalSugarcaneVariety } = require('../domain/sugarcaneVarieties');
const { operationAuthorization } = require('../domain/operationAuthorization');
const { completeMatchingScheduleEntry } = require('../domain/operationSchedule');
const { assertBaseVersion } = require('./mutationContext');
const { createSystemId } = require('../domain/systemIds');
const { queueAuditEvent } = require('./auditWriter');
const { assertOperationFitsField } = require('../domain/landArea');

const MAX_ATOMIC_ROLLOVER_LOGS = 496;
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

async function readManagerField(transaction, database, fieldId, user, action) {
  const normalizedFieldId = String(fieldId || '').trim().toUpperCase();
  const identity = actor(user);
  if (identity.actorRole !== ROLES.FARM_MANAGER) {
    throw serviceError(`Only the assigned Farm Manager may ${action}.`, 403);
  }
  const fieldRef = database.collection(COLLECTIONS.FIELDS).doc(normalizedFieldId);
  const fieldSnapshot = await transaction.get(fieldRef);
  if (!fieldSnapshot.exists) throw serviceError('The referenced field does not exist.', 404);
  const field = fieldSnapshot.data();
  const farmSnapshot = await transaction.get(database.collection(COLLECTIONS.BLOCK_FARMS).doc(field.blockFarmId));
  if (!farmSnapshot.exists || farmSnapshot.data().managerUserId !== identity.actorId) {
    throw serviceError(`Farm Managers may ${action} only within their assigned block farm.`, 403);
  }
  return { ...identity, fieldId: fieldSnapshot.id, field, fieldRef };
}

function coveredOperationIds(reports) {
  return new Set(reports
    .filter(document => String(document.data().status || '').toUpperCase() !== 'RETURNED')
    .flatMap(document => {
      const report = document.data();
      return Array.isArray(report.sourceLogIds) && report.sourceLogIds.length
        ? report.sourceLogIds
        : (report.operationSnapshots || report.operations || []);
    })
    .map(value => String(value?.operationLogId || value?.id || value || '').trim())
    .filter(Boolean));
}

async function readCycleAuditCoverage(transaction, database, cycleId, blockFarmId) {
  const logsSnapshot = await transaction.get(
    database.collection(COLLECTIONS.OPERATION_LOGS).where('cycleId', '==', cycleId)
  );
  const reportsSnapshot = await transaction.get(
    database.collection(COLLECTIONS.AUDIT_REPORTS).where('blockFarmId', '==', blockFarmId)
  );
  const coveredIds = coveredOperationIds(reportsSnapshot.docs);
  const submittedLogs = logsSnapshot.docs.filter(document => ['ACTIVE', 'ARCHIVED'].includes(
    String(document.data().status || '').toUpperCase()
  ));
  const uncompiledLogs = submittedLogs.filter(document => !coveredIds.has(String(document.id)));
  return { submittedLogs, uncompiledLogs };
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
  if (cycle.closureRequest?.status === CYCLE_CLOSURE_STATUS.PENDING) {
    throw serviceError(
      'This Crop Year Cycle is awaiting Farm Manager closure approval. New operation changes are locked until the manager approves or rejects the request.',
      409,
      { code: 'CYCLE_CLOSURE_PENDING', cycleId: normalizedCycleId, fieldId: fieldAccess.fieldId }
    );
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
    const currentStageNumber = integer(activeCycle.cycle.currentStageNumber, 'currentStageNumber', { min: CROP_STAGE_MIN, max: CROP_STAGE_MAX });
    if (selectedStageNumber > currentStageNumber) {
      const requiredStages = selectedStageNumber === currentStageNumber + 1
        ? `Stage ${currentStageNumber}`
        : `Stages ${currentStageNumber} through ${selectedStageNumber - 1}`;
      throw serviceError(
        `Complete ${requiredStages} before recording work for Stage ${selectedStageNumber}.`,
        409,
        { code: 'FUTURE_STAGE_LOCKED', currentStageNumber, requestedStageNumber: selectedStageNumber }
      );
    }
    const definition = validateOperationForStage(input, access.field, selectedStageNumber);
    const submittedComponent = definition.childOperationDefinitionId ? null : validateSubmittedComponent(input);
    const variety = plantingVariety(input, selectedStageNumber);
    const stageAlreadyCompleted = selectedStageNumber < currentStageNumber
      || (selectedStageNumber === currentStageNumber && Boolean(activeCycle.cycle.completedAt));
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
      parentOperationDefinitionId: null,
      childOperationDefinitionId: definition.childOperationDefinitionId || submittedComponent?.childOperationDefinitionId || null,
      childOperationName: definition.childOperationName || submittedComponent?.childOperationName || '',
      operationName: definition.name,
      category: definition.category,
      stageNumber: selectedStageNumber,
      stageNumberAtRecord: selectedStageNumber,
      isSupplemental: Boolean(input.isSupplemental) || stageAlreadyCompleted,
      variety,
      status: 'ACTIVE',
      archivedAt: null,
      archivedByUserId: null,
      createdAt: input.createdAt || timestamp,
      updatedAt: timestamp,
      submissionSource: access.authorization.submissionSource,
      photoEvidence: null
    }, { submittedByUserId: access.actorId, now: timestamp });
    assertOperationFitsField(payload.areaHa, access.field.areaHa ?? access.field.ha, access.fieldId);

    if (payload.childOperationDefinitionId && payload.childOperationDefinitionId !== 'CUSTOM') {
      const canonicalComponentId = value => String(value || '')
        .trim()
        .toUpperCase()
        .replace(/^SI-SRA-(\d+)-(\d+)$/, 'SI-$1-$2');
      const cycleOperations = await transaction.get(
        database.collection(COLLECTIONS.OPERATION_LOGS).where('cycleId', '==', cycleId)
      );
      const duplicateComponent = cycleOperations.docs.find(snapshot => {
        const operation = snapshot.data();
        return operation.status === 'ACTIVE'
          && operation.fieldId === fieldId
          && operation.operationDefinitionId === payload.operationDefinitionId
          && canonicalComponentId(operation.childOperationDefinitionId) === canonicalComponentId(payload.childOperationDefinitionId);
      });
      if (duplicateComponent) {
        return {
          replayed: true,
          id: duplicateComponent.id,
          record: duplicateComponent.data(),
          replayReason: 'DUPLICATE_OPERATION_COMPONENT'
        };
      }
    }

    if (variety && !existingCycleVariety) {
      transaction.update(activeCycle.cycleRef, { variety, updatedAt: timestamp });
    }
    const scheduleCompletion = completeMatchingScheduleEntry(access.field.operationSchedule, payload, logId, timestamp);
    if (scheduleCompletion.changed) {
      transaction.update(access.fieldRef, { operationSchedule: scheduleCompletion.schedule, updatedAt: timestamp });
    }
    transaction.create(targetRef, payload);
    queueAuditEvent(transaction, database, {
      eventType: 'OPERATION_LOG_CREATED',
      actorUserId: access.actorId,
      entityType: 'OPERATION_LOG',
      entityId: logId,
      blockFarmId: access.field.blockFarmId,
      details: `Recorded operation ${logId} for field ${fieldId}.`,
      createdAt: timestamp
    });
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
    const immutable = [
      'fieldId', 'cycleId', 'blockFarmId', 'cropYearCycle', 'stageNumber', 'stageNumberAtRecord',
      'operationDefinitionId', 'parentOperationDefinitionId', 'childOperationDefinitionId',
      'submittedByUserId', 'submissionSource', 'createdAt'
    ];
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

    const amendmentId = amendment.amendmentId || createSystemId('AMD');
    const merged = {
      ...existing,
      ...requested,
      operationDefinitionId: definition.id,
      parentOperationDefinitionId: null,
      childOperationDefinitionId: definition.childOperationDefinitionId || existing.childOperationDefinitionId || null,
      childOperationName: definition.childOperationName || existing.childOperationName || '',
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
      amendments: existing.amendments || []
    };
    const canonicalUpdate = buildOperationLog(merged, { submittedByUserId: existing.submittedByUserId, now: timestamp });
    assertOperationFitsField(canonicalUpdate.areaHa, access.field.areaHa ?? access.field.ha, access.fieldId);
    const amendableFields = [
      'operationName', 'childOperationName', 'variety', 'performedOn', 'areaHa',
      'peopleCount', 'quantity', 'baseCost', 'totalCost', 'lineItems',
      'laborEntries', 'isSupplemental'
    ];
    const authoritativeChanges = Object.fromEntries(amendableFields
      .filter(key => JSON.stringify(existing[key] ?? null) !== JSON.stringify(canonicalUpdate[key] ?? null))
      .map(key => [key, { before: existing[key] ?? null, after: canonicalUpdate[key] ?? null }]));
    if (!Object.keys(authoritativeChanges).length) {
      throw serviceError('No meaningful operation changes were provided.');
    }
    const payload = buildOperationLog({
      ...canonicalUpdate,
      amendments: [
        ...(existing.amendments || []),
        {
          amendmentId,
          amendedByUserId: access.actorId,
          amendedByName: access.actorName,
          amendedByRole: access.actorRole,
          reason: String(amendment.reason).trim(),
          amendedAt: timestamp,
          changes: authoritativeChanges
        }
      ]
    }, { submittedByUserId: existing.submittedByUserId, now: timestamp });
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
  if (!ids.length || ids.length > 499) {
    throw serviceError('ids must contain between 1 and 499 operation log IDs.');
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
    if (archivedCount > 0) {
      const first = snapshots.find(snapshot => snapshot.data().status === 'ACTIVE');
      queueAuditEvent(transaction, database, {
        eventType: 'OPERATION_LOGS_ARCHIVED',
        actorUserId: identity.actorId,
        entityType: 'OPERATION_LOG',
        entityId: archivedCount === 1 ? first.id : (mutationContext?.mutationId || createSystemId('BATCH')),
        blockFarmId: first?.data().blockFarmId,
        details: `Archived ${archivedCount} operation record${archivedCount === 1 ? '' : 's'}.`,
        createdAt: timestamp
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
    if (cycle.closureRequest?.status === CYCLE_CLOSURE_STATUS.PENDING) {
      throw serviceError('Crop-stage changes are locked while the Farm Manager reviews the cycle closure request.', 409, {
        code: 'CYCLE_CLOSURE_PENDING', cycleId: normalizedCycleId, fieldId: cycle.fieldId
      });
    }
    const access = await readAuthorizedField(transaction, database, cycle.fieldId, user, 'update crop stages');
    if (access.field.currentCycleId !== normalizedCycleId) {
      throw serviceError('The Crop Year Cycle is not the field current cycle.', 409);
    }
    const requestedStage = integer(input.currentStageNumber, 'currentStageNumber', {
      min: CROP_STAGE_MIN,
      max: CROP_STAGE_MAX
    });
    const requestedElapsed = finiteNumber(input.elapsedMonths == null ? cycle.elapsedMonths : input.elapsedMonths, 'elapsedMonths', { min: 0, max: 36 });
    const hasCompletionIntent = Object.prototype.hasOwnProperty.call(input, 'isCompleted');
    const requestedComplete = hasCompletionIntent
      ? input.isCompleted === true
      : requestedStage === CROP_STAGE_MAX && Boolean(cycle.completedAt);
    if (requestedComplete && requestedStage !== CROP_STAGE_MAX) {
      throw serviceError('Only the final Harvest stage can complete a Crop Year Cycle.', 400);
    }
    const completedAt = requestedStage < CROP_STAGE_MAX
      ? null
      : requestedComplete
        ? (cycle.completedAt || timestamp)
        : hasCompletionIntent
          ? null
          : (cycle.completedAt || null);
    if (
      cycle.currentStageNumber === requestedStage &&
      cycle.elapsedMonths === requestedElapsed &&
      (cycle.completedAt || null) === completedAt
    ) {
      return { id: cycleSnapshot.id, ...cycle, replayed: true };
    }
    assertBaseVersion(cycle.updatedAt, mutationContext, cycleSnapshot.id, { id: cycleSnapshot.id, ...cycle });
    const update = {
      currentStageNumber: requestedStage,
      elapsedMonths: requestedElapsed,
      completedAt,
      updatedAt: timestamp
    };
    transaction.update(cycleRef, update);
    queueAuditEvent(transaction, database, {
      eventType: 'CROP_STAGE_UPDATED',
      actorUserId: access.actorId,
      entityType: 'CROP_CYCLE',
      entityId: cycleSnapshot.id,
      blockFarmId: cycle.blockFarmId,
      details: `Updated Crop Year Cycle ${cycleSnapshot.id} to stage ${requestedStage}.`,
      createdAt: timestamp
    });
    return { id: cycleSnapshot.id, ...cycle, ...update };
  });
}

async function requestCycleRollover(database, fieldId, input, user, timestamp = nowIso(), mutationContext = null) {
  const normalizedFieldId = String(fieldId || '').trim().toUpperCase();
  return database.runTransaction(async transaction => {
    const access = await readAuthorizedField(transaction, database, normalizedFieldId, user, 'request a new Crop Year Cycle');
    if (access.actorRole !== ROLES.MEMBER_FARMER) {
      throw serviceError('Only the assigned Farm Member may request a new Crop Year Cycle.', 403);
    }
    if (access.field.status !== 'ACTIVE' || !access.field.currentCycleId) {
      throw serviceError('The field must have an ACTIVE Crop Year Cycle before requesting rollover.', 409);
    }
    assertBaseVersion(access.field.updatedAt, mutationContext, normalizedFieldId, { id: normalizedFieldId, ...access.field });
    const cycleRef = database.collection(COLLECTIONS.CROP_CYCLES).doc(access.field.currentCycleId);
    const cycleSnapshot = await transaction.get(cycleRef);
    if (!cycleSnapshot.exists) throw serviceError('The field current Crop Year Cycle does not exist.', 404);
    const cycle = cycleSnapshot.data();
    if (cycle.status !== 'ACTIVE' || cycle.fieldId !== normalizedFieldId) {
      throw serviceError('Only the field current ACTIVE Crop Year Cycle can request rollover.', 409);
    }
    if (Number(cycle.currentStageNumber) !== CROP_STAGE_MAX || !cycle.completedAt) {
      throw serviceError('Complete the Harvest stage before requesting a new Crop Year Cycle.', 409);
    }
    if (cycle.closureRequest?.status === CYCLE_CLOSURE_STATUS.PENDING) {
      return { id: cycleSnapshot.id, closureRequest: cycle.closureRequest, replayed: true };
    }
    const closureRequest = {
      status: CYCLE_CLOSURE_STATUS.PENDING,
      requestedByUserId: access.actorId,
      requestedByName: access.actorName || access.actorId,
      requestedAt: timestamp,
      requestedCropType: requiredString(input.cropType || cycle.cropType, 'cropType', { max: 120 }),
      decidedByUserId: null,
      decidedByName: '',
      decidedAt: null,
      decisionReason: ''
    };
    transaction.update(cycleRef, { closureRequest, updatedAt: timestamp });
    transaction.update(access.fieldRef, { updatedAt: timestamp });
    queueAuditEvent(transaction, database, {
      eventType: 'CROP_CYCLE_CLOSURE_REQUESTED',
      actorUserId: access.actorId,
      entityType: 'CROP_CYCLE',
      entityId: cycleSnapshot.id,
      blockFarmId: cycle.blockFarmId,
      details: `Requested Farm Manager approval to close ${cycleSnapshot.id} and start the next Crop Year Cycle.`,
      createdAt: timestamp
    });
    return { id: cycleSnapshot.id, closureRequest, replayed: false };
  });
}

async function rejectCycleRollover(database, fieldId, input, user, timestamp = nowIso()) {
  const normalizedFieldId = String(fieldId || '').trim().toUpperCase();
  return database.runTransaction(async transaction => {
    const access = await readManagerField(transaction, database, normalizedFieldId, user, 'reject Crop Year Cycle closure requests');
    if (!access.field.currentCycleId) throw serviceError('Field has no current Crop Year Cycle.', 409);
    const cycleRef = database.collection(COLLECTIONS.CROP_CYCLES).doc(access.field.currentCycleId);
    const cycleSnapshot = await transaction.get(cycleRef);
    if (!cycleSnapshot.exists) throw serviceError('The field current Crop Year Cycle does not exist.', 404);
    const cycle = cycleSnapshot.data();
    if (cycle.closureRequest?.status !== CYCLE_CLOSURE_STATUS.PENDING) {
      throw serviceError('This field has no pending Crop Year Cycle closure request.', 409);
    }
    const decisionReason = requiredString(input.reason, 'reason', { max: 1000 });
    const closureRequest = {
      ...cycle.closureRequest,
      status: CYCLE_CLOSURE_STATUS.REJECTED,
      decidedByUserId: access.actorId,
      decidedByName: access.actorName || access.actorId,
      decidedAt: timestamp,
      decisionReason
    };
    transaction.update(cycleRef, { closureRequest, updatedAt: timestamp });
    transaction.update(access.fieldRef, { updatedAt: timestamp });
    queueAuditEvent(transaction, database, {
      eventType: 'CROP_CYCLE_CLOSURE_REJECTED',
      actorUserId: access.actorId,
      entityType: 'CROP_CYCLE',
      entityId: cycleSnapshot.id,
      blockFarmId: cycle.blockFarmId,
      details: decisionReason,
      createdAt: timestamp
    });
    return { id: cycleSnapshot.id, closureRequest };
  });
}

async function rolloverFieldCycle(database, fieldId, input, user, timestamp = nowIso(), mutationContext = null) {
  const normalizedFieldId = String(fieldId || '').trim().toUpperCase();
  const previousCycleId = requiredString(input.previousCycleId, 'previousCycleId', { max: 120 }).toUpperCase();

  return database.runTransaction(async transaction => {
    const approvalRequired = input.managerApprovalRequired === true;
    const access = approvalRequired
      ? await readManagerField(transaction, database, normalizedFieldId, user, 'approve Crop Year Cycle closure requests')
      : await readAuthorizedField(transaction, database, normalizedFieldId, user, 'roll over Crop Year Cycles');
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
    if (approvalRequired && oldCycle.closureRequest?.status !== CYCLE_CLOSURE_STATUS.PENDING) {
      throw serviceError('The Farm Member must request Crop Year Cycle closure before manager approval.', 409, {
        code: 'CYCLE_CLOSURE_REQUEST_REQUIRED', cycleId: previousCycleId
      });
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
    if (approvalRequired) {
      const coverage = await readCycleAuditCoverage(transaction, database, previousCycleId, field.blockFarmId);
      if (coverage.uncompiledLogs.length) {
        throw serviceError(
          `Compile the ${coverage.uncompiledLogs.length} outstanding operation record${coverage.uncompiledLogs.length === 1 ? '' : 's'} before approving this new cycle.`,
          409,
          {
            code: 'UNCOMPILED_CYCLE_OPERATIONS',
            cycleId: previousCycleId,
            submittedCount: coverage.submittedLogs.length,
            uncompiledCount: coverage.uncompiledLogs.length,
            uncompiledOperationLogIds: coverage.uncompiledLogs.map(document => document.id)
          }
        );
      }
    }

    const archivedOldCycle = {
      ...oldCycle,
      status: 'ARCHIVED',
      archivedAt: timestamp,
      archivedByUserId: actorId,
      updatedAt: timestamp,
      closureRequest: approvalRequired ? {
        ...oldCycle.closureRequest,
        status: CYCLE_CLOSURE_STATUS.APPROVED,
        decidedByUserId: actorId,
        decidedByName: access.actorName || actorId,
        decidedAt: timestamp,
        decisionReason: String(input.reason || 'All submitted operations were compiled before rollover.').trim()
      } : (oldCycle.closureRequest || null)
    };
    const nextCropYear = nextCropYearParts(oldCycle.cropYear);
    const duplicateAnnualCycle = fieldCycles.docs.find(doc => normalizeCropYear(doc.data().cropYear) === nextCropYear.cropYear);
    if (duplicateAnnualCycle) {
      throw serviceError('This field already has a Crop Year Cycle for the next annual range.', 409, {
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
      completedAt: null,
      closureRequest: null
    };

    transaction.update(oldCycleRef, {
      status: archivedOldCycle.status,
      archivedAt: archivedOldCycle.archivedAt,
      archivedByUserId: archivedOldCycle.archivedByUserId,
      completedAt: timestamp,
      updatedAt: archivedOldCycle.updatedAt,
      closureRequest: archivedOldCycle.closureRequest
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
    queueAuditEvent(transaction, database, {
      eventType: 'CROP_CYCLE_ROLLED_OVER',
      actorUserId: actorId,
      entityType: 'CROP_CYCLE',
      entityId: newCycleId,
      blockFarmId: field.blockFarmId,
      details: `Closed ${previousCycleId} and started ${newCycleId}.`,
      createdAt: timestamp
    });

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

async function approveCycleRollover(database, fieldId, input, user, timestamp = nowIso(), mutationContext = null) {
  const normalizedFieldId = String(fieldId || '').trim().toUpperCase();
  const previousCycleId = requiredString(input.previousCycleId, 'previousCycleId', { max: 120 }).toUpperCase();
  return rolloverFieldCycle(database, normalizedFieldId, {
    ...input,
    previousCycleId,
    managerApprovalRequired: true
  }, user, timestamp, mutationContext);
}

async function createInitialFieldCycle(database, fieldId, input, user, timestamp = nowIso(), mutationContext = null) {
  const normalizedFieldId = String(fieldId || '').trim().toUpperCase();
  return database.runTransaction(async transaction => {
    const access = await readAuthorizedField(transaction, database, normalizedFieldId, user, 'start Crop Year Cycles');
    const { field, fieldRef, actorId } = access;
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
    queueAuditEvent(transaction, database, {
      eventType: 'CROP_CYCLE_CREATED',
      actorUserId: actorId,
      entityType: 'CROP_CYCLE',
      entityId: cycleId,
      blockFarmId: field.blockFarmId,
      details: `Started Crop Year Cycle ${cycleId} for field ${normalizedFieldId}.`,
      createdAt: timestamp
    });
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
  if (canonical?.parentOperationDefinitionId) {
    const parent = getOperationDefinition(canonical.parentOperationDefinitionId);
    return {
      ...parent,
      childOperationDefinitionId: canonical.id,
      childOperationName: canonical.name
    };
  }
  if (canonical?.childOperations?.length) {
    const childId = requiredString(input.childOperationDefinitionId, 'childOperationDefinitionId', { max: 120 }).toUpperCase();
    if (childId === 'CUSTOM') {
      return {
        ...canonical,
        childOperationDefinitionId: 'CUSTOM',
        childOperationName: requiredString(input.childOperationName, 'childOperationName', { max: 300 })
      };
    }
    const child = getOperationDefinition(childId);
    if (!child || child.parentOperationDefinitionId !== canonical.id) {
      throw serviceError('The selected child operation does not belong under this operation title.', 400, {
        code: 'INVALID_CHILD_OPERATION', operationDefinitionId: canonical.id, childOperationDefinitionId: childId
      });
    }
    return {
      ...canonical,
      childOperationDefinitionId: child.id,
      childOperationName: child.name
    };
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

function validateSubmittedComponent(input) {
  const componentId = String(input.childOperationDefinitionId || '').trim();
  if (!componentId) return null;
  const legacyChild = getOperationDefinition(componentId);
  if (legacyChild?.parentOperationDefinitionId === String(input.operationDefinitionId || '').trim().toUpperCase()) {
    return {
      childOperationDefinitionId: legacyChild.id,
      childOperationName: legacyChild.name
    };
  }
  const submittedLineItems = Array.isArray(input.lineItems) ? input.lineItems : [];
  const submittedLaborEntries = Array.isArray(input.laborEntries) ? input.laborEntries : [];
  const matchingLineItem = submittedLineItems.find(item => String(item.lineItemId || '').trim() === componentId);
  const matchingLaborEntry = submittedLaborEntries.find(item => String(item.laborEntryId || '').trim() === componentId);
  const isItemWithAttachedLabor = Boolean(matchingLineItem) && submittedLineItems.length === 1;
  const isLegacyLaborOnly = Boolean(matchingLaborEntry) && submittedLineItems.length === 0 && submittedLaborEntries.length === 1;
  if ((!isItemWithAttachedLabor && !isLegacyLaborOnly) || Number(input.baseCost || 0) !== 0) {
    throw serviceError('An itemized child submission must contain one matching material or expense row. Labor entries may be attached to that row.', 400, {
      code: 'INVALID_ITEMIZED_COMPONENT'
    });
  }
  return {
    childOperationDefinitionId: componentId,
    childOperationName: matchingLineItem
      ? requiredString(matchingLineItem.description, 'lineItems.description', { max: 300 })
      : `${Number(matchingLaborEntry.workerCount || 0)} workers for ${Number(matchingLaborEntry.days || matchingLaborEntry.quantity || 0)} days`
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
    const extraWrites = cycleSnapshot?.exists && cycleSnapshot.data().status === 'ACTIVE' ? 3 : 2;
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
    queueAuditEvent(transaction, database, {
      eventType: 'FIELD_ARCHIVED',
      actorUserId: identity.actorId,
      entityType: 'FIELD',
      entityId: fieldSnapshot.id,
      blockFarmId: field.blockFarmId,
      details: `Archived field ${fieldSnapshot.id} and ${logSnapshot.size} active operation record${logSnapshot.size === 1 ? '' : 's'}.`,
      createdAt: timestamp
    });
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
  requestCycleRollover,
  approveCycleRollover,
  rejectCycleRollover,
  rolloverFieldCycle,
  createInitialFieldCycle,
  archiveFieldWithOperations
};
