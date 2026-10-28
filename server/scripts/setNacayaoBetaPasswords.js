'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { BATCH_ID, MARKER_ID, fingerprint } = require('../services/betaDataService');
const { hashPassword, validatePassword, verifyPassword } = require('../security/password');
const { queueAuditEvent } = require('../services/auditWriter');
const { inventoryDatabase, saveRecoveryBackup } = require('./manageNacayaoBetaData');
const { _test: { encodeValue } } = require('../services/backupService');

async function setBetaPasswords(database, password, { execute = false } = {}) {
  validatePassword(password);
  const hashes = await Promise.all(Array.from({ length: 6 }, () => hashPassword(password)));
  return database.runTransaction(async transaction => {
    const marker = await transaction.get(database.collection('system_metadata').doc(MARKER_ID));
    if (!marker.exists || marker.data().status !== 'ACTIVE' || marker.data().betaBatchId !== BATCH_ID) throw new Error('An ACTIVE beta batch is required.');
    const ids = [...new Set(marker.data().userIds)];
    if (ids.length !== 6) throw new Error('Expected exactly the six beta accounts.');
    const reads = [];
    for (const id of ids) {
      const userRef = database.collection('users').doc(id);
      const credentialRef = database.collection('user_credentials').doc(id);
      const [user, credential] = await Promise.all([transaction.get(userRef), transaction.get(credentialRef)]);
      const data = user.data();
      if (!user.exists || !credential.exists || data.isBetaData !== true || data.betaBatchId !== BATCH_ID
        || !['FARM_MANAGER', 'MEMBER_FARMER'].includes(data.role) || data.status !== 'ACTIVE' || !data.phoneVerifiedAt) {
        throw new Error('Only active, verified beta Farm Manager and Farm Member accounts may be reset.');
      }
      reads.push({ id, userRef, credentialRef, user: data, credential: credential.data() });
    }
    if (reads.filter(row => row.user.role === 'MEMBER_FARMER').length !== 5
      || !reads.some(row => row.id === marker.data().betaManagerUserId && row.user.role === 'FARM_MANAGER')) throw new Error('Unexpected beta role assignment.');
    const changed = await Promise.all(reads.map(async row => row.user.requiresPasswordChange === true
      || !await verifyPassword(password, row.credential.passwordHash)));
    const accounts = reads.map((row, index) => ({ userId: row.id, name: row.user.displayName, phone: row.user.phone,
      role: row.user.role, platforms: row.user.role === 'FARM_MANAGER' ? ['web', 'mobile'] : ['mobile'], changed: changed[index] }));
    if (!execute) return accounts;
    const now = new Date().toISOString();
    reads.forEach((row, index) => {
      if (!changed[index]) return;
      transaction.update(row.credentialRef, { passwordHash: hashes[index], credentialsUpdatedAt: now, updatedAt: now });
      const version = Number(row.user.authVersion);
      transaction.update(row.userRef, { requiresPasswordChange: false, passwordChangedAt: now,
        credentialsUpdatedAt: now, authVersion: Number.isInteger(version) && version > 0 ? version + 1 : 2, updatedAt: now });
    });
    if (changed.some(Boolean)) queueAuditEvent(transaction, database, {
      eventType: 'BETA_PASSWORDS_UPDATED', actorUserId: 'SYSTEM_MAINTENANCE', entityType: 'BLOCK_FARM',
      entityId: marker.data().blockFarmId, blockFarmId: marker.data().blockFarmId,
      details: 'Updated six beta account passwords at user request; no first-login password change required. Previous API sessions revoked.', createdAt: now
    });
    return accounts;
  });
}

