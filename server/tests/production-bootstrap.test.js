'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { COLLECTIONS, ROLES } = require('../schema/firestoreSchema');
const { phoneIdentifierId } = require('../services/accountProvisioningService');
const {
  PRODUCTION_BOOTSTRAP_CONFIRMATION,
  PRODUCTION_BOOTSTRAP_MARKER_ID,
  assertProductionBootstrapAllowed,
  productionSuperAdminInput,
  inspectProductionBootstrap,
  bootstrapInitialProductionSuperAdmin
} = require('../services/productionBootstrap');

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

class MemoryDocumentReference {
  constructor(database, collectionName, id) {
    this.database = database;
    this.collectionName = collectionName;
    this.id = id;
  }

  async get() {
    const value = this.database.store(this.collectionName).get(this.id);
    return {
      id: this.id,
      exists: value !== undefined,
      data: () => clone(value)
    };
  }
}

class MemoryQuery {
  constructor(database, collectionName, filters = [], maximum = null) {
    this.database = database;
    this.collectionName = collectionName;
    this.filters = filters;
    this.maximum = maximum;
  }

  where(field, operator, value) {
    assert.equal(operator, '==');
    return new MemoryQuery(this.database, this.collectionName, [...this.filters, { field, value }], this.maximum);
  }

  limit(maximum) {
    return new MemoryQuery(this.database, this.collectionName, this.filters, maximum);
  }

  async get() {
    let records = Array.from(this.database.store(this.collectionName).entries())
      .filter(([, value]) => this.filters.every(filter => value?.[filter.field] === filter.value));
    if (this.maximum != null) records = records.slice(0, this.maximum);
    const docs = records.map(([id, value]) => ({ id, exists: true, data: () => clone(value) }));
    return { docs, empty: docs.length === 0, size: docs.length };
  }
}

class MemoryCollection extends MemoryQuery {
  doc(id) {
    return new MemoryDocumentReference(this.database, this.collectionName, id);
  }
}

class MemoryTransaction {
  constructor(database) {
    this.database = database;
    this.creates = [];
  }

  get(target) {
    return target.get();
  }

  create(reference, data) {
    this.creates.push({ reference, data: clone(data) });
    return this;
  }

  commit() {
    for (const item of this.creates) {
      if (this.database.store(item.reference.collectionName).has(item.reference.id)) {
        const error = new Error('Document already exists.');
        error.code = 'already-exists';
        throw error;
      }
    }
    for (const item of this.creates) {
      this.database.store(item.reference.collectionName).set(item.reference.id, clone(item.data));
    }
  }
}

class MemoryDatabase {
  constructor(seed = {}) {
    this.stores = new Map();
    for (const [collectionName, records] of Object.entries(seed)) {
      this.stores.set(collectionName, new Map(Object.entries(records).map(([id, value]) => [id, clone(value)])));
    }
  }

  store(collectionName) {
    if (!this.stores.has(collectionName)) this.stores.set(collectionName, new Map());
    return this.stores.get(collectionName);
  }

  collection(collectionName) {
    return new MemoryCollection(this, collectionName);
  }

  async runTransaction(callback) {
    const transaction = new MemoryTransaction(this);
    const result = await callback(transaction);
    transaction.commit();
    return result;
  }
}

function productionEnvironment(overrides = {}) {
  return {
    NODE_ENV: 'production',
    SMS_PROVIDER: 'iprog',
    IPROG_SMS_API_TOKEN: 'test-only-iprog-token',
    FIREBASE_PROJECT_ID: 'hugpong-production',
    HUGPONG_ALLOW_PRODUCTION_BOOTSTRAP: 'true',
    HUGPONG_PRODUCTION_BOOTSTRAP_CONFIRM: PRODUCTION_BOOTSTRAP_CONFIRMATION,
    HUGPONG_PRODUCTION_BOOTSTRAP_PROJECT_ID: 'hugpong-production',
    HUGPONG_BOOTSTRAP_FIRST_NAME: 'Maria',
    HUGPONG_BOOTSTRAP_MIDDLE_NAME: 'Santos',
    HUGPONG_BOOTSTRAP_LAST_NAME: 'Reyes',
    HUGPONG_BOOTSTRAP_SUFFIX: '',
    HUGPONG_BOOTSTRAP_PHONE: '09171234567',
    HUGPONG_BOOTSTRAP_TEMPORARY_PASSWORD: 'UniqueTemporary47!',
    ...overrides
  };
}

