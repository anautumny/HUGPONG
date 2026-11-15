import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createAuditReportPdf, createCropYearCompilationPdf } from '../src/services/auditPdfService.js';
import { auditReportLayout, reportingMonthLabel } from '../src/utils/auditReportLayout.js';

const report = () => ({ reportId: 'TEST-LAYOUT-ONLY', periodKey: '2028-04', cropYearCycle: '2027-2028', status: 'COMPILED',
  blockFarmId: 'TEST-FARM', blockFarmName: 'Layout Verification Farm', compiledByName: 'Verification Manager',
  qrHash: 'TEST-LAYOUT-NOT-A-REAL-AUDIT', operationSnapshots: [
    { operationLogId: 'TEST-1', fieldId: 'TEST-FIELD', cycleId: 'TEST-CYCLE', cropYearCycle: '2027-2028', performedOn: '2027-02-10',
      operationName: 'Soil Sampling', stageNumber: 1, areaHa: 4, quantity: { value: 1, unit: 'Sample' }, totalCost: 100 },
    { operationLogId: 'TEST-2', fieldId: 'TEST-FIELD', cycleId: 'TEST-CYCLE', cropYearCycle: '2027-2028', performedOn: '2028-04-21',
      operationName: 'Cane Cutting', stageNumber: 6, areaHa: 4, quantity: { value: 60, unit: 'ton' }, totalCost: 27000 }
  ] });

test('download creates an actual landscape PDF with crop headers and a full first year and continuation through April', () => {
  const original = report();
  const before = structuredClone(original);
  const { doc, filename, layout } = createAuditReportPdf(original);
  const bytes = new Uint8Array(doc.output('arraybuffer'));
  assert.equal(new TextDecoder().decode(bytes.slice(0, 5)), '%PDF-');
  assert.ok(bytes.length > 2000);
  assert.ok(doc.internal.pageSize.getWidth() > doc.internal.pageSize.getHeight());
  assert.equal(filename, 'HUGPONG_TEST-LAYOUT-ONLY_Audit_Report.pdf');
  assert.equal(layout.columnLabels[layout.columns[0]], 1);
  assert.equal(layout.columnLabels[layout.columns.at(-1)], 4);
  assert.deepEqual(layout.groups.map(group => group.columns.length), [12, 4]);
  const commands = doc.internal.pages.flat().join('\n');
  assert.match(commands, /April 2028/);
  assert.match(commands, /CROP YEAR CYCLE 2027-2028/);
  assert.match(commands, /CROP YEAR CYCLE 2028-2029/);
  assert.doesNotMatch(commands, /Calendar year/);
  assert.deepEqual(original, before, 'PDF export cannot alter signed snapshots or crop identity');
});

test('month names format reporting metadata while table labels remain numbers', () => {
  assert.equal(reportingMonthLabel('2026-10'), 'October 2026');
  const layout = auditReportLayout({ cropYearCycle: '2031-2032', operationSnapshots: [{ performedOn: '2031-08-04' }, { performedOn: '2031-10-06' }] });
  assert.deepEqual(Object.values(layout.columnLabels), Array.from({ length: 12 }, (_, index) => index + 1));
  assert.equal(layout.groups[0].cropYearCycle, '2031-2032');
});

test('export keeps all cost totals inside full-grid table rows without explanatory notes or an outside total', () => {
  const { doc, layout } = createAuditReportPdf(report());
  assert.equal(doc.lastAutoTable.head[0].raw.at(-1).content, 'OPERATION COST');
  const commands = doc.internal.pages.flat().join('\n');
  assert.doesNotMatch(commands, /Coverage:|Numbers are calendar months|Total recorded expenditure|Continuation headers/);
  const expected = new Map([['TOTAL DIRECT COST (PHP)', '100.00'], ['TOTAL MILLING EXPENSES (PHP)', '27,000.00'], ['TOTAL COST OF PRODUCTION (PHP)', '27,100.00']]);
  for (const [label, amount] of expected) {
    const row = doc.lastAutoTable.body.find(item => item.raw[1]?.content === label);
    assert.ok(row, label);
    assert.equal(row.raw.length, layout.columnCount);
    assert.equal(Object.keys(row.cells).length, layout.columnCount);
    assert.equal(row.cells[1].colSpan, 1);
    assert.equal(row.raw.at(-1).content, amount);
  }
});

