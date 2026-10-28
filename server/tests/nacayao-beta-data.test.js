'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { memoryFirestore } = require('./helpers/memoryFirestore');
const { BATCH_ID, MARKER_ID, planBetaData, buildBetaFixtures, applyBetaPlan, fingerprint, addBetaFarmManager } = require('../services/betaDataService');
const { saveRecoveryBackup, finishAuthenticationCleanup } = require('../scripts/manageNacayaoBetaData');
const { resolveAccountAssignments } = require('../services/accountAuthorization');
const { buildOperationLog } = require('../schema/firestoreSchema');
const { verifyPassword } = require('../security/password');
const { BETA_PHONES } = require('../domain/betaPhones');
const { createSmsGateway, sendIprogSms, sendSemaphoreSms } = require('../services/smsGateway');
const { listOperationPage } = require('../services/operationQueryService');
const { isRoleAllowedOnPlatform } = require('../schema/firestoreSchema');
const { buildFirebaseClaims } = require('../security/firebaseClaims');
const { updateBetaProfiles } = require('../scripts/updateNacayaoBetaProfiles');
const { phoneIdentifierId } = require('../services/accountProvisioningService');
const { BETA_MANAGER_NAME, BETA_MEMBER_PROFILES } = require('../domain/betaProfiles');
const { setBetaPasswords } = require('../scripts/setNacayaoBetaPasswords');

function initial() {
  return {
    'users/01848867': { displayName: 'Matt Daniel Delotavo', role: 'SUPER_ADMIN', status: 'ACTIVE' },
    'users/02136633': { displayName: 'John Benedict Miranda', role: 'SRA_ADMIN', status: 'ACTIVE' },
    'users/03999999': { displayName: 'Old Manager', role: 'FARM_MANAGER', phone: '09171234567' },
    'users/04999999': { displayName: 'Old Member', role: 'MEMBER_FARMER' },
    'user_credentials/01848867': { passwordHash: 'protected' },
    'user_credentials/03999999': { passwordHash: 'old' },
    'account_identifiers/admin': { userId: '01848867' },
    'account_identifiers/old': { userId: '03999999' },
    'block_farms/NACAYAO': { name: 'NACAYAO SMALL FARMERS ASSOCIATION', declaredAreaHa: 30.11, managerUserId: '03999999', status: 'ACTIVE' },
    'block_farms/OTHER': { name: 'Other Farm', status: 'ACTIVE' },
    'fields/OLD-FIELD': { blockFarmId: 'NACAYAO', memberUserId: '04999999' },
    'crop_cycles/OLD-CYCLE': { fieldId: 'OLD-FIELD' },
    'operation_logs/OLD-LOG': { fieldId: 'OLD-FIELD', cycleId: 'OLD-CYCLE' },
    'audit_reports/OLD-REPORT': { blockFarmId: 'NACAYAO', sourceLogIds: ['OLD-LOG'] },
    'server_sessions/old': { session: { user: { employeeId: '03999999' } } },
    'server_sessions/admin': { session: { user: { employeeId: '01848867' } } },
    'notification_states/old': { userId: '04999999' },
    'notification_states/admin-report': { userId: '02136633', notificationId: 'report:OLD-REPORT' },
    'otp_challenges/old-phone': { phone: '09171234567' },
    'sra_prices/REAL': { sugarPricePerLkg: 2500, molassesPricePerMetricTon: 9000 },
    'audit_logs/HISTORY': { actorUserId: '03999999', entityId: 'OLD-FIELD' },
    'system_metadata/initial-super-admin': { userId: '01848867' }
  };
}

function inventory(database) {
  const result = {};
  for (const [key, data] of database.records) {
    const [collection, id] = key.split('/');
    (result[collection] ||= []).push({ id, data: structuredClone(data) });
  }
  return result;
}

async function initialized() {
  const db = memoryFirestore(initial());
  const before = inventory(db);
  const plan = planBetaData(before, 'initialize');
  const fixtures = await buildBetaFixtures(plan.farm, '2026-10-27T06:00:00.000Z');
  await applyBetaPlan(db, before, plan, fixtures, '/private/backup');
  return { db, fixtures, plan };
}