test('production bootstrap requires production, explicit execution gates, a configured SMS provider, and exact project parity', () => {
  const safe = productionEnvironment();
  assert.doesNotThrow(() => assertProductionBootstrapAllowed(safe, 'hugpong-production'));
  assert.throws(() => assertProductionBootstrapAllowed({ ...safe, NODE_ENV: 'development' }, 'hugpong-production'), /NODE_ENV=production/);
  assert.throws(() => assertProductionBootstrapAllowed({ ...safe, HUGPONG_ALLOW_PRODUCTION_BOOTSTRAP: 'false' }, 'hugpong-production'), /ALLOW_PRODUCTION_BOOTSTRAP/);
  assert.throws(() => assertProductionBootstrapAllowed({ ...safe, HUGPONG_PRODUCTION_BOOTSTRAP_CONFIRM: 'wrong' }, 'hugpong-production'), /CREATE_INITIAL_HUGPONG_SUPER_ADMIN/);
  assert.throws(() => assertProductionBootstrapAllowed({ ...safe, SMS_PROVIDER: 'console' }, 'hugpong-production'), /configured production SMS provider/);
  assert.throws(() => assertProductionBootstrapAllowed({ ...safe, IPROG_SMS_API_TOKEN: '' }, 'hugpong-production'), /IPROG_SMS_API_TOKEN/);
  assert.doesNotThrow(() => assertProductionBootstrapAllowed({
    ...safe,
    SMS_PROVIDER: 'semaphore',
    SEMAPHORE_API_KEY: 'test-only-semaphore-key'
  }, 'hugpong-production'));
  assert.throws(() => assertProductionBootstrapAllowed({ ...safe, HUGPONG_PRODUCTION_BOOTSTRAP_PROJECT_ID: 'another-project' }, 'hugpong-production'), /project mismatch/i);
  assert.throws(() => assertProductionBootstrapAllowed({ ...safe, FIREBASE_PROJECT_ID: 'another-project' }, 'hugpong-production'), /project mismatch/i);
});

test('production bootstrap input normalizes identity and rejects unsafe phone or password values', () => {
  assert.deepEqual(productionSuperAdminInput(productionEnvironment()), {
    identity: {
      firstName: 'Maria',
      middleName: 'Santos',
      lastName: 'Reyes',
      suffix: null,
      displayName: 'Maria Santos Reyes'
    },
    phone: '09171234567',
    temporaryPassword: 'UniqueTemporary47!'
  });
  assert.throws(() => productionSuperAdminInput(productionEnvironment({ HUGPONG_BOOTSTRAP_PHONE: '123' })), /11-digit Philippine/);
  assert.throws(() => productionSuperAdminInput(productionEnvironment({ HUGPONG_BOOTSTRAP_TEMPORARY_PASSWORD: 'password' })), /uppercase|less predictable/i);
});

