'use strict';

const { COLLECTIONS, ROLES, canonicalRole, requiredString, optionalString } = require('../schema/firestoreSchema');

const PHONE_VERIFICATION_REASONS = Object.freeze({
  ID_AND_SIM_IN_PERSON: 'The reviewer met the applicant face to face and confirmed the registered mobile number.',
  ASSIGNED_MANAGER_CONFIRMED: 'The authorized reviewer knows the applicant and confirmed the registered mobile number.',
  OFFICIAL_RECORD_MATCH: 'Applicant identity and mobile number matched existing official organization records.',
  LIVE_CALL_CONFIRMATION: 'The reviewer called the registered mobile number and confirmed it with the applicant.',
  OTHER_DOCUMENTED_CHECK: 'The reviewer used another documented phone-verification method.'
});

function verificationError(message, status = 403) {
  return Object.assign(new Error(message), { status });
}

function resolvePhoneVerificationReason(input = {}) {
  const code = requiredString(
    input.verificationReasonCode,
    'verificationReasonCode',
    { max: 80 }
  ).toUpperCase();
  if (!PHONE_VERIFICATION_REASONS[code]) {
    throw verificationError('Select a supported phone-verification reason.', 400);
  }
  const details = optionalString(
    input.verificationReasonDetails,
    { max: 500 }
  );
  if (code === 'OTHER_DOCUMENTED_CHECK' && details.length < 10) {
    throw verificationError('Add at least 10 characters describing the documented verification check.', 400);
  }
  return {
    code,
    details: details || null,
    summary: details ? `${PHONE_VERIFICATION_REASONS[code]} ${details}` : PHONE_VERIFICATION_REASONS[code]
  };
}

async function assertPhoneVerificationAuthority(database, {
  actorId,
  actorRole,
  targetUserId = null,
  targetRole,
  requestedBlockFarmId = null,
  affiliatedBlockFarmId = null,
  selectedBlockFarmId = null
}) {
  const actor = canonicalRole(actorRole);
  const target = canonicalRole(targetRole);
  const normalizedActorId = String(actorId || '').trim();
  if (!actor || !target || !normalizedActorId) throw verificationError('Phone-verification authority could not be established.');
  if (targetUserId && normalizedActorId === String(targetUserId).trim()) {
    throw verificationError('Administrators cannot verify their own phone through the review queue.');
  }
  if (actor === ROLES.SUPER_ADMIN) return { authorized: true, scope: 'SYSTEM' };

  if ([ROLES.SRA_ADMIN, ROLES.SUPER_ADMIN].includes(target)) {
    throw verificationError('Only a Super Admin may verify an SRA Admin or Super Admin phone.');
  }
  if (target === ROLES.FARM_MANAGER) {
    if (actor === ROLES.SRA_ADMIN) return { authorized: true, scope: 'DISTRICT' };
    throw verificationError('Only an SRA Admin or Super Admin may verify a Farm Manager phone.');
  }
  if (target !== ROLES.MEMBER_FARMER) {
    throw verificationError('The target account role is not eligible for phone verification.');
  }
  if (actor === ROLES.SRA_ADMIN) return { authorized: true, scope: 'DISTRICT' };
  if (actor !== ROLES.FARM_MANAGER) {
    throw verificationError('Only the assigned Farm Manager, an SRA Admin, or a Super Admin may verify this member phone.');
  }

  const requestedFarm = String(requestedBlockFarmId || '').trim().toUpperCase();
  const selectedFarm = String(selectedBlockFarmId || '').trim().toUpperCase();
  const affiliatedFarm = String(affiliatedBlockFarmId || '').trim().toUpperCase();
  const authoritativeFarmId = requestedFarm || affiliatedFarm;
  if (!authoritativeFarmId) {
    throw verificationError('A member without a selected Block Farm must be verified by an SRA Admin or Super Admin.');
  }
  if (requestedFarm && selectedFarm && selectedFarm !== requestedFarm) {
    throw verificationError('The assigned Farm Manager may verify only the Block Farm selected during registration.');
  }
  if (!database) throw verificationError('Account database is unavailable.', 503);
  const farm = await database.collection(COLLECTIONS.BLOCK_FARMS).doc(authoritativeFarmId).get();
  if (!farm.exists || String(farm.data().managerUserId || '').trim() !== normalizedActorId) {
    throw verificationError('Only the Farm Manager assigned to the selected Block Farm may verify this member phone.');
  }
  return { authorized: true, scope: 'BLOCK_FARM', blockFarmId: authoritativeFarmId };
}

module.exports = {
  PHONE_VERIFICATION_REASONS,
  resolvePhoneVerificationReason,
  assertPhoneVerificationAuthority
};
