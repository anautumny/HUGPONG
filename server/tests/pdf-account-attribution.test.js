'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { auditCropYearCycles, canonicalAuditReport, nextCropYearCycle } = require('../domain/auditWorkflow');

const read = relativePath => fs.readFileSync(path.resolve(__dirname, relativePath), 'utf8');

test('web and mobile PDFs show actor names without exposing account IDs', () => {
  const mobilePdf = read('../../mobile/src/services/auditPdfService.js');
  const webPdf = read('../../web/react-app/src/components/audit/PrintableAuditReport.jsx');

  for (const source of [mobilePdf, webPdf]) {
    assert.doesNotMatch(source, /Ramon Lacson/i);
    assert.match(source, /compiledByName/);
    assert.match(source, /certifiedByName/);
    assert.match(source, /displayName \|\| user\?\.name/);
    assert.doesNotMatch(source, /account-id/);
    assert.doesNotMatch(source, />ID:\s*\{/);
    assert.doesNotMatch(source, /ID:\s*\$\{escapeHtml/);
    assert.doesNotMatch(source, /storedId \|\| fallback/);
    assert.doesNotMatch(source, /Authenticated HUGPONG Account/);
  }
});

test('audit PDFs derive their Crop Year Cycle from authoritative report snapshots', () => {
  const cropYears = auditCropYearCycles({}, [
    { cropYearCycle: '2026-2027' },
    { cropYearCycle: '2026-2027' }
  ], [{ cropYearCycle: '2026-2027' }]);
  assert.deepEqual(cropYears, ['2026-2027']);
  assert.equal(nextCropYearCycle(cropYears[0]), '2027-2028');
  assert.equal(nextCropYearCycle('2034-2035'), '2035-2036');
  assert.equal(nextCropYearCycle('invalid'), '');
  assert.equal(canonicalAuditReport({ cropYearCycles: cropYears }).continuationCropYearCycle, null);

  const mobilePdf = read('../../mobile/src/services/auditPdfService.js');
  const webPdf = read('../../web/react-app/src/components/audit/PrintableAuditReport.jsx');
  for (const source of [mobilePdf, webPdf]) {
    assert.match(source, /auditCropYearCycles/);
    assert.match(source, /auditReportLayout/);
    assert.doesNotMatch(source, /nextCropYearCycle/);
    assert.match(source, /Calendar year/);
    assert.match(source, /CROP YEAR CYCLE|Crop Year Cycle/);
    assert.doesNotMatch(source, /Following Period/i);
    assert.doesNotMatch(source, /HUG-SRA-AUDIT/);
  }
  assert.doesNotMatch(mobilePdf, /const continuationCycle = currentCycle;/);
  assert.doesNotMatch(webPdf, /const continuationCY = currentCY;/);

  const serverRoute = read('../routes/auditReports.js');
  assert.match(serverRoute, /continuationCropYearCycle:\s*cropYearCycles\[1\] \|\| null/);
});

test('audit PDF QR appears in the header with its code and no fabricated compliance copy', () => {
  const mobilePdf = read('../../mobile/src/services/auditPdfService.js');
  const webPdf = read('../../web/react-app/src/components/audit/PrintableAuditReport.jsx');
  assert.ok(mobilePdf.indexOf('qr-panel') < mobilePdf.indexOf('<table>'));
  assert.ok(webPdf.indexOf('value={hash}') < webPdf.indexOf('<table'));
  for (const source of [mobilePdf, webPdf]) {
    assert.doesNotMatch(source, /TAMPER-PROOF CRYPTOGRAPHIC AUDIT RECORD/i);
    assert.doesNotMatch(source, /R\.A\. 10659 COMPLIANT/i);
  }
});
