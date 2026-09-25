'use strict';

const { COLLECTIONS, ROLES, canonicalRole } = require('../schema/firestoreSchema');

const ASSIGNMENT_STATUS = Object.freeze({
  RESOLVED: 'RESOLVED',
  UNASSIGNED: 'UNASSIGNED',
  ORPHANED: 'ORPHANED',
  CONFLICT: 'CONFLICT'
});

function active(record) {
  return String(record?.status || 'ACTIVE').toUpperCase() !== 'ARCHIVED';
}

function sortedUnique(values) {
  return Array.from(new Set(values.filter(Boolean).map(value => String(value).trim()))).sort();
}

function assignment(status, type, displayLabel, details = {}) {
  return {
    status,
    type,
    blockFarmId: details.blockFarmId || null,
    blockFarmName: details.blockFarmName || null,
    fieldId: details.fieldIds?.[0] || null,
    fieldIds: details.fieldIds || [],
    displayLabel
  };
}

function resolveAssignment(user, blockFarms, fields) {
  const userId = String(user.id || user.employeeId || '').trim();
  const role = canonicalRole(user.canonicalRole || user.role);

  if (role === ROLES.SUPER_ADMIN) {
    return assignment(ASSIGNMENT_STATUS.RESOLVED, 'SYSTEM_OVERSIGHT', 'Central District Oversight');
  }
  if (role === ROLES.SRA_ADMIN) {
    return assignment(ASSIGNMENT_STATUS.RESOLVED, 'REGULATORY_OVERSIGHT', 'SRA Regulatory Oversight');
  }

  const farmMap = new Map(blockFarms.map(farm => [String(farm.id || '').trim(), farm]));

  if (role === ROLES.FARM_MANAGER) {
    const managedFarms = blockFarms
      .filter(farm => active(farm) && String(farm.managerUserId || '').trim() === userId)
      .sort((left, right) => String(left.id).localeCompare(String(right.id)));
    if (managedFarms.length === 0) {
      return assignment(ASSIGNMENT_STATUS.UNASSIGNED, 'BLOCK_FARM_MANAGER', 'Unassigned Farm');
    }
    const labels = managedFarms.map(farm => `${farm.name || farm.id} (Manager)`);
    return assignment(
      managedFarms.length === 1 ? ASSIGNMENT_STATUS.RESOLVED : ASSIGNMENT_STATUS.CONFLICT,
      'BLOCK_FARM_MANAGER',
      labels.join('; '),
      {
        blockFarmId: managedFarms.length === 1 ? managedFarms[0].id : null,
        blockFarmName: managedFarms.length === 1 ? (managedFarms[0].name || managedFarms[0].id) : null
      }
    );
  }

  if (role === ROLES.MEMBER_FARMER) {
    const memberFields = fields
      .filter(field => active(field) && String(field.memberUserId || '').trim() === userId)
      .sort((left, right) => String(left.id).localeCompare(String(right.id)));
    if (memberFields.length === 0) {
      return assignment(ASSIGNMENT_STATUS.UNASSIGNED, 'MEMBER_FIELD', 'Unassigned');
    }

    const fieldIds = sortedUnique(memberFields.map(field => field.id));
    const missingFarm = memberFields.some(field => {
      const farm = farmMap.get(String(field.blockFarmId || '').trim());
      return !farm || !active(farm);
    });
    if (missingFarm) {
      return assignment(
        ASSIGNMENT_STATUS.ORPHANED,
        'MEMBER_FIELD',
        `Assignment lookup failed · ${fieldIds.join(', ')}`,
        { fieldIds }
      );
    }

    const farmIds = sortedUnique(memberFields.map(field => field.blockFarmId));
    const groups = farmIds.map(farmId => {
      const farm = farmMap.get(farmId);
      const farmFieldIds = memberFields.filter(field => field.blockFarmId === farmId).map(field => field.id);
      return `${farm.name || farm.id} · ${farmFieldIds.join(', ')}`;
    });
    const singleFarm = farmIds.length === 1 ? farmMap.get(farmIds[0]) : null;
    return assignment(
      farmIds.length === 1 ? ASSIGNMENT_STATUS.RESOLVED : ASSIGNMENT_STATUS.CONFLICT,
      'MEMBER_FIELD',
      groups.join('; '),
      {
        blockFarmId: singleFarm?.id || null,
        blockFarmName: singleFarm ? (singleFarm.name || singleFarm.id) : null,
        fieldIds
      }
    );
  }

  return assignment(ASSIGNMENT_STATUS.UNASSIGNED, 'UNKNOWN', 'Unassigned');
}

function resolveDirectoryAssignments(users = [], blockFarms = [], fields = []) {
  return users.map(user => ({
    ...user,
    assignment: resolveAssignment(user, blockFarms, fields)
  }));
}

async function queryByValues(database, collectionName, fieldName, values) {
  const ids = sortedUnique(values);
  const records = new Map();
  for (let index = 0; index < ids.length; index += 10) {
    const snapshot = await database.collection(collectionName)
      .where(fieldName, 'in', ids.slice(index, index + 10))
      .get();
    snapshot.docs.forEach(doc => records.set(doc.id, { id: doc.id, ...doc.data() }));
  }
  return Array.from(records.values());
}

async function getDocumentsById(database, collectionName, ids) {
  const uniqueIds = sortedUnique(ids);
  const records = [];
  for (let index = 0; index < uniqueIds.length; index += 100) {
    const refs = uniqueIds.slice(index, index + 100).map(id => database.collection(collectionName).doc(id));
    const snapshots = refs.length ? await database.getAll(...refs) : [];
    snapshots.filter(doc => doc.exists).forEach(doc => records.push({ id: doc.id, ...doc.data() }));
  }
  return records;
}

async function resolveDirectoryAssignmentsFromDatabase(database, users = []) {
  const managerIds = users
    .filter(user => canonicalRole(user.canonicalRole || user.role) === ROLES.FARM_MANAGER)
    .map(user => user.id || user.employeeId);
  const memberIds = users
    .filter(user => canonicalRole(user.canonicalRole || user.role) === ROLES.MEMBER_FARMER)
    .map(user => user.id || user.employeeId);

  const [managerFarms, memberFields] = await Promise.all([
    queryByValues(database, COLLECTIONS.BLOCK_FARMS, 'managerUserId', managerIds),
    queryByValues(database, COLLECTIONS.FIELDS, 'memberUserId', memberIds)
  ]);
  const referencedFarms = await getDocumentsById(
    database,
    COLLECTIONS.BLOCK_FARMS,
    memberFields.map(field => field.blockFarmId)
  );
  const farmsById = new Map([...managerFarms, ...referencedFarms].map(farm => [farm.id, farm]));
  return resolveDirectoryAssignments(users, Array.from(farmsById.values()), memberFields);
}

module.exports = {
  ASSIGNMENT_STATUS,
  resolveAssignment,
  resolveDirectoryAssignments,
  resolveDirectoryAssignmentsFromDatabase
};
