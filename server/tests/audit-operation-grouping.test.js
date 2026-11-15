'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { auditOperationGroups, auditQuantityReadiness } = require('../domain/auditReportLayout');

const operation = extra => ({ operationId: 'BASAL', operationName: 'Basal Fertilizer Application', cropYearCycle: '2026-2027',
  stageNumber: 3, fieldId: 'A', areaHa: 2, performedOn: '2026-02-10', quantity: { value: 1, unit: 'bag' }, unitCost: 100, totalCost: 100, ...extra });

test('same operation across fields and months becomes one row with cumulative recorded area and quantity', () => {
  const records = [operation(), operation({ fieldId: 'B', areaHa: 1, quantity: { value: 2, unit: 'bag' }, totalCost: 200 }),
    operation({ fieldId: 'C', areaHa: 1.5, performedOn: '2026-03-12', quantity: { value: 3, unit: 'BAG' }, totalCost: 300 })];
  const before = structuredClone(records);
  const rows = auditOperationGroups({}, records);
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0].monthlyAreas, { '2026-02': 3, '2026-03': 1.5 });
  assert.equal(rows[0].areaHa, 4.5);
  assert.deepEqual(rows[0].quantity, { value: 6, unit: 'bag' });
  assert.equal(rows[0].totalCost, 600);
  assert.equal(rows[0].unitCost, 100);
  assert.equal(rows[0].sourceCount, 3);
  assert.deepEqual(rows[0].lineItems, []);
  assert.deepEqual(records, before, 'signed source snapshots stay unchanged');
});

test('actual child-operation and unit differences remain separate details under one heading', () => {
  const rows = auditOperationGroups({}, [operation({ childOperationName: 'First dose' }),
    operation({ childOperationName: 'Second dose' }), operation({ unitCost: 200, totalCost: 200 }),
    operation({ quantity: { value: 1, unit: 'liter' } })]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].lineItems.length, 4);
  assert.equal(rows[0].totalCost, 500);
  assert.ok(rows[0].lineItems.some(item => item.unitCost === 200));
  assert.ok(rows[0].lineItems.some(item => item.unit === 'liter'));
});

test('different prices for an operation without children produce one summed row with a labelled weighted average', () => {
  const [row] = auditOperationGroups({}, [operation({ operationName: 'Planting Operations', areaHa: 6.5,
    quantity: { value: 4, unit: 'HA' }, unitCost: 1000, totalCost: 4000 }),
    operation({ operationName: 'Planting Operations', areaHa: 1, quantity: { value: 1, unit: 'HA' }, unitCost: 2350, totalCost: 2350 })]);
  assert.equal(row.areaHa, 7.5);
  assert.equal(row.monthlyAreas['2026-02'], 7.5);
  assert.equal(row.quantity.value, 5);
  assert.equal(row.totalCost, 6350);
  assert.equal(row.lineItems.length, 0);
  assert.equal(row.childOperationName, '');
  assert.equal(row.unitCostVaries, true);
  assert.equal(row.unitCost, 1270, 'same-unit weighted average uses the actual quantities');
  assert.equal(row.priceCells.unitCostLabel, '1,270.00 (avg)');
  assert.deepEqual(row.priceCells.actualRateBreakdown.map(item => [item.quantity, item.rate]), [[4, 1000], [1, 2350]]);
});

test('different units in one plain operation retain separate quantity and price lines without invented children', () => {
  const rows = auditOperationGroups({}, [operation(), operation({ quantity: { value: 2, unit: 'liter' }, totalCost: 200 })]);
  assert.equal(rows.length, 1);
  assert.ok(rows.every(row => row.lineItems.length === 0));
  assert.equal(rows[0].priceCells.unitLabel, 'bag\nliter');
  assert.equal(rows[0].priceCells.quantityLabel, '1\n2');
  assert.equal(rows[0].quantity.value, null, 'unlike units have no fabricated combined quantity');
  assert.equal(rows.reduce((sum, row) => sum + row.totalCost, 0), 300);
});

