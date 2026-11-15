'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { auditReportLayout, operationMonth, reportingMonthLabel, auditOperationGroups } = require('../domain/auditReportLayout');
const { auditCropYearCycles } = require('../domain/auditWorkflow');
const root = path.resolve(__dirname, '../..');

test('numeric calendar columns show the full first year and preserve harvesting placement', async () => {
  const report = { periodKey: '2026-10', cropYearCycle: '2026-2027', operationSnapshots: [
    { performedOn: '2026-10-15', stageNumber: 6, operationName: 'Milling' },
    { performedOn: '2026-01-01', stageNumber: 1 },
  ] };
  const layout = auditReportLayout(report);
  assert.deepEqual(layout.years, ['2026']);
  assert.equal(layout.columnCount, 19);
  assert.equal(layout.columns[0], '2026-01');
  assert.equal(layout.columns.at(-1), '2026-12');
  assert.equal(layout.groups[0].label, 'Crop Year Cycle 2026-2027');
  assert.equal(operationMonth(report.operationSnapshots[0], layout.period), '2026-10');
  assert.equal(operationMonth({}, layout.period), '2026-10');
  assert.equal(operationMonth({}, ''), '');
  for (const client of ['mobile', 'web/react-app']) {
    const source = fs.readFileSync(path.join(root, client, 'src/utils/auditReportLayout.js'), 'utf8');
    const module = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
    assert.deepEqual(module.auditReportLayout(report), layout);
    assert.equal(module.operationMonth(report.operationSnapshots[0]), '2026-10');
  }
});

test('historical and cross-calendar reports retain their recorded years', () => {
  const report = { periodKey: '2024-12', operationSnapshots: [{ performedOn: '2024-12-31' }, { performedOn: '2025-10-01' }] };
  const layout = auditReportLayout(report);
  assert.deepEqual(layout.years, ['2024', '2025']);
  assert.ok(layout.columns.includes('2025-10'));
  assert.ok(!layout.columns.includes('2026-01'));
});

test('immutable operation crop years take precedence over stale aggregate metadata on all clients', () => {
  const args = [{ cropYearCycles: ['2026-2027', '2027-2028'] }, [{ cropYearCycle: '2026-2027' }], [{ cropYearCycle: '2027-2028' }]];
  assert.deepEqual(auditCropYearCycles(...args), ['2026-2027']);
  for (const client of ['mobile', 'web/react-app']) {
    const source = fs.readFileSync(path.join(root, client, 'src/domain/auditWorkflow.js'), 'utf8');
    const canonical = source.slice(source.indexOf('function canonicalCropYearCycle('), source.indexOf('export function nextCropYearCycle'));
    const fn = source.slice(source.indexOf('export function auditCropYearCycles('), source.indexOf('export function canonicalAuditReport(')).replace('export ', '');
    const result = vm.runInNewContext(`${canonical}\n${fn}\nauditCropYearCycles(...args)`, { args });
    assert.deepEqual(Array.from(result), ['2026-2027']);
  }
  assert.deepEqual(auditCropYearCycles({}, [{ cropYearCycle: '2026-2027' }, { cropYearCycle: '2025-2026' }]), ['2025-2026', '2026-2027']);
});

