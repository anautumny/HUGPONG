'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = relativePath => fs.readFileSync(path.resolve(__dirname, relativePath), 'utf8');

test('web and mobile PDFs use report actors and the authenticated printing account', () => {
  const mobilePdf = read('../../mobile/src/services/auditPdfService.js');
  const webPdf = read('../../web/react-app/src/components/audit/PrintableAuditReport.jsx');

  for (const source of [mobilePdf, webPdf]) {
    assert.doesNotMatch(source, /Ramon Lacson/i);
    assert.match(source, /compiledByName/);
    assert.match(source, /certifiedByName/);
    assert.match(source, /displayName \|\| user\?\.name/);
    assert.match(source, /Authenticated HUGPONG Account/);
  }
});
