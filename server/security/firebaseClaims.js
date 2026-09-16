'use strict';

const { canonicalRole } = require('../schema/firestoreSchema');

function buildFirebaseClaims(sessionUser) {
  return {
    role: sessionUser.canonicalRole || canonicalRole(sessionUser.role || sessionUser.roleKey),
    roleKey: sessionUser.roleKey,
    blockFarmId: sessionUser.blockFarmId || '',
    fieldId: sessionUser.fieldId || '',
    accountReady: sessionUser.phoneVerified === true && sessionUser.requiresPasswordChange !== true
  };
}

module.exports = { buildFirebaseClaims };
