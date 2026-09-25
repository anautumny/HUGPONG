'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { buildOperationSnapshot } = require('../schema/firestoreSchema');
const {
  createMutationEnvelope,
  drainMutationQueue,
  migrateOutbox
} = require('../../mobile/src/services/mutationOutboxCore');

const repositoryRoot = path.join(__dirname, '..', '..');

test('amendment presentation omits semantic no-ops and renders nested materials', async () => {
  const presentationUrl = pathToFileURL(path.join(
    repositoryRoot,
    'web', 'react-app', 'src', 'domain', 'amendmentPresentation.js'
  )).href;
  const { formatAmendmentChanges, meaningfulAmendmentChanges } = await import(presentationUrl);
  const changes = {
    peopleCount: { before: 2, after: '2' },
    performedOn: { before: '2026-09-10', after: '2026-09-10T08:00:00.000Z' },
    totalCost: { before: 800, after: 900 },
    lineItems: {
      before: [{ lineItemId: 'LI-1', description: 'Fertilizer', quantity: 2, unit: 'bag', unitCost: 400, subtotal: 800 }],
      after: [{ lineItemId: 'LI-1', description: 'Fertilizer', quantity: 3, unit: 'bag', unitCost: 300, subtotal: 900 }]
    }
  };

  assert.deepEqual(Object.keys(meaningfulAmendmentChanges(changes)), ['totalCost', 'lineItems']);
  const formatted = formatAmendmentChanges(changes);
  assert.equal(formatted.some(row => row.label === 'Workers'), false);
  assert.equal(formatted.some(row => row.label === 'Operation Date'), false);
  assert.equal(formatted.find(row => row.label === 'Materials').items[0].label, 'Fertilizer');
  assert.doesNotMatch(JSON.stringify(formatted), /\[object Object\]/);
});

test('audit snapshots preserve immutable amendment identity, role, reason, and changes', () => {
  const amendment = {
    amendmentId: 'AMD-1',
    amendedByUserId: '04000001',
    amendedByName: 'Juan Dela Cruz',
    amendedByRole: 'MEMBER_FARMER',
    reason: 'Corrected fertilizer quantity from receipt.',
    amendedAt: '2026-09-10T08:30:00.000Z',
    changes: { quantity: { before: { value: 2, unit: 'bag' }, after: { value: 3, unit: 'bag' } } }
  };
  const snapshot = buildOperationSnapshot('LOG-1', {
    fieldId: 'FLD-1', cycleId: 'CYC-1', blockFarmId: 'BF-1', cropYearCycle: '2026-2027',
    stageNumberAtRecord: 3, operationDefinitionId: 'OP-1', operationName: 'Fertilizer Application',
    category: 'INPUT', variety: '', stageNumber: 3, performedOn: '2026-09-10', areaHa: 1,
    peopleCount: 2, quantity: { value: 3, unit: 'bag', inputName: 'Fertilizer' }, totalCost: 900,
    lineItems: [], amendments: [amendment]
  });

  assert.deepEqual(snapshot.amendments, [amendment]);
});

test('audit compilation uses canonical period and database-selected operation logs', () => {
  const routeSource = fs.readFileSync(path.join(repositoryRoot, 'server', 'routes', 'auditReports.js'), 'utf8');
  const webSource = fs.readFileSync(path.join(repositoryRoot, 'web', 'react-app', 'src', 'services', 'auditService.js'), 'utf8');
  const mobileSource = fs.readFileSync(path.join(repositoryRoot, 'mobile', 'src', 'screens', 'FieldOpsScreen.js'), 'utf8');

  assert.match(routeSource, /req\.body\.periodKey \?\? req\.body\.period/);
  assert.match(routeSource, /COLLECTIONS\.OPERATION_LOGS/);
  assert.match(routeSource, /startsWith\(`\$\{period\}-`\)/);
  assert.match(routeSource, /eligibleLogDocuments[\s\S]*buildOperationSnapshot/);
  assert.match(webSource, /periodKey/);
  assert.match(mobileSource, /periodKey/);
  assert.doesNotMatch(mobileSource, /includes\('2026'\)/);
  assert.doesNotMatch(mobileSource, /farmFields\.length \|\| 5/);
});

test('amendment audit events are server-atomic instead of a second mobile mutation', () => {
  const serverSource = fs.readFileSync(path.join(repositoryRoot, 'server', 'services', 'cropCycleOperations.js'), 'utf8');
  const mobileSource = fs.readFileSync(path.join(repositoryRoot, 'mobile', 'src', 'data', 'dataStore.js'), 'utf8');
  const amendmentFlow = mobileSource.slice(
    mobileSource.indexOf('export const updateOperationLogWithSecurity'),
    mobileSource.indexOf('export const archivePastLogsForField')
  );

  assert.match(serverSource, /transaction\.set\(ref, payload\);[\s\S]*transaction\.create\(auditEventRef/);
  assert.match(serverSource, /eventType: 'OPERATION_LOG_CORRECTION'/);
  assert.doesNotMatch(amendmentFlow, /logSystemEvent\(/);
});

test('three operations and one later amendment drain idempotently without changing operation count', async () => {
  const operations = [
    { id: 'SRA-04', totalCost: 4000, amendments: [] },
    { id: 'SRA-03', totalCost: 15000, amendments: [] },
    { id: 'SRA-01', totalCost: 1600, amendments: [] }
  ];
  const createQueue = operations.map((operation, index) => createMutationEnvelope(
    'operation_log', operation, { mutationId: `MUT-CREATE-${index + 1}` }
  ));
  const created = await drainMutationQueue(createQueue, async item => ({
    success: true,
    data: { id: item.payload.id, updatedAt: '2026-09-24T08:00:00.000Z' }
  }));

  assert.equal(created.processedCount, 3);
  assert.equal(created.remainingCount, 0);
  assert.equal(migrateOutbox(created.queue).length, 0, 'restart must not resurrect acknowledged writes');

  operations[1] = {
    ...operations[1],
    totalCost: 15500,
    amendments: [{
      amendmentId: 'AMD-SRA-03-1', amendedByUserId: '03000001', amendedByName: 'Juan Dela Cruz',
      amendedByRole: 'FARM_MANAGER', reason: 'Voucher cost adjustment',
      amendedAt: '2026-09-24T09:00:00.000Z', changes: { totalCost: { before: 15000, after: 15500 } }
    }]
  };
  const amendment = createMutationEnvelope('operation_amendment', {
    id: 'SRA-03', changes: { totalCost: 15500 }, amendment: operations[1].amendments[0]
  }, { mutationId: 'MUT-AMEND-SRA-03-1' });
  const amended = await drainMutationQueue([amendment], async item => ({
    success: true,
    data: { ...operations[1], id: item.payload.id, updatedAt: '2026-09-24T09:00:00.000Z' }
  }));

  assert.equal(amended.processedCount, 1);
  assert.equal(amended.remainingCount, 0);
  assert.equal(operations.length, 3, 'an amendment is not a fourth operation');
  assert.equal(operations.reduce((total, operation) => total + operation.totalCost, 0), 21100);
  assert.equal(operations[1].amendments.length, 1);
});