test('full expenditure totals are independent of hectares and do not count expense lines twice or override an explicit zero cost', () => {
  const original = report();
  original.operationSnapshots = [
    { ...original.operationSnapshots[0], fieldId: 'A', areaHa: 1.25, totalCost: 125.5,
      lineItems: [{ description: 'Recorded expense', quantity: 1, unitCost: 100, subtotal: 100 }] },
    { ...original.operationSnapshots[1], fieldId: 'B', areaHa: 2.75, totalCost: 275 },
    { ...original.operationSnapshots[0], fieldId: 'B', areaHa: 2.75, totalCost: 0, cost: 999 }
  ];
  const before = structuredClone(original);
  for (const multiplier of [1, 2]) {
    const scoped = { ...original, operationSnapshots: original.operationSnapshots.map(item => ({ ...item, areaHa: item.areaHa * multiplier })) };
    const { doc } = createAuditReportPdf(scoped);
    const values = doc.lastAutoTable.body.filter(row => /^TOTAL .+\(PHP\)$/.test(row.raw[1]?.content)).map(row => row.raw.at(-1).content);
    assert.deepEqual(values, ['125.50', '275.00', '400.50']);
  }
  assert.deepEqual(original, before);
});

test('long reports paginate with repeated table headers and page numbering', () => {
  const value = report();
  value.operationSnapshots = Array.from({ length: 130 }, (_, index) => ({ ...value.operationSnapshots[index % 2],
    operationLogId: `TEST-${index}`, operationName: `Recorded operation ${index + 1}` }));
  const { doc } = createAuditReportPdf(value);
  assert.ok(doc.getNumberOfPages() > 1);
  const pages = doc.internal.pages.slice(1);
  for (const [index, commands] of pages.entries()) {
    const text = commands.join('\n');
    assert.match(text, new RegExp(`Page ${index + 1} of ${pages.length}`));
    if (text.includes('Recorded operation')) assert.match(text, /CROP YEAR CYCLE 2027-2028/);
  }
});

test('matching operations print once with their combined monthly areas and quantity', () => {
  const value = report();
  value.operationSnapshots = [
    { ...value.operationSnapshots[0], operationId: 'BASAL', operationName: 'Basal Fertilizer Application', areaHa: 2, quantity: { value: 1, unit: 'bag' }, unitCost: 100, totalCost: 100 },
    { ...value.operationSnapshots[0], operationId: 'BASAL', operationName: 'Basal Fertilizer Application', fieldId: 'OTHER-FIELD', performedOn: '2027-03-10', areaHa: 1.5, quantity: { value: 2, unit: 'bag' }, unitCost: 100, totalCost: 200 }
  ];
  const { doc, layout } = createAuditReportPdf(value);
  const matches = doc.lastAutoTable.body.filter(row => row.raw[1] === 'Basal Fertilizer Application');
  assert.equal(matches.length, 1);
  const row = matches[0].raw;
  assert.equal(row[layout.columns.indexOf('2027-02') + 2], '2.00');
  assert.equal(row[layout.columns.indexOf('2027-03') + 2], '1.50');
  assert.equal(row[layout.columns.length + 2], '3.50');
  assert.equal(row[layout.columns.length + 3], '3');
  assert.equal(doc.lastAutoTable.body.at(-1).raw.at(-1).content, '300.00');
});

