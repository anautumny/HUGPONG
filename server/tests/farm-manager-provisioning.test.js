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
      phone: '09091765170', role: 'FARM_MANAGER', blockFarmId: 'BF-NEW'
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
      managerUserId: '03000022'
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

test('web and mobile consume the server assignment while only the web provisioning form chooses it', () => {
  const root = path.resolve(__dirname, '..', '..');
  const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
  const webForm = read('web/react-app/src/components/users/UserFormModal.jsx');
  const mobileSchema = read('mobile/src/data/firestoreSchema.js');
  const route = read('server/routes/users.js');
  const blockFarmRoute = read('server/routes/blockFarms.js');
  const blockFarmForm = read('web/react-app/src/components/fields/BlockFarmModal.jsx');
  const blockFarmService = read('web/react-app/src/services/blockFarmsService.js');

  assert.match(webForm, /blockFarmId: blockFarmId \|\| undefined/);
  assert.match(webForm, /selectedRole === 'FARM_MANAGER' \? \{ blockFarmId \} : \{\}/);
  assert.match(webForm, /already assigned/);
  assert.match(route, /queueRelatedWrites: managerFarmSnapshot/);
  assert.match(route, /BLOCK_FARM_MANAGER_ASSIGNED/);
  assert.match(blockFarmRoute, /managerFarms\?\.docs/);
  assert.match(blockFarmForm, /currently \$\{mgr\.assignment\.blockFarmName\}/);
  assert.match(blockFarmService, /canonicalRole === 'FARM_MANAGER'.*status.*ACTIVE/);
  assert.match(mobileSchema, /assignment: value\.assignment \|\| null/);
});