test('real catalogue children remain named rows, aggregating repeat submissions for the same child', () => {
  const { getOperationDefinition } = require('../domain/operationCatalogue');
  const parent = getOperationDefinition('SRA-08');
  const records = ['SRA-08-1', 'SRA-08-2', 'SRA-08-3', 'SRA-08-1'].map(id => operation({
    operationId: undefined, operationDefinitionId: parent.id, operationName: parent.name, stageNumber: 4,
    childOperationDefinitionId: id, childOperationName: getOperationDefinition(id).name
  }));
  const [row] = auditOperationGroups({}, records);
  assert.equal(row.lineItems.length, 3);
  assert.equal(row.lineItems[0].description, 'Manual Weeding (1st Round)');
  assert.equal(row.lineItems[0].quantity, 2);
  assert.equal(row.totalCost, 400);
});

test('matching expense materials aggregate without counting the same operation area twice', () => {
  const records = [operation({ totalCost: 250, lineItems: [
    { description: '46-0-0', quantity: 1, unit: 'bag', unitCost: 100, subtotal: 100 },
    { description: '46-0-0', quantity: 1, unit: 'bag', unitCost: 100, subtotal: 100 }
  ] }), operation({ fieldId: 'B', areaHa: 1, totalCost: 300, lineItems: [
    { description: '46-0-0', quantity: 3, unit: 'bag', unitCost: 100, subtotal: 300 }
  ] })];
  const [row] = auditOperationGroups({}, records);
  const expense = row.lineItems.find(item => item.description === '46-0-0');
  assert.equal(expense.quantity, 5);
  assert.equal(expense.areaHa, 3);
  assert.equal(expense.monthlyAreas['2026-02'], 3);
  assert.equal(expense.subtotal, 500);
  assert.equal(row.lineItems.reduce((sum, item) => sum + item.subtotal, 0), 550, 'base costs are retained as well as expenses');
  assert.equal(row.totalCost, 550, 'authoritative operation totals retain labor/other recorded costs without summing item expenses again');
});

test('QTY and UNIT use selected operation data while attached and labor-only costs remain intact', () => {
  const laborOnly = () => operation({ quantity: null, unitCost: undefined, baseCost: 0, totalCost: 1000,
    laborEntries: [{ workerCount: 2, days: 1, rate: 500, subtotal: 1000 }] });
  const records = [laborOnly(), operation({ quantity: { value: 1, unit: 'HA' }, unitCost: undefined, baseCost: 1000, totalCost: 2350,
    laborEntries: [{ workerCount: 3, days: 3, rate: 150, subtotal: 1350 }] }), laborOnly(), laborOnly(), laborOnly()];
  const before = structuredClone(records);
  const [row] = auditOperationGroups({}, records);
  assert.equal(row.lineItems.length, 0);
  assert.equal(row.totalCost, 6350);
  assert.equal(row.quantity.value, 1);
  assert.equal(row.priceCells.quantityLabel, '1');
  assert.equal(row.priceCells.unitLabel, 'HA');
  assert.equal(row.priceCells.unitCostLabel, '2,350.00', 'a quantified plain operation includes its attached labor in the displayed unit cost');
  assert.equal(row.priceCells.weightedUnitRates.some(item => item.unit === 'worker-day'), false);
  assert.deepEqual(row.priceCells.actualRateBreakdown.filter(item => item.kind === 'labor').map(item => [item.quantity, item.rate, item.amount]),
    [[8, 500, 4000], [9, 150, 1350]]);
  assert.equal(row.totalCost, 6350, 'rounding the displayed average never recomputes expenditure as 6350.07');
  assert.deepEqual(records, before);
});

test('all supported selected operation units retain their selected quantity rather than using worker-days or hectares', () => {
  for (const unit of ['HA', 'ton', 'laksa', 'bag', 'liter', 'pcs', 'strip', 'Sample', 'pass', 'trip']) {
    const [row] = auditOperationGroups({}, [
      operation({ areaHa: 99, quantity: { value: 2, unit }, baseCost: 200, totalCost: 700,
        laborEntries: [{ workerCount: 1, days: 1, rate: 500, subtotal: 500 }] }),
      operation({ areaHa: 99, quantity: { value: 3, unit }, baseCost: 300, totalCost: 300 })
    ]);
    assert.equal(row.priceCells.quantityLabel, '5');
    assert.equal(row.priceCells.unitLabel, unit);
    assert.equal(row.priceCells.unitCostLabel, '200.00 (avg)');
    assert.equal(row.totalCost, 1000);
  }
});

