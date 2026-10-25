'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

class MemoryRef {
  constructor(database, collection, id) {
    this.database = database;
    this.collection = collection;
    this.id = id;
  }

  async get() {
    const value = this.database.records.get(this.collection)?.get(this.id);
    return {
      exists: value !== undefined,
      id: this.id,
      data: () => value && { ...value },
      ref: this,
      updateTime: value === undefined ? null : `version-${this.database.versionOf(this.collection, this.id)}`
    };
  }
}

class MemoryQuery {
  constructor(database, collection, filters = []) {
    this.database = database;
    this.collection = collection;
    this.filters = filters;
  }

  doc(id) {
    return new MemoryRef(this.database, this.collection, id);
  }

  where(field, operator, value) {
    assert.equal(operator, '==');
    return new MemoryQuery(this.database, this.collection, [...this.filters, { field, value }]);
  }

  limit() {
    return this;
  }

  async get() {
    const rows = [...(this.database.records.get(this.collection) || new Map()).entries()]
      .filter(([, value]) => this.filters.every(filter => value[filter.field] === filter.value));
    return {
      empty: rows.length === 0,
      docs: rows.map(([id, value]) => ({
        id,
        exists: true,
        ref: new MemoryRef(this.database, this.collection, id),
        data: () => ({ ...value }),
        updateTime: `version-${this.database.versionOf(this.collection, id)}`
      }))
    };
  }
}

class MemoryDb {
  constructor(seed = {}) {
    this.records = new Map(Object.entries(seed).map(([collection, records]) => [collection, new Map(Object.entries(records))]));
    this.versions = new Map();
  }

  versionOf(collection, id) {
    return this.versions.get(`${collection}/${id}`) || 1;
  }

  collection(name) {
    return new MemoryQuery(this, name);
  }

  batch() {
    const operations = [];
    return {
      create: (ref, value) => operations.push({ type: 'create', ref, value }),
      update: (ref, value, precondition) => operations.push({ type: 'update', ref, value, precondition }),
      set: (ref, value) => operations.push({ type: 'set', ref, value }),
      commit: async () => {
        for (const operation of operations) {
          const records = this.records.get(operation.ref.collection) || new Map();
          const existing = records.get(operation.ref.id);
          if (operation.type === 'create' && existing !== undefined) throw new Error('already exists');
          if (operation.type === 'update' && existing === undefined) throw new Error('not found');
          const expectedVersion = operation.precondition?.lastUpdateTime;
          if (expectedVersion && expectedVersion !== `version-${this.versionOf(operation.ref.collection, operation.ref.id)}`) {
            const error = new Error('failed precondition');
            error.code = 9;
            throw error;
          }
        }
        for (const operation of operations) {
          if (!this.records.has(operation.ref.collection)) this.records.set(operation.ref.collection, new Map());
          const records = this.records.get(operation.ref.collection);
          const current = records.get(operation.ref.id) || {};
          records.set(operation.ref.id, operation.type === 'update'
            ? { ...current, ...operation.value }
            : { ...operation.value });
          const key = `${operation.ref.collection}/${operation.ref.id}`;
          this.versions.set(key, this.versionOf(operation.ref.collection, operation.ref.id) + 1);
        }
      }
    };
  }

  async runTransaction(callback) {
    const writer = this.batch();
    const transaction = {
      get: source => source.get(),
      create: writer.create,
      update: writer.update,
      set: writer.set,
      delete: ref => writer.update(ref, {})
    };
    const result = await callback(transaction);
    await writer.commit();
    return result;
  }
}

function responseCapture() {
  return {
    statusCode: 200,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; }
  };
}

function loadApproveHandler(database) {
  const firebasePath = require.resolve('../firebase-admin');
  const routePath = require.resolve('../routes/users');
  const previousFirebase = require.cache[firebasePath];
  delete require.cache[routePath];
  require.cache[firebasePath] = {
    id: firebasePath,
    filename: firebasePath,
    loaded: true,
    exports: { admin: {}, db: database }
  };
  const router = require('../routes/users');
  if (previousFirebase) require.cache[firebasePath] = previousFirebase;
  else delete require.cache[firebasePath];
  return router.stack.find(layer => layer.route?.path === '/approve' && layer.route.methods.post).route.stack.at(-1).handle;
}

