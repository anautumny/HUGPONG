'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { COLLECTIONS, ROLES } = require('../schema/firestoreSchema');
const { phoneIdentifierId } = require('../services/accountProvisioningService');
const {
  buildLegacyDataIntegrityReport,
  assertLegacyMigrationAllowed,
  backfillAccountIdentifiers
} = require('../services/legacyDataMigrationService');

const root = path.resolve(__dirname, '..', '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

function canonicalFixture() {
  return {
    users: [
      { id: '03000001', role: ROLES.FARM_MANAGER, phone: '09170000001', createdAt: '2026-09-01T00:00:00.000Z' },
      { id: '04000001', role: ROLES.MEMBER_FARMER, phone: '09170000002', createdAt: '2026-09-01T00:00:00.000Z' }
    ],
    accountIdentifiers: [],
    credentials: [{ id: '03000001' }, { id: '04000001' }],
    blockFarms: [{ id: 'BF-ONE', managerUserId: '03000001' }],
    fields: [{ id: 'FLD-ONE', blockFarmId: 'BF-ONE', memberUserId: '04000001', currentCycleId: 'CYC-ONE' }],
    cropCycles: [{ id: 'CYC-ONE', fieldId: 'FLD-ONE', blockFarmId: 'BF-ONE' }],
    operationLogs: [{ id: 'LOG-ONE', fieldId: 'FLD-ONE', cycleId: 'CYC-ONE' }]
  };
}

function fakeFirestore(fixture) {
  const stores = new Map([
    [COLLECTIONS.USERS, new Map(fixture.users.map(record => [record.id, { ...record }]))],
    [COLLECTIONS.ACCOUNT_IDENTIFIERS, new Map()],
    [COLLECTIONS.AUDIT_LOGS, new Map()]
  ]);
  const database = {
    stores,
    collection(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      const store = stores.get(name);
      return {
        doc(id) {
          return {
            id,
            collectionName: name,
            async get() {
              return store.has(id)
                ? { exists: true, id, data: () => store.get(id) }
                : { exists: false, id, data: () => undefined };
            }
          };
        }
      };
    },
    async runTransaction(handler) {
      const creates = [];
      const result = await handler({
        get: ref => ref.get(),
        create: (ref, value) => creates.push({ ref, value })
      });
      for (const { ref, value } of creates) {
        const store = stores.get(ref.collectionName);
        if (store.has(ref.id)) throw new Error('already exists');
        store.set(ref.id, value);
      }
      return result;
    }
  };
  return database;
}

test('legacy audit plans only missing identity reservations and reaches readiness after backfill', () => {
  const fixture = canonicalFixture();
  const before = buildLegacyDataIntegrityReport(fixture);
  assert.equal(before.canApplyAccountIdentifierBackfill, true);
  assert.equal(before.deploymentReady, false);
  assert.deepEqual(before.repairs.accountIdentifiersToCreate.map(item => item.userId), ['03000001', '04000001']);
  assert.doesNotMatch(JSON.stringify(before), /0917000000[12]/);

  fixture.accountIdentifiers = before.repairs.accountIdentifiersToCreate.map(item => ({
    id: item.identifierId,
    type: 'PHONE',
    userId: item.userId
  }));
  const after = buildLegacyDataIntegrityReport(fixture);
  assert.equal(after.counts.issues, 0);
  assert.equal(after.counts.plannedIdentifierBackfills, 0);
  assert.equal(after.deploymentReady, true);
});

test('duplicate phones, conflicting claims, and orphaned identity reservations block migration', () => {
  const duplicateFixture = canonicalFixture();
  duplicateFixture.users[1].phone = duplicateFixture.users[0].phone;
  const duplicateReport = buildLegacyDataIntegrityReport(duplicateFixture);
  assert.equal(duplicateReport.canApplyAccountIdentifierBackfill, false);
  assert.equal(duplicateReport.issues.duplicatePhoneClaims.length, 1);
  assert.equal(duplicateReport.repairs.accountIdentifiersToCreate.length, 0);

  const conflictFixture = canonicalFixture();
  conflictFixture.accountIdentifiers.push({
    id: phoneIdentifierId(conflictFixture.users[0].phone),
    type: 'PHONE',
    userId: conflictFixture.users[1].id
  });
  conflictFixture.accountIdentifiers.push({ id: 'orphaned-hash', type: 'PHONE', userId: '04999999' });
  const conflictReport = buildLegacyDataIntegrityReport(conflictFixture);
  assert.equal(conflictReport.canApplyAccountIdentifierBackfill, false);
  assert.equal(conflictReport.issues.identifierConflicts.length, 1);
  assert.equal(conflictReport.issues.orphanedAccountIdentifiers.length, 1);
});

test('relationship and credential corruption is reported without inventing repairs', () => {
  const fixture = canonicalFixture();
  fixture.credentials = [{ id: '03000001' }, { id: '04999999' }];
  fixture.blockFarms[0].managerUserId = '04000001';
  fixture.fields[0].blockFarmId = 'BF-MISSING';
  fixture.cropCycles[0].fieldId = 'FLD-MISSING';
  fixture.operationLogs[0].cycleId = 'CYC-MISSING';
  const report = buildLegacyDataIntegrityReport(fixture);
  assert.deepEqual(report.issues.usersMissingCredentials, ['04000001']);
  assert.deepEqual(report.issues.orphanedCredentials, ['04999999']);
  assert.equal(report.issues.invalidFarmManagers[0].reason, 'ROLE_MISMATCH');
  assert.equal(report.issues.invalidFieldRelationships[0].relation, 'BLOCK_FARM');
  assert.equal(report.issues.invalidCycleRelationships[0].reason, 'FIELD_NOT_FOUND');
  assert.equal(report.issues.invalidOperationRelationships[0].relation, 'CYCLE');
  assert.equal(report.deploymentReady, false);
});

test('migration execution requires the explicit gate and exact Firebase project confirmation', () => {
  assert.throws(() => assertLegacyMigrationAllowed({}), /requires --execute/);
  assert.throws(() => assertLegacyMigrationAllowed({ execute: true }), /HUGPONG_ALLOW_LEGACY_MIGRATION=true/);
  assert.throws(() => assertLegacyMigrationAllowed({
    execute: true,
    allowMigration: true,
    projectId: 'hugpong-production',
    expectedProjectId: 'another-project'
  }), /must exactly match/);
  assert.doesNotThrow(() => assertLegacyMigrationAllowed({
    execute: true,
    allowMigration: true,
    projectId: 'hugpong-production',
    expectedProjectId: 'hugpong-production'
  }));
});

test('backfill creates reservations and audit events without changing user records', async () => {
  const fixture = canonicalFixture();
  const database = fakeFirestore(fixture);
  const report = buildLegacyDataIntegrityReport(fixture);
  const originalUsers = JSON.stringify(fixture.users);
  const result = await backfillAccountIdentifiers(database, report, { timestamp: '2026-09-26T08:00:00.000Z' });

  assert.deepEqual(result, { planned: 2, created: 2, alreadyPresent: 0 });
  assert.equal(database.stores.get(COLLECTIONS.ACCOUNT_IDENTIFIERS).size, 2);
  assert.equal(database.stores.get(COLLECTIONS.AUDIT_LOGS).size, 2);
  assert.equal(
    database.stores.get(COLLECTIONS.ACCOUNT_IDENTIFIERS).get(phoneIdentifierId('09170000001')).userId,
    '03000001'
  );
  assert.equal(JSON.stringify(fixture.users), originalUsers);
});

test('package scripts expose dry-run audit separately from explicitly gated execution', () => {
  const packageJson = JSON.parse(read('server/package.json'));
  assert.equal(packageJson.scripts['audit:legacy-data'], 'node scripts/migrateLegacyData.js');
  assert.match(packageJson.scripts['migrate:legacy-data'], /--execute/);
  const script = read('server/scripts/migrateLegacyData.js');
  assert.match(script, /HUGPONG_ALLOW_LEGACY_MIGRATION/);
  assert.match(script, /expectedProjectId/);
});
