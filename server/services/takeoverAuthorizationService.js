'use strict';

const { COLLECTIONS } = require('../schema/firestoreSchema');

function authorizationError(message, status) {
  return Object.assign(new Error(message), { status });
}

async function assertManagerFieldAssignment(database, actorId, fieldId) {
  const normalizedFieldId = String(fieldId || '').trim().toUpperCase();
  if (!normalizedFieldId) throw authorizationError('Field ID is required for takeover authorization.', 400);
  const field = await database.collection(COLLECTIONS.FIELDS).doc(normalizedFieldId).get();
  if (!field.exists) throw authorizationError('Field not found.', 404);
  const farm = await database.collection(COLLECTIONS.BLOCK_FARMS).doc(field.data().blockFarmId).get();
  if (!farm.exists || farm.data().managerUserId !== String(actorId || '').trim()) {
    throw authorizationError('The field is outside your assigned block farm.', 403);
  }
  return { fieldId: normalizedFieldId, blockFarmId: field.data().blockFarmId };
}

module.exports = { assertManagerFieldAssignment };
