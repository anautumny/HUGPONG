'use strict';

require('../config');
const { admin, db } = require('../firebase-admin');
const { COLLECTIONS, nowIso } = require('../schema/firestoreSchema');
const { queueAuditEvent } = require('../services/auditWriter');

const RESET_ACTOR = 'SYSTEM_CROP_YEAR_CORRECTION';

function argument(name) {
  const prefix = `--${name}=`;
  const value = process.argv.find(item => item.startsWith(prefix));
  return value ? value.slice(prefix.length).trim() : '';
}

function canonicalCropYear(value, name) {
  const match = String(value || '').trim().match(/^(\d{4})-(\d{4})$/);
  if (!match || Number(match[2]) !== Number(match[1]) + 1) {
    throw new Error(`${name} must use the canonical YYYY-YYYY annual range.`);
  }
  return `${match[1]}-${match[2]}`;
}

function publicDocument(snapshot) {
  return { id: snapshot.id, ...snapshot.data() };
}

async function buildResetPlan(database, { fieldId, fromYear, toYear }) {
  const fieldRef = database.collection(COLLECTIONS.FIELDS).doc(fieldId);
  const [fieldSnapshot, cycleSnapshots, operationSnapshots] = await Promise.all([
    fieldRef.get(),
    database.collection(COLLECTIONS.CROP_CYCLES).where('fieldId', '==', fieldId).get(),
    database.collection(COLLECTIONS.OPERATION_LOGS).where('fieldId', '==', fieldId).get()
  ]);
  if (!fieldSnapshot.exists) throw new Error(`Field ${fieldId} does not exist.`);

  const cycles = cycleSnapshots.docs.map(publicDocument);
  const activeFromCycles = cycles.filter(cycle => cycle.status === 'ACTIVE' && cycle.cropYear === fromYear);
  const archivedToCycles = cycles.filter(cycle => cycle.status === 'ARCHIVED' && cycle.cropYear === toYear);
  if (activeFromCycles.length !== 1) {
    throw new Error(`Expected exactly one ACTIVE ${fromYear} cycle for ${fieldId}; found ${activeFromCycles.length}.`);
  }
  if (archivedToCycles.length !== 1) {
    throw new Error(`Expected exactly one ARCHIVED ${toYear} cycle for ${fieldId}; found ${archivedToCycles.length}.`);
  }

  const field = publicDocument(fieldSnapshot);
  const fromCycle = activeFromCycles[0];
  const toCycle = archivedToCycles[0];
  if (field.currentCycleId !== fromCycle.id || field.cropYear !== fromYear) {
    throw new Error(`Field ${fieldId} is not currently linked to the ACTIVE ${fromYear} cycle.`);
  }
  if (Number(fromCycle.sequenceNumber) !== Number(toCycle.sequenceNumber) + 1) {
    throw new Error('The target cycle is not the direct predecessor of the current cycle.');
  }

  const operations = operationSnapshots.docs.map(publicDocument);
  const fromOperations = operations.filter(operation => operation.cycleId === fromCycle.id);
  const restorableOperations = operations.filter(operation => (
    operation.cycleId === toCycle.id
    && operation.status === 'ARCHIVED'
    && operation.archivedReason === 'CYCLE_COMPLETED'
  ));
  const incompatibleTargetOperations = operations.filter(operation => (
    operation.cycleId === toCycle.id
    && !restorableOperations.some(restorable => restorable.id === operation.id)
  ));
  if (incompatibleTargetOperations.length) {
    throw new Error(`The ${toYear} cycle contains operation records that cannot be safely restored.`);
  }

  return {
    field,
    fromCycle,
    toCycle,
    fromOperations,
    restorableOperations
  };
}

