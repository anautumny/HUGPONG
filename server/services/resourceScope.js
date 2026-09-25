'use strict';

const { db } = require('../firebase-admin');
const { COLLECTIONS, ROLES, canonicalRole } = require('../schema/firestoreSchema');

function actor(user) {
  return {
    userId: String(user?.employeeId || user?.userId || '').trim(),
    role: canonicalRole(user?.role || user?.roleKey)
  };
}

async function assertFieldScope(fieldId, user, allowedRoles = Object.values(ROLES)) {
  const identity = actor(user);
  if (!allowedRoles.includes(identity.role)) throw Object.assign(new Error('Role is not authorized for this field mutation.'), { status: 403 });
  const snapshot = await db.collection(COLLECTIONS.FIELDS).doc(String(fieldId || '').trim().toUpperCase()).get();
  if (!snapshot.exists) throw Object.assign(new Error('Field not found.'), { status: 404 });
  const field = snapshot.data();
  if (identity.role === ROLES.MEMBER_FARMER && field.memberUserId !== identity.userId) {
    throw Object.assign(new Error('Farm Members may mutate only their assigned field.'), { status: 403 });
  }
  if (identity.role === ROLES.FARM_MANAGER) {
    const farm = await db.collection(COLLECTIONS.BLOCK_FARMS).doc(field.blockFarmId).get();
    if (!farm.exists || farm.data().managerUserId !== identity.userId) {
      throw Object.assign(new Error('Farm Managers may mutate only their assigned block farm.'), { status: 403 });
    }
  }
  return { ...identity, fieldId: snapshot.id, field, snapshot };
}

async function assertBlockFarmScope(blockFarmId, user, allowedRoles = Object.values(ROLES)) {
  const identity = actor(user);
  if (!allowedRoles.includes(identity.role)) throw Object.assign(new Error('Role is not authorized for this block farm mutation.'), { status: 403 });
  const snapshot = await db.collection(COLLECTIONS.BLOCK_FARMS).doc(String(blockFarmId || '').trim().toUpperCase()).get();
  if (!snapshot.exists) throw Object.assign(new Error('Block farm not found.'), { status: 404 });
  if (identity.role === ROLES.FARM_MANAGER && snapshot.data().managerUserId !== identity.userId) {
    throw Object.assign(new Error('Farm Managers may mutate only their assigned block farm.'), { status: 403 });
  }
  return { ...identity, blockFarmId: snapshot.id, blockFarm: snapshot.data(), snapshot };
}

module.exports = { actor, assertFieldScope, assertBlockFarmScope };