test('initial cleanup preserves admins, credentials, phone identifiers, prices and historical evidence', async () => {
  const { db, fixtures } = await initialized();
  const original = initial();
  for (const key of ['users/01848867', 'users/02136633', 'user_credentials/01848867', 'account_identifiers/admin', 'sra_prices/REAL', 'audit_logs/HISTORY', 'server_sessions/admin']) {
    assert.deepEqual(db.records.get(key), original[key]);
  }
  for (const key of ['users/03999999', 'users/04999999', 'user_credentials/03999999', 'account_identifiers/old', 'server_sessions/old', 'fields/OLD-FIELD', 'crop_cycles/OLD-CYCLE', 'operation_logs/OLD-LOG', 'audit_reports/OLD-REPORT', 'block_farms/OTHER', 'notification_states/admin-report', 'otp_challenges/old-phone']) {
    assert.equal(db.records.has(key), false, key);
  }
  assert.equal(db.records.get('block_farms/NACAYAO').managerUserId, null);
  assert.equal(fixtures.credentials.length, 5);
  assert.equal(fixtures.credentials.reduce((sum, row) => sum + row.areaHa, 0), 7.5);
});

test('fixtures use normal mobile assignments, hashed individual passwords, and the operation schema', async () => {
  const { db, fixtures } = await initialized();
  assert.equal(fixtures.creates.filter(row => row.collection === 'operation_logs').length, 30);
  for (const account of fixtures.credentials) {
    const user = db.records.get(`users/${account.userId}`);
    assert.match(account.userId, /^04\d{6}$/);
    assert.ok(BETA_PHONES.includes(user.phone));
    assert.equal(user.betaBatchId, BATCH_ID);
    assert.equal(await verifyPassword(account.password, db.records.get(`user_credentials/${account.userId}`).passwordHash), true);
    assert.deepEqual(await resolveAccountAssignments(db, account.userId, user.role, user), { blockFarmId: 'NACAYAO', fieldId: account.fieldId });
  }
  for (const row of fixtures.creates.filter(item => item.collection === 'operation_logs')) {
    const normalized = buildOperationLog(row.data);
    assert.equal(normalized.totalCost, 1000);
    assert.equal(normalized.lineItems.length, 0);
    assert.equal(normalized.laborEntries[0].subtotal, 1000);
  }
});

test('removal includes new operations, cycles, reports and security artifacts, while retaining later real accounts', async () => {
  const { db, fixtures } = await initialized();
  const beta = fixtures.credentials[0];
  const realRecords = {
    'users/03123456': { displayName: 'Real Manager', role: 'FARM_MANAGER' },
    'users/04123456': { displayName: 'Real Member', role: 'MEMBER_FARMER' },
    'fields/REAL-FIELD': { memberUserId: '04123456', blockFarmId: 'NACAYAO' },
    'operation_logs/REAL-LOG': { fieldId: 'REAL-FIELD', submittedByUserId: '04123456' }
  };
  for (const [key, value] of Object.entries(realRecords)) db.records.set(key, value);
  db.records.get('block_farms/NACAYAO').managerUserId = '03123456';
  db.records.set('operation_logs/TESTER-LOG', { fieldId: beta.fieldId, submittedByUserId: '03123456' });
  db.records.set('crop_cycles/TESTER-CYCLE', { fieldId: beta.fieldId });
  db.records.set('audit_reports/TESTER-REPORT', { fieldSnapshots: [{ fieldId: beta.fieldId }], sourceLogIds: ['TESTER-LOG'] });
  db.records.set('notification_states/TESTER-NOTIFICATION', { userId: '02136633', notificationId: 'report:TESTER-REPORT' });
  db.records.set('server_sessions/TESTER-SESSION', { session: { user: { employeeId: beta.userId } } });
  const before = inventory(db);
  const plan = planBetaData(before, 'remove');
  await applyBetaPlan(db, before, plan, null, '/private/removal-backup');
  for (const [key, value] of Object.entries(realRecords)) assert.deepEqual(db.records.get(key), value);
  assert.equal(db.records.get('block_farms/NACAYAO').managerUserId, '03123456');
  for (const key of ['operation_logs/TESTER-LOG', 'crop_cycles/TESTER-CYCLE', 'audit_reports/TESTER-REPORT', 'notification_states/TESTER-NOTIFICATION', 'server_sessions/TESTER-SESSION']) assert.equal(db.records.has(key), false);
  assert.equal(db.records.get(`system_metadata/${MARKER_ID}`).status, 'REMOVED');
});

