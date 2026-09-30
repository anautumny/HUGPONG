'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  resolvePhoneVerificationReason,
  assertPhoneVerificationAuthority
} = require('../domain/phoneVerificationPolicy');

const databaseWithFarm = (farmId, managerUserId) => ({
  collection: () => ({
    doc: requestedId => ({
      get: async () => ({
        exists: requestedId === farmId,
        data: () => ({ managerUserId })
      })
    })
  })
});

test('guided verification reasons accept presets and require details only for Other', () => {
  assert.equal(resolvePhoneVerificationReason({ verificationReasonCode: 'ID_AND_SIM_IN_PERSON' }).code, 'ID_AND_SIM_IN_PERSON');
  assert.throws(
    () => resolvePhoneVerificationReason({ verificationReasonCode: 'OTHER_DOCUMENTED_CHECK', verificationReasonDetails: 'short' }),
    /at least 10 characters/
  );
  assert.match(resolvePhoneVerificationReason({
    verificationReasonCode: 'OTHER_DOCUMENTED_CHECK',
    verificationReasonDetails: 'Barangay certification and SIM were checked.'
  }).summary, /Barangay certification/);
});

test('assigned Farm Manager may verify only a member in the selected Block Farm', async () => {
  const database = databaseWithFarm('BF-001', '03000001');
  await assert.doesNotReject(assertPhoneVerificationAuthority(database, {
    actorId: '03000001', actorRole: 'FARM_MANAGER', targetUserId: '04000001', targetRole: 'MEMBER_FARMER',
    requestedBlockFarmId: 'BF-001', selectedBlockFarmId: 'BF-001'
  }));
  await assert.rejects(assertPhoneVerificationAuthority(database, {
    actorId: '03000001', actorRole: 'FARM_MANAGER', targetUserId: '04000002', targetRole: 'MEMBER_FARMER'
  }), /without a selected Block Farm/);
  await assert.rejects(assertPhoneVerificationAuthority(database, {
    actorId: '03000001', actorRole: 'FARM_MANAGER', targetUserId: '04000003', targetRole: 'MEMBER_FARMER',
    requestedBlockFarmId: 'BF-002', selectedBlockFarmId: 'BF-002'
  }), /assigned to the selected Block Farm/);
});

test('role hierarchy reserves Farm Manager and SRA Admin verification for their supervisors', async () => {
  await assert.doesNotReject(assertPhoneVerificationAuthority(null, {
    actorId: '02000001', actorRole: 'SRA_ADMIN', targetUserId: '03000001', targetRole: 'FARM_MANAGER'
  }));
  await assert.rejects(assertPhoneVerificationAuthority(null, {
    actorId: '02000001', actorRole: 'SRA_ADMIN', targetUserId: '02000002', targetRole: 'SRA_ADMIN'
  }), /Only a Super Admin/);
  await assert.doesNotReject(assertPhoneVerificationAuthority(null, {
    actorId: '01000001', actorRole: 'SUPER_ADMIN', targetUserId: '02000002', targetRole: 'SRA_ADMIN'
  }));
});
