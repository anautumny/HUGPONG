'use strict';

const crypto = require('crypto');
const { COLLECTIONS, ROLES, canonicalRole, cropYearParts, createCycleId, createOperationLogId, buildOperationLog } = require('../schema/firestoreSchema');
const { createUserId, createFieldId } = require('../domain/systemIds');
const { SRA_OPERATIONS_CATALOGUE } = require('../domain/operationCatalogue');
const { normalizeStructuredName } = require('../domain/personName');
const { hashPassword } = require('../security/password');
const { phoneIdentifierId, queueUserAccountCreation } = require('./accountProvisioningService');
const { BETA_PHONES } = require('../domain/betaPhones');
const { BETA_MANAGER_NAME, BETA_MEMBER_PROFILES } = require('../domain/betaProfiles');
const { _test: { encodeValue } } = require('./backupService');

const BATCH_ID = 'NACAYAO-BETA-2026-01';
const MARKER_ID = 'beta-nacayao-2026-01';
const PROTECTED_NAMES = ['matt daniel delotavo', 'john benedict miranda'];
const ANCILLARY = [
  'user_credentials', 'account_identifiers', 'server_sessions', 'otp_challenges',
  'password_recovery_challenges', 'password_recovery_reviews', 'mutation_receipts',
  'notification_states', 'terminal_diagnostics', 'diagnostic_events', 'security_rate_limits',
  'support_tickets'
];
const rows = (inventory, collection) => inventory[collection] || [];
const isProtected = row => [ROLES.SUPER_ADMIN, ROLES.SRA_ADMIN].includes(canonicalRole(row.data.role))
  || PROTECTED_NAMES.includes(String(row.data.displayName || '').trim().replace(/\s+/g, ' ').toLowerCase());
function fingerprint(value) {
  const canonical = item => Array.isArray(item) ? item.map(canonical)
    : item && typeof item === 'object' ? Object.fromEntries(Object.keys(item).sort().map(key => [key, canonical(item[key])])) : item;
  return crypto.createHash('sha256').update(JSON.stringify(canonical(encodeValue(value)))).digest('hex');
}

// Deliberately scoped to known IDs, including IDs embedded in notification and receipt keys.
function references(value, ids) {
  if (typeof value === 'string') return [...ids].some(id => value === id || (id.length >= 8 && value.includes(id)));
  if (Array.isArray(value)) return value.some(item => references(item, ids));
  if (value && typeof value === 'object') return Object.values(value).some(item => references(item, ids));
  return false;
}

