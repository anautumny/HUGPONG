'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  rolloverFieldCycle,
  createOperationRecord,
  amendOperationRecord,
  updateCycleStage,
  archiveFieldWithOperations,
  createInitialFieldCycle
} = require('../services/cropCycleOperations');
const { COLLECTIONS } = require('../schema/firestoreSchema');

const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));

class MemoryDocumentReference {
  constructor(database, collectionName, id) {
    this.database = database;
    this.collectionName = collectionName;
    this.id = id;
    this.path = `${collectionName}/${id}`;
  }
}

class MemoryQuery {
  constructor(database, collectionName, filters = []) {
    this.database = database;
    this.collectionName = collectionName;
    this.filters = filters;
  }

  where(field, operator, value) {
    assert.equal(operator, '==');
    return new MemoryQuery(this.database, this.collectionName, [...this.filters, { field, value }]);
  }
}

class MemoryCollectionReference extends MemoryQuery {
  doc(id) {
    return new MemoryDocumentReference(this.database, this.collectionName, id);
  }
}

class MemorySnapshot {
  constructor(ref, value) {
    this.ref = ref;
    this.id = ref.id;
    this.exists = value !== undefined;
    this.value = clone(value);
  }

  data() {
    return clone(this.value);
  }
}

class MemoryFirestore {
  constructor(seed) {
    this.collections = new Map();
    for (const [collectionName, records] of Object.entries(seed)) {
      this.collections.set(collectionName, new Map(Object.entries(clone(records))));
    }
  }

  collection(name) {
    return new MemoryCollectionReference(this, name);
  }

  read(ref) {
    return this.collections.get(ref.collectionName)?.get(ref.id);
  }

  query(query) {
    const records = this.collections.get(query.collectionName) || new Map();
    return [...records.entries()]
      .filter(([, value]) => query.filters.every(filter => value[filter.field] === filter.value))
      .map(([id, value]) => new MemorySnapshot(new MemoryDocumentReference(this, query.collectionName, id), value));
  }

  async runTransaction(handler) {
    const writes = [];
    const transaction = {
      get: async target => {
        if (target instanceof MemoryDocumentReference) return new MemorySnapshot(target, this.read(target));
        const docs = this.query(target);
        return { docs, size: docs.length, empty: docs.length === 0 };
      },
      update: (ref, update) => writes.push({ type: 'update', ref, value: clone(update) }),
      create: (ref, value) => writes.push({ type: 'create', ref, value: clone(value) }),
      set: (ref, value) => writes.push({ type: 'set', ref, value: clone(value) })
    };
    const result = await handler(transaction);
    for (const write of writes) {
      if (!this.collections.has(write.ref.collectionName)) this.collections.set(write.ref.collectionName, new Map());
      const records = this.collections.get(write.ref.collectionName);
      if (write.type === 'create' && records.has(write.ref.id)) throw new Error('already exists');
      if (write.type === 'update' && !records.has(write.ref.id)) throw new Error('not found');
      if (write.type === 'update') records.set(write.ref.id, { ...records.get(write.ref.id), ...write.value });
      else records.set(write.ref.id, write.value);
    }
    return result;
  }

  get(collectionName, id) {
    return clone(this.collections.get(collectionName)?.get(id));
  }

  ids(collectionName) {
    return [...(this.collections.get(collectionName)?.keys() || [])];
  }

  dump() {
    return Object.fromEntries([...this.collections.entries()].map(([collectionName, records]) => [
      collectionName,
      Object.fromEntries([...records.entries()].map(([id, value]) => [id, clone(value)]))
    ]));
  }
}

const FIELD_ID = 'FLD-TEST-001';
const OLD_CYCLE_ID = 'CYC-FLD-TEST-001-001';
const NEW_CYCLE_ID = 'CYC-FLD-TEST-001-002';
const USER = { employeeId: '04000001', role: 'MEMBER_FARMER' };
const NOW = '2026-09-17T08:00:00.000Z';

