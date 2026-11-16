'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function mobileApprovalRuntime({ response = {}, fail = false, phoneVerified = true } = {}) {
  const source = fs.readFileSync(path.resolve(__dirname, '../../mobile/src/data/dataStore.js'), 'utf8');
  const start = source.indexOf('export const approvePendingRegistration =');
  const end = source.indexOf('\nexport const provisionUserAccount', start);
  const applicant = { id: '04000077', employeeId: '04000077', contact: '09171234567', name: 'Member',
    status: 'PENDING', canonicalRole: 'MEMBER_FARMER', phoneVerified, updatedAt: 'v1' };
  const context = {
    pendingUsers: [applicant], users: [], fields: [], cropCycles: [],
    blockFarms: [{ id: 'BF-001', name: 'Farm' }], ROLES: { MEMBER_FARMER: 'MEMBER_FARMER' },
    canonicalRole: value => value,
    fromUserDocument: (id, row) => ({ ...row, id, employeeId: id }),
    fromFieldDocument: (id, row) => ({ ...row, id }), fromCycleDocument: (id, row) => ({ ...row, id }),
    STORAGE_KEYS: {}, saveItem: async () => {}, notifyDataUpdate: () => {},
    createClientRecordId: () => 'VERIFY-MUTATION',
    authenticatedRequest: async () => ({ data: { ...applicant, phoneVerified: true } }),
    commitExplicitMutation: async (type, payload, options) => {
      context.calls.push({ type, payload, options });
      if (fail) throw new Error('Field exceeds remaining area.');
      return { response: { success: true, accountId: applicant.id, data: { ...applicant, status: 'ACTIVE' }, ...response } };
    }, calls: []
  };
  const keys = Object.keys(context);
  const approve = new Function(...keys, source.slice(start, end).replace('export const', 'const') + '; return approvePendingRegistration;')(...keys.map(key => context[key]));
  return { context, approve };
}

test('mobile assign-later submits a single approval and does not require an area', async () => {
  const { context, approve } = mobileApprovalRuntime();
  const result = await approve('09171234567', { blockFarmId: 'BF-001', fieldAssignmentMode: 'LATER' });
  assert.equal(result.success, true);
  assert.equal(context.calls.length, 1);
  assert.equal(context.calls[0].payload.fieldAssignmentMode, 'LATER');
  assert.equal(context.calls[0].payload.fieldAreaHa, undefined);
  assert.equal(context.pendingUsers.length, 0);
  assert.equal(context.users[0].status, 'ACTIVE');
  assert.equal(context.fields.length, 0);
});

test('mobile immediate assignment submits the area and applies canonical field/cycle records', async () => {
  const { context, approve } = mobileApprovalRuntime({ response: {
    fieldId: 'FIELD-SERVER', field: { id: 'FIELD-SERVER', blockFarmId: 'BF-001', memberUserId: '04000077', areaHa: 1.5 },
    cycle: { id: 'CYCLE-SERVER', fieldId: 'FIELD-SERVER', currentStageNumber: 1 }
  } });
  const result = await approve('09171234567', { blockFarmId: 'BF-001', fieldAssignmentMode: 'NOW', fieldAreaHa: 1.5 });
  assert.equal(result.fieldId, 'FIELD-SERVER');
  assert.equal(context.calls.length, 1);
  assert.equal(context.calls[0].payload.fieldAreaHa, 1.5);
  assert.equal(context.fields[0].id, 'FIELD-SERVER');
  assert.equal(context.cropCycles[0].id, 'CYCLE-SERVER');
});

test('mobile preserves the pending account when the atomic server approval fails', async () => {
  const { context, approve } = mobileApprovalRuntime({ fail: true });
  const result = await approve('09171234567', { blockFarmId: 'BF-001', fieldAssignmentMode: 'NOW', fieldAreaHa: 1.5 });
  assert.equal(result.success, false);
  assert.equal(context.pendingUsers.length, 1);
  assert.equal(context.users.length, 0);
  assert.equal(context.fields.length, 0);
});

test('phone-only review leaves the mobile registration pending even when field assignment was selected', async () => {
  const { context, approve } = mobileApprovalRuntime({ phoneVerified: false });
  const result = await approve('09171234567', { blockFarmId: 'BF-001', fieldAssignmentMode: 'NOW',
    acceptUserNow: false, verificationReasonCode: 'IN_PERSON_SIM_CHECK' });
  assert.equal(result.success, true);
  assert.equal(result.pendingApproval, true);
  assert.equal(context.pendingUsers.length, 1);
  assert.equal(context.calls.length, 0);
});