test('mixed real/beta reports and transferred fields stop removal before any writes', async () => {
  const { db, fixtures } = await initialized();
  const beta = fixtures.credentials[0];
  db.records.set('audit_reports/MIXED', { fieldSnapshots: [{ fieldId: beta.fieldId }, { fieldId: 'REAL' }] });
  assert.throws(() => planBetaData(inventory(db), 'remove'), /mixes beta and real/);
  db.records.delete('audit_reports/MIXED');
  db.records.get(`fields/${beta.fieldId}`).memberUserId = 'REAL';
  assert.throws(() => planBetaData(inventory(db), 'remove'), /belongs to a real account/);
});

test('changed data aborts the atomic transaction with no partial deletion', async () => {
  const db = memoryFirestore(initial());
  const before = inventory(db);
  const plan = planBetaData(before, 'initialize');
  const fixtures = await buildBetaFixtures(plan.farm);
  db.records.set('fields/NEW', { blockFarmId: 'NACAYAO' });
  const checkpoint = structuredClone([...db.records]);
  await assert.rejects(applyBetaPlan(db, before, plan, fixtures, '/private/backup'), /changed after backup/);
  assert.deepEqual([...db.records], checkpoint);
});

test('reinitialization, missing protected accounts, unknown roles and ambiguous NACAYAO are rejected', async () => {
  const { db } = await initialized();
  assert.throws(() => planBetaData(inventory(db), 'initialize'), /already initialized/);
  const missing = initial(); delete missing['users/01848867'];
  assert.throws(() => planBetaData(inventory(memoryFirestore(missing)), 'initialize'), /Protected account/);
  const unknown = initial(); unknown['users/UNKNOWN'] = { role: 'UNKNOWN' };
  assert.throws(() => planBetaData(inventory(memoryFirestore(unknown)), 'initialize'), /Unknown user role/);
  const duplicate = initial(); duplicate['block_farms/DUPLICATE'] = { name: 'NACAYAO', status: 'ACTIVE' };
  assert.throws(() => planBetaData(inventory(memoryFirestore(duplicate)), 'initialize'), /Exactly one/);
});

test('additional SRA and Super Admin accounts are always protected', () => {
  const seed = initial();
  seed['users/EXTRA'] = { role: 'SRA_ADMIN', displayName: 'Another Admin' };
  const plan = planBetaData(inventory(memoryFirestore(seed)), 'initialize');
  assert.ok(plan.protectedRows.some(row => row.id === 'EXTRA'));
  assert.ok(!plan.deletions.some(row => row.id === 'EXTRA'));
});

test('Firebase cleanup is resumable and refuses to delete an account restored in Firestore', async () => {
  const db = memoryFirestore({ [`system_metadata/${MARKER_ID}`]: { pendingAuthUserIds: ['03999999', '04999999'] } });
  const deleted = [];
  const auth = { async deleteUser(id) { if (id === '04999999') throw Object.assign(new Error(), { code: 'auth/user-not-found' }); deleted.push(id); } };
  await finishAuthenticationCleanup(db, auth);
  assert.deepEqual(deleted, ['03999999']);
  assert.deepEqual(db.records.get(`system_metadata/${MARKER_ID}`).pendingAuthUserIds, []);
  db.records.get(`system_metadata/${MARKER_ID}`).pendingAuthUserIds = ['01848867'];
  db.records.set('users/01848867', { role: 'SUPER_ADMIN' });
  await assert.rejects(finishAuthenticationCleanup(db, auth), /account 01848867 exists/);
});