function approvalRecheckFixture() {
  const database = new MemoryDb({
    users: { '04000077': {
      displayName: 'Pending Member', role: 'MEMBER_FARMER', status: 'PENDING',
      requestedBlockFarmId: 'BF-001', affiliatedBlockFarmId: 'BF-001',
      phoneVerifiedAt: '2026-10-24T00:00:00.000Z', updatedAt: 'v1'
    } },
    block_farms: { 'BF-001': { status: 'ACTIVE', managerUserId: '03000001' } }
  });
  const request = {
    body: { id: '04000077', role: 'MEMBER_FARMER', blockFarmId: 'BF-001', _mutation: {
      mutationId: 'MUT-APPROVAL-RECHECK', idempotencyKey: 'MUT-APPROVAL-RECHECK', entityKey: 'users/04000077', baseVersion: 'v1'
    } },
    session: { user: { employeeId: '03000001', role: 'FARM_MANAGER' } }, get: () => ''
  };
  return { database, request };
}

test('pending approval cannot reactivate an account disabled just before its atomic commit', async () => {
  const { database, request } = approvalRecheckFixture();
  const originalBatch = database.batch.bind(database);
  let injected = false;
  database.batch = () => {
    const writer = originalBatch(), commit = writer.commit;
    writer.commit = async () => {
      if (!injected) {
        injected = true;
        const member = database.records.get('users').get('04000077');
        database.records.get('users').set('04000077', { ...member, status: 'DISABLED', updatedAt: 'v2' });
        database.versions.set('users/04000077', 2);
      }
      return commit();
    };
    return writer;
  };
  const response = responseCapture();
  await loadApproveHandler(database)(request, response);
  assert.equal(response.statusCode, 409);
  assert.equal(database.records.get('users').get('04000077').status, 'DISABLED');
  assert.equal(database.records.has('audit_logs'), false);
});

test('approval checks its expected user version inside the transaction', async () => {
  const { database, request } = approvalRecheckFixture();
  const transact = database.runTransaction.bind(database);
  database.runTransaction = async work => {
    database.records.get('users').get('04000077').updatedAt = 'v2';
    return transact(work);
  };
  const response = responseCapture();
  await loadApproveHandler(database)(request, response);
  assert.equal(response.statusCode, 409);
  assert.equal(database.records.get('users').get('04000077').status, 'PENDING');
});

test('approval revalidates manager assignment before committing the account change', async () => {
  const { database, request } = approvalRecheckFixture();
  const transact = database.runTransaction.bind(database);
  database.runTransaction = async work => {
    database.records.get('block_farms').get('BF-001').managerUserId = '03009999';
    return transact(work);
  };
  const response = responseCapture();
  await loadApproveHandler(database)(request, response);
  assert.equal(response.statusCode, 403);
  assert.equal(database.records.get('users').get('04000077').status, 'PENDING');
});

test('approval receipt retries retain idempotency and reject a manager who has lost account scope', async () => {
  const { database, request } = approvalRecheckFixture();
  const member = database.records.get('users').get('04000077');
  Object.assign(member, { status: 'ACTIVE', approvedByUserId: '03000001' });
  const handler = loadApproveHandler(database);
  const allowed = responseCapture();
  await handler(request, allowed);
  assert.equal(allowed.statusCode, 200);
  assert.equal(allowed.payload.replayed, true);
  database.records.get('block_farms').get('BF-001').managerUserId = '03009999';
  const denied = responseCapture();
  await handler(request, denied);
  assert.equal(denied.statusCode, 403);
  assert.equal(denied.payload.data, undefined);
});

test('phone-verification receipts check current farm scope and target-role authority', async () => {
  const { database, request } = approvalRecheckFixture();
  request.params = { userId: '04000077' };
  const handler = loadVerifyPhoneHandler(database);
  const allowed = responseCapture();
  await handler(request, allowed);
  assert.equal(allowed.statusCode, 200);
  assert.equal(allowed.payload.replayed, true);
  database.records.get('block_farms').get('BF-001').managerUserId = '03009999';
  const reassigned = responseCapture();
  await handler(request, reassigned);
  assert.equal(reassigned.statusCode, 403);
  assert.equal(reassigned.payload.data, undefined);
  database.records.get('users').get('04000077').role = 'SRA_ADMIN';
  const wrongRole = responseCapture();
  await handler(request, wrongRole);
  assert.equal(wrongRole.statusCode, 403);
  assert.equal(wrongRole.payload.data, undefined);
});

