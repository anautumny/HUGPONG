'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeOperationSchedule,
  completeMatchingScheduleEntry
} = require('../domain/operationSchedule');

const context = {
  cycleId: 'CYC-FLD-001-001',
  actorId: '04000001',
  now: '2026-09-27T08:00:00.000Z',
  existing: []
};

test('planner schedule references canonical operations and computes estimated totals', () => {
  const schedule = normalizeOperationSchedule([{
    id: 'PLAN-1',
    operationDefinitionId: 'SRA-02',
    plannedDate: '2026-10-02',
    estimatedLabor: 1000,
    estimatedMaterials: 2500,
    estimatedOther: 500,
    notes: 'Tractor reserved.'
  }], context);
  assert.equal(schedule[0].operationName, 'Land Preparation');
  assert.equal(schedule[0].stageNumber, 1);
  assert.equal(schedule[0].estimatedTotal, 4000);
  assert.equal(schedule[0].completedOperationLogId, null);
});

test('each Manual Weeding round is a separate dated child under one parent operation', () => {
  const schedule = normalizeOperationSchedule([
    { id: 'PLAN-W1', operationDefinitionId: 'SRA-08', childOperationDefinitionId: 'SI-08-1', plannedDate: '2026-10-01' },
    { id: 'PLAN-W2', operationDefinitionId: 'SRA-08', childOperationDefinitionId: 'SRA-08-2', plannedDate: '2026-10-15' },
    { id: 'PLAN-W3', operationDefinitionId: 'SRA-08', childOperationDefinitionId: 'SI-08-3', plannedDate: '2026-10-29' }
  ], context);
  assert.deepEqual(schedule.map(entry => entry.operationDefinitionId), ['SRA-08', 'SRA-08', 'SRA-08']);
  assert.deepEqual(schedule.map(entry => entry.childOperationDefinitionId), ['SI-08-1', 'SI-08-2', 'SI-08-3']);
  assert.deepEqual(schedule.map(entry => entry.childOperationName), [
    'Manual Weeding (1st Round)', 'Manual Weeding (2nd Round)', 'Manual Weeding (3rd Round)'
  ]);
});

test('a custom planner operation keeps its user-entered name without requiring a fixed crop stage', () => {
  const schedule = normalizeOperationSchedule([{
    id: 'PLAN-CUSTOM',
    operationDefinitionId: 'CUSTOM',
    operationName: 'Repair field drainage canal',
    plannedDate: '2026-10-09',
    estimatedLabor: 1200
  }], context);
  assert.equal(schedule[0].operationDefinitionId, 'CUSTOM');
  assert.equal(schedule[0].operationName, 'Repair field drainage canal');
  assert.equal(schedule[0].stageNumber, null);
  assert.throws(() => normalizeOperationSchedule([{
    id: 'PLAN-CUSTOM-BAD',
    operationDefinitionId: 'CUSTOM',
    operationName: '',
    plannedDate: '2026-10-09'
  }], context), /operationName is required/i);
});

test('a submitted actual operation completes only the nearest matching planned item', () => {
  const schedule = normalizeOperationSchedule([
    { id: 'PLAN-A', operationDefinitionId: 'SRA-08', childOperationDefinitionId: 'SI-08-1', plannedDate: '2026-10-01' },
    { id: 'PLAN-B', operationDefinitionId: 'SRA-08', childOperationDefinitionId: 'SI-08-1', plannedDate: '2026-11-01' }
  ], context);
  const result = completeMatchingScheduleEntry(schedule, {
    cycleId: context.cycleId,
    operationDefinitionId: 'SRA-08',
    childOperationDefinitionId: 'SI-08-1',
    performedOn: '2026-10-03'
  }, 'LOG-1', '2026-10-03T09:00:00.000Z');
  assert.equal(result.changed, true);
  assert.equal(result.schedule[0].completedOperationLogId, 'LOG-1');
  assert.equal(result.schedule[1].completedOperationLogId, null);
});

test('an actual custom operation completes only the matching custom activity name', () => {
  const schedule = normalizeOperationSchedule([
    { id: 'PLAN-CUSTOM-A', operationDefinitionId: 'CUSTOM', operationName: 'Repair drainage canal', stageNumber: 4, plannedDate: '2026-10-01' },
    { id: 'PLAN-CUSTOM-B', operationDefinitionId: 'CUSTOM', operationName: 'Install field marker', stageNumber: 4, plannedDate: '2026-10-01' }
  ], context);
  const result = completeMatchingScheduleEntry(schedule, {
    cycleId: context.cycleId,
    operationDefinitionId: 'CUSTOM',
    operationName: 'Install field marker',
    childOperationDefinitionId: null,
    performedOn: '2026-10-02'
  }, 'LOG-CUSTOM', '2026-10-02T09:00:00.000Z');
  assert.equal(result.schedule.find(entry => entry.id === 'PLAN-CUSTOM-A').completedOperationLogId, null);
  assert.equal(result.schedule.find(entry => entry.id === 'PLAN-CUSTOM-B').completedOperationLogId, 'LOG-CUSTOM');
});

test('clients cannot remove completed schedule history or change its identity', () => {
  const completed = normalizeOperationSchedule([{
    id: 'PLAN-DONE',
    operationDefinitionId: 'SRA-02',
    plannedDate: '2026-09-20'
  }], context)[0];
  const existing = [{ ...completed, completedOperationLogId: 'LOG-DONE', completedAt: '2026-09-20T08:00:00.000Z' }];
  const retained = normalizeOperationSchedule([], { ...context, existing });
  assert.equal(retained[0].completedOperationLogId, 'LOG-DONE');
  assert.throws(() => normalizeOperationSchedule([{
    ...existing[0],
    operationDefinitionId: 'SRA-03'
  }], { ...context, existing }), /completed planned operation cannot be changed/i);
  assert.throws(() => normalizeOperationSchedule([{
    ...existing[0],
    plannedDate: '2026-09-21'
  }], { ...context, existing }), /completed planned operation cannot be changed/i);
});

test('an unchanged schedule keeps its timestamp so offline retries are idempotent', () => {
  const first = normalizeOperationSchedule([{
    id: 'PLAN-RETRY',
    operationDefinitionId: 'SRA-02',
    plannedDate: '2026-10-02',
    estimatedLabor: 1000
  }], context);
  const retried = normalizeOperationSchedule(first, {
    ...context,
    existing: first,
    now: '2026-09-27T09:00:00.000Z'
  });
  assert.deepEqual(retried, first);
});

test('Crop Year Cycle rollover preserves old plans without moving them into the new cycle', () => {
  const previous = normalizeOperationSchedule([{
    id: 'PLAN-OLD-CYCLE',
    operationDefinitionId: 'SRA-02',
    plannedDate: '2026-09-10'
  }], context);
  const nextCycle = normalizeOperationSchedule([{
    id: 'PLAN-NEW-CYCLE',
    operationDefinitionId: 'SRA-03',
    plannedDate: '2027-01-10'
  }], {
    ...context,
    cycleId: 'CYC-FLD-001-002',
    existing: previous,
    now: '2027-01-01T08:00:00.000Z'
  });
  assert.equal(nextCycle.length, 2);
  assert.equal(nextCycle.find(entry => entry.id === 'PLAN-OLD-CYCLE').cycleId, context.cycleId);
  assert.equal(nextCycle.find(entry => entry.id === 'PLAN-NEW-CYCLE').cycleId, 'CYC-FLD-001-002');
});
