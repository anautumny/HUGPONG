'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { auditReportLayout, operationMonth } = require('../domain/auditReportLayout');
const { auditCropYearCycles } = require('../domain/auditWorkflow');
const root = path.resolve(__dirname, '../..');

test('calendar columns use operation dates, including harvesting, without generating a future crop year', async () => {
  const report = { periodKey: '2026-10', cropYearCycle: '2026-2027', operationSnapshots: [
    { performedOn: '2026-10-15', stageNumber: 6, operationName: 'Milling' },
    { performedOn: '2026-01-01', stageNumber: 1 },
  ] };
  const layout = auditReportLayout(report);
  assert.deepEqual(layout.years, ['2026']);
  assert.equal(layout.columnCount, 19);
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

test('mobile PDF places harvesting in October and omits fabricated next-year headers', () => {
  let source = fs.readFileSync(path.join(root, 'mobile/src/services/auditPdfService.js'), 'utf8')
    .replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '');
  const context = { auditCropYearCycles, auditReportLayout, operationMonth,
    formatCropYearDisplay: value => value.replace('-', '–'),
    QRCode: require('../../mobile/node_modules/qrcode'),
  };
  vm.createContext(context); vm.runInContext(source, context);
  const html = context.buildAuditReportHtml({ reportId: 'AUD-TEST-2026-10-V1', periodKey: '2026-10', cropYearCycle: '2026-2027', integrityHash: 'TEST-HASH',
    operationSnapshots: [{ id: 'OP-1', fieldId: 'FLD-1', cropYearCycle: '2026-2027', performedOn: '2026-10-15', stageNumber: 6, operationName: 'Milling', areaHa: 4, totalCost: 4135 }],
  });
  assert.match(html, /Calendar year 2026/);
  assert.doesNotMatch(html, /2027–2028|Calendar year 2027|\$\{layout/);
  const row = html.match(/<td class="bold">Milling<\/td>([\s\S]*?)<td class="number bold">/)[1];
  const months = [...row.matchAll(/<td class="number month">(.*?)<\/td>/g)].map(match => match[1]);
  assert.equal(months.length, 12);
  assert.equal(months[9], '4.00');
  assert.equal(months.filter(Boolean).length, 1);
});