test('mobile PDF places harvesting in October and uses the recorded cycle without future columns', () => {
  let source = fs.readFileSync(path.join(root, 'mobile/src/services/auditPdfService.js'), 'utf8')
    .replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '');
  const context = { auditCropYearCycles, auditReportLayout, operationMonth, reportingMonthLabel, auditOperationGroups,
    formatCropYearDisplay: value => value.replace('-', '–'),
    QRCode: require('../../mobile/node_modules/qrcode'),
  };
  vm.createContext(context); vm.runInContext(source, context);
  const html = context.buildAuditReportHtml({ reportId: 'AUD-TEST-2026-10-V1', periodKey: '2026-10', cropYearCycle: '2026-2027', integrityHash: 'TEST-HASH',
    operationSnapshots: [{ id: 'OP-1', fieldId: 'FLD-1', cropYearCycle: '2026-2027', performedOn: '2026-10-15', stageNumber: 6, operationName: 'Milling', areaHa: 4, totalCost: 4135 }],
  });
  assert.match(html, /Crop Year Cycle 2026-2027/);
  assert.match(html, /October 2026/);
  assert.doesNotMatch(html, /2027–2028|Calendar year|\$\{layout/);
  const row = html.match(/<td class="bold">Milling<\/td>([\s\S]*?)<td class="number bold">/)[1];
  const months = [...row.matchAll(/<td class="number month">(.*?)<\/td>/g)].map(match => match[1]);
  assert.equal(months.length, 12);
  assert.equal(months[9], '4.00');
  assert.equal(months.filter(Boolean).length, 1);
  assert.match(html, /<td class="bold">Milling<\/td>[\s\S]*?<td class="number bold">4,135\.00<\/td>\s*<\/tr>/);
  assert.doesNotMatch(html, /Coverage:|Numbers are calendar months|Total recorded expenditure|Continuation headers/);
  const totalRows = [...html.matchAll(/<tr class="(?:total|grand)-row">([\s\S]*?)<\/tr>/g)];
  assert.equal(totalRows.length, 3);
  for (const [, row] of totalRows) {
    assert.equal([...row.matchAll(/<td\b/g)].length, 19, 'each total row preserves the full monthly grid');
    assert.doesNotMatch(row, /colspan/);
  }
  assert.match(totalRows.at(-1)[1], /<td><\/td><td>TOTAL COST OF PRODUCTION \(PHP\)<\/td>/);
  assert.match(totalRows.at(-1)[1], /<td class="number">4,135\.00<\/td>$/);
});

test('Mobile expenditure totals sum authoritative operation costs across different field areas without counting line items twice', () => {
  const source = fs.readFileSync(path.join(root, 'mobile/src/services/auditPdfService.js'), 'utf8')
    .replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '');
  const context = { auditCropYearCycles, auditReportLayout, operationMonth, reportingMonthLabel, auditOperationGroups,
    formatCropYearDisplay: value => value, QRCode: require('../../mobile/node_modules/qrcode') };
  vm.createContext(context); vm.runInContext(source, context);
  const report = { reportId: 'EXPENDITURE-REGRESSION', periodKey: '2026-10', cropYearCycle: '2026-2027', integrityHash: 'TEST-HASH',
    operationSnapshots: [
      { fieldId: 'A', areaHa: 1.25, operationName: 'Land Preparation', stageNumber: 1, totalCost: 125.5,
        lineItems: [{ description: 'Recorded expense', quantity: 1, unitCost: 100, subtotal: 100 }] },
      { fieldId: 'B', areaHa: 2.75, operationName: 'Cane Cutting', stageNumber: 6, totalCost: 275 },
      { fieldId: 'B', areaHa: 2.75, operationName: 'No-charge operation', stageNumber: 1, totalCost: 0, cost: 999 }
    ] };
  const before = JSON.stringify(report);
  for (const multiplier of [1, 2]) {
    const scoped = { ...report, operationSnapshots: report.operationSnapshots.map(item => ({ ...item, areaHa: item.areaHa * multiplier })) };
    const html = context.buildAuditReportHtml(scoped);
    const values = [...html.matchAll(/<tr class="(?:total|grand)-row">[\s\S]*?<td class="number">([^<]+)<\/td><\/tr>/g)].map(match => match[1]);
    assert.deepEqual(values, ['125.50', '275.00', '400.50']);
    assert.match(html, /<td class="indent">Recorded expense<\/td>[\s\S]*?<td class="number bold">100\.00<\/td>\s*<\/tr>/,
      'expense cost is quantity times price without an area divisor');
  }
  assert.equal(JSON.stringify(report), before);
});

