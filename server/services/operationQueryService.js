'use strict';

const { COLLECTIONS, ROLES, canonicalRole } = require('../schema/firestoreSchema');
const { sortOperationsNewestFirst } = require('./recordOrdering');

async function getOperationActorScope(database, user) {
  const userId = String(user?.employeeId || user?.userId || '').trim();
  const role = canonicalRole(user?.role || user?.roleKey);
  if (role === ROLES.SRA_ADMIN) {
    return { role, userId, all: true };
  }

  if (![ROLES.FARM_MANAGER, ROLES.MEMBER_FARMER].includes(role)) {
    const error = new Error('Role is not permitted to view field operations.');
    error.status = 403;
    throw error;
  }

  if (role === ROLES.FARM_MANAGER) {
    const farmSnapshot = await database.collection(COLLECTIONS.BLOCK_FARMS).where('managerUserId', '==', userId).get();
    const farmIds = farmSnapshot.docs.map(document => document.id);
    if (!farmIds.length) return { role, userId, fieldIds: [] };
    const fieldSnapshots = [];
    for (let index = 0; index < farmIds.length; index += 10) {
      fieldSnapshots.push(await database.collection(COLLECTIONS.FIELDS)
        .where('blockFarmId', 'in', farmIds.slice(index, index + 10)).get());
    }
    return {
      role,
      userId,
      fieldIds: fieldSnapshots.flatMap(snapshot => snapshot.docs.map(document => document.id))
    };
  }

  const fieldSnapshot = await database.collection(COLLECTIONS.FIELDS).where('memberUserId', '==', userId).get();
  return { role, userId, fieldIds: fieldSnapshot.docs.map(document => document.id) };
}

async function listOperationRecords(database, user, options = {}) {
  const scope = await getOperationActorScope(database, user);
  const requestedStatus = String(options.status || '').trim().toUpperCase();
  const status = ['ACTIVE', 'ARCHIVED'].includes(requestedStatus) ? requestedStatus : null;
  if (scope.all) {
    let query = database.collection(COLLECTIONS.OPERATION_LOGS);
    if (status) query = query.where('status', '==', status);
    const snapshot = await query.get();
    return sortOperationsNewestFirst(snapshot.docs.map(document => ({ id: document.id, ...document.data() })));
  }
  const records = [];
  for (let index = 0; index < scope.fieldIds.length; index += 10) {
    const fieldIds = scope.fieldIds.slice(index, index + 10);
    let query = database.collection(COLLECTIONS.OPERATION_LOGS).where('fieldId', 'in', fieldIds);
    if (status) query = query.where('status', '==', status);
    const snapshot = await query.get();
    records.push(...snapshot.docs.map(document => ({ id: document.id, ...document.data() })));
  }
  return sortOperationsNewestFirst(records);
}

module.exports = {
  getOperationActorScope,
  listOperationRecords
};