test('production bootstrap atomically creates only the initial Super Admin and forces first-login security', async () => {
  const database = new MemoryDatabase();
  assert.deepEqual(await inspectProductionBootstrap(database), { eligible: true, reason: null });
  const timestamp = '2026-09-29T05:00:00.000Z';
  const result = await bootstrapInitialProductionSuperAdmin({
    database,
    env: productionEnvironment(),
    actualProjectId: 'hugpong-production',
    timestamp
  });

  assert.equal(result.created, true);
  assert.match(result.userId, /^01\d{6}$/);
  assert.equal(result.role, ROLES.SUPER_ADMIN);
  assert.equal(result.phoneVerificationRequired, true);
  assert.equal(result.passwordChangeRequired, true);
  const user = database.store(COLLECTIONS.USERS).get(result.userId);
  assert.equal(user.role, ROLES.SUPER_ADMIN);
  assert.equal(user.status, 'ACTIVE');
  assert.equal(user.phoneVerifiedAt, null);
  assert.equal(user.requiresPasswordChange, true);
  assert.equal(user.passwordChangedAt, null);
  assert.equal(user.approvedByUserId, result.userId);
  assert.equal(database.store(COLLECTIONS.USER_CREDENTIALS).size, 1);
  assert.equal(database.store(COLLECTIONS.ACCOUNT_IDENTIFIERS).get(phoneIdentifierId('09171234567')).userId, result.userId);
  assert.equal(database.store(COLLECTIONS.AUDIT_LOGS).size, 1);
  assert.deepEqual(database.store(COLLECTIONS.SYSTEM_METADATA).get(PRODUCTION_BOOTSTRAP_MARKER_ID), {
    type: 'INITIAL_SUPER_ADMIN_BOOTSTRAP',
    userId: result.userId,
    projectId: 'hugpong-production',
    completedAt: timestamp
  });
  assert.deepEqual(await inspectProductionBootstrap(database), { eligible: false, reason: 'BOOTSTRAP_ALREADY_COMPLETED' });
  await assert.rejects(
    bootstrapInitialProductionSuperAdmin({
      database,
      env: productionEnvironment({ HUGPONG_BOOTSTRAP_PHONE: '09171234568' }),
      actualProjectId: 'hugpong-production',
      timestamp
    }),
    /already completed/
  );
});

test('production bootstrap refuses a non-empty user database without creating anything', async () => {
  const database = new MemoryDatabase({
    [COLLECTIONS.USERS]: { '04000001': { role: ROLES.MEMBER_FARMER, phone: '09170000001' } }
  });
  assert.deepEqual(await inspectProductionBootstrap(database), { eligible: false, reason: 'USER_DATABASE_NOT_EMPTY' });
  await assert.rejects(
    bootstrapInitialProductionSuperAdmin({
      database,
      env: productionEnvironment(),
      actualProjectId: 'hugpong-production'
    }),
    /user database is not empty/i
  );
  assert.equal(database.store(COLLECTIONS.USER_CREDENTIALS).size, 0);
  assert.equal(database.store(COLLECTIONS.SYSTEM_METADATA).size, 0);
});

test('production bootstrap stays outside normal server startup and every client surface', () => {
  const serverPackage = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../package.json'), 'utf8'));
  const rootPackage = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../package.json'), 'utf8'));
  assert.match(serverPackage.scripts['bootstrap:production-super-admin'], /bootstrapProductionSuperAdmin/);
  assert.match(rootPackage.scripts['bootstrap:production-super-admin'], /bootstrap:production-super-admin/);
  assert.doesNotMatch(serverPackage.scripts.start, /bootstrap/i);
  const webSource = fs.readFileSync(path.resolve(__dirname, '../../web/react-app/src/App.jsx'), 'utf8');
  const mobileSource = fs.readFileSync(path.resolve(__dirname, '../../mobile/App.js'), 'utf8');
  assert.doesNotMatch(webSource, /PRODUCTION_BOOTSTRAP|bootstrapProductionSuperAdmin/);
  assert.doesNotMatch(mobileSource, /PRODUCTION_BOOTSTRAP|bootstrapProductionSuperAdmin/);
  const rules = fs.readFileSync(path.resolve(__dirname, '../../firestore.rules'), 'utf8');
  assert.match(rules, /match \/system_metadata\/\{documentId\}[\s\S]*allow read, write: if false/);
});
