'use strict';

const { ROLES, canonicalRole } = require('../schema/firestoreSchema');

function normalizeId(value) {
  return String(value || '').trim().toUpperCase();
}

function actorId(user) {
  return String(user?.employeeId || user?.userId || user?.id || '').trim();
}

function isFieldOwner(user, field) {
  return Boolean(actorId(user)) && String(field?.memberUserId || '').trim() === actorId(user);
}

function isValidTakeoverGrant(user, fieldId, now = Date.now()) {
  const grant = user?.takeoverGrant;
  return Boolean(
    grant &&
    grant.actorId === actorId(user) &&
    normalizeId(grant.fieldId) === normalizeId(fieldId) &&
    (!Number.isFinite(grant.expiresAt) || grant.expiresAt > now)
  );
}

function operationAuthorization(user, field, { managedBlockFarm = false, now = Date.now() } = {}) {
  const role = canonicalRole(user?.role || user?.canonicalRole || user?.roleKey);
  const ownField = isFieldOwner(user, field);
  const manager = role === ROLES.FARM_MANAGER;
  const member = role === ROLES.MEMBER_FARMER;
  const takeover = manager && !ownField && managedBlockFarm && isValidTakeoverGrant(user, field?.id, now);
  const directOwner = ownField && (member || manager);

  return Object.freeze({
    role,
    ownField,
    takeover,
    canView: directOwner || (manager && managedBlockFarm),
    canCreate: directOwner || takeover,
    canEdit: directOwner || takeover,
    canSubmit: directOwner || takeover,
    canDraft: directOwner,
    canPlan: directOwner,
    requiresTakeover: manager && managedBlockFarm && !ownField && !takeover,
    submissionSource: manager ? (ownField ? 'FIELD_OWNER' : (takeover ? 'MANAGER_TAKEOVER' : '')) : (member && ownField ? 'MEMBER' : '')
  });
}

module.exports = { actorId, isFieldOwner, isValidTakeoverGrant, operationAuthorization };