test('labor-only records do not display invented QTY or UNIT and legacy saved units remain visible', () => {
  const record = operation({ quantity: null, unitCost: undefined, baseCost: 0, totalCost: 1000,
    laborEntries: [{ workerCount: 2, days: 1, rate: 500, subtotal: 1000 }] });
  const [row] = auditOperationGroups({}, [record]);
  assert.equal(row.priceCells.quantityLabel, 'Not recorded');
  assert.equal(row.priceCells.unitLabel, '-');
  assert.equal(row.priceCells.unitCostLabel, 'Not recorded');
  assert.equal(row.totalCost, 1000);
  const [legacy] = auditOperationGroups({}, [{ ...record, unit: 'ton' }]);
  assert.equal(legacy.priceCells.unitLabel, 'ton');
  assert.equal(legacy.priceCells.quantityLabel, 'Not recorded');
});

test('legacy records with missing quantities do not acquire a synthetic quantity or unit rate', () => {
  const [row] = auditOperationGroups({}, [operation({ quantity: null, unitCost: undefined, totalCost: 700 })]);
  assert.equal(row.quantity.value, null);
  assert.equal(row.priceCells.quantityLabel, 'Not recorded');
  assert.equal(row.priceCells.unitCostLabel, 'Not recorded');
  assert.equal(row.totalCost, 700);
});

test('crop identity, stage and unknown-cycle boundaries prevent unsafe grouping', () => {
  assert.equal(auditOperationGroups({}, [operation(), operation({ cropYearCycle: '2027-2028' }), operation({ stageNumber: 4 })]).length, 3);
  assert.equal(auditOperationGroups({}, [operation({ cropYearCycle: '', cycleId: 'CYCLE-A' }), operation({ cropYearCycle: '', cycleId: 'CYCLE-B' })]).length, 2);
});

test('future audit readiness requires actual operation or item quantities, not labor or a guessed unit', () => {
  const workerOnly = operation({ id: 'LEGACY-LABOR', quantity: null, baseCost: 0,
    laborEntries: [{ workerCount: 1, days: 1, rate: 100, subtotal: 100 }] });
  assert.equal(auditQuantityReadiness([workerOnly]).quantityReady, false);
  assert.equal(auditQuantityReadiness([{ ...workerOnly, quantity: { value: 2, unit: 'bag' } }]).quantityReady, true);
  assert.equal(auditQuantityReadiness([{ ...workerOnly, quantity: { value: 2, unit: '' } }]).quantityReady, false);
  assert.equal(auditQuantityReadiness([{ ...workerOnly, lineItems: [{ quantity: 2, unit: 'liter', unitCost: 50, subtotal: 100 }] }]).quantityReady, true);
  assert.equal(auditQuantityReadiness([{ ...workerOnly, baseCost: 50, lineItems: [{ quantity: 2, unit: 'liter', subtotal: 100 }] }]).quantityReady, false,
    'item quantities cannot hide an unquantified base charge');
  assert.equal(auditQuantityReadiness([{ ...workerOnly, lineItems: [{ quantity: null, unit: 'bag' }] }]).quantityReady, false);
});

test('labor-only operations with a selected reporting quantity have a cost per selected unit and no missing display fields', () => {
  const [row] = auditOperationGroups({}, [operation({ quantity: { value: 2, unit: 'HA' }, baseCost: 0, totalCost: 1000,
    laborEntries: [{ workerCount: 2, days: 1, rate: 500, subtotal: 1000 }] })]);
  assert.equal(row.priceCells.quantityLabel, '2');
  assert.equal(row.priceCells.unitLabel, 'HA');
  assert.equal(row.priceCells.unitCostLabel, '500.00');
  assert.equal(row.totalCost, 1000);
});

