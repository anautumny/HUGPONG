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
  selectAuditCompilationBatch,
  encodeQrPayload,
  decodeQrPayload
} = require('../domain/auditWorkflow');

const repositoryRoot = path.join(__dirname, '..', '..');

function responseCapture() {
  return {
    statusCode: 200,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; }
  };
}

function loadAuditListHandler(db) {
  const firebasePath = require.resolve('../firebase-admin');
  const routePath = require.resolve('../routes/auditReports');
  const previousFirebase = require.cache[firebasePath];
  delete require.cache[routePath];
  require.cache[firebasePath] = { id: firebasePath, filename: firebasePath, loaded: true, exports: { db } };
  const router = require('../routes/auditReports');
  if (previousFirebase) require.cache[firebasePath] = previousFirebase;
  else delete require.cache[firebasePath];
  return router.stack.find(layer => layer.route?.path === '/' && layer.route.methods.get).route.stack.at(-1).handle;
}

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

test('a certified monthly report starts a new version only for newly eligible logs', () => {
  const certified = {
    id: 'AUD-BF1-2026-09-V1', reportVersion: 1, status: AUDIT_STATUS.CERTIFIED,
    operationSnapshots: [{ operationLogId: 'LOG-1' }, { operationLogId: 'LOG-2' }]
  };
  const batch = selectAuditCompilationBatch([
    { id: 'LOG-1' }, { id: 'LOG-2' }, { id: 'LOG-3' }
  ], [certified]);
  assert.equal(batch.replay, null);
  assert.deepEqual(batch.operations.map(operation => operation.id), ['LOG-3']);
  assert.equal(batch.latest.id, certified.id);
});

test('compilation is idempotent while a report is awaiting submission or SRA review', () => {
  for (const status of [AUDIT_STATUS.COMPILED, AUDIT_STATUS.PENDING_SUBMISSION, AUDIT_STATUS.PENDING_REVIEW]) {
    const current = { id: `AUD-${status}`, reportVersion: 2, status, operationSnapshots: [{ operationLogId: 'LOG-3' }] };
    const batch = selectAuditCompilationBatch([{ id: 'LOG-3' }, { id: 'LOG-4' }], [current]);
    assert.equal(batch.replay.id, current.id);
    assert.deepEqual(batch.operations, []);
  }
});

test('a returned batch recompiles uncertified logs without duplicating certified snapshots', () => {
  const batch = selectAuditCompilationBatch([
    { id: 'LOG-1' }, { id: 'LOG-2' }, { id: 'LOG-3' }
  ], [
    { id: 'AUD-V1', reportVersion: 1, status: AUDIT_STATUS.CERTIFIED, operationSnapshots: [{ operationLogId: 'LOG-1' }] },
    { id: 'AUD-V2', reportVersion: 2, status: AUDIT_STATUS.RETURNED, operationSnapshots: [{ operationLogId: 'LOG-2' }] }
  ]);
  assert.equal(batch.replay, null);
  assert.deepEqual(batch.operations.map(operation => operation.id), ['LOG-2', 'LOG-3']);
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

test('SRA audit inbox falls back to a status-scoped query while its composite index is unavailable', async () => {
  const reports = [
    { id: 'AUD-OLD', status: AUDIT_STATUS.PENDING_REVIEW, submittedAt: '2026-09-24T00:00:00.000Z' },
    { id: 'AUD-NEW', status: AUDIT_STATUS.PENDING_REVIEW, submittedAt: '2026-09-25T00:00:00.000Z' },
    { id: 'AUD-CERTIFIED', status: AUDIT_STATUS.CERTIFIED, certifiedAt: '2026-09-26T00:00:00.000Z' }
  ];
  let usedStatusOnlyFallback = false;
  const collection = () => {
    const query = ({ status = null, ordered = false } = {}) => ({
      where(field, operator, value) {
        return query({ status: field === 'status' && operator === '==' ? value : status, ordered });
      },
      orderBy() { return query({ status, ordered: true }); },
      limit() { return this; },
      startAfter() { return this; },
      async get() {
        if (ordered) throw Object.assign(new Error('The query requires an index.'), { code: 9 });
        if (status === AUDIT_STATUS.PENDING_REVIEW) usedStatusOnlyFallback = true;
        return {
          docs: reports
            .filter(report => !status || report.status === status)
            .map(report => ({ id: report.id, data: () => report }))
        };
      }
    });
    return query();
  };
  const handler = loadAuditListHandler({ collection });
  const response = responseCapture();
  await handler({
    query: { view: 'inbox', limit: '20' },
    session: { user: { employeeId: 'SRA-1', role: 'SRA_ADMIN', name: 'SRA Officer' } }
  }, response);
  assert.equal(response.statusCode, 200);
  assert.equal(usedStatusOnlyFallback, true);
  assert.deepEqual(response.payload.data.map(report => report.id), ['AUD-NEW', 'AUD-OLD']);
  assert.equal(response.payload.hasMore, false);
});
