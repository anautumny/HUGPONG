'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  activeAllocatedArea,
  attachBlockFarmAreaSummaries,
  blockFarmAreaSummary,
  assertDeclaredAreaCoversFields,
  assertFieldFitsBlockFarm,
  assertOperationFitsField
} = require('../domain/landArea');

const fields = [
  { id: 'FLD-1', status: 'ACTIVE', areaHa: 20 },
  { id: 'FLD-2', status: 'ACTIVE', areaHa: 25 },
  { id: 'FLD-OLD', status: 'ARCHIVED', areaHa: 100 }
];

test('active field allocations cannot exceed the Block Farm declared area', () => {
  assert.equal(activeAllocatedArea(fields), 45);
  assert.doesNotThrow(() => assertFieldFitsBlockFarm({
    declaredAreaHa: 50,
    fields,
    requestedAreaHa: 5,
    blockFarmId: 'BF-1'
  }));
  assert.throws(() => assertFieldFitsBlockFarm({
    declaredAreaHa: 50,
    fields,
    requestedAreaHa: 5.01,
    blockFarmId: 'BF-1'
  }), error => error.status === 409
    && error.data.code === 'BLOCK_FARM_AREA_EXCEEDED'
    && error.data.remainingAreaHa === 5);
});

test('Block Farm summaries expose an authoritative display area for current and legacy records', () => {
  assert.deepEqual(blockFarmAreaSummary({ declaredAreaHa: 50 }, fields), {
    declaredAreaHa: 50,
    allocatedAreaHa: 45,
    effectiveAreaHa: 50,
    remainingAreaHa: 5,
    areaSource: 'DECLARED_AREA'
  });
  assert.deepEqual(blockFarmAreaSummary({}, fields), {
    declaredAreaHa: null,
    allocatedAreaHa: 45,
    effectiveAreaHa: 45,
    remainingAreaHa: null,
    areaSource: 'ACTIVE_FIELDS'
  });

  const summarized = attachBlockFarmAreaSummaries(
    [{ id: 'BF-1' }, { id: 'BF-2', declaredAreaHa: 12 }],
    [
      { blockFarmId: 'BF-1', status: 'ACTIVE', areaHa: 7.5 },
      { blockFarmId: 'BF-2', status: 'ARCHIVED', areaHa: 99 }
    ]
  );
  assert.equal(summarized[0].effectiveAreaHa, 7.5);
  assert.equal(summarized[1].effectiveAreaHa, 12);
});

test('editing a field excludes its current allocation before checking the replacement', () => {
  assert.doesNotThrow(() => assertFieldFitsBlockFarm({
    declaredAreaHa: 50,
    fields,
    requestedAreaHa: 25,
    excludedFieldId: 'FLD-2',
    blockFarmId: 'BF-1'
  }));
  assert.throws(() => assertFieldFitsBlockFarm({
    declaredAreaHa: 50,
    fields,
    requestedAreaHa: 30.01,
    excludedFieldId: 'FLD-2',
    blockFarmId: 'BF-1'
  }), /remaining declared area/);
});

test('a Block Farm declaration cannot be reduced below active field allocations', () => {
  assert.doesNotThrow(() => assertDeclaredAreaCoversFields({ declaredAreaHa: 45, fields, blockFarmId: 'BF-1' }));
  assert.throws(() => assertDeclaredAreaCoversFields({ declaredAreaHa: 44.99, fields, blockFarmId: 'BF-1' }), error => (
    error.status === 409 && error.data.code === 'BLOCK_FARM_DECLARED_AREA_TOO_SMALL'
  ));
});

test('operation hectares cannot exceed the registered field area', () => {
  assert.doesNotThrow(() => assertOperationFitsField(5, 5, 'FLD-1'));
  assert.throws(() => assertOperationFitsField(5.01, 5, 'FLD-1'), error => (
    error.status === 409
    && error.data.code === 'FIELD_OPERATION_AREA_EXCEEDED'
    && error.data.fieldAreaHa === 5
  ));
});

test('every active Web and Mobile operation form exposes the field-area limit', () => {
  const root = path.resolve(__dirname, '..', '..');
  const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
  const webAdd = read('web/react-app/src/components/operations/AddOperationModal.jsx');
  const webEdit = read('web/react-app/src/components/operations/EditOperationModal.jsx');
  const webTakeover = read('web/react-app/src/views/operations/TakeOverView.jsx');
  const mobileOperations = read('mobile/src/screens/FieldOpsScreen.js');

  [webAdd, webEdit, webTakeover].forEach(source => {
    assert.match(source, /cannot exceed this field's registered area/);
    assert.match(source, /max=\{Number\(/);
  });
  assert.match(mobileOperations, /Area Exceeds Field/);
  assert.match(mobileOperations, /Maximum: \{operationFieldAreaHa\.toFixed\(2\)\} ha registered for this field/);
});

test('mobile contains no local field-assignment path that can rewrite hectares', () => {
  const root = path.resolve(__dirname, '..', '..');
  const store = fs.readFileSync(path.join(root, 'mobile/src/data/dataStore.js'), 'utf8');
  const fieldOperations = fs.readFileSync(path.join(root, 'mobile/src/screens/FieldOpsScreen.js'), 'utf8');
  assert.doesNotMatch(store, /assignmentRequests|requestFieldAssignment|resolveAssignmentRequest/);
  assert.doesNotMatch(fieldOperations, /assignmentRequests|requestFieldAssignment|resolveAssignmentRequest/);
});

test('Block Farm screens and reports use plain address and registry wording', () => {
  const root = path.resolve(__dirname, '..', '..');
  const sources = [
    'web/react-app/src/components/fields/BlockFarmModal.jsx',
    'web/react-app/src/views/fields/FarmFieldRegistryView.jsx',
    'web/react-app/src/components/audit/PrintableAuditReport.jsx',
    'mobile/src/services/auditPdfService.js'
  ].map(relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8')).join('\n');
  assert.match(sources, /label="Address"/);
  assert.match(sources, /Brgy\. Kapitan Ramon, Silay City/);
  assert.doesNotMatch(sources, /Geographic|Spatial Governance|Jurisdiction|>LOCATION<|Location not provided/);
});
