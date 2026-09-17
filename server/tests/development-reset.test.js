'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  RESET_CONFIRMATION,
  assertDevelopmentResetAllowed,
  resetDevelopmentFirestore
} = require('../services/developmentReset');

const safeEnvironment = {
  NODE_ENV: 'development',
  ALLOW_DEVELOPMENT_DATABASE_RESET: 'true',
  DEVELOPMENT_DATABASE_RESET_CONFIRM: RESET_CONFIRMATION,
  HUGPONG_EXPECTED_FIREBASE_PROJECT_ID: 'hugpong-dev-test'
};

test('development reset requires every destructive gate and exact project match', () => {
  assert.doesNotThrow(() => assertDevelopmentResetAllowed(safeEnvironment, 'hugpong-dev-test'));
  assert.throws(() => assertDevelopmentResetAllowed({ ...safeEnvironment, NODE_ENV: 'production' }, 'hugpong-dev-test'), /forbidden in production/i);
  assert.throws(() => assertDevelopmentResetAllowed({ ...safeEnvironment, ALLOW_DEVELOPMENT_DATABASE_RESET: 'false' }, 'hugpong-dev-test'), /ALLOW_DEVELOPMENT_DATABASE_RESET/i);
  assert.throws(() => assertDevelopmentResetAllowed({ ...safeEnvironment, DEVELOPMENT_DATABASE_RESET_CONFIRM: 'wrong' }, 'hugpong-dev-test'), /DEVELOPMENT_DATABASE_RESET_CONFIRM/i);
  assert.throws(() => assertDevelopmentResetAllowed(safeEnvironment, 'another-project'), /project mismatch/i);
});

test('controlled reset inventories, deletes, and verifies every Firestore collection', async () => {
  const records = new Map([
    ['users', new Map([['01000001', {}]])],
    ['legacy_collection', new Map([['legacy-1', {}], ['legacy-2', {}]])]
  ]);
  const database = {
    async listCollections() {
      return [...records.entries()]
        .filter(([, documents]) => documents.size > 0)
        .map(([id, documents]) => ({
          id,
          async get() { return { size: documents.size, empty: documents.size === 0, docs: [] }; }
        }));
    },
    async recursiveDelete(collection) {
      records.get(collection.id).clear();
    }
  };

  const result = await resetDevelopmentFirestore(database);
  assert.deepEqual(result.before, [
    { collection: 'legacy_collection', documentCount: 2 },
    { collection: 'users', documentCount: 1 }
  ]);
  assert.equal(result.deletedDocumentCount, 3);
  assert.deepEqual(result.after, []);
});

test('reset remains separate from explicit account bootstrap and runtime startup', () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
  const resetScript = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'resetDevelopmentFirestore.js'), 'utf8');
  const serverSource = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  const webStore = fs.readFileSync(path.join(__dirname, '..', '..', 'web', 'react-app', 'src', 'services', 'replicaStore.js'), 'utf8');

  assert.match(packageJson.scripts['reset:dev-firestore'], /--execute/);
  assert.match(packageJson.scripts['bootstrap:dev-test-accounts'], /bootstrapDevelopmentTestAccounts/);
  assert.doesNotMatch(packageJson.scripts.start, /reset|bootstrap/i);
  assert.doesNotMatch(resetScript, /bootstrapDevelopmentTestAccounts|bootstrapInitialDevelopmentSuperAdmin/);
  assert.doesNotMatch(serverSource, /resetDevelopmentFirestore|bootstrapDevelopmentTestAccounts/);
  assert.match(webStore, /blockFarms:\s*\[\]/);
  assert.match(webStore, /users:\s*\[\]/);
  assert.match(webStore, /logs:\s*\[\]/);
  assert.doesNotMatch(webStore, /seed|mock|sample/i);
});

test('client cache epochs invalidate old replicas and outboxes', () => {
  const mobileStorage = fs.readFileSync(path.join(__dirname, '..', '..', 'mobile', 'src', 'services', 'storageService.js'), 'utf8');
  const mobileDataStore = fs.readFileSync(path.join(__dirname, '..', '..', 'mobile', 'src', 'data', 'dataStore.js'), 'utf8');
  const webCore = fs.readFileSync(path.join(__dirname, '..', '..', 'web', 'react-app', 'src', 'services', 'replicaStore.js'), 'utf8');

  assert.match(mobileStorage, /MOBILE_CACHE_SCHEMA_VERSION = '2026_09_17_post_reset_v1'/);
  assert.match(mobileStorage, /key\.startsWith\('@hugpong_'\)/);
  assert.match(mobileDataStore, /await ensureCurrentCacheSchema\(\)/);
  assert.doesNotMatch(mobileDataStore, /@hugpong_clean_prod_v2/);
  assert.match(webCore, /hugpong_react_replica_v1:\$\{userId\}/);
  assert.match(webCore, /localStorage\.removeItem\(cacheKey\(targetUserId\)\)/);
  assert.doesNotMatch(webCore, /localOnly|auto.*upload/i);
});