function operation(overrides = {}) {
  return {
    fieldId: FIELD_ID,
    cycleId: OLD_CYCLE_ID,
    submittedByUserId: USER.employeeId,
    submissionSource: 'MEMBER',
    operationDefinitionId: 'OP-LAND-PREP',
    operationName: 'Land Preparation',
    category: 'LAND_PREPARATION',
    stageNumber: 1,
    performedOn: '2026-09-16',
    areaHa: 1,
    peopleCount: 2,
    quantity: null,
    totalCost: 100,
    lineItems: [],
    isSupplemental: false,
    amendments: [],
    status: 'ACTIVE',
    createdAt: '2026-09-16T08:00:00.000Z',
    updatedAt: '2026-09-16T08:00:00.000Z',
    archivedAt: null,
    archivedByUserId: null,
    ...overrides
  };
}

function database() {
  return new MemoryFirestore({
    [COLLECTIONS.FIELDS]: {
      [FIELD_ID]: {
        blockFarmId: 'BLK-TEST-001',
        memberUserId: USER.employeeId,
        currentCycleId: OLD_CYCLE_ID,
        status: 'ACTIVE',
        updatedAt: '2026-09-16T08:00:00.000Z'
      }
    },
    [COLLECTIONS.BLOCK_FARMS]: {
      'BLK-TEST-001': { managerUserId: '03000001', status: 'ACTIVE' }
    },
    [COLLECTIONS.CROP_CYCLES]: {
      [OLD_CYCLE_ID]: {
        fieldId: FIELD_ID,
        sequenceNumber: 1,
        cropType: 'Plant Cane (New Plant)',
        cropYear: 'CY 2025-2026',
        currentStageNumber: 6,
        elapsedMonths: 12,
        batchNumber: 1,
        status: 'ACTIVE',
        startedAt: '2025-09-17T08:00:00.000Z',
        updatedAt: '2026-09-16T08:00:00.000Z',
        archivedAt: null,
        archivedByUserId: null
      }
    },
    [COLLECTIONS.OPERATION_LOGS]: {
      'LOG-A': operation(),
      'LOG-B': operation({ operationDefinitionId: 'OP-WEED', operationName: 'Weeding' }),
      'LOG-ALREADY-ARCHIVED': operation({
        status: 'ARCHIVED',
        archivedAt: '2026-09-15T08:00:00.000Z',
        archivedByUserId: USER.employeeId
      })
    }
  });
}

const rolloverInput = {
  previousCycleId: OLD_CYCLE_ID,
  cropType: 'Ratoon',
  cropYear: 'CY 2026-2027',
  elapsedMonths: 9,
  batchNumber: 2
};

test('crop-cycle renewal atomically archives ACTIVE operations and starts a reset cycle', async () => {
  const db = database();
  const result = await rolloverFieldCycle(db, FIELD_ID, rolloverInput, USER, NOW);

  assert.equal(result.replayed, false);
  assert.equal(result.newCycleId, NEW_CYCLE_ID);
  assert.deepEqual(result.archivedOperationLogIds.sort(), ['LOG-A', 'LOG-B']);
  assert.equal(db.get(COLLECTIONS.FIELDS, FIELD_ID).currentCycleId, NEW_CYCLE_ID);
  assert.equal(db.get(COLLECTIONS.CROP_CYCLES, OLD_CYCLE_ID).status, 'ARCHIVED');
  assert.equal(db.get(COLLECTIONS.CROP_CYCLES, NEW_CYCLE_ID).currentStageNumber, 1);
  assert.equal(db.get(COLLECTIONS.CROP_CYCLES, NEW_CYCLE_ID).elapsedMonths, 0);
  assert.equal(db.get(COLLECTIONS.CROP_CYCLES, NEW_CYCLE_ID).cropYear, '2026-2027');
  assert.equal(db.get(COLLECTIONS.OPERATION_LOGS, 'LOG-A').status, 'ARCHIVED');
  assert.equal(db.get(COLLECTIONS.OPERATION_LOGS, 'LOG-A').cycleId, OLD_CYCLE_ID);
  assert.equal(db.get(COLLECTIONS.OPERATION_LOGS, 'LOG-B').cycleId, OLD_CYCLE_ID);
  assert.equal(db.get(COLLECTIONS.OPERATION_LOGS, 'LOG-ALREADY-ARCHIVED').archivedAt, '2026-09-15T08:00:00.000Z');
  assert.equal(db.ids(COLLECTIONS.OPERATION_LOGS).length, 3, 'submitted operation records are retained');
});

