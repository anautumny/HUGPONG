'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { BETA_MANAGER_NAME, BETA_MEMBER_PROFILES } = require('../domain/betaProfiles');
const { BATCH_ID, MARKER_ID, fingerprint } = require('../services/betaDataService');
const { phoneIdentifierId } = require('../services/accountProvisioningService');
const { queueAuditEvent } = require('../services/auditWriter');
const { inventoryDatabase, saveRecoveryBackup } = require('./manageNacayaoBetaData');
const { _test: { encodeValue } } = require('../services/backupService');

async function updateBetaProfiles(database, { execute = false } = {}) {
  return database.runTransaction(async transaction => {
    const markerRef = database.collection('system_metadata').doc(MARKER_ID);
    const marker = await transaction.get(markerRef);
    if (!marker.exists || marker.data().status !== 'ACTIVE' || marker.data().betaBatchId !== BATCH_ID) throw new Error('An ACTIVE beta batch is required.');
    const users = await transaction.get(database.collection('users'));
    const byId = new Map(users.docs.map(doc => [doc.id, doc]));
    const members = marker.data().userIds.map(id => byId.get(id)).filter(doc => doc?.data().role === 'MEMBER_FARMER');
    const manager = byId.get(marker.data().betaManagerUserId);
    if (members.length !== 5 || !manager || manager.data().role !== 'FARM_MANAGER') throw new Error('Expected five beta members and their beta manager.');
    const profiles = [...members.map((doc, index) => ({ doc, profile: BETA_MEMBER_PROFILES[index] })),
      { doc: manager, profile: { ...BETA_MANAGER_NAME, phone: manager.data().phone } }];
    const identityReads = [];
    for (const { doc, profile } of profiles) {
      const current = doc.data();
      if (current.betaBatchId !== BATCH_ID || current.isBetaData !== true) throw new Error('A non-beta account entered the update scope.');
      if (users.docs.some(other => other.id !== doc.id && other.data().phone === profile.phone)) throw new Error('Mock phone conflicts with another account.');
      const newRef = database.collection('account_identifiers').doc(phoneIdentifierId(profile.phone));
      const oldRef = database.collection('account_identifiers').doc(phoneIdentifierId(current.phone));
      const [newIdentifier, oldIdentifier] = await Promise.all([transaction.get(newRef), transaction.get(oldRef)]);
      if (newIdentifier.exists && newIdentifier.data().userId !== doc.id) throw new Error('Mock phone identifier is already owned by another account.');
      if (oldIdentifier.exists && oldIdentifier.data().userId !== doc.id) throw new Error('Current phone identifier has conflicting ownership.');
      identityReads.push({ doc, profile, newRef, oldRef, newIdentifier });
    }
    const now = new Date().toISOString();
    const result = profiles.map(({ doc, profile }) => ({ userId: doc.id, name: profile.displayName,
      phone: profile.phone, role: doc.data().role, mockPhone: doc.data().role === 'MEMBER_FARMER' }));
    if (!execute) return result;
    for (const { doc, profile, newRef, oldRef, newIdentifier } of identityReads) {
      if (fingerprint(Object.fromEntries(Object.keys(profile).map(key => [key, doc.data()[key]]))) === fingerprint(profile)) continue;
      transaction.update(doc.ref, { ...profile, updatedAt: now });
      if (newRef.path !== oldRef.path) transaction.delete(oldRef);
      if (!newIdentifier.exists) transaction.create(newRef, { type: 'PHONE', userId: doc.id, createdAt: now, updatedAt: now, betaBatchId: BATCH_ID });
    }
    queueAuditEvent(transaction, database, { eventType: 'BETA_PROFILES_UPDATED', actorUserId: 'SYSTEM_MAINTENANCE',
      entityType: 'BLOCK_FARM', entityId: marker.data().blockFarmId, blockFarmId: marker.data().blockFarmId,
      details: 'Assigned fictional full names and random mock PH-format member phone numbers at user request. Passwords, IDs and farm data retained.', createdAt: now });
    return result;
  });
}

async function main() {
  const args = process.argv.slice(2);
  const execute = args.includes('--execute');
  const project = args.find(arg => arg.startsWith('--project='))?.slice('--project='.length);
  const { db, admin } = require('../firebase-admin');
  const projectId = admin.app().options.projectId;
  if (execute && project !== projectId) throw new Error('Execution requires the exact --project=<Firebase project>.');
  const planned = await updateBetaProfiles(db);
  console.log(JSON.stringify({ projectId, execute, profiles: planned }, null, 2));
  if (!execute) return;
  const before = await inventoryDatabase(db);
  const directory = path.resolve(__dirname, '../../output/private-beta', `update-profiles-${new Date().toISOString().replace(/[:.]/g, '-')}-${crypto.randomBytes(3).toString('hex')}`);
  const backupPath = saveRecoveryBackup(directory, { projectId, mode: 'update-profiles', collections: encodeValue(before) });
  const result = await updateBetaProfiles(db, { execute: true });
  const after = await inventoryDatabase(db);
  const changedIds = new Set(result.map(profile => profile.userId));
  for (const collection of ['users', 'user_credentials', 'fields', 'crop_cycles', 'operation_logs', 'block_farms', 'sra_prices']) {
    const live = new Map((after[collection] || []).map(row => [row.id, row.data]));
    for (const row of before[collection] || []) {
      if (collection === 'users' && changedIds.has(row.id)) continue;
      if (fingerprint(live.get(row.id)) !== fingerprint(row.data)) throw new Error(`Unexpected change: ${collection}/${row.id}.`);
    }
  }
  const privateRoot = path.resolve(__dirname, '../../output/private-beta');
  const accounts = new Map();
  // Refresh the existing private login handouts without touching encrypted historical backups.
  for (const entry of fs.readdirSync(privateRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    for (const filename of ['beta-credentials.json', 'manager-credentials.json', 'beta-accounts.json']) {
      const file = path.join(privateRoot, entry.name, filename);
      if (!fs.existsSync(file)) continue;
      const contents = JSON.parse(fs.readFileSync(file, 'utf8'));
      const records = contents.members || contents.accounts || [contents];
      let changed = false;
      for (const record of records) {
        const profile = result.find(item => item.userId === record.userId);
        if (!profile) continue;
        Object.assign(record, profile);
        changed = true;
        if (record.password) accounts.set(record.userId, { ...record, ...profile });
      }
      if (changed) fs.writeFileSync(file, JSON.stringify(contents, null, 2), { mode: 0o600 });
    }
  }
  const credentialsPath = path.join(directory, 'beta-accounts.json');
  fs.writeFileSync(credentialsPath, JSON.stringify({ betaBatchId: BATCH_ID, accounts: [...accounts.values()] }, null, 2), { flag: 'wx', mode: 0o600 });
  console.log(JSON.stringify({ verified: true, profiles: result, credentialsPath, backupPath }, null, 2));
}

if (require.main === module) main().catch(error => { console.error(`[Beta profiles] ${error.message}`); process.exitCode = 1; });
module.exports = { updateBetaProfiles };