test('phone verification requires the account version that the reviewer inspected', async () => {
  const { database, request } = approvalRecheckFixture();
  Object.assign(database.records.get('users').get('04000077'), { phoneVerifiedAt: null, updatedAt: 'v2' });
  request.params = { userId: '04000077' };
  request.body.verificationReasonCode = 'ID_AND_SIM_IN_PERSON';
  const handler = loadVerifyPhoneHandler(database);
  const stale = responseCapture();
  await handler(request, stale);
  assert.equal(stale.statusCode, 409);
  assert.equal(database.records.get('users').get('04000077').phoneVerifiedAt, null);
  delete request.body._mutation;
  const absent = responseCapture();
  await handler(request, absent);
  assert.equal(absent.statusCode, 428);
});

test('a phone changed before verification commit is not marked as verified', async () => {
  const { database, request } = approvalRecheckFixture();
  Object.assign(database.records.get('users').get('04000077'), { phoneVerifiedAt: null, phone: '09171234567' });
  request.params = { userId: '04000077' };
  request.body.verificationReasonCode = 'ID_AND_SIM_IN_PERSON';
  const originalBatch = database.batch.bind(database);
  let injected = false;
  database.batch = () => {
    const writer = originalBatch(), commit = writer.commit;
    writer.commit = async () => {
      if (!injected) {
        injected = true;
        Object.assign(database.records.get('users').get('04000077'), { phone: '09179999999', updatedAt: 'v2' });
        database.versions.set('users/04000077', 2);
      }
      return commit();
    };
    return writer;
  };
  const response = responseCapture();
  await loadVerifyPhoneHandler(database)(request, response);
  assert.equal(response.statusCode, 409);
  assert.equal(database.records.get('users').get('04000077').phone, '09179999999');
  assert.equal(database.records.get('users').get('04000077').phoneVerifiedAt, null);
  assert.equal(database.records.has('audit_logs'), false);
});

test('phone verification rechecks the manager assignment inside its transaction', async () => {
  const { database, request } = approvalRecheckFixture();
  database.records.get('users').get('04000077').phoneVerifiedAt = null;
  request.params = { userId: '04000077' };
  request.body.verificationReasonCode = 'ID_AND_SIM_IN_PERSON';
  const transact = database.runTransaction.bind(database);
  database.runTransaction = async work => {
    database.records.get('block_farms').get('BF-001').managerUserId = '03009999';
    return transact(work);
  };
  const response = responseCapture();
  await loadVerifyPhoneHandler(database)(request, response);
  assert.equal(response.statusCode, 403);
  assert.equal(database.records.get('users').get('04000077').phoneVerifiedAt, null);
});

function loadPatchHandler(database) {
  const firebasePath = require.resolve('../firebase-admin');
  const routePath = require.resolve('../routes/users');
  const previousFirebase = require.cache[firebasePath];
  delete require.cache[routePath];
  require.cache[firebasePath] = {
    id: firebasePath,
    filename: firebasePath,
    loaded: true,
    exports: { admin: {}, db: database }
  };
  const router = require('../routes/users');
  if (previousFirebase) require.cache[firebasePath] = previousFirebase;
  else delete require.cache[firebasePath];
  return router.stack.find(layer => layer.route?.path === '/:userId' && layer.route.methods.patch).route.stack.at(-1).handle;
}

function loadVerifyPhoneHandler(database) {
  const firebasePath = require.resolve('../firebase-admin');
  const routePath = require.resolve('../routes/users');
  const previousFirebase = require.cache[firebasePath];
  delete require.cache[routePath];
  require.cache[firebasePath] = {
    id: firebasePath,
    filename: firebasePath,
    loaded: true,
    exports: { admin: {}, db: database }
  };
  const router = require('../routes/users');
  if (previousFirebase) require.cache[firebasePath] = previousFirebase;
  else delete require.cache[firebasePath];
  return router.stack.find(layer => layer.route?.path === '/:userId/verify-phone' && layer.route.methods.post).route.stack.at(-1).handle;
}

