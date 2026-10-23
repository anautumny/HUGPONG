'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { memoryFirestore } = require('./helpers/memoryFirestore');
const { COLLECTIONS, createAuditHash } = require('../schema/firestoreSchema');
const { encodeQrPayload, validateCanonicalAuditReport } = require('../domain/auditWorkflow');
const root = path.resolve(__dirname, '../..');
const webRequire = createRequire(path.join(root, 'web/react-app/package.json'));
const mobileRequire = createRequire(path.join(root, 'mobile/package.json'));

function fixture() {
  const report = {
    id: 'AUD-BF1-2026-09', rootReportId: 'AUD-BF1-2026-09', blockFarmId: 'BF-1', periodKey: '2026-09', reportVersion: 1,
    compiledByUserId: 'MGR-1', compiledAt: '2026-09-30T08:00:00.000Z',
    status: 'COMPILED', hectaresAudited: 1.25, totalCost: 100,
    operationSnapshots: [{ operationLogId: 'LOG-1', fieldId: 'FLD-1', totalCost: 100 }],
    fieldSnapshots: [{ fieldId: 'FLD-1', memberId: 'MEM-1', areaHa: 1.25, operationLogIds: ['LOG-1'] }],
    sourceLogIds: ['LOG-1'],
  };
  report.integrityHash = report.qrHash = createAuditHash(report.id, report.blockFarmId, report.periodKey, report.operationSnapshots);
  const db = memoryFirestore({ [`${COLLECTIONS.AUDIT_REPORTS}/${report.id}`]: report });
  const firebasePath = require.resolve('../firebase-admin');
  const routePath = require.resolve('../routes/auditReports');
  const previous = require.cache[firebasePath];
  delete require.cache[routePath];
  require.cache[firebasePath] = { id: firebasePath, filename: firebasePath, loaded: true, exports: { db } };
  const router = require('../routes/auditReports');
  if (previous) require.cache[firebasePath] = previous;
  else delete require.cache[firebasePath];
  async function request(endpoint, payload, role = 'SRA_ADMIN') {
    const route = router.stack.find(layer => layer.route?.path === endpoint).route;
    const req = { body: { payload }, authorizationVerified: true, authUser: { role }, session: { user: { role, employeeId: 'SRA-1' } } };
    const res = { statusCode: 200, status(value) { this.statusCode = value; return this; }, json(value) { this.body = value; return this; } };
    const invoke = index => route.stack[index].handle(req, res, () => invoke(index + 1));
    await invoke(0);
    return res;
  }
  return { report, db, request };
}

test('generated QR, manually typed report ID and HUG code retrieve the identical authoritative report without writing', async () => {
  const { report, db, request } = fixture();
  const before = [...db.records];
  for (const input of [encodeQrPayload(report), `  ${report.id.toLowerCase()}  `, report.integrityHash.toLowerCase()]) {
    const response = await request('/qr/verify', input);
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.data.integrityVerified, true);
    assert.equal(response.body.data.alreadyImported, false);
    assert.deepEqual(response.body.data.report, validateCanonicalAuditReport(report));
  }
  assert.deepEqual([...db.records], before, 'preview and manual lookup cannot import or certify');
});

test('QR and manual imports are atomic and idempotent and never automatically certify', async () => {
  const { report, db, request } = fixture();
  const results = await Promise.all([
    request('/qr/import', encodeQrPayload(report)), request('/qr/import', report.id),
  ]);
  assert.ok(results.every(result => result.statusCode === 200));
  assert.deepEqual(results.map(result => result.body.data.alreadyImported).sort(), [false, true]);
  const stored = db.records.get(`${COLLECTIONS.AUDIT_REPORTS}/${report.id}`);
  assert.equal(stored.status, 'PENDING_REVIEW');
  assert.equal(stored.certificationStatus, 'not_certified');
  assert.equal(stored.certifiedAt, undefined);
  assert.equal([...db.records.keys()].filter(key => key.startsWith(`${COLLECTIONS.AUDIT_LOGS}/`)).length, 1);
  assert.equal((await request('/qr/verify', report.id)).body.data.alreadyImported, true);
});

