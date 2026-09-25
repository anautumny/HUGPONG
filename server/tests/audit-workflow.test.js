'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  AUDIT_STATUS,
  businessPeriod,
  canonicalAuditStatus,
  rootAuditReportId,
  versionedAuditReportId,
  summarizeSnapshots,
  encodeQrPayload,
  decodeQrPayload
} = require('../domain/auditWorkflow');

const repositoryRoot = path.join(__dirname, '..', '..');

test('audit lifecycle keeps compilation, submission, review, return, and certification distinct', () => {
  assert.deepEqual(Object.values(AUDIT_STATUS), [
    'COMPILED', 'PENDING_SUBMISSION', 'PENDING_REVIEW', 'RETURNED', 'CERTIFIED'
  ]);
  assert.equal(canonicalAuditStatus('PENDING'), AUDIT_STATUS.PENDING_REVIEW);
  assert.equal(canonicalAuditStatus('certified'), AUDIT_STATUS.CERTIFIED);
});

test('report identity is deterministic by Block Farm, period, and version', () => {
  assert.equal(rootAuditReportId('BLK-NCY-01', '2026-09'), 'AUD-BLKNCY01-2026-09');
  assert.equal(versionedAuditReportId('BLK-NCY-01', '2026-09', 2), 'AUD-BLKNCY01-2026-09-V2');
});

test('business period uses the HUGPONG Asia/Manila date boundary', () => {
  assert.equal(businessPeriod('2026-09-30T16:30:00.000Z'), '2026-10');
});

test('snapshot summary counts each operation once and each audited field once', () => {
  const summary = summarizeSnapshots([
    { operationLogId: 'LOG-1', fieldId: 'FLD-1', totalCost: 100 },
    { operationLogId: 'LOG-2', fieldId: 'FLD-1', totalCost: 150 },
    { operationLogId: 'LOG-3', fieldId: 'FLD-2', totalCost: 200 }
  ], [
    { id: 'FLD-1', areaHa: 1.25 },
    { id: 'FLD-2', areaHa: 2.5 }
  ]);
  assert.deepEqual(summary, { operationCount: 3, fieldCount: 2, hectaresAudited: 3.75, totalCost: 450 });
});

test('compact QR package is self-identifying, versioned, and excludes operation snapshots', () => {
  const report = {
    id: 'AUD-BF1-2026-09-V1', rootReportId: 'AUD-BF1-2026-09', blockFarmId: 'BF-1',
    periodKey: '2026-09', reportVersion: 1, operationCount: 14, fieldCount: 5,
    hectaresAudited: 15.25, totalCost: 125430, compiledByUserId: '03000001',
    compiledAt: '2026-09-30T08:00:00.000Z', integrityHash: 'HUG-ABC123',
    operationSnapshots: [{ operationLogId: 'LOG-SHOULD-NOT-BE-IN-QR' }]
  };
  const encoded = encodeQrPayload(report);
  const decoded = decodeQrPayload(encoded);
  assert.equal(decoded.type, 'HUGPONG_AUDIT');
  assert.equal(decoded.schemaVersion, 1);
  assert.equal(decoded.reportId, report.id);
  assert.equal(decoded.integrityHash, report.integrityHash);
  assert.doesNotMatch(encoded, /operationSnapshots|LOG-SHOULD-NOT-BE-IN-QR/);
});

test('audit route exposes separate idempotent submit, QR import, return, and certify transitions', () => {
  const source = fs.readFileSync(path.join(repositoryRoot, 'server', 'routes', 'auditReports.js'), 'utf8');
  assert.match(source, /router\.post\('\/:id\/submit'/);
  assert.match(source, /router\.post\('\/qr\/import'/);
  assert.match(source, /router\.post\('\/:id\/return'/);
  assert.match(source, /router\.post\('\/:id\/certify'/);
  assert.match(source, /status: AUDIT_STATUS\.COMPILED/);
  assert.match(source, /status: AUDIT_STATUS\.PENDING_REVIEW/);
  assert.match(source, /expectedHash !== \(report\.integrityHash \|\| report\.qrHash\)/);
});

test('active SRA reads are bounded server queries and history remains one canonical collection', () => {
  const source = fs.readFileSync(path.join(repositoryRoot, 'server', 'routes', 'auditReports.js'), 'utf8');
  assert.match(source, /where\('status', '==', AUDIT_STATUS\.PENDING_REVIEW\)/);
  assert.match(source, /where\('status', '==', AUDIT_STATUS\.CERTIFIED\)/);
  assert.match(source, /limit\(limit \+ 1\)/);
  assert.doesNotMatch(source, /audit_history|qr_audits|cloud_audits|certified_audits/);
});