function loadBlockFarmPutHandler(database) {
  const firebasePath = require.resolve('../firebase-admin');
  const routePath = require.resolve('../routes/blockFarms');
  const previousFirebase = require.cache[firebasePath];
  delete require.cache[routePath];
  require.cache[firebasePath] = {
    id: firebasePath,
    filename: firebasePath,
    loaded: true,
    exports: { db: database }
  };
  const router = require('../routes/blockFarms');
  if (previousFirebase) require.cache[firebasePath] = previousFirebase;
  else delete require.cache[firebasePath];
  return router.stack.find(layer => layer.route?.path === '/:id' && layer.route.methods.put).route.stack.at(-1).handle;
}

async function provisionManager(database, overrides = {}) {
  const response = responseCapture();
  await loadApproveHandler(database)({
    body: {
      firstName: 'Karl',
      lastName: 'Cuello',
      phone: '09091765170',
      password: 'Temporary9Pass',
      role: 'FARM_MANAGER',
      blockFarmId: 'BF-001',
      ...overrides
    },
    session: { user: { employeeId: '02000001', role: 'SRA_ADMIN' } },
    get: () => ''
  }, response);
  return response;
}

test('provisioning a Farm Manager atomically persists the selected Block Farm relationship', async () => {
  const database = new MemoryDb({
    block_farms: {
      'BF-001': { name: 'North Block Farm', managerUserId: null, status: 'ACTIVE', updatedAt: '2026-09-01T00:00:00.000Z' }
    }
  });

  const response = await provisionManager(database);

  assert.equal(response.statusCode, 201);
  assert.match(response.payload.accountId, /^03\d{6}$/);
  assert.equal(database.records.get('block_farms').get('BF-001').managerUserId, response.payload.accountId);
  assert.ok(database.records.get('users').has(response.payload.accountId));
  assert.equal(response.payload.data.assignment.blockFarmId, 'BF-001');
  assert.equal(response.payload.data.assignment.displayLabel, 'North Block Farm (Manager)');
  const auditTypes = [...database.records.get('audit_logs').values()].map(record => record.eventType);
  assert.ok(auditTypes.includes('USER_ACCOUNT_CREATED'));
  assert.ok(auditTypes.includes('BLOCK_FARM_MANAGER_ASSIGNED'));
});

test('provisioning refuses to replace a Block Farm existing manager', async () => {
  const database = new MemoryDb({
    block_farms: {
      'BF-001': { name: 'North Block Farm', managerUserId: '03000001', status: 'ACTIVE' }
    }
  });

  const response = await provisionManager(database, { phone: '09091765171' });

  assert.equal(response.statusCode, 409);
  assert.match(response.payload.error, /already has a Farm Manager/);
  assert.equal(database.records.get('users'), undefined);
  assert.equal(database.records.get('block_farms').get('BF-001').managerUserId, '03000001');
});

test('assigned Farm Manager or district administrators can verify an unverified pending member', async () => {
  const seed = () => ({
    users: {
      '04000077': {
        firstName: 'Juan', lastName: 'Farmer', displayName: 'Juan Farmer', phone: '09181234567',
        role: 'MEMBER_FARMER', status: 'PENDING', requestedBlockFarmId: 'BF-001',
        phoneVerifiedAt: null, phoneVerificationStatus: 'PENDING_VERIFICATION',
        updatedAt: '2026-09-29T00:00:00.000Z'
      }
    },
    block_farms: {
      'BF-001': { name: 'North Block Farm', managerUserId: '03000001', status: 'ACTIVE' }
    }
  });

  const managerDatabase = new MemoryDb(seed());
  const managerApproved = responseCapture();
  await loadApproveHandler(managerDatabase)({
    body: { id: '04000077', role: 'MEMBER_FARMER', blockFarmId: 'BF-001', verificationReasonCode: 'ID_AND_SIM_IN_PERSON', _mutation: { mutationId: 'MUT-APPROVAL-77', idempotencyKey: 'MUT-APPROVAL-77', entityKey: 'users/04000077', baseVersion: '2026-09-29T00:00:00.000Z' } },
    session: { user: { employeeId: '03000001', role: 'FARM_MANAGER' } },
    get: () => ''
  }, managerApproved);
  assert.equal(managerApproved.statusCode, 200);
  assert.equal(managerDatabase.records.get('users').get('04000077').status, 'ACTIVE');

  const sraDatabase = new MemoryDb(seed());
  const approved = responseCapture();
  await loadApproveHandler(sraDatabase)({
    body: {
      id: '04000077', role: 'MEMBER_FARMER', blockFarmId: 'BF-001',
      verificationReasonCode: 'OFFICIAL_RECORD_MATCH',
      _mutation: { mutationId: 'MUT-SRA-APPROVAL-77', idempotencyKey: 'MUT-SRA-APPROVAL-77', entityKey: 'users/04000077', baseVersion: '2026-09-29T00:00:00.000Z' }
    },
    session: { user: { employeeId: '02000001', role: 'SRA_ADMIN' } },
    get: () => ''
  }, approved);

  assert.equal(approved.statusCode, 200);
  const user = sraDatabase.records.get('users').get('04000077');
  assert.equal(user.status, 'ACTIVE');
  assert.equal(user.phoneVerificationMethod, 'AUTHORIZED_REVIEW');
  assert.equal(user.phoneVerifiedByUserId, '02000001');
  assert.ok(user.phoneVerifiedAt);
  const auditTypes = [...sraDatabase.records.get('audit_logs').values()].map(record => record.eventType);
  assert.ok(auditTypes.includes('USER_PHONE_VERIFIED_BY_AUTHORITY'));
});

