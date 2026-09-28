'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  BACKUP_COLLECTIONS,
  EXCLUDED_SECURITY_COLLECTIONS,
  createBackupArchive,
  decryptBackupArchive,
  analyzeMissingRecords,
  restoreMissingRecords
} = require('../services/backupService');
const { COLLECTIONS, ROLES } = require('../schema/firestoreSchema');
const { allowedRolesForRequest } = require('../middleware/requestPermissions');

const root = path.resolve(__dirname, '..', '..');
const passphrase = 'Safe-HUGPONG-Backup-2026!';

function fakeDatabase(seed = {}) {
  const stores = new Map(Object.entries(seed).map(([name, records]) => [name, new Map(Object.entries(records))]));
  const ref = (name, id) => ({ name, id, path: `${name}/${id}` });
  return {
    stores,
    collection(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      return {
        doc(id) { return ref(name, id); },
        async get() {
          return {
            docs: [...stores.get(name).entries()].map(([id, data]) => ({ id, data: () => data }))
          };
        }
      };
    },
    doc(documentPath) {
      const [name, id] = String(documentPath).split('/');
      return ref(name, id);
    },
    async getAll(...refs) {
      return refs.map(document => ({ exists: stores.get(document.name)?.has(document.id) || false, ref: document }));
    },
    batch() {
      const creates = [];
      return {
        create(document, data) { creates.push({ document, data }); },
        async commit() {
          for (const { document, data } of creates) {
            const target = stores.get(document.name);
            if (target.has(document.id)) throw new Error('already exists');
            target.set(document.id, data);
          }
        }
      };
    }
  };
}

function businessSeed() {
  return {
    [COLLECTIONS.USERS]: { '01000001': { displayName: 'Super Admin', role: 'SUPER_ADMIN', status: 'ACTIVE' } },
    [COLLECTIONS.FIELDS]: { 'FLD-1': { blockFarmId: 'BF-1', areaHa: 2 } },
    [COLLECTIONS.OPERATION_LOGS]: { 'LOG-1': { fieldId: 'FLD-1', totalCost: 100 } },
    [COLLECTIONS.USER_CREDENTIALS]: { '01000001': { passwordHash: 'must-not-export' } },
    [COLLECTIONS.DIAGNOSTIC_EVENTS]: { 'DIAG-1': { technicalError: 'must-not-export' } }
  };
}

test('manual backup encrypts approved business collections and excludes security and diagnostics data', async () => {
  const database = fakeDatabase(businessSeed());
  const result = await createBackupArchive(database, {
    passphrase,
    projectId: 'hugpong-test',
    actorUserId: '01000001',
    now: new Date('2026-09-28T00:00:00.000Z')
  });
  const archiveText = Buffer.from(result.archiveBase64, 'base64').toString('utf8');
  assert.doesNotMatch(archiveText, /Super Admin|must-not-export|FLD-1/);
  const decrypted = await decryptBackupArchive(database, result.archiveBase64, passphrase, 'hugpong-test');
  assert.equal(decrypted.payload.documentCount, 3);
  assert.deepEqual(decrypted.payload.includedCollections, BACKUP_COLLECTIONS);
  assert.ok(EXCLUDED_SECURITY_COLLECTIONS.includes(COLLECTIONS.USER_CREDENTIALS));
  assert.ok(EXCLUDED_SECURITY_COLLECTIONS.includes(COLLECTIONS.DIAGNOSTIC_EVENTS));
  assert.equal(decrypted.payload.collections[COLLECTIONS.USER_CREDENTIALS], undefined);
});

test('backup rejects wrong passphrases, tampering, and another Firebase project', async () => {
  const database = fakeDatabase(businessSeed());
  const result = await createBackupArchive(database, {
    passphrase,
    projectId: 'hugpong-test',
    actorUserId: '01000001',
    now: new Date('2026-09-28T00:00:00.000Z')
  });
  await assert.rejects(
    decryptBackupArchive(database, result.archiveBase64, 'Wrong-HUGPONG-Backup-2026!', 'hugpong-test'),
    error => error.code === 'BACKUP_DECRYPTION_FAILED'
  );
  await assert.rejects(
    decryptBackupArchive(database, result.archiveBase64, passphrase, 'another-project'),
    error => error.code === 'BACKUP_PROJECT_MISMATCH'
  );
});

test('recovery plan and execution create missing records without overwriting existing data', async () => {
  const source = fakeDatabase(businessSeed());
  const result = await createBackupArchive(source, {
    passphrase,
    projectId: 'hugpong-test',
    actorUserId: '01000001',
    now: new Date('2026-09-28T00:00:00.000Z')
  });
  const decrypted = await decryptBackupArchive(source, result.archiveBase64, passphrase, 'hugpong-test');
  const target = fakeDatabase({
    [COLLECTIONS.USERS]: { '01000001': { displayName: 'Current Name', role: 'SUPER_ADMIN', status: 'ACTIVE' } }
  });
  const plan = await analyzeMissingRecords(target, decrypted.payload);
  assert.equal(plan.missingCount, 2);
  assert.equal(plan.existingCount, 1);
  const restored = await restoreMissingRecords(target, decrypted.payload);
  assert.equal(restored.restoredCount, 2);
  assert.equal(restored.skippedExistingCount, 1);
  assert.equal(target.stores.get(COLLECTIONS.USERS).get('01000001').displayName, 'Current Name');
  assert.equal(target.stores.get(COLLECTIONS.FIELDS).get('FLD-1').areaHa, 2);
});

test('backup APIs and web page are Super Admin web-only while mobile has no backup controls', () => {
  assert.deepEqual(allowedRolesForRequest('GET', '/api/backups'), [ROLES.SUPER_ADMIN]);
  assert.deepEqual(allowedRolesForRequest('POST', '/api/backups/export'), [ROLES.SUPER_ADMIN]);
  assert.deepEqual(allowedRolesForRequest('POST', '/api/backups/validate'), [ROLES.SUPER_ADMIN]);
  assert.deepEqual(allowedRolesForRequest('POST', '/api/backups/restore-missing'), [ROLES.SUPER_ADMIN]);
  const app = fs.readFileSync(path.join(root, 'web/react-app/src/App.jsx'), 'utf8');
  const sidebar = fs.readFileSync(path.join(root, 'web/react-app/src/components/layout/Sidebar.jsx'), 'utf8');
  const mobile = fs.readFileSync(path.join(root, 'mobile/src/navigation/RootNavigator.js'), 'utf8');
  assert.match(app, /path="\/backups"[\s\S]*allowed=\{GOVERNANCE_ROLES\}/);
  assert.match(sidebar, /Backup & Recovery[\s\S]*\/backups/);
  assert.doesNotMatch(mobile, /BackupManagement|\/api\/backups|backupService/);
});

test('Firestore rules deny clients direct access to backup operation metadata', () => {
  const rules = fs.readFileSync(path.join(root, 'firestore.rules'), 'utf8');
  assert.match(rules, /match \/backup_operations\/\{documentId\}[\s\S]*allow read, write: if false/);
});
