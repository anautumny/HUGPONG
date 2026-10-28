'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { inventoryDatabase, saveRecoveryBackup } = require('./manageNacayaoBetaData');
const { _test: { encodeValue } } = require('../services/backupService');
const { BATCH_ID, MARKER_ID, addBetaFarmManager, fingerprint, planBetaData } = require('../services/betaDataService');
const { verifyPassword } = require('../security/password');
const { resolveAccountAssignments } = require('../services/accountAuthorization');
const { listOperationPage } = require('../services/operationQueryService');
const { isRoleAllowedOnPlatform } = require('../schema/firestoreSchema');
const { BETA_MANAGER_NAME } = require('../domain/betaProfiles');

async function main() {
  const args = process.argv.slice(2);
  const execute = args.includes('--execute');
  const project = args.find(arg => arg.startsWith('--project='))?.slice('--project='.length);
  const phone = args.find(arg => arg.startsWith('--phone='))?.slice('--phone='.length);
  if (!/^09\d{9}$/.test(phone || '')) throw new Error('Provide --phone=<Philippine mobile number>.');
  const { db, admin } = require('../firebase-admin');
  const projectId = admin.app().options.projectId;
  if (execute && projectId !== project) throw new Error('Provide --project=<exact active Firebase project>.');
  const before = await inventoryDatabase(db);
  const plan = planBetaData(before, 'remove'); // Also validates the protected accounts and canonical beta batch.
  const { farm, marker } = plan;
  const existing = before.users.find(row => row.data.phone === phone);
  if (existing && existing.id === marker.data.betaManagerUserId && existing.data.betaBatchId === BATCH_ID
    && existing.data.role === 'FARM_MANAGER' && existing.data.status === 'ACTIVE' && farm.data.managerUserId === existing.id) {
    console.log(JSON.stringify({ alreadyCreated: true, userId: existing.id, name: existing.data.displayName,
      phone, credentialsPath: marker.data.betaManagerCredentialsPath }, null, 2));
    return;
  }
  if (existing) throw new Error('Phone already belongs to an account. No changes made.');
  if (farm.data.managerUserId) throw new Error('NACAYAO already has a Farm Manager. No changes made.');
  console.log(JSON.stringify({ projectId, execute, name: BETA_MANAGER_NAME.displayName, phone,
    role: 'FARM_MANAGER', blockFarmId: farm.id, phoneVerification: 'Waived per user request', betaBatchId: BATCH_ID }, null, 2));
  if (!execute) return;
  const directory = path.resolve(__dirname, '../../output/private-beta', `add-manager-${new Date().toISOString().replace(/[:.]/g, '-')}-${crypto.randomBytes(3).toString('hex')}`);
  const backupPath = saveRecoveryBackup(directory, { format: 'HUGPONG_BETA_RECOVERY_V1', projectId,
    createdAt: new Date().toISOString(), mode: 'add-manager', collections: encodeValue(before) });
  const password = `Nacayao!7${crypto.randomBytes(10).toString('base64url')}`;
  const credentialsPath = path.join(directory, 'manager-credentials.json');
  // Persist the password before the atomic creation, so interrupted output cannot lose login details.
  fs.writeFileSync(credentialsPath, JSON.stringify({ name: BETA_MANAGER_NAME.displayName, phone, password,
    platforms: ['web', 'mobile'], betaBatchId: BATCH_ID, status: 'PENDING_CREATION' }, null, 2), { flag: 'wx', mode: 0o600 });
  const result = await addBetaFarmManager(db, { phone, password, credentialsPath });
  fs.writeFileSync(credentialsPath, JSON.stringify({ ...result, password, platforms: ['web', 'mobile'], status: 'CREATED' }, null, 2), { mode: 0o600 });
  const credential = await db.collection('user_credentials').doc(result.userId).get();
  if (!await verifyPassword(password, credential.data().passwordHash)) throw new Error('Saved credential verification failed.');
  const assignment = await resolveAccountAssignments(db, result.userId, 'FARM_MANAGER');
  if (assignment.blockFarmId !== farm.id) throw new Error('Manager assignment verification failed.');
  for (const platform of ['web', 'mobile']) {
    if (!isRoleAllowedOnPlatform('FARM_MANAGER', platform)) throw new Error(`${platform} role verification failed.`);
  }
  const operations = await listOperationPage(db, { employeeId: result.userId, role: 'FARM_MANAGER' }, { status: 'ACTIVE', limit: 100 });
  if (operations.data.some(row => row.blockFarmId !== farm.id)) throw new Error('Manager operation scope verification failed.');
  const after = await inventoryDatabase(db);
  for (const collection of ['users', 'user_credentials', 'account_identifiers', 'sra_prices', 'fields', 'crop_cycles', 'operation_logs']) {
    const live = new Map((after[collection] || []).map(row => [row.id, row.data]));
    for (const row of before[collection] || []) {
      if (fingerprint(live.get(row.id)) !== fingerprint(row.data)) throw new Error(`Existing data changed: ${collection}/${row.id}.`);
    }
  }
  const removal = planBetaData(after, 'remove');
  if (!removal.userIds.includes(result.userId) || !removal.unassignFarms.some(row => row.id === farm.id)) throw new Error('Beta manager removal verification failed.');
  const verification = { ...result, verified: true, platforms: ['web', 'mobile'], operationsVisible: operations.data.length,
    pricesPreserved: after.sra_prices.length, betaRemovalVerified: true, credentialsPath, backupPath };
  fs.writeFileSync(path.join(directory, 'result.json'), JSON.stringify(verification, null, 2));
  console.log(JSON.stringify(verification, null, 2));
}

if (require.main === module) main().catch(error => { console.error(`[Beta Farm Manager] ${error.message}`); process.exitCode = 1; });
