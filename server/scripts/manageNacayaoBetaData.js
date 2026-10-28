'use strict';

// Explicit operator-only CLI. Never imported by the running API or either client.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
const { COLLECTIONS } = require('../schema/firestoreSchema');
const { _test: { encodeValue } } = require('../services/backupService');
const { BATCH_ID, MARKER_ID, fingerprint, planBetaData, buildBetaFixtures, applyBetaPlan } = require('../services/betaDataService');

async function inventoryDatabase(database) {
  const collections = await database.listCollections();
  const inventory = {};
  for (const collection of collections) {
    const snapshot = await collection.get();
    inventory[collection.id] = snapshot.docs.map(doc => ({ id: doc.id, data: doc.data() }));
  }
  return inventory;
}

async function listAuthentication(auth) {
  const users = [];
  let token;
  do {
    const page = await auth.listUsers(1000, token);
    users.push(...page.users.map(user => user.toJSON()));
    token = page.pageToken;
  } while (token);
  return users;
}

function saveRecoveryBackup(directory, payload) {
  fs.mkdirSync(directory, { recursive: true });
  const key = crypto.randomBytes(32);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const plaintext = Buffer.from(JSON.stringify(payload));
  const encrypted = Buffer.concat([cipher.update(zlib.gzipSync(plaintext)), cipher.final()]);
  const envelope = { format: 'HUGPONG_BETA_MAINTENANCE_BACKUP_V1', cipher: 'aes-256-gcm',
    iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: encrypted.toString('base64') };
  const archivePath = path.join(directory, 'recovery.hpbeta');
  const keyPath = path.join(directory, 'recovery.key');
  fs.writeFileSync(keyPath, key.toString('base64'), { flag: 'wx', mode: 0o600 });
  fs.writeFileSync(archivePath, JSON.stringify(envelope), { flag: 'wx', mode: 0o600 });
  // Verify the files actually written to disk before any database writes.
  const saved = JSON.parse(fs.readFileSync(archivePath, 'utf8'));
  const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(fs.readFileSync(keyPath, 'utf8'), 'base64'), Buffer.from(saved.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(saved.tag, 'base64'));
  const restored = zlib.gunzipSync(Buffer.concat([decipher.update(Buffer.from(saved.data, 'base64')), decipher.final()]));
  if (!restored.equals(plaintext)) throw new Error('Recovery backup verification failed.');
  return archivePath;
}

async function finishAuthenticationCleanup(database, auth) {
  const ref = database.collection(COLLECTIONS.SYSTEM_METADATA).doc(MARKER_ID);
  const marker = await ref.get();
  if (!marker.exists) return;
  for (const userId of marker.data().pendingAuthUserIds || []) {
    // A recreated/restored account must never lose its Firebase identity.
    const user = await database.collection(COLLECTIONS.USERS).doc(userId).get();
    if (user.exists) throw new Error(`Authentication cleanup stopped: account ${userId} exists.`);
    try { await auth.deleteUser(userId); }
    catch (error) { if (error.code !== 'auth/user-not-found') throw error; }
  }
  await database.runTransaction(async transaction => {
    const current = await transaction.get(ref);
    if (!current.exists || fingerprint(current.data().pendingAuthUserIds || []) !== fingerprint(marker.data().pendingAuthUserIds || [])) {
      throw new Error('Authentication cleanup marker changed; retry.');
    }
    transaction.update(ref, { pendingAuthUserIds: [], authenticationCleanedAt: new Date().toISOString() });
  });
}

async function verifyResult(database, auth, before, plan, fixtures) {
  const after = await inventoryDatabase(database);
  for (const collection of [COLLECTIONS.USERS, COLLECTIONS.USER_CREDENTIALS, COLLECTIONS.ACCOUNT_IDENTIFIERS, COLLECTIONS.SRA_PRICES]) {
    const protectedIds = new Set(plan.protectedRows.map(row => row.id));
    const expected = (before[collection] || []).filter(row => collection === COLLECTIONS.SRA_PRICES
      || protectedIds.has(row.id) || protectedIds.has(row.data.userId));
    for (const row of expected) {
      const live = (after[collection] || []).find(item => item.id === row.id);
      if (!live || fingerprint(live.data) !== fingerprint(row.data)) throw new Error(`Preservation check failed for ${collection}/${row.id}.`);
    }
    if (collection === COLLECTIONS.SRA_PRICES && (after[collection] || []).length !== expected.length) throw new Error('Price inventory changed during maintenance.');
  }
  for (const row of plan.deletions) {
    if ((after[row.collection] || []).some(item => item.id === row.id)) throw new Error(`Deletion verification failed: ${row.collection}/${row.id}.`);
  }
  const farms = after[COLLECTIONS.BLOCK_FARMS] || [];
  if (plan.mode === 'initialize' && (farms.length !== 1 || farms[0].id !== plan.farm.id || farms[0].data.managerUserId !== null)) {
    throw new Error('NACAYAO retention/manager verification failed.');
  }
  const userIds = new Set((after[COLLECTIONS.USERS] || []).map(row => row.id));
  const fieldIds = new Set((after[COLLECTIONS.FIELDS] || []).map(row => row.id));
  const cycles = after[COLLECTIONS.CROP_CYCLES] || [];
  const cycleIds = new Set(cycles.map(row => row.id));
  for (const row of after[COLLECTIONS.FIELDS] || []) {
    if (!farms.some(farm => farm.id === row.data.blockFarmId) || !cycleIds.has(row.data.currentCycleId)
      || (row.data.memberUserId && !userIds.has(row.data.memberUserId))) throw new Error('Dangling field assignment.');
  }
  for (const row of cycles) if (!fieldIds.has(row.data.fieldId)) throw new Error('Dangling crop cycle.');
  for (const row of after[COLLECTIONS.OPERATION_LOGS] || []) {
    if (!fieldIds.has(row.data.fieldId) || !cycleIds.has(row.data.cycleId) || !userIds.has(row.data.submittedByUserId)) throw new Error('Dangling operation.');
  }
  if (fixtures) for (const row of fixtures.creates) {
    const live = (after[row.collection] || []).find(item => item.id === row.id);
    if (!live || fingerprint(live.data) !== fingerprint(row.data)) throw new Error('Fixture verification failed.');
  }
  const authUsers = await listAuthentication(auth);
  if (authUsers.some(user => plan.userIds.includes(user.uid))) throw new Error('Removed account still has a Firebase identity.');
  return { verified: true, accounts: userIds.size, blockFarms: farms.length,
    fields: fieldIds.size, cycles: cycleIds.size, operations: (after[COLLECTIONS.OPERATION_LOGS] || []).length,
    prices: (after[COLLECTIONS.SRA_PRICES] || []).length, protectedAccountIds: plan.protectedRows.map(row => row.id) };
}