test('reload reads the persisted archived lifecycle and original cycle identities', async () => {
  const db = database();
  await rolloverFieldCycle(db, FIELD_ID, rolloverInput, USER, NOW);
  const reloaded = new MemoryFirestore(db.dump());

  assert.equal(reloaded.get(COLLECTIONS.FIELDS, FIELD_ID).currentCycleId, NEW_CYCLE_ID);
  assert.equal(reloaded.get(COLLECTIONS.CROP_CYCLES, OLD_CYCLE_ID).status, 'ARCHIVED');
  assert.equal(reloaded.get(COLLECTIONS.CROP_CYCLES, NEW_CYCLE_ID).status, 'ACTIVE');
  for (const logId of ['LOG-A', 'LOG-B', 'LOG-ALREADY-ARCHIVED']) {
    assert.equal(reloaded.get(COLLECTIONS.OPERATION_LOGS, logId).status, 'ARCHIVED');
    assert.equal(reloaded.get(COLLECTIONS.OPERATION_LOGS, logId).cycleId, OLD_CYCLE_ID);
  }
});

test('device B cannot amend or reactivate an operation after device A renews the cycle', async () => {
  const db = database();
  await rolloverFieldCycle(db, FIELD_ID, rolloverInput, USER, NOW);

  await assert.rejects(
    amendOperationRecord(db, 'LOG-A', { status: 'ACTIVE', totalCost: 150 }, {
      amendmentId: 'AMD-STALE-DEVICE',
      reason: 'Stale device correction',
      changes: { totalCost: { before: 100, after: 150 } }
    }, USER, '2026-09-17T08:01:00.000Z'),
    error => error.status === 409 && /ARCHIVED/.test(error.message)
  );
  const record = db.get(COLLECTIONS.OPERATION_LOGS, 'LOG-A');
  assert.equal(record.status, 'ARCHIVED');
  assert.equal(record.cycleId, OLD_CYCLE_ID);
  assert.equal(record.totalCost, 100);
});

test('device B receives a version conflict after device A changes the same active operation', async () => {
  const db = database();
  const baseVersion = db.get(COLLECTIONS.OPERATION_LOGS, 'LOG-A').updatedAt;
  await amendOperationRecord(db, 'LOG-A', { totalCost: 125 }, {
    amendmentId: 'AMD-DEVICE-A',
    reason: 'Device A correction',
    changes: { totalCost: { before: 100, after: 125 } }
  }, USER, '2026-09-17T08:00:30.000Z', {
    mutationId: 'MUT-DEVICE-A',
    idempotencyKey: 'MUT-DEVICE-A',
    entityKey: 'operation_logs/LOG-A',
    baseVersion
  });

  await assert.rejects(
    amendOperationRecord(db, 'LOG-A', { totalCost: 150 }, {
      amendmentId: 'AMD-DEVICE-B',
      reason: 'Device B stale correction',
      changes: { totalCost: { before: 100, after: 150 } }
    }, USER, '2026-09-17T08:01:00.000Z', {
      mutationId: 'MUT-DEVICE-B',
      idempotencyKey: 'MUT-DEVICE-B',
      entityKey: 'operation_logs/LOG-A',
      baseVersion
    }),
    error => error.status === 409 && /newer server version/.test(error.message)
  );
  assert.equal(db.get(COLLECTIONS.OPERATION_LOGS, 'LOG-A').totalCost, 125);
});