test('phone verification can leave a registration pending for explicit acceptance later', async () => {
  const database = new MemoryDb({
    users: {
      '04000088': {
        firstName: 'Ana', lastName: 'Farmer', displayName: 'Ana Farmer', phone: '09181234568',
        role: 'MEMBER_FARMER', status: 'PENDING', requestedBlockFarmId: 'BF-001',
        phoneVerifiedAt: null, phoneVerificationStatus: 'PENDING_VERIFICATION',
        updatedAt: '2026-09-29T00:00:00.000Z'
      }
    },
    block_farms: {
      'BF-001': { name: 'North Block Farm', managerUserId: '03000001', status: 'ACTIVE' }
    }
  });
  const verified = responseCapture();
  await loadVerifyPhoneHandler(database)({
    body: { verificationReasonCode: 'ID_AND_SIM_IN_PERSON', _mutation: {
      mutationId: 'MUT-VERIFY-88', idempotencyKey: 'MUT-VERIFY-88', entityKey: 'users/04000088', baseVersion: '2026-09-29T00:00:00.000Z'
    } },
    params: { userId: '04000088' },
    session: { user: { employeeId: '03000001', role: 'FARM_MANAGER' } }
  }, verified);

  assert.equal(verified.statusCode, 200);
  assert.equal(verified.payload.pendingApproval, true);
  assert.equal(database.records.get('users').get('04000088').status, 'PENDING');
  assert.ok(database.records.get('users').get('04000088').phoneVerifiedAt);

  const approved = responseCapture();
  await loadApproveHandler(database)({
    body: { id: '04000088', role: 'MEMBER_FARMER', blockFarmId: 'BF-001', _mutation: { mutationId: 'MUT-APPROVAL-88', idempotencyKey: 'MUT-APPROVAL-88', entityKey: 'users/04000088', baseVersion: verified.payload.data.updatedAt } },
    session: { user: { employeeId: '03000001', role: 'FARM_MANAGER' } },
    get: () => ''
  }, approved);
  assert.equal(approved.statusCode, 200);
  assert.equal(database.records.get('users').get('04000088').status, 'ACTIVE');
});

test('editing a Farm Manager moves the canonical assignment to the selected Block Farm', async () => {
  const database = new MemoryDb({
    users: {
      '03000055': {
        firstName: 'Karl', lastName: 'Cuello', displayName: 'Karl Cuello', phone: '09091765170',
        role: 'FARM_MANAGER', status: 'ACTIVE', updatedAt: '2026-09-01T00:00:00.000Z'
      }
    },
    block_farms: {
      'BF-OLD': { name: 'Old Block Farm', managerUserId: '03000055', status: 'ACTIVE', updatedAt: '2026-09-01T00:00:00.000Z' },
      'BF-NEW': { name: 'New Block Farm', managerUserId: null, status: 'ACTIVE', updatedAt: '2026-09-01T00:00:00.000Z' }
    }
  });
  const response = responseCapture();

  await loadPatchHandler(database)({
    body: {
      firstName: 'Karl', middleName: '', lastName: 'Cuello', suffix: '',
      phone: '09091765170', role: 'FARM_MANAGER', blockFarmId: 'BF-NEW',
      _mutation: { mutationId: 'MUT-EDIT-MANAGER', idempotencyKey: 'MUT-EDIT-MANAGER', entityKey: 'users/03000055', baseVersion: '2026-09-01T00:00:00.000Z' }
    },
    params: { userId: '03000055' },
    session: { user: { employeeId: '02000001', role: 'SRA_ADMIN' } },
    get: () => ''
  }, response);

  assert.equal(response.statusCode, 200);
  assert.equal(database.records.get('block_farms').get('BF-OLD').managerUserId, null);
  assert.equal(database.records.get('block_farms').get('BF-NEW').managerUserId, '03000055');
  assert.equal(response.payload.data.assignment.blockFarmId, 'BF-NEW');
  assert.equal(response.payload.data.assignment.displayLabel, 'New Block Farm (Manager)');
});

