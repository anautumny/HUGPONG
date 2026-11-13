'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');
const server = require('../domain/operationUnits');
const { buildOperationLog, buildOperationSnapshot } = require('../schema/firestoreSchema');
const { normalizeCustomOperationsPlan } = require('../domain/operationPlan');
const expected = ['HA', 'ton', 'laksa', 'bag', 'liter', 'pcs', 'strip', 'Sample', 'pass', 'trip'];
const source = file => fs.readFileSync(path.resolve(__dirname, '../..', file), 'utf8');
const standalone = async file => import(`data:text/javascript;base64,${Buffer.from(source(file)).toString('base64')}`);
const operation = (overrides = {}) => ({
  fieldId: 'FIELD-1', cycleId: 'CYCLE-1', submittedByUserId: 'MEMBER-1',
  submissionSource: 'FIELD_OWNER', operationDefinitionId: 'SRA-02',
  operationName: 'Land Preparation', category: 'prep', stageNumber: 1,
  performedOn: '2026-11-13', areaHa: 1, peopleCount: 0,
  quantity: { value: 2, unit: 'ha', inputName: '' }, baseCost: 20, totalCost: 20,
  lineItems: [], laborEntries: [], ...overrides
});

test('server, Web and Android expose exactly the ten beneficiary units in the same order', async () => {
  const web = await standalone('web/react-app/src/domain/operationUnits.js');
  const mobile = await standalone('mobile/src/domain/operationUnits.js');
  for (const contract of [server, web, mobile]) {
    assert.deepEqual(contract.OPERATION_UNITS, expected);
    for (const [input, output] of [['ha', 'HA'], [' L ', 'liter'], ['lac', 'laksa'], ['lacsa', 'laksa'],
      ['pieces', 'pcs'], ['pcs.', 'pcs'], ['strips', 'strip'], ['samples', 'Sample'], ['passes', 'pass'], ['tonnes', 'ton']]) {
      assert.equal(contract.canonicalOperationUnit(input), output);
    }
    for (const invalid of ['kg', 'm²', 'sqm', 'day', 'worker', 'pax', 'box', 'toString', '__proto__', '']) {
      assert.equal(contract.canonicalOperationUnit(invalid), null);
    }
  }
});

test('server accepts all beneficiary units for direct quantities, expense rows and operation plans', () => {
  for (const unit of expected) {
    const direct = buildOperationLog(operation({ quantity: { value: 2, unit } }));
    assert.equal(direct.quantity.unit, unit);
    assert.equal(direct.quantity.value, 2);
    const item = { lineItemId: 'ITEM-1', itemType: 'MATERIAL', description: 'Recorded input', quantity: 2, unit, unitCost: 10, subtotal: 20 };
    const grouped = buildOperationLog(operation({ quantity: null, baseCost: 0, lineItems: [item] }));
    assert.equal(grouped.lineItems[0].unit, unit);
    assert.equal(grouped.totalCost, 20);
    const plan = normalizeCustomOperationsPlan({ 1: [{ id: 'CUSTOM-1', name: 'Recorded work', unit, perHa: 2, rate: 10 }] });
    assert.equal(plan[1][0].unit, unit);
    assert.equal(plan[1][0].costPerHa, 20);
  }
});

test('aliases normalize on writes without altering quantities, rates or totals; unsupported new units are rejected', () => {
  for (const [input, output] of [['ha', 'HA'], ['L', 'liter'], ['lac', 'laksa']]) {
    const record = buildOperationLog(operation({ quantity: { value: 2, unit: input } }));
    assert.equal(record.quantity.unit, output);
    assert.equal(record.quantity.value, 2);
    assert.equal(record.totalCost, 20);
  }
  for (const unit of ['kg', 'm²', 'day', 'worker', 'unknown']) {
    assert.throws(() => buildOperationLog(operation({ quantity: { value: 2, unit } })), /supported operation unit/);
    assert.throws(() => buildOperationLog(operation({ quantity: null, baseCost: 0,
      lineItems: [{ lineItemId: 'ITEM-1', description: 'Recorded input', quantity: 2, unit, unitCost: 10, subtotal: 20 }] })), /supported operation unit/);
  }
});

test('only an unchanged server-loaded historical unit can survive an amendment', () => {
  const previousRecord = operation({ quantity: { value: 2, unit: 'kg' } });
  assert.equal(buildOperationLog(previousRecord, { previousRecord }).quantity.unit, 'kg');
  assert.throws(() => buildOperationLog(operation({ quantity: { value: 2, unit: 'm²' } }), { previousRecord }), /supported operation unit/);
  assert.throws(() => buildOperationLog({ ...previousRecord, previousRecord }), /supported operation unit/, 'client cannot provide its own trusted previous record');
  const item = { lineItemId: 'OLD-ITEM', description: 'Historical input', quantity: 2, unit: 'kg', unitCost: 10, subtotal: 20 };
  const historical = operation({ quantity: null, baseCost: 0, lineItems: [item] });
  assert.equal(buildOperationLog(historical, { previousRecord: historical }).lineItems[0].unit, 'kg');
  assert.throws(() => buildOperationLog({ ...historical, lineItems: [{ ...item, lineItemId: 'NEW-ITEM' }] }, { previousRecord: historical }), /supported operation unit/);
});