test('operation amendments preserve legacy photo evidence and cannot replace it', async () => {
  const db = database();
  const existing = db.collections.get(COLLECTIONS.OPERATION_LOGS).get('LOG-A');
  existing.photoEvidence = {
    dataUrl: `data:image/jpeg;base64,${Buffer.from('historical photo').toString('base64')}`,
    mimeType: 'image/jpeg',
    fileName: 'historical.jpg',
    byteSize: 16,
    capturedAt: '2026-09-01T00:00:00.000Z'
  };

  await amendOperationRecord(db, 'LOG-A', {
    totalCost: 125,
    photoEvidence: {
      dataUrl: `data:image/jpeg;base64,${Buffer.from('replacement photo').toString('base64')}`,
      mimeType: 'image/jpeg',
      fileName: 'replacement.jpg',
      byteSize: 17,
      capturedAt: NOW
    }
  }, {
    amendmentId: 'AMD-NO-PHOTO-REPLACEMENT',
    reason: 'Correct the operation cost',
    changes: { totalCost: { before: 100, after: 125 } }
  }, USER, '2026-09-17T08:00:30.000Z');

  const amended = db.get(COLLECTIONS.OPERATION_LOGS, 'LOG-A');
  assert.equal(amended.totalCost, 125);
  assert.equal(amended.photoEvidence.fileName, 'historical.jpg');
});

test('device B cannot submit a new ACTIVE record against the archived cycle', async () => {
  const db = database();
  await rolloverFieldCycle(db, FIELD_ID, rolloverInput, USER, NOW);

  await assert.rejects(
    createOperationRecord(db, { id: 'LOG-STALE-CREATE', ...operation() }, USER, '2026-09-17T08:01:00.000Z'),
    error => error.status === 409
      && /explicit ACTIVE Crop Year Cycle/.test(error.message)
      && error.data?.code === 'CYCLE_CLOSED_CONFLICT'
  );
  assert.equal(db.get(COLLECTIONS.OPERATION_LOGS, 'LOG-STALE-CREATE'), undefined);
});

test('duplicate operation-create retry replays one canonical record', async () => {
  const db = database();
  const input = { id: 'LOG-IDEMPOTENT', ...operation({ operationName: 'Offline retry operation' }) };
  const first = await createOperationRecord(db, input, USER, '2026-09-17T07:58:00.000Z');
  const retry = await createOperationRecord(db, input, USER, '2026-09-17T07:59:00.000Z');

  assert.equal(first.replayed, false);
  assert.equal(retry.replayed, true);
  assert.equal(db.ids(COLLECTIONS.OPERATION_LOGS).filter(id => id === 'LOG-IDEMPOTENT').length, 1);
});

test('a second device replaying the same rollover does not create another cycle', async () => {
  const db = database();
  await rolloverFieldCycle(db, FIELD_ID, rolloverInput, USER, NOW);
  const replay = await rolloverFieldCycle(db, FIELD_ID, rolloverInput, USER, '2026-09-17T08:02:00.000Z');

  assert.equal(replay.replayed, true);
  assert.equal(replay.newCycleId, NEW_CYCLE_ID);
  assert.deepEqual(replay.archivedOperationLogIds.sort(), ['LOG-A', 'LOG-ALREADY-ARCHIVED', 'LOG-B']);
  assert.deepEqual(db.ids(COLLECTIONS.CROP_CYCLES).sort(), [OLD_CYCLE_ID, NEW_CYCLE_ID].sort());
});

test('stale stage updates cannot modify an archived cycle', async () => {
  const db = database();
  await rolloverFieldCycle(db, FIELD_ID, rolloverInput, USER, NOW);

  await assert.rejects(
    updateCycleStage(db, OLD_CYCLE_ID, { currentStageNumber: 2, elapsedMonths: 1 }, USER, '2026-09-17T08:03:00.000Z'),
    error => error.status === 409 && /ARCHIVED/.test(error.message)
  );
  assert.equal(db.get(COLLECTIONS.CROP_CYCLES, OLD_CYCLE_ID).currentStageNumber, 6);
});