test('different prices do not produce artificial child rows for a plain operation', () => {
  const original = report();
  const base = { ...original.operationSnapshots[0], operationName: 'Planting Operations (Labor & Handling)', unitCost: 1000 };
  original.operationSnapshots = [
    { ...base, areaHa: 6.5, quantity: { value: 4, unit: 'HA' }, totalCost: 4000 },
    { ...base, areaHa: 1, quantity: { value: 1, unit: 'HA' }, unitCost: 2350, totalCost: 2350 }
  ];
  const { doc, layout } = createAuditReportPdf(original);
  const matches = doc.lastAutoTable.body.filter(row => row.raw[1] === base.operationName || row.raw[1]?.content === base.operationName);
  assert.equal(matches.length, 1);
  const row = matches[0].raw;
  assert.equal(row[layout.columns.length + 2], '7.50');
  assert.equal(row[layout.columns.length + 3], '5');
  assert.equal(row[layout.columns.length + 5], '1,270.00 (avg)');
  assert.equal(row.at(-1), '6,350.00');
  assert.equal(doc.lastAutoTable.body.at(-1).raw.at(-1).content, '6,350.00');
});

test('PDF QTY and UNIT use user-selected operation values and keep labor in costs without displaying worker-days', () => {
  const value = report();
  const base = { ...value.operationSnapshots[0], operationName: 'Planting Operations (Labor & Handling)', quantity: null, baseCost: 0, totalCost: 1000,
    laborEntries: [{ workerCount: 2, days: 1, rate: 500, subtotal: 1000 }] };
  value.operationSnapshots = [base, { ...base, quantity: { value: 1, unit: 'HA' }, baseCost: 1000, totalCost: 2350,
    laborEntries: [{ workerCount: 3, days: 3, rate: 150, subtotal: 1350 }] }, { ...base }, { ...base }, { ...base }];
  const before = structuredClone(value);
  const { doc, layout } = createAuditReportPdf(value);
  const row = doc.lastAutoTable.body.find(row => row.raw[1] === base.operationName).raw;
  assert.equal(row[layout.columns.length + 3], '1');
  assert.equal(row[layout.columns.length + 4], 'HA');
  assert.equal(row[layout.columns.length + 5], '2,350.00');
  assert.doesNotMatch(doc.internal.pages.flat().join('\n'), /worker-day/);
  assert.equal(row.at(-1), '6,350.00');
  assert.equal(doc.lastAutoTable.body.at(-1).raw.at(-1).content, '6,350.00');
  assert.deepEqual(value, before);
});

test('Basal PDF displays the same labor-inclusive unit cost as the audit ledger', () => {
  const value = report();
  value.operationSnapshots = [{ ...value.operationSnapshots[0], operationName: 'Basal Fertilizer Application (Labor & Materials)',
    quantity: { value: 4, unit: 'ton' }, areaHa: 1.25, baseCost: 4000, totalCost: 5440, lineItems: [],
    laborEntries: [{ workerCount: 12, days: 12, rate: 10, subtotal: 1440 }] }];
  const before = structuredClone(value);
  const { doc, layout } = createAuditReportPdf(value);
  const row = doc.lastAutoTable.body.find(row => row.raw[1] === value.operationSnapshots[0].operationName).raw;
  assert.equal(row[layout.columns.length + 3], '4');
  assert.equal(row[layout.columns.length + 4], 'ton');
  assert.equal(row[layout.columns.length + 5], '1,360.00');
  assert.equal(row.at(-1), '5,440.00');
  assert.equal(doc.lastAutoTable.body.at(-1).raw.at(-1).content, '5,440.00');
  assert.deepEqual(value, before);
});

