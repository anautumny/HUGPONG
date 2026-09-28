'use strict';

const { COLLECTIONS, ROLES, canonicalRole } = require('../schema/firestoreSchema');

function activeDocuments(snapshot) {
  return (snapshot?.docs || [])
    .filter(document => String(document.data()?.status || 'ACTIVE').toUpperCase() === 'ACTIVE')
    .sort((left, right) => String(left.id).localeCompare(String(right.id)));
}

async function resolveAccountAssignments(database, userId, role) {
  if (!database) throw new Error('Database is required to resolve account assignments.');
  const canonical = canonicalRole(role);
  if (canonical === ROLES.FARM_MANAGER) {
    const [farms, fields] = await Promise.all([
      database.collection(COLLECTIONS.BLOCK_FARMS).where('managerUserId', '==', userId).get(),
      database.collection(COLLECTIONS.FIELDS).where('memberUserId', '==', userId).get()
    ]);
    const field = activeDocuments(fields)[0] || null;
    const farm = activeDocuments(farms)[0] || null;
    return {
      blockFarmId: field ? String(field.data().blockFarmId || '') : (farm?.id || ''),
      fieldId: field?.id || ''
    };
  }
  if (canonical === ROLES.MEMBER_FARMER) {
    const fields = await database.collection(COLLECTIONS.FIELDS).where('memberUserId', '==', userId).get();
    const field = activeDocuments(fields)[0] || null;
    return { blockFarmId: field ? String(field.data().blockFarmId || '') : '', fieldId: field?.id || '' };
  }
  return { blockFarmId: '', fieldId: '' };
}

module.exports = { resolveAccountAssignments };
