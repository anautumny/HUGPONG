'use strict';

const { COLLECTIONS, ROLES, canonicalRole, nowIso } = require('../schema/firestoreSchema');
const { phoneIdentifierId } = require('./accountProvisioningService');
const { queueAuditEvent } = require('./auditWriter');

const MIGRATION_ACTOR_ID = 'SYSTEM_MIGRATION';

function recordMap(records = []) {
  return new Map(records.map(record => [String(record.id || '').trim(), record]));
}

function normalizedPhone(value) {
  const phone = String(value || '').replace(/\D/g, '');
  return /^09\d{9}$/.test(phone) ? phone : null;
}

function buildLegacyDataIntegrityReport({
  users = [],
  accountIdentifiers = [],
  credentials = [],
  blockFarms = [],
  fields = [],
  cropCycles = [],
  operationLogs = []
} = {}) {
  const usersById = recordMap(users);
  const identifiersById = recordMap(accountIdentifiers);
  const credentialsById = recordMap(credentials);
  const farmsById = recordMap(blockFarms);
  const fieldsById = recordMap(fields);
  const cyclesById = recordMap(cropCycles);
  const phoneOwners = new Map();
  const invalidUserPhones = [];

  for (const user of users) {
    const userId = String(user.id || '').trim();
    const phone = normalizedPhone(user.phone);
    if (!phone) {
      invalidUserPhones.push({ userId });
      continue;
    }
    const identifierId = phoneIdentifierId(phone);
    phoneOwners.set(identifierId, [...(phoneOwners.get(identifierId) || []), userId]);
  }

  const duplicatePhoneClaims = Array.from(phoneOwners.entries())
    .filter(([, userIds]) => userIds.length > 1)
    .map(([identifierId, userIds]) => ({ identifierId, userIds: [...userIds].sort() }));
  const duplicateIdentifierIds = new Set(duplicatePhoneClaims.map(item => item.identifierId));
  const identifierConflicts = [];
  const accountIdentifiersToCreate = [];

  for (const [identifierId, userIds] of phoneOwners) {
    if (duplicateIdentifierIds.has(identifierId)) continue;
    const userId = userIds[0];
    const existing = identifiersById.get(identifierId);
    if (!existing) {
      accountIdentifiersToCreate.push({ identifierId, userId });
    } else if (String(existing.userId || '').trim() !== userId || String(existing.type || '').trim().toUpperCase() !== 'PHONE') {
      identifierConflicts.push({
        identifierId,
        expectedUserId: userId,
        storedUserId: String(existing.userId || '').trim() || null,
        storedType: String(existing.type || '').trim() || null
      });
    }
  }

  const orphanedAccountIdentifiers = accountIdentifiers
    .filter(identifier => !usersById.has(String(identifier.userId || '').trim()))
    .map(identifier => ({
      identifierId: String(identifier.id || '').trim(),
      storedUserId: String(identifier.userId || '').trim() || null
    }));
  const usersMissingCredentials = users
    .filter(user => !credentialsById.has(String(user.id || '').trim()))
    .map(user => String(user.id || '').trim());
  const orphanedCredentials = credentials
    .filter(credential => !usersById.has(String(credential.id || '').trim()))
    .map(credential => String(credential.id || '').trim());

  const invalidUserRoles = users
    .filter(user => !canonicalRole(user.role))
    .map(user => ({ userId: String(user.id || '').trim(), storedRole: user.role ?? null }));
  const invalidFarmManagers = blockFarms.flatMap(farm => {
    const managerUserId = String(farm.managerUserId || '').trim();
    if (!managerUserId) return [];
    const manager = usersById.get(managerUserId);
    if (!manager || canonicalRole(manager.role) !== ROLES.FARM_MANAGER) {
      return [{ blockFarmId: String(farm.id || '').trim(), managerUserId, reason: manager ? 'ROLE_MISMATCH' : 'USER_NOT_FOUND' }];
    }
    return [];
  });
  const invalidFieldRelationships = fields.flatMap(field => {
    const findings = [];
    const fieldId = String(field.id || '').trim();
    const blockFarmId = String(field.blockFarmId || '').trim();
    const memberUserId = String(field.memberUserId || '').trim();
    if (!farmsById.has(blockFarmId)) findings.push({ fieldId, relation: 'BLOCK_FARM', referencedId: blockFarmId || null, reason: 'NOT_FOUND' });
    if (memberUserId) {
      const member = usersById.get(memberUserId);
      if (!member || canonicalRole(member.role) !== ROLES.MEMBER_FARMER) {
        findings.push({ fieldId, relation: 'MEMBER', referencedId: memberUserId, reason: member ? 'ROLE_MISMATCH' : 'USER_NOT_FOUND' });
      }
    }
    return findings;
  });
  const invalidCycleRelationships = cropCycles.flatMap(cycle => {
    const cycleId = String(cycle.id || '').trim();
    const fieldId = String(cycle.fieldId || '').trim();
    const field = fieldsById.get(fieldId);
    if (!field) return [{ cycleId, fieldId: fieldId || null, reason: 'FIELD_NOT_FOUND' }];
    if (String(cycle.blockFarmId || '').trim() && String(cycle.blockFarmId).trim() !== String(field.blockFarmId || '').trim()) {
      return [{ cycleId, fieldId, reason: 'BLOCK_FARM_MISMATCH' }];
    }
    return [];
  });
  const invalidCurrentCycleLinks = fields.flatMap(field => {
    const currentCycleId = String(field.currentCycleId || '').trim();
    if (!currentCycleId) return [];
    const cycle = cyclesById.get(currentCycleId);
    if (!cycle) return [{ fieldId: String(field.id || '').trim(), currentCycleId, reason: 'CYCLE_NOT_FOUND' }];
    if (String(cycle.fieldId || '').trim() !== String(field.id || '').trim()) {
      return [{ fieldId: String(field.id || '').trim(), currentCycleId, reason: 'FIELD_MISMATCH' }];
    }
    return [];
  });
  const invalidOperationRelationships = operationLogs.flatMap(operation => {
    const operationLogId = String(operation.id || '').trim();
    const fieldId = String(operation.fieldId || '').trim();
    const cycleId = String(operation.cycleId || '').trim();
    const field = fieldsById.get(fieldId);
    const cycle = cyclesById.get(cycleId);
    const findings = [];
    if (!field) findings.push({ operationLogId, relation: 'FIELD', referencedId: fieldId || null, reason: 'NOT_FOUND' });
    if (!cycle) findings.push({ operationLogId, relation: 'CYCLE', referencedId: cycleId || null, reason: 'NOT_FOUND' });
    else if (String(cycle.fieldId || '').trim() !== fieldId) {
      findings.push({ operationLogId, relation: 'CYCLE', referencedId: cycleId, reason: 'FIELD_MISMATCH' });
    }
    return findings;
  });

  const issues = {
    invalidUserPhones,
    duplicatePhoneClaims,
    identifierConflicts,
    orphanedAccountIdentifiers,
    usersMissingCredentials,
    orphanedCredentials,
    invalidUserRoles,
    invalidFarmManagers,
    invalidFieldRelationships,
    invalidCycleRelationships,
    invalidCurrentCycleLinks,
    invalidOperationRelationships
  };
  const issueCount = Object.values(issues).reduce((total, entries) => total + entries.length, 0);
  const phoneMigrationBlockerCount = invalidUserPhones.length
    + duplicatePhoneClaims.length
    + identifierConflicts.length
    + orphanedAccountIdentifiers.length;

  return {
    counts: {
      users: users.length,
      accountIdentifiers: accountIdentifiers.length,
      credentials: credentials.length,
      blockFarms: blockFarms.length,
      fields: fields.length,
      cropCycles: cropCycles.length,
      operationLogs: operationLogs.length,
      issues: issueCount,
      plannedIdentifierBackfills: accountIdentifiersToCreate.length
    },
    deploymentReady: issueCount === 0 && accountIdentifiersToCreate.length === 0,
    canApplyAccountIdentifierBackfill: phoneMigrationBlockerCount === 0,
    repairs: { accountIdentifiersToCreate },
    issues
  };
}