test('saved plans can retain retired units only for the same server-loaded operation or expense row', () => {
  const previousPlan = { 1: [{ id: 'CUSTOM-1', name: 'Existing plan', unit: 'kg', perHa: 2, rate: 10 }] };
  assert.equal(normalizeCustomOperationsPlan(previousPlan, { previousPlan })[1][0].unit, 'kg');
  assert.throws(() => normalizeCustomOperationsPlan(previousPlan), /unit is not supported/);
  assert.throws(() => normalizeCustomOperationsPlan({ 1: [{ ...previousPlan[1][0], id: 'CUSTOM-NEW' }] }, { previousPlan }), /unit is not supported/);
  const grouped = { 1: [{ id: 'CUSTOM-GROUP', name: 'Existing itemized plan', isGroup: true,
    subItems: [{ id: 'OLD-ITEM', description: 'Existing input', qty: 2, unit: 'kg', unitCost: 10 }] }] };
  assert.equal(normalizeCustomOperationsPlan(grouped, { previousPlan: grouped })[1][0].subItems[0].unit, 'kg');
  const changed = structuredClone(grouped);
  changed[1][0].subItems[0].id = 'NEW-ITEM';
  assert.throws(() => normalizeCustomOperationsPlan(changed, { previousPlan: grouped }), /unit is not supported/);
});

test('Android normalizes pending submissions while preserving historical snapshot and QR unit strings', async () => {
  const units = await standalone('mobile/src/domain/operationUnits.js');
  const context = { canonicalOperationUnit: units.canonicalOperationUnit };
  vm.createContext(context);
  vm.runInContext(source('mobile/src/data/firestoreSchema.js').replace(/^import .*;\r?\n/gm, '').replace(/export /g, ''), context);
  const historical = operation({
    quantity: { value: 2, unit: 'ha' }, baseCost: 0,
    lineItems: [{ lineItemId: 'ITEM-1', description: 'Seedpieces', quantity: 2, unit: 'lac', unitCost: 10, subtotal: 20 }]
  });
  const original = structuredClone(historical);
  context.input = historical;
  const pending = vm.runInContext('toOperationLogDocument(input)', context);
  assert.equal(pending.quantity.unit, 'HA');
  assert.equal(pending.lineItems[0].unit, 'laksa');
  const snapshot = vm.runInContext("operationSnapshot('OP-1', input)", context);
  assert.equal(snapshot.quantity.unit, 'ha');
  assert.equal(snapshot.lineItems[0].unit, 'lac');
  assert.equal(buildOperationSnapshot('OP-1', historical).lineItems[0].unit, 'lac');
  assert.deepEqual(historical, original);
});

test('Web normalizes submission units and preserves original strings in historical snapshots', async () => {
  const web = await import(pathToFileURL(path.resolve(__dirname, '../../web/react-app/src/services/firestoreSchema.js')).href);
  const historical = operation({ quantity: { value: 2, unit: 'ha' }, baseCost: 0,
    lineItems: [{ lineItemId: 'ITEM-1', description: 'Seedpieces', quantity: 2, unit: 'lac', unitCost: 10, subtotal: 20 }] });
  assert.equal(web.toOperation(historical).quantity.unit, 'HA');
  assert.equal(web.toOperation(historical).lineItems[0].unit, 'laksa');
  assert.equal(web.snapshot('OP-1', historical).quantity.unit, 'ha');
  assert.equal(web.snapshot('OP-1', historical).lineItems[0].unit, 'lac');
});

test('Web unit selectors preserve a retired saved value visibly and do not offer it as a new choice', async () => {
  const web = await standalone('web/react-app/src/domain/operationUnits.js');
  const options = web.operationUnitOptions('kg');
  assert.equal(options[0].value, 'kg');
  assert.equal(options[0].disabled, true);
  assert.deepEqual(options.filter(option => !option.disabled).map(option => option.value), expected);
});

test('all default Web/Android operation and expense templates use beneficiary units', async () => {
  for (const file of ['web/react-app/src/domain/operationCatalogue.js', 'mobile/src/domain/operationCatalogue.js']) {
    const catalogue = await standalone(file);
    for (const operation of catalogue.SRA_OPERATIONS_CATALOGUE) {
      for (const entry of [operation, ...(operation.subItems || []), ...(operation.childOperations || [])]) {
        if (entry.unit) assert.ok(expected.includes(entry.unit), `${file}: ${entry.id || entry.lineItemId} uses ${entry.unit}`);
      }
    }
  }
});
