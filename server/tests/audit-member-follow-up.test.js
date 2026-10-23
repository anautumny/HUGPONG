'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { memoryFirestore } = require('./helpers/memoryFirestore');
const { auditMemberFollowUps } = require('../services/auditMemberFollowUpService');

const now = Date.parse('2026-10-23T12:00:00Z');
const daysAgo = days => new Date(now - days * 86400000).toISOString();
const member = (name, overrides = {}) => ({
  displayName: name, role: 'MEMBER_FARMER', status: 'ACTIVE',
  affiliatedBlockFarmId: 'BF-1', createdAt: daysAgo(30), phone: '09170000001', ...overrides,
});

function fixture() {
  const db = memoryFirestore({
    'users/MEM-IDLE': member('No monthly operations'),
    'users/MEM-WARN': member('Three days inactive'),
    'users/MEM-CRITICAL': member('Five days inactive'),
    'users/MEM-ACTIVE': member('Active with records'),
    'users/MEM-NOPLOT': member('No plot assigned', { phone: '' }),
    'users/MEM-OUTSIDE': member('Other farm member', { affiliatedBlockFarmId: 'BF-2' }),
    'users/MEM-DISABLED': member('Disabled account', { status: 'DISABLED' }),
    'terminal_diagnostics/IDLE': { userId: 'MEM-IDLE', lastActiveAt: daysAgo(1) },
    'terminal_diagnostics/WARN': { userId: 'MEM-WARN', lastActiveAt: daysAgo(3) },
    'terminal_diagnostics/CRITICAL': { userId: 'MEM-CRITICAL', lastActiveAt: daysAgo(5) },
    'terminal_diagnostics/ACTIVE': { userId: 'MEM-ACTIVE', lastActiveAt: daysAgo(0) },
    'terminal_diagnostics/NOPLOT': { userId: 'MEM-NOPLOT', lastActiveAt: daysAgo(1) },
    'terminal_diagnostics/OUTSIDE': { userId: 'MEM-OUTSIDE', lastActiveAt: daysAgo(7) },
  });
  const input = {
    blockFarmId: 'BF-1',
    activeFields: [
      { id: 'FLD-IDLE-1', memberUserId: 'MEM-IDLE' },
      { id: 'FLD-IDLE-2', memberUserId: 'MEM-IDLE' },
      { id: 'FLD-WARN', memberUserId: 'MEM-WARN' },
      { id: 'FLD-CRITICAL', memberUserId: 'MEM-CRITICAL' },
      { id: 'FLD-ACTIVE', memberUserId: 'MEM-ACTIVE' },
      { id: 'FLD-UNASSIGNED', memberUserId: null },
    ],
    operationSnapshots: ['FLD-WARN', 'FLD-CRITICAL', 'FLD-ACTIVE'].map(fieldId => ({ fieldId })),
  };
  return { db, input };
}

test('monthly member review separates no operations from three/five-day account warnings and stays farm scoped', async () => {
  const { db, input } = fixture();
  const before = structuredClone([...db.records]);
  const result = await auditMemberFollowUps(db, input, now);
  const rows = new Map(result.memberFollowUps.map(row => [row.memberId, row]));
  assert.equal(rows.size, 4);
  assert.equal(result.memberFollowUps[0].memberId, 'MEM-CRITICAL');
  assert.equal(rows.get('MEM-WARN').activity.attentionStatus, 'NEEDS_ATTENTION');
  assert.equal(rows.get('MEM-WARN').activity.inactiveDays, 3);
  assert.equal(rows.get('MEM-CRITICAL').activity.attentionStatus, 'CRITICAL');
  assert.equal(rows.get('MEM-CRITICAL').hasMonthlyOperations, true);
  assert.equal(rows.get('MEM-IDLE').activity.attentionStatus, 'WITHIN_WINDOW');
  assert.equal(rows.get('MEM-IDLE').hasMonthlyOperations, false);
  assert.deepEqual(rows.get('MEM-IDLE').fieldIds, ['FLD-IDLE-1', 'FLD-IDLE-2']);
  assert.equal(rows.get('MEM-IDLE').contactNumber, '09170000001');
  assert.equal(rows.get('MEM-NOPLOT').contactNumber, null);
  assert.deepEqual(rows.get('MEM-NOPLOT').fieldIds, []);
  assert.equal(rows.has('MEM-OUTSIDE'), false);
  assert.equal(rows.has('MEM-DISABLED'), false);
  assert.equal(rows.has('MEM-ACTIVE'), false);
  assert.deepEqual([...db.records], before, 'reviewing does not mark a call or no-activity claim as verified');
});

test('telemetry failure keeps the complete no-operation member list without inventing inactivity', async () => {
  const { db, input } = fixture();
  const collection = db.collection.bind(db);
  db.collection = name => {
    if (name === 'terminal_diagnostics') throw new Error('Telemetry temporarily unavailable');
    return collection(name);
  };
  const result = await auditMemberFollowUps(db, input, now);
  assert.equal(result.activityAvailable, false);
  assert.deepEqual(result.memberFollowUps.map(row => row.memberId).sort(), ['MEM-IDLE', 'MEM-NOPLOT']);
  assert.ok(result.memberFollowUps.every(row => row.activity === null && !row.reasonCodes.includes('ACCOUNT_INACTIVITY')));
});

test('unreported account dates are explicit and registration-based inactivity uses the existing policy', async () => {
  const { db, input } = fixture();
  db.records.set('users/MEM-NEW', member('No reported dates', { createdAt: null }));
  db.records.set('users/MEM-NEVER', member('Never active since registration', { createdAt: daysAgo(6) }));
  const result = await auditMemberFollowUps(db, input, now);
  const unknown = result.memberFollowUps.find(row => row.memberId === 'MEM-NEW');
  const never = result.memberFollowUps.find(row => row.memberId === 'MEM-NEVER');
  assert.equal(unknown.activity.inactiveDays, null);
  assert.ok(unknown.reasonCodes.includes('ACCOUNT_ACTIVITY_NOT_REPORTED'));
  assert.match(unknown.activityNote, /No account activity date/);
  assert.equal(never.activity.basedOn, 'ACCOUNT_CREATED');
  assert.equal(never.activity.attentionStatus, 'CRITICAL');
  assert.match(never.activityNote, /since registration/);
});
