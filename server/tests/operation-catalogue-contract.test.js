'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const server = require('../domain/operationCatalogue');
const serverVarieties = require('../domain/sugarcaneVarieties');

async function importStandaloneModule(relativePath) {
  const source = fs.readFileSync(path.resolve(__dirname, relativePath), 'utf8');
  const url = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
  return import(url);
}

test('web and Android retain the same operation identity, stage, and cost contract', async () => {
  const web = await importStandaloneModule('../../web/react-app/src/domain/operationCatalogue.js');
  const mobile = await importStandaloneModule('../../mobile/src/domain/operationCatalogue.js');
  const stableProjection = catalogue => catalogue.map(operation => ({
    id: operation.id,
    name: operation.name,
    category: operation.category,
    stageNumber: operation.stageNumber,
    costPerHa: operation.costPerHa
  }));

  assert.equal(web.SRA_OPERATIONS_CATALOGUE.length, 14);
  assert.equal(mobile.SRA_OPERATIONS_CATALOGUE.length, 14);
  assert.deepEqual(
    stableProjection(mobile.SRA_OPERATIONS_CATALOGUE),
    stableProjection(web.SRA_OPERATIONS_CATALOGUE)
  );
});

test('mobile default-stage templates remain detached copies', async () => {
  const mobile = await importStandaloneModule('../../mobile/src/domain/operationCatalogue.js');
  const first = mobile.getDefaultStageOperations(1);
  const second = mobile.getDefaultStageOperations(1);

  assert.deepEqual(first.map(operation => operation.id), ['SRA-01', 'SRA-02']);
  assert.notStrictEqual(first, second);
  assert.notStrictEqual(first[0], second[0]);
  assert.notStrictEqual(first[0].subItems, second[0].subItems);
});

test('server, web, and Android enforce one exact 14-operation stage map', async () => {
  const web = await importStandaloneModule('../../web/react-app/src/domain/operationCatalogue.js');
  const mobile = await importStandaloneModule('../../mobile/src/domain/operationCatalogue.js');
  const projection = catalogue => catalogue.map(({ id, name, category, stageNumber }) => ({ id, name, category, stageNumber }));
  const expectedIdsByStage = {
    1: ['SRA-01', 'SRA-02'],
    2: ['SRA-03', 'SRA-04'],
    3: ['SRA-05', 'SRA-06'],
    4: ['SRA-07', 'SRA-08'],
    5: ['SRA-09', 'SRA-10'],
    6: ['SRA-11', 'SRA-12', 'SRA-13', 'SRA-14']
  };

  assert.deepEqual(projection(server.SRA_OPERATIONS_CATALOGUE), projection(web.SRA_OPERATIONS_CATALOGUE));
  assert.deepEqual(projection(server.SRA_OPERATIONS_CATALOGUE), projection(mobile.SRA_OPERATIONS_CATALOGUE));
  assert.equal(new Set(server.SRA_OPERATIONS_CATALOGUE.map(operation => operation.id)).size, 14);
  for (const [stageNumber, ids] of Object.entries(expectedIdsByStage)) {
    assert.deepEqual(server.getOperationsForStage(stageNumber).map(operation => operation.id), ids);
    assert.deepEqual(web.getOperationsForStage(stageNumber).map(operation => operation.id), ids);
    assert.deepEqual(mobile.getOperationsForStage(stageNumber).map(operation => operation.id), ids);
  }
});

test('server, web, and Android expose the same authoritative sugarcane varieties', async () => {
  const web = await importStandaloneModule('../../web/react-app/src/domain/sugarcaneVarieties.js');
  const mobile = await importStandaloneModule('../../mobile/src/domain/sugarcaneVarieties.js');
  const expected = [
    'PHIL 2006-2289', 'PHIL 2006-1899', 'PHIL 2005-1763', 'PHIL 2005-0483',
    'PHIL 2005-0055', 'PHIL 2003-1727', 'PHIL 2003-0021', 'PHIL 2002-0421',
    'PHIL 2000-2417', 'PHIL 2000-2155', 'PHIL 2000-1419', 'PHIL 99-0925',
    'PHIL 2005-1197', 'PHIL 2005-0645', 'PHIL 2004-1011', 'PHIL 2004-0827',
    'PHIL 2003-1389', 'PHIL 2002-0359', 'PHIL 2001-0295', 'PHIL 2000-2569',
    'PHIL 2000-0791', 'PHIL 99-2641', 'PHIL 99-1427', 'PHIL 99-1793',
    'PHIL 97-2041', 'PHIL 97-1123', 'PHIL 97-0693'
  ];

  assert.deepEqual(serverVarieties.SUGARCANE_VARIETIES, expected);
  assert.deepEqual(web.SUGARCANE_VARIETIES, expected);
  assert.deepEqual(mobile.SUGARCANE_VARIETIES, expected);
  assert.equal(serverVarieties.canonicalSugarcaneVariety(' phil 99-1793 '), 'PHIL 99-1793');
  assert.equal(serverVarieties.canonicalSugarcaneVariety('Other / Local High Yield'), null);
});

test('field enrollment surfaces exclude variety and initial-stage input', () => {
  const webEnrollment = fs.readFileSync(path.resolve(__dirname, '../../web/react-app/src/components/fields/FieldEnrollmentModal.jsx'), 'utf8');
  const webEdit = fs.readFileSync(path.resolve(__dirname, '../../web/react-app/src/components/fields/FieldEditModal.jsx'), 'utf8');
  const mobile = fs.readFileSync(path.resolve(__dirname, '../../mobile/src/screens/FieldOpsScreen.js'), 'utf8');

  assert.doesNotMatch(webEnrollment, /Cane Variety|Initial Crop Stage|currentStageNumber:\s*Number/);
  assert.doesNotMatch(webEdit, /edit-variety|Cane Variety/);
  assert.doesNotMatch(mobile, /managerAssignForm\.variety|managerAssignForm\.stageNumber|Initial Crop Stage/);
  assert.match(webEnrollment, /Generated by the server after enrollment/);
  assert.match(mobile, /System generated/);
});

test('Takeover stage change clears selection and filters operation options', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../../web/react-app/src/views/operations/TakeOverView.jsx'), 'utf8');
  assert.match(source, /setSelectedOpId\(''\)/);
  assert.match(source, /getOperationsForStage\(selectedStageNumber\)/);
  assert.match(source, /disabled=\{!selectedStageNumber\}/);
});