async function readCollection(database, collectionName) {
  const snapshot = await database.collection(collectionName).get();
  return snapshot.docs.map(document => ({ id: document.id, ...document.data() }));
}

async function auditLegacyData(database) {
  if (!database) throw new Error('Database is unavailable.');
  const [users, accountIdentifiers, credentials, blockFarms, fields, cropCycles, operationLogs] = await Promise.all([
    readCollection(database, COLLECTIONS.USERS),
    readCollection(database, COLLECTIONS.ACCOUNT_IDENTIFIERS),
    readCollection(database, COLLECTIONS.USER_CREDENTIALS),
    readCollection(database, COLLECTIONS.BLOCK_FARMS),
    readCollection(database, COLLECTIONS.FIELDS),
    readCollection(database, COLLECTIONS.CROP_CYCLES),
    readCollection(database, COLLECTIONS.OPERATION_LOGS)
  ]);
  return buildLegacyDataIntegrityReport({ users, accountIdentifiers, credentials, blockFarms, fields, cropCycles, operationLogs });
}

function assertLegacyMigrationAllowed({ execute, allowMigration, projectId, expectedProjectId }) {
  if (!execute) throw new Error('Legacy migration execution requires --execute.');
  if (allowMigration !== true) throw new Error('Legacy migration execution requires HUGPONG_ALLOW_LEGACY_MIGRATION=true.');
  const actual = String(projectId || '').trim();
  const expected = String(expectedProjectId || '').trim();
  if (!actual || !expected || actual !== expected) {
    throw new Error('The confirmed migration project ID must exactly match the active Firebase project.');
  }
}