test('three Basal records print one weighted-average row while retaining their exact full expenditure', () => {
  const value = report();
  const base = { ...value.operationSnapshots[0], operationName: 'Basal Fertilizer Application (Labor & Materials)', lineItems: [] };
  value.operationSnapshots = [
    { ...base, areaHa: 1.25, quantity: { value: 4, unit: 'ton' }, baseCost: 4000, totalCost: 5440,
      laborEntries: [{ workerCount: 12, days: 12, rate: 10, subtotal: 1440 }] },
    { ...base, fieldId: 'B', areaHa: 0.75, quantity: { value: 2, unit: 'ton' }, baseCost: 2000, totalCost: 2360,
      laborEntries: [{ workerCount: 1, days: 1, rate: 360, subtotal: 360 }] },
    { ...base, fieldId: 'C', areaHa: 1, quantity: { value: 3, unit: 'ton' }, baseCost: 3000, totalCost: 4500,
      laborEntries: [{ workerCount: 1, days: 1, rate: 1500, subtotal: 1500 }] }
  ];
  const { doc, layout } = createAuditReportPdf(value);
  const rows = doc.lastAutoTable.body.filter(row => row.raw[1] === base.operationName);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].raw[layout.columns.length + 2], '3.00');
  assert.equal(rows[0].raw[layout.columns.length + 3], '9');
  assert.equal(rows[0].raw[layout.columns.length + 5], '1,366.67 (avg)');
  assert.equal(rows[0].raw.at(-1), '12,300.00');
  assert.equal(doc.lastAutoTable.body.at(-1).raw.at(-1).content, '12,300.00');
});

test('the beneficiary cost column shows quantity times unit cost for plain, actual child and material rows without dividing by hectares', () => {
  const value = report();
  const base = value.operationSnapshots[0];
  value.operationSnapshots = [
    { ...base, operationName: 'Soil Sampling', areaHa: 15.25, quantity: { value: 2, unit: 'Sample' }, unitCost: 350, totalCost: 700 },
    { ...base, operationName: 'Weeding Operations', stageNumber: 4, childOperationDefinitionId: 'SRA-08-1', childOperationName: 'Manual Weeding (1st Round)',
      areaHa: 3, quantity: { value: 5, unit: 'HA' }, unitCost: 300, totalCost: 1500 },
    { ...base, operationName: 'Basal Fertilizer Application', stageNumber: 3, areaHa: 2, totalCost: 300,
      lineItems: [{ description: '46-0-0', quantity: 3, unit: 'bag', unitCost: 100, subtotal: 300 }] }
  ];
  const before = structuredClone(value);
  for (const multiplier of [1, 2]) {
    const scoped = { ...value, operationSnapshots: value.operationSnapshots.map(item => ({ ...item, areaHa: item.areaHa * multiplier })) };
    const { doc } = createAuditReportPdf(scoped);
    const expected = new Map([['Soil Sampling', '700.00'], ['Manual Weeding (1st Round)', '1,500.00'], ['46-0-0', '300.00']]);
    for (const [name, amount] of expected) {
      const row = doc.lastAutoTable.body.find(row => row.raw[1] === name);
      assert.ok(row, name);
      assert.equal(row.raw.at(-1), amount);
    }
    assert.equal(doc.lastAutoTable.body.at(-1).raw.at(-1).content, '2,500.00');
  }
  assert.deepEqual(value, before);
});

test('a mid-cycle compilation PDF identifies its inclusive selected dates without changing source scope', () => {
  const scope = { id: 'CYA-RANGE-TEST', cropYearCycle: '2026-2027', startDate: '2026-09-10', endDate: '2026-09-20',
    sourceReportCount: 1, monthCount: 1, operationCount: 2, hectaresAudited: 2, totalCost: 50,
    monthlySummaries: [], farmSummaries: [], sourceReports: [] };
  const before = structuredClone(scope);
  const { doc } = createCropYearCompilationPdf(scope);
  const text = doc.internal.pages.flat().join('\n');
  assert.match(text, /2026-09-10 through 2026-09-20/); assert.match(text, /Crop cycle remains open/);
  assert.deepEqual(scope, before);
});

test('PDF UI offers separate download and print actions without expanding report permissions', () => {
  const dossier = fs.readFileSync(new URL('../src/components/audit/AuditDossierCard.jsx', import.meta.url), 'utf8');
  const preview = fs.readFileSync(new URL('../src/components/audit/PrintableAuditReport.jsx', import.meta.url), 'utf8');
  assert.match(dossier, /isCertified && <Button[^\n]*handleDownloadPdf[^\n]*Download PDF/);
  assert.match(dossier, /Print Audit Document/);
  assert.match(preview, /onClick=\{handleDownload\}/);
  assert.match(preview, /onClick=\{handlePrint\}/);
});