test('backup is encrypted, disk-verified and never overwrites an existing archive', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'hugpong-beta-test-'));
  try {
    const archive = saveRecoveryBackup(directory, { sensitive: 'test-secret', collections: initial() });
    assert.ok(!fs.readFileSync(archive, 'utf8').includes('test-secret'));
    assert.throws(() => saveRecoveryBackup(directory, {}), /EEXIST/);
  } finally { fs.rmSync(directory, { recursive: true }); }
});

test('fingerprints tolerate Firestore object key ordering without hiding changes', () => {
  assert.equal(fingerprint({ b: { y: 2, x: 1 }, a: 0 }), fingerprint({ a: 0, b: { x: 1, y: 2 } }));
  assert.notEqual(fingerprint({ a: 1 }), fingerprint({ a: 2 }));
});

test('fixture numbers cannot send SMS through any gateway or either direct provider function', async () => {
  const database = memoryFirestore(Object.fromEntries(BETA_PHONES.flatMap((phone, index) => [
    [`users/fixture-${index}`, { phone, isBetaData: true, betaBatchId: BATCH_ID }],
    [`account_identifiers/${phoneIdentifierId(phone)}`, { userId: `fixture-${index}` }]
  ])));
  for (const phone of BETA_PHONES) {
    for (const provider of ['console', 'iprog', 'semaphore']) {
      const gateway = createSmsGateway({ provider, database, logger: { log() { assert.fail('SMS must not be logged'); } } });
      await assert.rejects(gateway.send(phone, 'beta message'), { code: 'BETA_SMS_DISABLED' });
      await assert.rejects(gateway.send(`63${phone.slice(1)}`, 'beta message'), { code: 'BETA_SMS_DISABLED' });
    }
    await assert.rejects(sendIprogSms(phone, 'beta message', { database }), { code: 'BETA_SMS_DISABLED' });
    await assert.rejects(sendSemaphoreSms(phone, 'beta message', { database }), { code: 'BETA_SMS_DISABLED' });
  }
});

test('removing beta identities releases their phone numbers for legitimate SMS without restarting the server', async () => {
  const phone = BETA_PHONES[0];
  const identifier = `account_identifiers/${phoneIdentifierId(phone)}`;
  const database = memoryFirestore({
    'users/fixture': { phone, isBetaData: true, betaBatchId: BATCH_ID },
    [identifier]: { userId: 'fixture' }
  });
  let sent = 0;
  const gateway = createSmsGateway({ provider: 'iprog', database, iprogApiToken: 'fake-token', fetchImpl: async () => {
    sent += 1;
    return { ok: true, status: 200, text: async () => '{"status":200}' };
  } });
  await assert.rejects(gateway.send(phone, 'test'), { code: 'BETA_SMS_DISABLED' });
  assert.equal(sent, 0);
  database.records.delete('users/fixture');
  database.records.delete(identifier);
  assert.equal((await gateway.send(phone, 'test')).success, true);
  database.records.set('users/real', { phone, isBetaData: false });
  database.records.set(identifier, { userId: 'real' });
  assert.equal((await gateway.send(`+63${phone.slice(1)}`, 'test')).success, true);
  assert.equal(sent, 2);
});

test('fixture phone lookup failures fail closed before contacting the SMS provider', async () => {
  let sent = 0;
  const gateway = createSmsGateway({ provider: 'iprog', iprogApiToken: 'fake-token',
    database: { collection() { throw new Error('Database unavailable'); } }, fetchImpl: async () => { sent += 1; } });
  await assert.rejects(gateway.send(BETA_PHONES[0], 'test'), /Database unavailable/);
  assert.equal(sent, 0);
});