test('concurrent rollover attempts converge on one canonical active cycle', async () => {
  const db = database();
  const attempts = await Promise.allSettled([
    rolloverFieldCycle(db, FIELD_ID, rolloverInput, USER, NOW),
    rolloverFieldCycle(db, FIELD_ID, rolloverInput, USER, NOW)
  ]);
  const successfulIds = attempts
    .filter(attempt => attempt.status === 'fulfilled')
    .map(attempt => attempt.value.newCycleId);
  assert.ok(successfulIds.length >= 1);
  assert.equal(new Set(successfulIds).size, 1);
  const activeCycles = db.ids(COLLECTIONS.CROP_CYCLES)
    .filter(id => db.get(COLLECTIONS.CROP_CYCLES, id).status === 'ACTIVE');
  assert.deepEqual(activeCycles, [NEW_CYCLE_ID]);
});

test('new operations receive server-derived lifecycle snapshots and discard client photo evidence', async () => {
  const db = database();
  const result = await createOperationRecord(db, {
    id: 'LOG-SNAPSHOT',
    ...operation(),
    photoEvidence: {
      dataUrl: `data:image/jpeg;base64,${Buffer.from('legacy client photo').toString('base64')}`,
      mimeType: 'image/jpeg',
      fileName: 'legacy-client.jpg',
      byteSize: 19,
      capturedAt: NOW
    }
  }, USER, NOW);

  assert.equal(result.record.cycleId, OLD_CYCLE_ID);
  assert.equal(result.record.blockFarmId, 'BLK-TEST-001');
  assert.equal(result.record.cropYearCycle, '2025-2026');
  assert.equal(result.record.stageNumberAtRecord, 6);
  assert.equal(result.record.photoEvidence, null);
});

test('operations before and after rollover remain linked to their original Crop Year Cycles', async () => {
  const db = database();
  await rolloverFieldCycle(db, FIELD_ID, rolloverInput, USER, NOW);
  const created = await createOperationRecord(db, {
    id: 'LOG-NEW-CYCLE',
    ...operation({ cycleId: NEW_CYCLE_ID, stageNumber: 1, performedOn: '2026-09-18' })
  }, USER, '2026-09-18T08:00:00.000Z');

  assert.equal(db.get(COLLECTIONS.OPERATION_LOGS, 'LOG-A').cycleId, OLD_CYCLE_ID);
  assert.equal(created.record.cycleId, NEW_CYCLE_ID);
  assert.equal(created.record.cropYearCycle, '2026-2027');
  assert.equal(created.record.stageNumberAtRecord, 1);
});

test('field with no active cycle can transactionally create one using the server year', async () => {
  const db = database();
  const field = db.collections.get(COLLECTIONS.FIELDS).get(FIELD_ID);
  delete field.currentCycleId;
  db.collections.get(COLLECTIONS.CROP_CYCLES).clear();

  const result = await createInitialFieldCycle(db, FIELD_ID, {}, USER, '2026-03-01T00:00:00.000Z');
  assert.equal(result.cycle.cropYear, '2026-2027');
  assert.equal(result.cycle.currentStageNumber, 1);
  assert.equal(result.cycle.status, 'ACTIVE');
  assert.equal(db.get(COLLECTIONS.FIELDS, FIELD_ID).currentCycleId, result.cycleId);
});

test('field with an active cycle cannot create a second initial cycle', async () => {
  await assert.rejects(
    createInitialFieldCycle(database(), FIELD_ID, {}, USER, NOW),
    error => error.status === 409 && /already has an active Crop Year Cycle pointer/.test(error.message)
  );
});