async function executeReset(database, plan, timestamp) {
  const snapshotId = `crop-year-reset-${plan.field.id}-${timestamp.replace(/[^0-9]/g, '')}`;
  const fieldRef = database.collection(COLLECTIONS.FIELDS).doc(plan.field.id);
  const fromCycleRef = database.collection(COLLECTIONS.CROP_CYCLES).doc(plan.fromCycle.id);
  const toCycleRef = database.collection(COLLECTIONS.CROP_CYCLES).doc(plan.toCycle.id);
  const fromOperationRefs = plan.fromOperations.map(operation => (
    database.collection(COLLECTIONS.OPERATION_LOGS).doc(operation.id)
  ));
  const restorableOperationRefs = plan.restorableOperations.map(operation => (
    database.collection(COLLECTIONS.OPERATION_LOGS).doc(operation.id)
  ));

  await database.runTransaction(async transaction => {
    const refs = [fieldRef, fromCycleRef, toCycleRef, ...fromOperationRefs, ...restorableOperationRefs];
    const snapshots = await Promise.all(refs.map(ref => transaction.get(ref)));
    const [liveFieldSnapshot, liveFromCycleSnapshot, liveToCycleSnapshot, ...liveOperationSnapshots] = snapshots;
    const liveField = liveFieldSnapshot.data();
    const liveFromCycle = liveFromCycleSnapshot.data();
    const liveToCycle = liveToCycleSnapshot.data();
    if (!liveFieldSnapshot.exists || !liveFromCycleSnapshot.exists || !liveToCycleSnapshot.exists) {
      throw new Error('A required Field or Crop Year Cycle changed after the reset plan was created.');
    }
    if (
      liveField.currentCycleId !== plan.fromCycle.id
      || liveField.cropYear !== plan.fromCycle.cropYear
      || liveFromCycle.status !== 'ACTIVE'
      || liveToCycle.status !== 'ARCHIVED'
    ) {
      throw new Error('Crop Year state changed after the reset plan was created. Refresh the plan before retrying.');
    }
    if (liveOperationSnapshots.some(snapshot => !snapshot.exists)) {
      throw new Error('An operation record changed after the reset plan was created.');
    }

    transaction.create(database.collection(COLLECTIONS.SYSTEM_METADATA).doc(snapshotId), {
      type: 'CROP_YEAR_RESET_SNAPSHOT',
      fieldId: plan.field.id,
      fromCropYear: plan.fromCycle.cropYear,
      toCropYear: plan.toCycle.cropYear,
      createdAt: timestamp,
      createdBy: RESET_ACTOR,
      before: {
        field: plan.field,
        fromCycle: plan.fromCycle,
        toCycle: plan.toCycle,
        fromOperations: plan.fromOperations,
        restorableOperations: plan.restorableOperations
      }
    });

    transaction.update(fromCycleRef, {
      status: 'ARCHIVED',
      archivedAt: timestamp,
      archivedByUserId: RESET_ACTOR,
      archivedReason: 'CROP_YEAR_RESET',
      updatedAt: timestamp
    });
    plan.fromOperations.forEach(operation => {
      transaction.update(database.collection(COLLECTIONS.OPERATION_LOGS).doc(operation.id), {
        status: 'ARCHIVED',
        archivedAt: timestamp,
        archivedByUserId: RESET_ACTOR,
        archivedReason: 'CROP_YEAR_RESET',
        updatedAt: timestamp
      });
    });

    transaction.update(toCycleRef, {
      status: 'ACTIVE',
      archivedAt: null,
      archivedByUserId: null,
      updatedAt: timestamp
    });
    plan.restorableOperations.forEach(operation => {
      transaction.update(database.collection(COLLECTIONS.OPERATION_LOGS).doc(operation.id), {
        status: 'ACTIVE',
        archivedAt: null,
        archivedByUserId: null,
        archivedReason: null,
        updatedAt: timestamp
      });
    });
    transaction.update(fieldRef, {
      currentCycleId: plan.toCycle.id,
      cropYear: plan.toCycle.cropYear,
      updatedAt: timestamp
    });
    queueAuditEvent(transaction, database, {
      eventType: 'CROP_YEAR_RESET',
      actorUserId: RESET_ACTOR,
      entityType: 'FIELD',
      entityId: plan.field.id,
      blockFarmId: plan.field.blockFarmId,
      details: `Restored ${plan.toCycle.id} (${plan.toCycle.cropYear}) as the current cycle and archived ${plan.fromCycle.id} (${plan.fromCycle.cropYear}).`,
      createdAt: timestamp
    });
  });

  return { snapshotId };
}

async function main() {
  if (!db) throw new Error('Firestore Admin is unavailable.');
  const projectId = String(admin.app().options.projectId || '').trim();
  const expectedProjectId = argument('expected-project');
  if (!expectedProjectId || expectedProjectId !== projectId) {
    throw new Error(`Firebase project mismatch: expected ${expectedProjectId || '(required)'}, received ${projectId || '(unknown)'}.`);
  }

  const fieldId = argument('field').toUpperCase();
  if (!fieldId) throw new Error('--field is required.');
  const fromYear = canonicalCropYear(argument('from'), '--from');
  const toYear = canonicalCropYear(argument('to'), '--to');
  if (Number(toYear.slice(0, 4)) + 1 !== Number(fromYear.slice(0, 4))) {
    throw new Error('--to must be the annual range immediately before --from.');
  }

  const plan = await buildResetPlan(db, { fieldId, fromYear, toYear });
  console.log(`[HUGPONG CROP YEAR RESET] Project: ${projectId}`);
  console.log(`[HUGPONG CROP YEAR RESET] Field: ${fieldId}`);
  console.log(`[HUGPONG CROP YEAR RESET] Restore ${plan.toCycle.id} (${toYear}) with ${plan.restorableOperations.length} operation(s).`);
  console.log(`[HUGPONG CROP YEAR RESET] Archive ${plan.fromCycle.id} (${fromYear}) with ${plan.fromOperations.length} operation(s).`);

  if (!process.argv.includes('--execute')) {
    console.log('[HUGPONG CROP YEAR RESET] Dry run only. Add --execute to apply this exact plan atomically.');
    return;
  }

  const result = await executeReset(db, plan, nowIso());
  console.log(`[HUGPONG CROP YEAR RESET] Completed. Recovery snapshot: ${result.snapshotId}`);
}

if (require.main === module) {
  main().catch(error => {
    console.error(`[HUGPONG CROP YEAR RESET] ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { buildResetPlan, executeReset };