test('requested beta manager has verified-phone login, normal Web/Mobile scope and complete end-of-beta cleanup', async () => {
  const { db } = await initialized();
  const password = 'ExampleBeta!73';
  const manager = await addBetaFarmManager(db, { phone: '09293794717', password, credentialsPath: '/private/manager.json' });
  const user = db.records.get(`users/${manager.userId}`);
  assert.match(manager.userId, /^03\d{6}$/);
  assert.equal(user.phoneVerificationStatus, 'VERIFIED');
  assert.ok(user.phoneVerifiedAt);
  assert.equal(user.requiresPasswordChange, false);
  assert.equal(user.status, 'ACTIVE');
  assert.equal(await verifyPassword(password, db.records.get(`user_credentials/${manager.userId}`).passwordHash), true);
  assert.deepEqual(await resolveAccountAssignments(db, manager.userId, 'FARM_MANAGER'), { blockFarmId: 'NACAYAO', fieldId: '' });
  assert.ok(db.records.get(`system_metadata/${MARKER_ID}`).userIds.includes(manager.userId));
  for (const platform of ['web', 'mobile']) {
    assert.equal(isRoleAllowedOnPlatform(user.role, platform), true);
    assert.equal(buildFirebaseClaims({ canonicalRole: user.role, phoneVerified: true, requiresPasswordChange: false }).accountReady, true);
    const page = await listOperationPage(db, { employeeId: manager.userId, role: user.role }, { status: 'ACTIVE', limit: 100 });
    assert.equal(page.data.length, 30);
  }
  const before = inventory(db);
  const plan = planBetaData(before, 'remove');
  assert.deepEqual(plan.summary.unassignFarmIds, ['NACAYAO']);
  await applyBetaPlan(db, before, plan, null, '/private/removal');
  assert.equal(db.records.get('block_farms/NACAYAO').managerUserId, null);
  assert.equal(db.records.has(`users/${manager.userId}`), false);
  assert.equal(db.records.has(`user_credentials/${manager.userId}`), false);
  assert.deepEqual(db.records.get('sra_prices/REAL'), initial()['sra_prices/REAL']);
});

test('beta manager creation refuses occupied farms, registered phones and inactive beta batches atomically', async () => {
  const { db, fixtures } = await initialized();
  const options = { phone: '09293794717', password: 'ExampleBeta!73' };
  db.records.get('block_farms/NACAYAO').managerUserId = 'REAL-MANAGER';
  const occupied = structuredClone([...db.records]);
  await assert.rejects(addBetaFarmManager(db, options), /already has a Farm Manager/);
  assert.deepEqual([...db.records], occupied);
  db.records.get('block_farms/NACAYAO').managerUserId = null;
  const memberPhone = db.records.get(`users/${fixtures.credentials[0].userId}`).phone;
  await assert.rejects(addBetaFarmManager(db, { ...options, phone: memberPhone }), /already registered/);
  db.records.get(`system_metadata/${MARKER_ID}`).status = 'REMOVED';
  await assert.rejects(addBetaFarmManager(db, options), /ACTIVE NACAYAO beta batch/);
});