function planBetaData(inventory, mode) {
  if (!['initialize', 'remove'].includes(mode)) throw new Error('Mode must be initialize or remove.');
  const farms = rows(inventory, COLLECTIONS.BLOCK_FARMS);
  const matching = farms.filter(row => /\bNACAYAO\b/i.test(row.data.name || ''));
  if (matching.length !== 1 || matching[0].data.status !== 'ACTIVE') throw new Error('Exactly one ACTIVE NACAYAO block farm is required.');
  const farm = matching[0];
  const users = rows(inventory, COLLECTIONS.USERS);
  for (const name of PROTECTED_NAMES) {
    if (!users.some(row => String(row.data.displayName || '').trim().replace(/\s+/g, ' ').toLowerCase() === name)) {
      throw new Error(`Protected account was not found: ${name}.`);
    }
  }
  const marker = rows(inventory, COLLECTIONS.SYSTEM_METADATA).find(row => row.id === MARKER_ID);
  if (mode === 'initialize' && marker) throw new Error('This beta batch was already initialized. Refusing to reset newly added real data.');
  if (mode === 'remove' && !marker) throw new Error('The beta batch has not been initialized.');
  const targets = new Map();
  const add = (collection, row) => targets.set(`${collection}/${row.id}`, { collection, ...row });
  const removedUsers = users.filter(row => !isProtected(row) && (mode === 'initialize'
    ? [ROLES.FARM_MANAGER, ROLES.MEMBER_FARMER].includes(canonicalRole(row.data.role))
    : row.data.betaBatchId === BATCH_ID || marker.data.userIds.includes(row.id)));
  if (mode === 'initialize' && users.some(row => !canonicalRole(row.data.role))) throw new Error('Unknown user role requires manual review.');
  removedUsers.forEach(row => add(COLLECTIONS.USERS, row));
  const userIds = new Set(removedUsers.map(row => row.id));
  if (mode === 'remove') marker.data.userIds.forEach(id => userIds.add(id));
  if (users.some(row => userIds.has(row.id) && isProtected(row))) throw new Error('A protected account entered the beta removal scope.');
  const unassignFarms = mode === 'remove' ? farms.filter(row => userIds.has(row.data.managerUserId)) : [];
  const removedFarms = mode === 'initialize' ? farms.filter(row => row.id !== farm.id) : [];
  removedFarms.forEach(row => add(COLLECTIONS.BLOCK_FARMS, row));
  const farmIds = new Set(removedFarms.map(row => row.id));
  const fields = rows(inventory, COLLECTIONS.FIELDS).filter(row => mode === 'initialize'
    || row.data.betaBatchId === BATCH_ID || marker.data.fieldIds.includes(row.id) || userIds.has(row.data.memberUserId));
  // A real owner can be assigned after beta begins. Never silently delete that owner's field.
  if (mode === 'remove' && fields.some(row => row.data.memberUserId && !userIds.has(row.data.memberUserId))) {
    throw new Error('A beta field now belongs to a real account. Reassign or review it before removal.');
  }
  fields.forEach(row => add(COLLECTIONS.FIELDS, row));
  const fieldIds = new Set(fields.map(row => row.id));
  if (mode === 'remove') marker.data.fieldIds.forEach(id => fieldIds.add(id));
  const related = new Set([...userIds, ...farmIds, ...fieldIds]);
  for (const collection of [COLLECTIONS.CROP_CYCLES, COLLECTIONS.OPERATION_LOGS]) {
    for (const row of rows(inventory, collection)) {
      if (mode === 'initialize' || row.data.betaBatchId === BATCH_ID || fieldIds.has(row.data.fieldId)
        || related.has(row.data.submittedByUserId) || related.has(row.data.farmMemberId)) {
        add(collection, row); related.add(row.id);
      }
    }
  }
  for (const collection of [COLLECTIONS.AUDIT_REPORTS, COLLECTIONS.CROP_YEAR_COMPILATIONS]) {
    for (const row of rows(inventory, collection)) {
      if (mode === 'initialize' || row.data.betaBatchId === BATCH_ID || references(row.data, related)) {
        if (mode === 'remove') {
          const sources = [...(row.data.fieldSnapshots || []), ...(row.data.operationSnapshots || [])];
          if (sources.some(source => source.fieldId && !fieldIds.has(source.fieldId))) {
            throw new Error('A report mixes beta and real fields. Review the report before removing beta data.');
          }
          const logIds = row.data.sourceLogIds || [];
          if (logIds.some(id => !related.has(id))) throw new Error('A report includes non-beta operations. Review before removal.');
        }
        add(collection, row); related.add(row.id);
      }
    }
  }
  // Phone-bound challenges must also go, without touching protected users' challenges.
  const artifactIds = new Set([...related, ...removedUsers.map(row => row.data.phone).filter(Boolean)]);
  for (const collection of ANCILLARY) {
    for (const row of rows(inventory, collection)) {
      if (references(row.id, artifactIds) || references(row.data, artifactIds)) add(collection, row);
    }
  }
  // Retain immutable audit history and prior recovery records as historical evidence.
  const protectedRows = users.filter(isProtected);
  const prices = rows(inventory, COLLECTIONS.SRA_PRICES);
  const deletions = [...targets.values()];
  if (deletions.some(row => row.collection === COLLECTIONS.SRA_PRICES
    || (row.collection === COLLECTIONS.USERS && isProtected(row)))) throw new Error('Protected data entered the deletion plan.');
  return { mode, farm, marker, deletions, unassignFarms, protectedRows, prices, userIds: [...userIds],
    summary: { mode, batchId: BATCH_ID, retainedFarm: { id: farm.id, name: farm.data.name },
      protectedAccounts: protectedRows.map(row => ({ id: row.id, name: row.data.displayName })),
      preservedPrices: prices.length, unassignFarmIds: unassignFarms.map(row => row.id), deletions: Object.fromEntries([...new Set(deletions.map(row => row.collection))]
        .sort().map(collection => [collection, deletions.filter(row => row.collection === collection).length])),
      seed: mode === 'initialize' ? { members: 5, fields: 5, cycles: 5, operations: 30, areaHa: 7.5, manager: null } : null } };
}

