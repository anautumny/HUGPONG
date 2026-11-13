'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { auditReportLayout, operationMonth, reportingMonthLabel } = require('../domain/auditReportLayout');
const { auditCropYearCycles } = require('../domain/auditWorkflow');
const root = path.resolve(__dirname, '../..');

test('numeric calendar columns use only the included month span, including harvesting', async () => {
  const report = { periodKey: '2026-10', cropYearCycle: '2026-2027', operationSnapshots: [
    { performedOn: '2026-10-15', stageNumber: 6, operationName: 'Milling' },
    { performedOn: '2026-01-01', stageNumber: 1 },
  ] };
  const layout = auditReportLayout(report);
  assert.deepEqual(layout.years, ['2026']);
  assert.equal(layout.columnCount, 17);
  assert.equal(layout.columns[0], '2026-01');
  assert.equal(layout.columns.at(-1), '2026-10');
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
  const context = { auditCropYearCycles, auditReportLayout, operationMonth, reportingMonthLabel,
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
  assert.equal(months.length, 1);
  assert.equal(months[0], '4.00');
  assert.equal(months.filter(Boolean).length, 1);
});

test('February starts at 2 and continuation ends at the last actual month rather than a fixed 12 plus 3', () => {
  const report = { periodKey: '2028-04', cropYearCycle: '2027-2028', operationSnapshots: [
    { cropYearCycle: '2027-2028', performedOn: '2027-02-10' },
    { cropYearCycle: '2027-2028', performedOn: '2028-04-21' }
  ] };
  const original = structuredClone(report);
  const layout = auditReportLayout(report);
  assert.equal(layout.columns.length, 15);
  assert.equal(layout.columns[0], '2027-02');
  assert.equal(layout.columnLabels[layout.columns[0]], 2);
  assert.deepEqual(layout.groups.map(group => [group.cropYearCycle, group.columns.length]), [['2027-2028', 11], ['2028-2029', 4]]);
  assert.equal(layout.columns.at(-1), '2028-04');
  assert.equal(layout.columnLabels[layout.columns.at(-1)], 4);
  assert.deepEqual(report, original, 'presentation does not roll over or alter the crop');
});

test('short, long, historical and out-of-order spans never depend on the current year', () => {
  assert.deepEqual(auditReportLayout({ periodKey: '2027-02', cropYearCycle: '2027-2028' }).columns, ['2027-02']);
  const layout = auditReportLayout({ cropYearCycle: '2023-2024', operationSnapshots: [
    { performedOn: '2025-08-01' }, { performedOn: '2023-11-02' }, { performedOn: '2024-06-01' }
  ] });
  assert.equal(layout.columns.length, 22);
  assert.deepEqual(layout.groups.map(group => group.cropYearCycle), ['2023-2024', '2024-2025', '2025-2026']);
  assert.deepEqual(layout.groups.map(group => group.columns.length), [2, 12, 8]);
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