test('natural profile names and mock PH phones migrate atomically without changing passwords or farm relationships', async () => {
  const { db, fixtures } = await initialized();
  const manager = await addBetaFarmManager(db, { phone: '09293794717', password: 'ExampleBeta!73' });
  for (let index = 0; index < 5; index++) {
    const id = fixtures.credentials[index].userId;
    const user = db.records.get(`users/${id}`);
    db.records.delete(`account_identifiers/${phoneIdentifierId(user.phone)}`);
    user.phone = `0900000000${index + 1}`;
    user.displayName = `Beta Member ${index + 1}`;
    db.records.set(`account_identifiers/${phoneIdentifierId(user.phone)}`, { type: 'PHONE', userId: id });
  }
  db.records.get(`users/${manager.userId}`).displayName = 'Nacayao Beta Manager';
  const before = new Map(structuredClone([...db.records]));
  const dryRun = await updateBetaProfiles(db);
  assert.equal(dryRun.length, 6);
  assert.deepEqual([...db.records], [...before]);
  const result = await updateBetaProfiles(db, { execute: true });
  assert.equal(result.find(row => row.userId === manager.userId).name, BETA_MANAGER_NAME.displayName);
  assert.equal(db.records.get(`users/${manager.userId}`).phone, '09293794717');
  for (let index = 0; index < 5; index++) {
    const id = fixtures.credentials[index].userId;
    const user = db.records.get(`users/${id}`);
    assert.equal(user.displayName, BETA_MEMBER_PROFILES[index].displayName);
    assert.equal(user.phone, BETA_PHONES[index]);
    assert.equal(db.records.get(`account_identifiers/${phoneIdentifierId(user.phone)}`).userId, id);
    assert.equal(db.records.has(`account_identifiers/${phoneIdentifierId(`0900000000${index + 1}`)}`), false);
    assert.deepEqual(db.records.get(`user_credentials/${id}`), before.get(`user_credentials/${id}`));
  }
  for (const [key, value] of before) {
    if (/^(fields|crop_cycles|operation_logs|block_farms|sra_prices)\//.test(key)) assert.deepEqual(db.records.get(key), value);
  }
  await updateBetaProfiles(db, { execute: true });
  assert.equal(planBetaData(inventory(db), 'remove').userIds.length, 6);
});

test('profile phone collision fails before any writes to beta accounts or identifiers', async () => {
  const { db, fixtures } = await initialized();
  await addBetaFarmManager(db, { phone: '09293794717', password: 'ExampleBeta!73' });
  db.records.get(`users/${fixtures.credentials[0].userId}`).phone = '09000000001';
  db.records.set('users/REAL', { role: 'MEMBER_FARMER', phone: BETA_PHONES[0] });
  const before = structuredClone([...db.records]);
  await assert.rejects(updateBetaProfiles(db, { execute: true }), /conflicts with another account/);
  assert.deepEqual([...db.records], before);
});

test('shared beta password enables all six accounts with distinct hashes and preserves protected records', async () => {
  const { db } = await initialized();
  await addBetaFarmManager(db, { phone: '09293794717', password: 'ExampleBeta!73' });
  const before = new Map(structuredClone([...db.records]));
  assert.equal((await setBetaPasswords(db, 'Test1234')).length, 6);
  assert.deepEqual([...db.records], [...before]);
  const accounts = await setBetaPasswords(db, 'Test1234', { execute: true });
  const hashes = new Set();
  for (const account of accounts) {
    const credential = db.records.get(`user_credentials/${account.userId}`);
    assert.equal(await verifyPassword('Test1234', credential.passwordHash), true);
    hashes.add(credential.passwordHash);
    const user = db.records.get(`users/${account.userId}`);
    assert.equal(user.requiresPasswordChange, false);
    assert.equal(user.authVersion, before.get(`users/${account.userId}`).authVersion + 1);
    assert.ok(user.phoneVerifiedAt);
    assert.deepEqual(account.platforms, user.role === 'FARM_MANAGER' ? ['web', 'mobile'] : ['mobile']);
  }
  assert.equal(hashes.size, 6);
  for (const [key, value] of before) {
    if (/^(fields|crop_cycles|operation_logs|block_farms|sra_prices)\//.test(key)
      || ['users/01848867', 'users/02136633', 'user_credentials/01848867'].includes(key)) assert.deepEqual(db.records.get(key), value);
  }
  assert.ok((await setBetaPasswords(db, 'Test1234', { execute: true })).every(account => account.changed === false));
});

test('beta password reset refuses protected accounts in the manifest before any writes', async () => {
  const { db } = await initialized();
  await addBetaFarmManager(db, { phone: '09293794717', password: 'ExampleBeta!73' });
  db.records.get(`system_metadata/${MARKER_ID}`).userIds[0] = '01848867';
  const before = structuredClone([...db.records]);
  await assert.rejects(setBetaPasswords(db, 'Test1234', { execute: true }), /Only active, verified beta/);
  assert.deepEqual([...db.records], before);
});