test('duplicate annual Crop Year Cycle for the same field is rejected', async () => {
  const db = database();
  db.collections.get(COLLECTIONS.CROP_CYCLES).set('CYC-FLD-TEST-001-099', {
    fieldId: FIELD_ID,
    sequenceNumber: 99,
    cropYear: '2026-2027',
    status: 'ARCHIVED'
  });
  await assert.rejects(
    rolloverFieldCycle(db, FIELD_ID, rolloverInput, USER, NOW),
    error => error.status === 409 && error.data?.code === 'DUPLICATE_CROP_YEAR_CYCLE'
  );
});

test('new Crop Year Cycle uses the injected server year instead of a client-supplied year', async () => {
  const db = database();
  const result = await rolloverFieldCycle(
    db,
    FIELD_ID,
    { ...rolloverInput, cropYear: '2030-2031' },
    USER,
    '2027-04-10T00:00:00.000Z'
  );

  assert.equal(result.newCycle.cropYear, '2027-2028');
  assert.equal(db.get(COLLECTIONS.FIELDS, FIELD_ID).cropYear, '2027-2028');
});

test('Farm Member may advance only the canonical cycle for their own field without takeover', async () => {
  const db = database();
  db.collections.get(COLLECTIONS.CROP_CYCLES).get(OLD_CYCLE_ID).currentStageNumber = 1;

  const result = await updateCycleStage(
    db,
    OLD_CYCLE_ID,
    { currentStageNumber: 2, elapsedMonths: 1 },
    USER,
    '2026-09-17T08:03:00.000Z'
  );

  assert.equal(result.currentStageNumber, 2);
  assert.equal(db.get(COLLECTIONS.CROP_CYCLES, OLD_CYCLE_ID).currentStageNumber, 2);
  assert.equal(USER.takeoverGrant, undefined);
});

test('calendar-year change and stage advancement do not rewrite an active stored Crop Year Cycle', async () => {
  const db = database();
  db.collections.get(COLLECTIONS.CROP_CYCLES).get(OLD_CYCLE_ID).currentStageNumber = 1;
  const before = db.get(COLLECTIONS.CROP_CYCLES, OLD_CYCLE_ID).cropYear;

  await updateCycleStage(
    db,
    OLD_CYCLE_ID,
    { currentStageNumber: 2, elapsedMonths: 1 },
    USER,
    '2027-01-01T00:00:00.000Z'
  );

  assert.equal(db.get(COLLECTIONS.CROP_CYCLES, OLD_CYCLE_ID).cropYear, before);
  assert.equal(db.get(COLLECTIONS.CROP_CYCLES, OLD_CYCLE_ID).currentStageNumber, 2);
});

test('Farm Member cannot advance another member field in another block farm', async () => {
  const db = database();
  db.collections.get(COLLECTIONS.FIELDS).set('FLD-OTHER-001', {
    blockFarmId: 'BLK-OTHER-001',
    memberUserId: '04000002',
    currentCycleId: 'CYC-FLD-OTHER-001-001',
    status: 'ACTIVE',
    updatedAt: '2026-09-16T08:00:00.000Z'
  });
  db.collections.get(COLLECTIONS.BLOCK_FARMS).set('BLK-OTHER-001', {
    managerUserId: '03000002', status: 'ACTIVE'
  });
  db.collections.get(COLLECTIONS.CROP_CYCLES).set('CYC-FLD-OTHER-001-001', {
    fieldId: 'FLD-OTHER-001',
    sequenceNumber: 1,
    cropType: 'Plant Cane (New Plant)',
    cropYear: '2025-2026',
    currentStageNumber: 1,
    elapsedMonths: 0,
    batchNumber: 1,
    status: 'ACTIVE',
    startedAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-09-16T08:00:00.000Z',
    archivedAt: null,
    archivedByUserId: null
  });

  await assert.rejects(
    updateCycleStage(
      db,
      'CYC-FLD-OTHER-001-001',
      { currentStageNumber: 2, elapsedMonths: 1 },
      USER,
      '2026-09-17T08:03:00.000Z'
    ),
    error => error.status === 403 && /assigned field/.test(error.message)
  );
  assert.equal(db.get(COLLECTIONS.CROP_CYCLES, 'CYC-FLD-OTHER-001-001').currentStageNumber, 1);
});

