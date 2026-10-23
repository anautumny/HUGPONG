'use strict';
const { ROLES, canonicalRole } = require('../schema/firestoreSchema');

function accountUpdateActions(actorRole, currentRole) {
  const actor = canonicalRole(actorRole), current = canonicalRole(currentRole);
  const allowedRoles = actor === ROLES.SUPER_ADMIN ? Object.values(ROLES)
    : actor === ROLES.SRA_ADMIN && current === ROLES.FARM_MANAGER ? [ROLES.FARM_MANAGER]
      : actor === ROLES.FARM_MANAGER && current === ROLES.MEMBER_FARMER ? [ROLES.MEMBER_FARMER] : [];
  return { canEdit: allowedRoles.length > 0, allowedRoles };
}

function assertAccountUpdateAllowed(actorRole, currentRole, requestedRole) {
  if (!accountUpdateActions(actorRole, currentRole).allowedRoles.includes(canonicalRole(requestedRole))) {
    throw Object.assign(new Error('Your role does not permit this account role transition.'), { status: 403, code: 'ACCOUNT_ROLE_TRANSITION_DENIED' });
  }
}
module.exports = { accountUpdateActions, assertAccountUpdateAllowed };