test('Basal audit unit cost matches the ledger including labor and retains the actual base rate separately', () => {
  const source = operation({ areaHa: 1.25, quantity: { value: 4, unit: 'ton' }, baseCost: 4000, totalCost: 5440,
    laborEntries: [{ workerCount: 12, days: 12, rate: 10, subtotal: 1440 }] });
  const before = structuredClone(source);
  const [row] = auditOperationGroups({}, [source]);
  assert.equal(row.priceCells.quantityLabel, '4');
  assert.equal(row.priceCells.unitLabel, 'ton');
  assert.equal(row.priceCells.unitCostLabel, '1,360.00');
  assert.equal(row.totalCost, 5440);
  assert.equal(row.priceCells.actualRateBreakdown.find(item => item.kind === 'direct').baseRate, 1000);
  assert.equal(row.priceCells.actualRateBreakdown.reduce((sum, item) => sum + item.amount, 0), 5440, 'labor is counted exactly once');
  assert.deepEqual(source, before);
  const [average] = auditOperationGroups({}, [source, { ...source, quantity: { value: 2, unit: 'ton' }, baseCost: 2000, totalCost: 2360,
    laborEntries: [{ workerCount: 1, days: 1, rate: 360, subtotal: 360 }] }]);
  assert.equal(average.priceCells.quantityLabel, '6');
  assert.equal(average.priceCells.unitCostLabel, '1,300.00 (avg)');
  assert.equal(average.totalCost, 7800);
  const [sameEffectiveRate] = auditOperationGroups({}, [source, { ...source, baseCost: 4800,
    laborEntries: [{ workerCount: 1, days: 1, rate: 640, subtotal: 640 }] }]);
  assert.equal(sameEffectiveRate.priceCells.unitCostLabel, '1,360.00');
  assert.deepEqual(sameEffectiveRate.priceCells.actualRateBreakdown.filter(item => item.kind === 'direct').map(item => item.baseRate), [1000, 1200],
    'equal effective costs must not erase different underlying base rates');
});

test('three Basal records add areas and selected quantities, weight their full costs and retain exact money after display rounding', () => {
  const records = [
    operation({ areaHa: 1.25, quantity: { value: 4, unit: 'ton' }, baseCost: 4000, totalCost: 5440,
      laborEntries: [{ workerCount: 12, days: 12, rate: 10, subtotal: 1440 }] }),
    operation({ fieldId: 'B', areaHa: 0.75, quantity: { value: 2, unit: 'ton' }, baseCost: 2000, totalCost: 2360,
      laborEntries: [{ workerCount: 1, days: 1, rate: 360, subtotal: 360 }] }),
    operation({ fieldId: 'C', areaHa: 1, quantity: { value: 3, unit: 'ton' }, baseCost: 3000, totalCost: 4500,
      laborEntries: [{ workerCount: 1, days: 1, rate: 1500, subtotal: 1500 }] })
  ];
  const before = structuredClone(records);
  const [row] = auditOperationGroups({}, records);
  assert.equal(row.sourceCount, 3);
  assert.equal(row.lineItems.length, 0);
  assert.equal(row.areaHa, 3);
  assert.equal(row.monthlyAreas['2026-02'], 3);
  assert.equal(row.quantity.value, 9);
  assert.equal(row.quantity.unit, 'ton');
  assert.equal(row.priceCells.unitCostLabel, '1,366.67 (avg)');
  assert.equal(row.totalCost, 12300, 'never replace exact recorded costs with 9 * the rounded 1366.67 display rate');
  assert.deepEqual(records, before);
});

test('server, Web and Mobile use the same grouping projection for representative report snapshots', async () => {
  const report = { cropYearCycle: '2026-2027', operationSnapshots: [operation(), operation({ fieldId: 'B', performedOn: '2026-03-10' }), operation({ unitCost: 200, totalCost: 200 })] };
  const expected = auditOperationGroups(report);
  for (const client of ['mobile', 'web/react-app']) {
    const source = fs.readFileSync(path.resolve(__dirname, '../..', client, 'src/utils/auditReportLayout.js'), 'utf8');
    const domain = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
    assert.deepEqual(domain.auditOperationGroups(report), expected);
  }
});