test('missing reports, altered hashes, corrupted stored data and unrelated QR data fail without mutations', async () => {
  const { report, db, request } = fixture();
  const reference = JSON.parse(encodeQrPayload(report));
  const forged = validateCanonicalAuditReport(report);
  forged.operationSnapshots[0].totalCost = forged.totalCost = 999;
  forged.integrityHash = forged.qrHash = createAuditHash(forged.reportId, forged.blockFarmId, forged.periodKey, forged.operationSnapshots);
  for (const endpoint of ['/qr/verify', '/qr/import']) {
    for (const [input, status] of [
      ['AUD-NOTFOUND', 404], ['HUG-NOTFOUND', 404], ['https://example.com', 400],
      [JSON.stringify({ ...reference, reportId: 'AUD-NOTFOUND' }), 404],
      [JSON.stringify({ ...reference, integrityHash: 'HUG-TAMPERED' }), 422],
      [JSON.stringify({ type: 'HUGPONG_AUDIT_TRANSFER', schemaVersion: 2, report: forged }), 422],
    ]) {
      assert.equal((await request(endpoint, input)).statusCode, status);
    }
  }
  const stored = db.records.get(`${COLLECTIONS.AUDIT_REPORTS}/${report.id}`);
  stored.integrityHash = stored.qrHash = 'HUG-CORRUPTED';
  assert.equal((await request('/qr/verify', report.id)).statusCode, 422);
  assert.equal((await request('/qr/import', report.id)).statusCode, 422);
  assert.equal(db.records.size, 1);
  assert.equal(stored.status, 'COMPILED');
});

test('both receiving endpoints reject Farm Members and Farm Managers', async () => {
  const { report, db, request } = fixture();
  for (const endpoint of ['/qr/verify', '/qr/import']) {
    for (const role of ['FARM_MEMBER', 'FARM_MANAGER']) {
      assert.equal((await request(endpoint, report.id, role)).statusCode, 403);
    }
  }
  assert.equal(db.records.size, 1);
});

test('Web and Mobile generate the same QR, and the ZXing reader decodes an actual rendered QR image', () => {
  const { report } = fixture();
  const babel = mobileRequire('@babel/core');
  for (const client of ['web/react-app', 'mobile']) {
    const filename = path.join(root, client, 'src/domain/auditWorkflow.js');
    const compiled = babel.transformSync(fs.readFileSync(filename, 'utf8'), {
      filename, configFile: false, babelrc: false,
      plugins: [mobileRequire.resolve('@babel/plugin-transform-modules-commonjs')],
    }).code;
    const module = { exports: {} };
    new Function('require', 'module', 'exports', compiled)(webRequire, module, module.exports);
    assert.equal(module.exports.createAuditQrPayload(report), encodeQrPayload(report));
  }
  const QRCode = webRequire('qrcode');
  const { QRCodeReader, RGBLuminanceSource, HybridBinarizer, BinaryBitmap } = webRequire('@zxing/library');
  const payload = encodeQrPayload(report);
  const qr = QRCode.create(payload, { errorCorrectionLevel: 'M' });
  const scale = 4, margin = 4;
  const width = (qr.modules.size + margin * 2) * scale;
  const pixels = new Uint8ClampedArray(width * width).fill(255);
  for (let y = 0; y < width; y++) for (let x = 0; x < width; x++) {
    const row = Math.floor(y / scale) - margin, col = Math.floor(x / scale) - margin;
    if (row >= 0 && col >= 0 && row < qr.modules.size && col < qr.modules.size && qr.modules.get(row, col)) pixels[y * width + x] = 0;
  }
  const bitmap = new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(pixels, width, width)));
  assert.equal(new QRCodeReader().decode(bitmap).getText(), payload);
});