test('an archived operation ID cannot be recreated as ACTIVE', async () => {
  const db = database();
  await rolloverFieldCycle(db, FIELD_ID, rolloverInput, USER, NOW);

  await assert.rejects(
    createOperationRecord(db, { id: 'LOG-A', ...operation() }, USER, '2026-09-17T08:04:00.000Z'),
    error => error.status === 409 && /reactivated/.test(error.message)
  );
  assert.equal(db.get(COLLECTIONS.OPERATION_LOGS, 'LOG-A').status, 'ARCHIVED');
});

test('submitted operation API exposes archive transitions but no delete or purge endpoint', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'routes', 'logs.js'), 'utf8');
  assert.doesNotMatch(source, /router\.delete\s*\(/);
  assert.doesNotMatch(source, /purge-past/i);
  assert.match(source, /router\.post\('\/archive'/);
});

test('field archival is atomic with cycle and submitted-operation archival', async () => {
  const db = database();
  const result = await archiveFieldWithOperations(
    db,
    FIELD_ID,
    { employeeId: '03000001', role: 'FARM_MANAGER' },
    NOW
  );

  assert.equal(result.archivedLogCount, 2);
  assert.equal(db.get(COLLECTIONS.FIELDS, FIELD_ID).status, 'ARCHIVED');
  assert.equal(db.get(COLLECTIONS.CROP_CYCLES, OLD_CYCLE_ID).status, 'ARCHIVED');
  assert.equal(db.get(COLLECTIONS.OPERATION_LOGS, 'LOG-A').status, 'ARCHIVED');
  assert.equal(db.get(COLLECTIONS.OPERATION_LOGS, 'LOG-A').cycleId, OLD_CYCLE_ID);
  assert.equal(db.ids(COLLECTIONS.OPERATION_LOGS).length, 3);

  await assert.rejects(
    createOperationRecord(db, { id: 'LOG-AFTER-FIELD-ARCHIVE', ...operation() }, USER, '2026-09-17T08:05:00.000Z'),
    error => error.status === 409 && /ACTIVE field/.test(error.message)
  );
  assert.equal(db.get(COLLECTIONS.OPERATION_LOGS, 'LOG-AFTER-FIELD-ARCHIVE'), undefined);
});

test('web and mobile cache reconciliation defer to canonical server lifecycle state', () => {
  const webSource = fs.readFileSync(path.join(__dirname, '..', '..', 'web', 'react-app', 'src', 'services', 'operationReadService.js'), 'utf8');
  const mobileSource = fs.readFileSync(path.join(__dirname, '..', '..', 'mobile', 'src', 'data', 'dataStore.js'), 'utf8');

  assert.match(webSource, /subscribeToAuthenticatedResource\(`\/api\/logs\$\{statusQuery\}`/);
  assert.match(webSource, /fromOperation\(item\.id, item\)/);
  assert.doesNotMatch(webSource, /onSnapshot|collection\(db/);
  assert.doesNotMatch(webSource, /refreshWebLifecycleStateFromApi/);
  assert.doesNotMatch(webSource, /canonicalLocalOnly|localOnly|pendingCreateOverlays/);
  assert.match(mobileSource, /pendingCreateOverlays/);
  assert.doesNotMatch(mobileSource, /const localOnly/);
  assert.match(mobileSource, /authenticatedRequest\('\/api\/crop-cycles'\)/);
  assert.match(mobileSource, /authenticatedRequest\('\/api\/fields'\)/);
  assert.match(mobileSource, /authenticatedRequest\('\/api\/logs'\)/);
  assert.doesNotMatch(mobileSource, /onSnapshot|collection\(db/);
});
