import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createAuditReportPdf } from '../src/services/auditPdfService.js';
import { auditReportLayout, reportingMonthLabel } from '../src/utils/auditReportLayout.js';

const report = () => ({ reportId: 'TEST-LAYOUT-ONLY', periodKey: '2028-04', cropYearCycle: '2027-2028', status: 'COMPILED',
  blockFarmId: 'TEST-FARM', blockFarmName: 'Layout Verification Farm', compiledByName: 'Verification Manager',
  qrHash: 'TEST-LAYOUT-NOT-A-REAL-AUDIT', operationSnapshots: [
    { operationLogId: 'TEST-1', fieldId: 'TEST-FIELD', cycleId: 'TEST-CYCLE', cropYearCycle: '2027-2028', performedOn: '2027-02-10',
      operationName: 'Soil Sampling', stageNumber: 1, areaHa: 4, quantity: { value: 1, unit: 'Sample' }, totalCost: 100 },
    { operationLogId: 'TEST-2', fieldId: 'TEST-FIELD', cycleId: 'TEST-CYCLE', cropYearCycle: '2027-2028', performedOn: '2028-04-21',
      operationName: 'Cane Cutting', stageNumber: 6, areaHa: 4, quantity: { value: 60, unit: 'ton' }, totalCost: 27000 }
  ] });

test('download creates an actual landscape PDF with crop headers and numeric February-to-April coverage', () => {
  const original = report();
  const before = structuredClone(original);
  const { doc, filename, layout } = createAuditReportPdf(original);
  const bytes = new Uint8Array(doc.output('arraybuffer'));
  assert.equal(new TextDecoder().decode(bytes.slice(0, 5)), '%PDF-');
  assert.ok(bytes.length > 2000);
  assert.ok(doc.internal.pageSize.getWidth() > doc.internal.pageSize.getHeight());
  assert.equal(filename, 'HUGPONG_TEST-LAYOUT-ONLY_Audit_Report.pdf');
  assert.equal(layout.columnLabels[layout.columns[0]], 2);
  assert.equal(layout.columnLabels[layout.columns.at(-1)], 4);
  assert.deepEqual(layout.groups.map(group => group.columns.length), [11, 4]);
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
  assert.deepEqual(Object.values(layout.columnLabels), [8, 9, 10]);
  assert.equal(layout.groups[0].cropYearCycle, '2031-2032');
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

test('PDF UI offers separate download and print actions without expanding report permissions', () => {
  const dossier = fs.readFileSync(new URL('../src/components/audit/AuditDossierCard.jsx', import.meta.url), 'utf8');
  const preview = fs.readFileSync(new URL('../src/components/audit/PrintableAuditReport.jsx', import.meta.url), 'utf8');
  assert.match(dossier, /isCertified && <Button[^\n]*handleDownloadPdf[^\n]*Download PDF/);
  assert.match(dossier, /Print Audit Document/);
  assert.match(preview, /onClick=\{handleDownload\}/);
  assert.match(preview, /onClick=\{handlePrint\}/);
});
