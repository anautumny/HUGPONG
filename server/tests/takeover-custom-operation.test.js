'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildOperationLog } = require('../schema/firestoreSchema');

const root = path.join(__dirname, '..', '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('canonical operation schema accepts custom operations without photo evidence', () => {
  const operation = buildOperationLog({
    fieldId: 'FLD-001',
    cycleId: 'CYC-FLD-001-001',
    blockFarmId: 'BF-001',
    cropYearCycle: '2026-2027',
    stageNumberAtRecord: 2,
    submittedByUserId: '03000001',
    submissionSource: 'MANAGER_TAKEOVER',
    operationDefinitionId: 'CUSTOM',
    operationName: 'Canal clearing',
    category: 'General Care',
    stageNumber: 2,
    performedOn: '2026-09-23',
    areaHa: 1.5,
    peopleCount: 2,
    totalCost: 1200,
    lineItems: [],
    quantity: { value: 1.5, unit: 'ha', inputName: 'Canal clearing' },
    photoEvidence: null
  }, { submittedByUserId: '03000001', now: '2026-09-23T08:00:00.000Z' });

  assert.equal(operation.operationDefinitionId, 'CUSTOM');
  assert.equal(operation.operationName, 'Canal clearing');
  assert.equal(operation.photoEvidence, null);
});

test('mobile operation entry exposes Custom Operation before templates and has no photo attachment flow', () => {
  const source = read('mobile/src/screens/FieldOpsScreen.js');
  assert.doesNotMatch(source, /photoEvidence|ImagePicker|preparePhotoEvidence|form_attach_photo/);
  const customIndex = source.indexOf('Enter your own activity and cost');
  const templateIndex = source.indexOf('getFieldCustomOperations(safeField.id, task.stageNumber || i + 1).map', customIndex);
  assert.ok(customIndex > 0 && templateIndex > customIndex, 'Custom Operation must be visible before the template list');
  assert.match(source, /const openCustomOperationLog = targetTask =>/);
  assert.match(source, /logForm\.sraOperationId !== 'CUSTOM' && l\.sraOperationId === logForm\.sraOperationId/);
  assert.ok(source.indexOf('const parentStageNum', source.indexOf('const handleSaveLog')) < source.indexOf('existingMatchingLog', source.indexOf('const handleSaveLog')));
});

test('web operation surfaces include Custom Operation and have no photo attachment flow', () => {
  const modal = read('web/react-app/src/components/operations/AddOperationModal.jsx');
  const takeover = read('web/react-app/src/views/operations/TakeOverView.jsx');
  for (const source of [modal, takeover]) {
    assert.match(source, /CUSTOM: Enter a Custom Operation/);
    assert.match(source, /if \(opId === 'CUSTOM'\)/);
  }
  assert.doesNotMatch(modal, /photoEvidence|resizePhotoEvidence|Choose Photo|Field Photo/);
});