async function buildBetaFixtures(farm, now = new Date().toISOString()) {
  const annual = cropYearParts(null, now);
  if (Number(farm.data.declaredAreaHa ?? farm.data.declaredHa) < 7.5) throw new Error('NACAYAO requires at least 7.5 hectares for these fixtures.');
  const creates = [];
  const credentials = [];
  const tag = { betaBatchId: BATCH_ID, isBetaData: true };
  const put = (collection, id, data) => creates.push({ collection, id, data: { ...data, ...tag } });
  const issuedIds = new Set();
  for (let index = 1; index <= 5; index++) {
    let userId;
    do { userId = createUserId(ROLES.MEMBER_FARMER); } while (issuedIds.has(userId));
    issuedIds.add(userId);
    const fieldId = createFieldId();
    const cycleId = createCycleId(fieldId, 1);
    const areaHa = 0.75 + index * 0.25;
    const password = `Beta!7a${crypto.randomBytes(12).toString('base64url')}`;
    const name = normalizeStructuredName(BETA_MEMBER_PROFILES[index - 1]);
    const phone = BETA_PHONES[index - 1];
    // Reserved fixture phones satisfy the normal identity schema; the gateway blocks delivery.
    put(COLLECTIONS.USERS, userId, { ...name, phone, role: ROLES.MEMBER_FARMER, status: 'ACTIVE',
      affiliatedBlockFarmId: farm.id, phoneVerifiedAt: now, phoneVerificationStatus: 'VERIFIED',
      phoneVerificationMethod: 'BETA_FIXTURE', requiresPasswordChange: false, passwordChangedAt: now,
      authVersion: 1, credentialsUpdatedAt: now, disabledAt: null, approvedByUserId: null, approvedAt: now,
      createdAt: now, updatedAt: now });
    put(COLLECTIONS.USER_CREDENTIALS, userId, { passwordHash: await hashPassword(password), credentialsUpdatedAt: now, createdAt: now, updatedAt: now });
    put(COLLECTIONS.ACCOUNT_IDENTIFIERS, phoneIdentifierId(phone), { type: 'PHONE', userId, createdAt: now, updatedAt: now });
    put(COLLECTIONS.FIELDS, fieldId, { blockFarmId: farm.id, memberUserId: userId, areaHa,
      cropYear: annual.cropYear, currentCycleId: cycleId, status: 'ACTIVE', customStages: [],
      customOperations: {}, operationSchedule: [], createdAt: now, updatedAt: now, archivedAt: null });
    put(COLLECTIONS.CROP_CYCLES, cycleId, { fieldId, blockFarmId: farm.id, farmMemberId: userId,
      sequenceNumber: 1, cropType: 'Plant Cane (New Plant)', variety: index > 1 ? 'PHIL 2006-2289' : '', ...annual,
      currentStageNumber: index, elapsedMonths: 0, batchNumber: 1, status: 'ACTIVE', startedAt: new Date(Date.parse(now) - (index - 1) * 86400000).toISOString(),
      updatedAt: now, archivedAt: null, archivedByUserId: null, completedAt: null });
    for (const definition of SRA_OPERATIONS_CATALOGUE.filter(operation => operation.stageNumber <= index)) {
      const performedOn = new Date(Date.parse(now) - (index - definition.stageNumber) * 86400000).toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
      put(COLLECTIONS.OPERATION_LOGS, createOperationLogId(fieldId), buildOperationLog({
        fieldId, cycleId, blockFarmId: farm.id, cropYearCycle: annual.cropYear,
        stageNumberAtRecord: definition.stageNumber, submittedByUserId: userId, submissionSource: 'MEMBER',
        operationDefinitionId: definition.id, operationName: definition.name, category: definition.category,
        stageNumber: definition.stageNumber, performedOn, areaHa, peopleCount: 2,
        variety: definition.stageNumber === 2 ? 'PHIL 2006-2289' : '',
        baseCost: 0, totalCost: 1000, lineItems: [],
        laborEntries: [{ laborEntryId: `BETA-LABOR-${index}-${definition.id}`, workerCount: 2, days: 1, rate: 500, subtotal: 1000 }]
      }, { now }));
    }
    credentials.push({ userId, name: name.displayName, password, fieldId, areaHa, stage: index });
  }
  return { creates, credentials };
}