async function verifyLoginHandler(accounts, password) {
  const router = require('../routes/auth');
  const handler = router.stack.find(layer => layer.route?.path === '/login' && layer.route.methods.post).route.stack.at(-1).handle;
  const results = [];
  for (const account of accounts) for (const platform of account.platforms) {
    const req = { body: { identifier: account.phone, password }, session: {}, ip: 'beta-credential-verification',
      headers: { 'x-client-platform': platform, 'x-client-instance-id': 'beta-credential-verification' } };
    const res = { locals: {}, statusCode: 200, status(code) { this.statusCode = code; return this; },
      json(body) { this.body = body; return this; }, set() { return this; } };
    await handler(req, res);
    if (res.statusCode !== 200 || !res.body?.success || res.body.user?.employeeId !== account.userId
      || res.body.user?.phoneVerified !== true || res.body.user?.requiresPasswordChange !== false
      || (platform === 'mobile' && !res.body.firebaseCustomToken)) throw new Error(`Login verification failed for ${account.userId} on ${platform}.`);
    results.push({ userId: account.userId, platform, loginVerified: true });
  }
  return results;
}

async function main() {
  const args = process.argv.slice(2);
  const execute = args.includes('--execute');
  const project = args.find(arg => arg.startsWith('--project='))?.slice('--project='.length);
  const password = args.find(arg => arg.startsWith('--password='))?.slice('--password='.length) || process.env.HUGPONG_BETA_PASSWORD;
  const { db, admin } = require('../firebase-admin');
  const projectId = admin.app().options.projectId;
  if (execute && project !== projectId) throw new Error('Execution requires the exact --project=<Firebase project>.');
  const plan = await setBetaPasswords(db, password);
  console.log(JSON.stringify({ projectId, execute, accounts: plan }, null, 2));
  if (!execute) return;
  const before = await inventoryDatabase(db);
  const directory = path.resolve(__dirname, '../../output/private-beta', `passwords-${new Date().toISOString().replace(/[:.]/g, '-')}-${crypto.randomBytes(3).toString('hex')}`);
  const backupPath = saveRecoveryBackup(directory, { projectId, mode: 'beta-passwords', collections: encodeValue(before) });
  const accounts = await setBetaPasswords(db, password, { execute: true });
  const credentialsPath = path.join(directory, 'beta-accounts.json');
  fs.writeFileSync(credentialsPath, JSON.stringify({ betaBatchId: BATCH_ID, accounts: accounts.map(account => ({ ...account, password })) }, null, 2), { flag: 'wx', mode: 0o600 });
  const after = await inventoryDatabase(db);
  const ids = new Set(accounts.map(account => account.userId));
  for (const collection of ['users', 'user_credentials', 'account_identifiers', 'fields', 'crop_cycles', 'operation_logs', 'block_farms', 'sra_prices']) {
    const live = new Map((after[collection] || []).map(row => [row.id, row.data]));
    for (const row of before[collection] || []) {
      if (['users', 'user_credentials'].includes(collection) && ids.has(row.id)) continue;
      if (fingerprint(live.get(row.id)) !== fingerprint(row.data)) throw new Error(`Unexpected change: ${collection}/${row.id}.`);
    }
  }
  const privateRoot = path.resolve(__dirname, '../../output/private-beta');
  for (const entry of fs.readdirSync(privateRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    for (const filename of ['beta-credentials.json', 'manager-credentials.json', 'beta-accounts.json']) {
      const file = path.join(privateRoot, entry.name, filename);
      if (!fs.existsSync(file)) continue;
      const contents = JSON.parse(fs.readFileSync(file, 'utf8'));
      let changed = false;
      for (const record of contents.members || contents.accounts || [contents]) {
        if (ids.has(record.userId)) { record.password = password; changed = true; }
      }
      if (changed) fs.writeFileSync(file, JSON.stringify(contents, null, 2), { mode: 0o600 });
    }
  }
  const logins = await verifyLoginHandler(accounts, password);
  const result = { verified: true, accounts, logins, credentialsPath, backupPath };
  fs.writeFileSync(path.join(directory, 'result.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
}

if (require.main === module) main().catch(error => { console.error(`[Beta passwords] ${error.message}`); process.exitCode = 1; });
module.exports = { setBetaPasswords, verifyLoginHandler };