test('Mobile Basal PDF uses the same full-cost unit rate as the ledger without modifying the signed snapshot', () => {
  const source = fs.readFileSync(path.join(root, 'mobile/src/services/auditPdfService.js'), 'utf8')
    .replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '');
  const context = { auditCropYearCycles, auditReportLayout, operationMonth, reportingMonthLabel, auditOperationGroups,
    formatCropYearDisplay: value => value, QRCode: require('../../mobile/node_modules/qrcode') };
  vm.createContext(context); vm.runInContext(source, context);
  const report = { reportId: 'BASAL-RATE-REGRESSION', integrityHash: 'TEST-HASH', periodKey: '2026-11', cropYearCycle: '2026-2027', operationSnapshots: [{
    operationName: 'Basal Fertilizer Application (Labor & Materials)', performedOn: '2026-11-15', areaHa: 1.25,
    quantity: { value: 4, unit: 'ton' }, baseCost: 4000, totalCost: 5440, lineItems: [],
    laborEntries: [{ workerCount: 12, days: 12, rate: 10, subtotal: 1440 }] }] };
  const before = JSON.stringify(report);
  const html = context.buildAuditReportHtml(report);
  assert.match(html, /<td class="center">4<\/td>\s*<td class="center">ton<\/td>\s*<td class="number">1,360\.00<\/td>\s*<td class="number bold">5,440\.00<\/td>/);
  assert.equal(JSON.stringify(report), before);
});

test('the first block starts at 1 and continuation ends at the last actual month', () => {
  const report = { periodKey: '2028-04', cropYearCycle: '2027-2028', operationSnapshots: [
    { cropYearCycle: '2027-2028', performedOn: '2027-02-10' },
    { cropYearCycle: '2027-2028', performedOn: '2028-04-21' }
  ] };
  const original = structuredClone(report);
  const layout = auditReportLayout(report);
  assert.equal(layout.columns.length, 16);
  assert.equal(layout.columns[0], '2027-01');
  assert.equal(layout.columnLabels[layout.columns[0]], 1);
  assert.deepEqual(layout.groups.map(group => [group.cropYearCycle, group.columns.length]), [['2027-2028', 12], ['2028-2029', 4]]);
  assert.equal(layout.columns.at(-1), '2028-04');
  assert.equal(layout.columnLabels[layout.columns.at(-1)], 4);
  assert.deepEqual(report, original, 'presentation does not roll over or alter the crop');
});

test('short, long, historical and out-of-order spans never depend on the current year', () => {
  assert.equal(auditReportLayout({ periodKey: '2027-02', cropYearCycle: '2027-2028' }).columns.length, 12);
  const layout = auditReportLayout({ cropYearCycle: '2023-2024', operationSnapshots: [
    { performedOn: '2025-08-01' }, { performedOn: '2023-11-02' }, { performedOn: '2024-06-01' }
  ] });
  assert.equal(layout.columns.length, 32);
  assert.deepEqual(layout.groups.map(group => group.cropYearCycle), ['2023-2024', '2024-2025', '2025-2026']);
  assert.deepEqual(layout.groups.map(group => group.columns.length), [12, 12, 8]);
  assert.equal(reportingMonthLabel('2026-10'), 'October 2026');
  assert.equal(reportingMonthLabel('2027-02'), 'February 2027');
});

test('separate recorded crop cycles retain their own headers when a report includes several crops', () => {
  const layout = auditReportLayout({ cropYearCycles: ['2090-2091'], operationSnapshots: [
    { cropYearCycle: '2024-2025', performedOn: '2025-02-01' },
    { cropYearCycle: '2026-2027', performedOn: '2026-04-01' }
  ] });
  assert.deepEqual(layout.groups.map(group => group.cropYearCycle), ['2024-2025', '2026-2027']);
  assert.doesNotMatch(JSON.stringify(layout.groups), /2090/);
});