async function applyBetaPlan(database, inventory, plan, fixtures, backupPath) {
  const markerRef = database.collection(COLLECTIONS.SYSTEM_METADATA).doc(MARKER_ID);
  const now = new Date().toISOString();
  const creates = fixtures?.creates || [];
  if (plan.deletions.length + creates.length + plan.unassignFarms.length + 3 > 450) throw new Error('Plan exceeds the atomic maintenance limit; no changes applied.');
  await database.runTransaction(async transaction => {
    // Query reads detect edits and newly added records since backup, so an active client cannot be silently overwritten.
    for (const collection of Object.values(COLLECTIONS)) {
      const live = await transaction.get(database.collection(collection));
      const expected = rows(inventory, collection);
      const expectedMap = new Map(expected.map(row => [row.id, fingerprint(row.data)]));
      if (live.size !== expected.length || live.docs.some(doc => expectedMap.get(doc.id) !== fingerprint(doc.data()))) {
        throw new Error(`Collection ${collection} changed after backup. Retry with a fresh backup.`);
      }
    }
    for (const row of creates) {
      if (rows(inventory, row.collection).some(existing => existing.id === row.id)) throw new Error('Generated fixture ID collision; retry.');
    }
    for (const row of plan.deletions) transaction.delete(database.collection(row.collection).doc(row.id));
    for (const row of creates) transaction.create(database.collection(row.collection).doc(row.id), row.data);
    if (plan.mode === 'initialize') {
      transaction.update(database.collection(COLLECTIONS.BLOCK_FARMS).doc(plan.farm.id), { managerUserId: null, updatedAt: now });
      transaction.create(markerRef, { type: 'BETA_DATA_BATCH', betaBatchId: BATCH_ID, status: 'ACTIVE', createdAt: now,
        blockFarmId: plan.farm.id, userIds: fixtures.credentials.map(row => row.userId), fieldIds: fixtures.credentials.map(row => row.fieldId),
        initialRemovedUserIds: plan.userIds, pendingAuthUserIds: plan.userIds, backupPath });
    } else {
      for (const farm of plan.unassignFarms) {
        transaction.update(database.collection(COLLECTIONS.BLOCK_FARMS).doc(farm.id), { managerUserId: null, updatedAt: now });
      }
      transaction.update(markerRef, { status: 'REMOVED', removedAt: now, pendingAuthUserIds: plan.userIds, removalBackupPath: backupPath });
    }
    transaction.create(database.collection(COLLECTIONS.AUDIT_LOGS).doc(`BETA-${plan.mode.toUpperCase()}-${crypto.randomBytes(10).toString('hex').toUpperCase()}`), {
      eventType: plan.mode === 'initialize' ? 'BETA_DATA_INITIALIZED' : 'BETA_DATA_REMOVED', actorUserId: 'SYSTEM_MAINTENANCE',
      entityType: 'BLOCK_FARM', entityId: plan.farm.id, blockFarmId: plan.farm.id,
      details: JSON.stringify(plan.summary), createdAt: now
    });
  });
}