async function backfillAccountIdentifiers(database, report, { timestamp = nowIso() } = {}) {
  if (!database) throw new Error('Database is unavailable.');
  if (!report?.canApplyAccountIdentifierBackfill) {
    throw new Error('Account identifier backfill is blocked by ambiguous or unsafe phone identity data.');
  }
  const planned = report?.repairs?.accountIdentifiersToCreate || [];
  let created = 0;
  let alreadyPresent = 0;
  for (const item of planned) {
    const outcome = await database.runTransaction(async transaction => {
      const userRef = database.collection(COLLECTIONS.USERS).doc(item.userId);
      const identifierRef = database.collection(COLLECTIONS.ACCOUNT_IDENTIFIERS).doc(item.identifierId);
      const [userSnapshot, identifierSnapshot] = await Promise.all([
        transaction.get(userRef),
        transaction.get(identifierRef)
      ]);
      if (!userSnapshot.exists) throw new Error(`User ${item.userId} no longer exists; re-run the migration audit.`);
      const liveIdentifierId = phoneIdentifierId(userSnapshot.data().phone);
      if (liveIdentifierId !== item.identifierId) {
        throw new Error(`User ${item.userId} changed after the migration audit; re-run the audit.`);
      }
      if (identifierSnapshot.exists) {
        const stored = identifierSnapshot.data();
        if (stored.userId !== item.userId || String(stored.type || '').toUpperCase() !== 'PHONE') {
          throw new Error(`Identifier ${item.identifierId} was claimed by another account; migration stopped.`);
        }
        return 'ALREADY_PRESENT';
      }
      transaction.create(identifierRef, {
        type: 'PHONE',
        userId: item.userId,
        createdAt: userSnapshot.data().createdAt || timestamp,
        updatedAt: timestamp
      });
      queueAuditEvent(transaction, database, {
        eventType: 'ACCOUNT_IDENTIFIER_BACKFILLED',
        actorUserId: MIGRATION_ACTOR_ID,
        entityType: 'USER',
        entityId: item.userId,
        details: `Backfilled the phone identity reservation for account ${item.userId}.`,
        createdAt: timestamp
      });
      return 'CREATED';
    });
    if (outcome === 'CREATED') created += 1;
    else alreadyPresent += 1;
  }
  return { planned: planned.length, created, alreadyPresent };
}

module.exports = {
  MIGRATION_ACTOR_ID,
  normalizedPhone,
  buildLegacyDataIntegrityReport,
  auditLegacyData,
  assertLegacyMigrationAllowed,
  backfillAccountIdentifiers
};
