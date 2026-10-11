'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ROLES } = require('../schema/firestoreSchema');
const {
  invalidateAccountAssignments,
  resolveAccountAssignments
} = require('../services/accountAuthorization');

const root = path.join(__dirname, '..', '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

function managerDatabase() {
  let reads = 0;
  const database = {
    collection(name) {
      return {
        where() {
          return {
            async get() {
              reads += 1;
              await new Promise(resolve => setImmediate(resolve));
              return {
                docs: name === 'block_farms'
                  ? [{ id: 'BF-CACHED', data: () => ({ managerUserId: '03000001', status: 'ACTIVE' }) }]
                  : []
              };
            }
          };
        }
      };
    },
    reads: () => reads
  };
  return database;
}

test('assignment authorization coalesces request bursts and invalidates after relevant mutations', async () => {
  const database = managerDatabase();
  const results = await Promise.all([
    resolveAccountAssignments(database, '03000001', ROLES.FARM_MANAGER),
    resolveAccountAssignments(database, '03000001', ROLES.FARM_MANAGER),
    resolveAccountAssignments(database, '03000001', ROLES.FARM_MANAGER)
  ]);
  assert.deepEqual(results[0], { blockFarmId: 'BF-CACHED', fieldId: '' });
  assert.equal(database.reads(), 2, 'one farm query and one field query should serve the whole burst');

  await resolveAccountAssignments(database, '03000001', ROLES.FARM_MANAGER);
  assert.equal(database.reads(), 2, 'the bounded cache should serve an immediate repeat');

  invalidateAccountAssignments(database, '03000001');
  await resolveAccountAssignments(database, '03000001', ROLES.FARM_MANAGER);
  assert.equal(database.reads(), 4, 'invalidation must force authoritative assignment reads');
});

test('session restoration reuses middleware authorization and web avoids unused Firebase authentication', () => {
  const authRoute = read('server/routes/auth.js');
  const sessionStart = authRoute.indexOf("router.get('/session'");
  const sessionEnd = authRoute.indexOf("router.post('/logout'", sessionStart);
  const sessionRoute = authRoute.slice(sessionStart, sessionEnd);
  const webContext = read('web/react-app/src/context/AuthContext.jsx');
  const webApi = read('web/react-app/src/services/apiClient.js');

  assert.match(sessionRoute, /const sessionUser = \{ \.\.\.req\.authUser \}/);
  assert.doesNotMatch(sessionRoute, /collection\(COLLECTIONS\.USERS\)|buildSessionUser/);
  assert.match(authRoute, /sessionUser\?\.platform[\s\S]{0,100}!== 'mobile'/);
  assert.doesNotMatch(webContext, /firebaseClient|signInWithCustomToken/);
  assert.doesNotMatch(webApi, /firebaseClient|signInWithCustomToken/);
});

test('mobile startup reuses a valid token while explicit synchronization forces refresh', () => {
  const authService = read('mobile/src/services/authService.js');
  const dataStore = read('mobile/src/data/dataStore.js');

  assert.match(authService, /forceRefresh\s*\?\s*await auth\.currentUser\.getIdToken\(true\)/);
  assert.match(authService, /:\s*await auth\.currentUser\.getIdToken\(\)/);
  assert.match(dataStore, /refreshMobileSessionFromFirebase\(\{ forceRefresh: true \}\)/);
});