async function main(argv = process.argv.slice(2)) {
  const mode = argv.find(value => !value.startsWith('--')) || 'initialize';
  const execute = argv.includes('--execute');
  const expectedProject = argv.find(value => value.startsWith('--project='))?.slice('--project='.length);
  const { db, auth, admin } = require('../firebase-admin');
  const projectId = admin.app().options.projectId;
  if (!db || !auth) throw new Error('Firebase Admin is unavailable.');
  if (execute && (!expectedProject || expectedProject !== projectId)) throw new Error('Execution requires --project=<exact active Firebase project>.');
  const inventory = await inventoryDatabase(db);
  const existingMarker = (inventory[COLLECTIONS.SYSTEM_METADATA] || []).find(row => row.id === MARKER_ID);
  if (execute && existingMarker && (mode === 'initialize' || existingMarker.data.status === 'REMOVED')) {
    if (existingMarker.data.pendingAuthUserIds?.length) await finishAuthenticationCleanup(db, auth);
    console.log(JSON.stringify({ alreadyApplied: true, batchId: BATCH_ID, status: existingMarker.data.status,
      message: 'No data reset or re-seeding performed.' }, null, 2));
    return;
  }
  const plan = planBetaData(inventory, mode);
  console.log(JSON.stringify({ projectId, execute, ...plan.summary }, null, 2));
  if (!execute) return;
  // Refuse nested collections rather than leave unbacked or orphaned descendants.
  for (const row of plan.deletions) {
    const children = await db.collection(row.collection).doc(row.id).listCollections();
    if (children.length) throw new Error(`Nested data requires explicit handling: ${row.collection}/${row.id}.`);
  }
  const fixtures = mode === 'initialize' ? await buildBetaFixtures(plan.farm) : null;
  const authUsers = await listAuthentication(auth);
  const directory = path.resolve(__dirname, '../../output/private-beta', `${mode}-${new Date().toISOString().replace(/[:.]/g, '-')}-${crypto.randomBytes(3).toString('hex')}`);
  const backupPath = saveRecoveryBackup(directory, { format: 'HUGPONG_BETA_RECOVERY_V1', projectId,
    createdAt: new Date().toISOString(), mode, summary: plan.summary, collections: encodeValue(inventory),
    firebaseAuthUsers: authUsers, proposedCreates: encodeValue(fixtures?.creates || []) });
  if (fixtures) fs.writeFileSync(path.join(directory, 'beta-credentials.json'), JSON.stringify({ batchId: BATCH_ID,
    platform: 'mobile', loginWith: 'User ID', phone: 'Reserved fixture numbers; SMS and phone recovery are unavailable. Restart the API to load the beta SMS safeguard.',
    members: fixtures.credentials }, null, 2), { flag: 'wx', mode: 0o600 });
  console.log(`Verified recovery backup: ${backupPath}`);
  await applyBetaPlan(db, inventory, plan, fixtures, backupPath);
  await finishAuthenticationCleanup(db, auth);
  const result = await verifyResult(db, auth, inventory, plan, fixtures);
  // Also verify protected Firebase identities have not changed.
  const afterAuth = await listAuthentication(auth);
  for (const user of authUsers.filter(user => plan.protectedRows.some(row => row.id === user.uid))) {
    if (fingerprint(afterAuth.find(candidate => candidate.uid === user.uid)) !== fingerprint(user)) throw new Error('Protected Firebase identity changed.');
  }
  fs.writeFileSync(path.join(directory, 'result.json'), JSON.stringify({ ...result, projectId, batchId: BATCH_ID, mode, backupPath }, null, 2));
  console.log(JSON.stringify({ ...result, privateOutput: directory }, null, 2));
}

if (require.main === module) main().catch(error => { console.error(`[Beta maintenance] ${error.message}`); process.exitCode = 1; });
module.exports = { inventoryDatabase, saveRecoveryBackup, finishAuthenticationCleanup, verifyResult, main };