test('editing a Block Farm can replace its manager and moves the selected manager from another farm', async () => {
  const database = new MemoryDb({
    users: {
      '03000011': { displayName: 'Old Manager', role: 'FARM_MANAGER', status: 'ACTIVE' },
      '03000022': { displayName: 'New Manager', role: 'FARM_MANAGER', status: 'ACTIVE' }
    },
    block_farms: {
      'BF-TARGET': {
        code: 'BF-TARGET', name: 'Target Farm', location: 'Target Location', declaredAreaHa: 10,
        managerUserId: '03000011', status: 'ACTIVE', createdAt: '2026-09-01T00:00:00.000Z',
        updatedAt: '2026-09-01T00:00:00.000Z', archivedAt: null
      },
      'BF-PREVIOUS': {
        code: 'BF-PREVIOUS', name: 'Previous Farm', location: 'Previous Location', declaredAreaHa: 8,
        managerUserId: '03000022', status: 'ACTIVE', createdAt: '2026-09-01T00:00:00.000Z',
        updatedAt: '2026-09-01T00:00:00.000Z', archivedAt: null
      }
    }
  });
  const response = responseCapture();

  await loadBlockFarmPutHandler(database)({
    body: {
      name: 'Target Farm', location: 'Target Location', declaredAreaHa: 10,
      managerUserId: '03000022',
      _mutation: { mutationId: 'MUT-EDIT-FARM', idempotencyKey: 'MUT-EDIT-FARM', entityKey: 'block_farms/BF-TARGET', baseVersion: '2026-09-01T00:00:00.000Z' }
    },
    params: { id: 'BF-TARGET' },
    session: { user: { employeeId: '02000001', role: 'SRA_ADMIN' } },
    get: () => ''
  }, response);

  assert.equal(response.statusCode, 200);
  assert.equal(database.records.get('block_farms').get('BF-TARGET').managerUserId, '03000022');
  assert.equal(database.records.get('block_farms').get('BF-PREVIOUS').managerUserId, null);
  assert.equal(response.payload.data.managerUserId, '03000022');
});

test('web and mobile both choose the server-authoritative assignment during provisioning', () => {
  const root = path.resolve(__dirname, '..', '..');
  const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
  const webForm = read('web/react-app/src/components/users/UserFormModal.jsx');
  const mobileSchema = read('mobile/src/data/firestoreSchema.js');
  const mobileProvisioning = read('mobile/src/components/ProvisionUserModal.js');
  const route = read('server/routes/users.js');
  const blockFarmRoute = read('server/routes/blockFarms.js');
  const blockFarmForm = read('web/react-app/src/components/fields/BlockFarmModal.jsx');
  const blockFarmService = read('web/react-app/src/services/blockFarmsService.js');

  assert.match(webForm, /blockFarmId: blockFarmId \|\| undefined/);
  assert.match(webForm, /selectedRole === 'FARM_MANAGER' \? \{ blockFarmId \} : \{\}/);
  assert.match(webForm, /already assigned/);
  assert.match(route, /queueManagerFarmAssignment\(writer, database, managerFarmSnapshot/);
  assert.match(route, /BLOCK_FARM_MANAGER_ASSIGNED/);
  assert.match(blockFarmRoute, /managerFarms\?\.docs/);
  assert.match(blockFarmForm, /currently \$\{mgr\.assignment\.blockFarmName\}/);
  assert.match(blockFarmService, /canonicalRole === 'FARM_MANAGER'.*status.*ACTIVE/);
  assert.match(mobileSchema, /assignment: value\.assignment \|\| null/);
  assert.match(mobileProvisioning, /blockFarmId: form\.blockFarmId \|\| undefined/);
  assert.match(mobileProvisioning, /phoneVerificationMode/);
});
