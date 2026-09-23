'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

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