async function addBetaFarmManager(database, { phone, password, credentialsPath, now = new Date().toISOString() }) {
  const identifierId = phoneIdentifierId(phone);
  const userId = createUserId(ROLES.FARM_MANAGER);
  const markerRef = database.collection(COLLECTIONS.SYSTEM_METADATA).doc(MARKER_ID);
  const name = BETA_MANAGER_NAME;
  const user = { ...name, phone, role: ROLES.FARM_MANAGER, status: 'ACTIVE',
    affiliatedBlockFarmId: null, phoneVerifiedAt: now, phoneVerificationStatus: 'VERIFIED',
    phoneVerificationMethod: 'BETA_FIXTURE', phoneVerificationRequestedAt: null,
    phoneVerificationReviewRequestedByUser: false, phoneVerifiedByUserId: null,
    phoneVerificationReasonCode: 'BETA_USER_REQUEST',
    phoneVerificationReason: 'User explicitly requested a beta Farm Manager with no SMS verification.',
    requiresPasswordChange: false, passwordChangedAt: now, authVersion: 1, credentialsUpdatedAt: now,
    disabledAt: null, approvedByUserId: null, approvedAt: now, createdAt: now, updatedAt: now,
    farmAssignmentUpdatedAt: now, isBetaData: true, betaBatchId: BATCH_ID };
  const credential = { passwordHash: await hashPassword(password), createdAt: now, updatedAt: now, credentialsUpdatedAt: now,
    isBetaData: true, betaBatchId: BATCH_ID };
  return database.runTransaction(async transaction => {
    const marker = await transaction.get(markerRef);
    if (!marker.exists || marker.data().status !== 'ACTIVE' || marker.data().betaBatchId !== BATCH_ID) {
      throw new Error('An ACTIVE NACAYAO beta batch is required.');
    }
    const farmRef = database.collection(COLLECTIONS.BLOCK_FARMS).doc(marker.data().blockFarmId);
    const [farm, samePhone, identifier, existingId] = await Promise.all([
      transaction.get(farmRef),
      transaction.get(database.collection(COLLECTIONS.USERS).where('phone', '==', phone)),
      transaction.get(database.collection(COLLECTIONS.ACCOUNT_IDENTIFIERS).doc(identifierId)),
      transaction.get(database.collection(COLLECTIONS.USERS).doc(userId))
    ]);
    if (!farm.exists || farm.data().status !== 'ACTIVE' || !/\bNACAYAO\b/i.test(farm.data().name || '')) {
      throw new Error('The beta batch must reference the ACTIVE NACAYAO block farm.');
    }
    if (farm.data().managerUserId) throw new Error('NACAYAO already has a Farm Manager; no assignment was replaced.');
    if (!samePhone.empty || identifier.exists) throw new Error('Phone is already registered; no account was replaced.');
    if (existingId.exists) throw new Error('Generated User ID is already used; retry.');
    queueUserAccountCreation(transaction, database, { user, credential, actorUserId: 'SYSTEM_MAINTENANCE',
      eventType: 'BETA_FARM_MANAGER_CREATED', details: 'Created and assigned the user-requested beta Farm Manager to NACAYAO; SMS verification waived for this account.' }, userId);
    transaction.update(farmRef, { managerUserId: userId, updatedAt: now });
    transaction.update(markerRef, { userIds: [...new Set([...marker.data().userIds, userId])],
      betaManagerUserId: userId, betaManagerCredentialsPath: credentialsPath || null, updatedAt: now });
    return { userId, name: user.displayName, phone, role: user.role, blockFarmId: farm.id, phoneVerified: true,
      requiresPasswordChange: false, betaBatchId: BATCH_ID };
  });
}

module.exports = { BATCH_ID, MARKER_ID, isProtected, fingerprint, references, planBetaData, buildBetaFixtures, applyBetaPlan, addBetaFarmManager };
