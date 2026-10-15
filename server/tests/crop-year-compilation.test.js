'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { COLLECTIONS, createAuditHash } = require('../schema/firestoreSchema');
const { selection, buildCompilation, compileCropYear, compilationOptions, compilationHtml } = require('../services/cropYearCompilationService');
const { allowedRolesForRequest } = require('../middleware/requestPermissions');

const sra = { employeeId: '02000001', role: 'SRA_ADMIN', name: 'SRA Reviewer' };
const scope = { cropYearCycle: '2026-2027' };
function report(id = 'AUD-BF1-2026-09-V1', { status = 'CERTIFIED', farm = 'BF-1', period = '2026-09', version = 1, area = 2, operations = [{ operationLogId: 'LOG-1', cropYearCycle: '2026-2027', totalCost: 100 }] } = {}) {
  const snapshots = operations.map(operation => ({ fieldId: 'FLD-1', ...operation }));
  return {
    id, blockFarmId: farm, blockFarmName: 'Farm '+farm, periodKey: period, reportVersion: version, status,
    compiledByUserId: '03000001', compiledAt: period+'-28T00:00:00.000Z',
    certifiedByUserId: sra.employeeId, certifiedAt: period+'-29T00:00:00.000Z',
    operationSnapshots: snapshots, sourceLogIds: snapshots.map(operation => operation.operationLogId),
    fieldSnapshots: [{ fieldId: 'FLD-1', memberId: '04000001', areaHa: area, operationLogIds: snapshots.map(operation => operation.operationLogId) }],
    operationCount: snapshots.length, fieldCount: 1, memberCount: 1, hectaresAudited: area,
    totalCost: snapshots.reduce((sum, operation) => sum + operation.totalCost, 0),
    integrityHash: createAuditHash(id, farm, period, snapshots)
  };
}
function database(reports = []) {
  const records = new Map(reports.map(row => [`${COLLECTIONS.AUDIT_REPORTS}/${row.id}`, structuredClone(row)]));
  const snap = ref => ({ ref, id: ref.id, exists: records.has(ref.path), data: () => structuredClone(records.get(ref.path)) });
  const db = {
    records,
    collection(name) {
      const query = (filters = [], cap = Infinity, sort = null, after = null) => ({
        where(field, operator, value) { assert.equal(operator, '=='); return query([...filters, [field, value]], cap, sort, after); },
        limit(value) { return query(filters, value, sort, after); },
        orderBy(field, direction) { return query(filters, cap, [field, direction], after); },
        startAfter(snapshot) { return query(filters, cap, sort, snapshot.id); },
        async get() {
          let rows = [...records].filter(([key, value]) => key.startsWith(name+'/') && filters.every(([field, expected]) => value[field] === expected));
          if (sort) rows.sort((a, b) => String(a[1][sort[0]]).localeCompare(String(b[1][sort[0]])) * (sort[1] === 'desc' ? -1 : 1));
          if (after) rows = rows.slice(rows.findIndex(([key]) => key === `${name}/${after}`) + 1);
          return { docs: rows.slice(0, cap).map(([key]) => snap(db.collection(name).doc(key.slice(name.length+1)))) };
        }
      });
      return { ...query(), doc(id) { const ref = { path: `${name}/${id}`, id, get: async () => snap(ref) }; return ref; } };
    },
    async runTransaction(work) {
      const pending = [];
      const result = await work({ get: ref => ref.get(), create(ref, value) { pending.push([ref, value]); } });
      pending.forEach(([ref]) => assert.equal(records.has(ref.path), false));
      pending.forEach(([ref, value]) => records.set(ref.path, structuredClone(value)));
      return result;
    }
  };
  return db;
}

test('crop year selection requires a consecutive annual range and a safe farm ID', () => {
  for (const value of ['', '2026', '2026-2028', '2026/2027']) assert.throws(() => selection({ cropYearCycle: value }));
  assert.throws(() => selection({ ...scope, blockFarmId: '../BF' }));
  assert.deepEqual(selection({ ...scope, blockFarmId: 'bf-1' }), { ...scope, blockFarmId: 'BF-1' });
});

test('compile uses certified source snapshots and crop year identity, including calendar-year carryover', () => {
  const rows = [report(), report('AUD-CARRYOVER', { period: '2027-02', operations: [{ operationLogId: 'LOG-2', cropYearCycle: '2026-2027', totalCost: 50 }, { operationLogId: 'LOG-OTHER', cropYearCycle: '2027-2028', totalCost: 999 }] }), report('AUD-PENDING', { status: 'PENDING_REVIEW', operations: [{ operationLogId: 'LOG-PENDING', cropYearCycle: '2026-2027', totalCost: 999 }] })];
  const result = buildCompilation(rows, scope);
  assert.equal(result.operationCount, 2); assert.equal(result.totalCost, 150);
  assert.equal(result.sourceReportCount, 2); assert.equal(result.monthCount, 2);
  assert.deepEqual(result.periods, ['2026-09', '2027-02']);
  assert.equal(result.coverage, 'CERTIFIED_REPORTS_TO_DATE');
});

test('all certified monthly incremental versions contribute, exact duplicates count once', () => {
  const first = report();
  const second = report('AUD-BF1-2026-09-V2', { version: 2, operations: [{ operationLogId: 'LOG-2', cropYearCycle: '2026-2027', totalCost: 20 }] });
  const duplicate = { ...first, id: 'AUD-DUPLICATE', reportVersion: 3 };
  duplicate.integrityHash = createAuditHash(duplicate.id, duplicate.blockFarmId, duplicate.periodKey, duplicate.operationSnapshots);
  const result = buildCompilation([second, duplicate, first], scope);
  assert.equal(result.sourceReportCount, 3); assert.equal(result.operationCount, 2);
  assert.equal(result.totalCost, 120); assert.equal(result.duplicateOperationCount, 1);
  assert.equal(result.monthlySummaries[0].totalCost, 120);
});

test('conflicting certified snapshots for one operation fail closed', () => {
  const next = report('AUD-CONFLICT', { operations: [{ operationLogId: 'LOG-1', cropYearCycle: '2026-2027', totalCost: 101 }] });
  assert.throws(() => buildCompilation([report(), next], scope), /conflicting certified snapshots/);
});

test('area is unique per farm and field and uses the latest included monthly snapshot', () => {
  const result = buildCompilation([report(), report('AUD-LATER', { period: '2026-10', area: 3, operations: [{ operationLogId: 'LOG-2', cropYearCycle: '2026-2027', totalCost: 50 }] }), report('AUD-OTHER-FARM', { farm: 'BF-2', area: 4, operations: [{ operationLogId: 'LOG-3', cropYearCycle: '2026-2027', totalCost: 25 }] })], scope);
  assert.equal(result.fieldCount, 2); assert.equal(result.hectaresAudited, 7);
  assert.equal(result.farmSummaries[0].hectaresAudited, 3);
  assert.equal(result.totalCost, 175); assert.equal(result.blockFarmCount, 2);
  const single = buildCompilation([report(), report('AUD-OTHER-FARM', { farm: 'BF-2' })], { ...scope, blockFarmId: 'BF-1' });
  assert.equal(single.sourceReportCount, 1); assert.equal(single.blockFarmCount, 1);
});

test('legacy operation crop year falls back only to an explicit unambiguous report identity', () => {
  const row = report('AUD-LEGACY', { operations: [{ operationLogId: 'LOG-LEGACY', totalCost: 100 }] });
  assert.equal(buildCompilation([row], scope).operationCount, 0);
  row.cropYearCycles = ['2026-2027'];
  assert.equal(buildCompilation([row], scope).operationCount, 1);
  row.cropYearCycles = ['2026-2027', '2027-2028'];
  assert.throws(() => buildCompilation([row], scope), /unambiguous Crop Year/);
});

test('source integrity and certification attribution are required', () => {
  assert.throws(() => buildCompilation([{ ...report(), integrityHash: 'HUG-INVALID' }], scope), /integrity/);
  assert.throws(() => buildCompilation([{ ...report(), certifiedByUserId: null }], scope), /attribution/);
});

test('service and API policies permit only SRA on both platforms', async () => {
  for (const role of ['MEMBER_FARMER', 'FARM_MANAGER', 'SUPER_ADMIN']) {
    await assert.rejects(compileCropYear(database([report()]), { employeeId: '01000001', role }, scope), { status: 403 });
    await assert.rejects(compilationOptions(database(), { role }), { status: 403 });
  }
  for (const [method, url] of [['GET', '/api/crop-year-compilations'], ['POST', '/api/crop-year-compilations'], ['GET', '/api/crop-year-compilations/options'], ['GET', '/api/crop-year-compilations/preview'], ['GET', '/api/crop-year-compilations/CYA-1/print']]) {
    assert.deepEqual(allowedRolesForRequest(method, url), ['SRA_ADMIN']);
  }
  assert.equal(allowedRolesForRequest('DELETE', '/api/crop-year-compilations/CYA-1'), null);
});

test('same sources replay one immutable saved compilation and one audit event', async () => {
  const db = database([report()]);
  const first = await compileCropYear(db, sra, scope, { now: '2026-10-01T00:00:00.000Z' });
  const again = await compileCropYear(db, sra, scope, { now: '2026-10-02T00:00:00.000Z' });
  assert.equal(first.replayed, false); assert.equal(again.replayed, true);
  assert.equal(first.id, again.id); assert.equal(again.compiledAt, first.compiledAt);
  assert.equal([...db.records.keys()].filter(key => key.startsWith('audit_logs/')).length, 1);
  db.records.set('audit_reports/AUD-NEW', report('AUD-NEW', { period: '2026-10', operations: [{ operationLogId: 'LOG-NEW', cropYearCycle: '2026-2027', totalCost: 25 }] }));
  const next = await compileCropYear(db, sra, scope);
  assert.notEqual(next.id, first.id); assert.equal(next.totalCost, 125);
  assert.equal(db.records.get(`crop_year_compilations/${first.id}`).totalCost, 100);
});

test('content identity is stable across source and property ordering', () => {
  const row = report();
  const reordered = Object.fromEntries(Object.entries(row).reverse());
  assert.equal(buildCompilation([row], scope).contentHash, buildCompilation([reordered], scope).contentHash);
});

test('empty preview is allowed but cannot be saved; options derive from certified snapshots', async () => {
  const db = database([report(), report('AUD-UNAPPROVED', { status: 'PENDING_REVIEW', operations: [{ operationLogId: 'LOG-2028', cropYearCycle: '2028-2029', totalCost: 1 }] })]);
  const options = await compilationOptions(db, sra);
  assert.deepEqual(options.cropYearCycles, ['2026-2027']);
  const missing = { cropYearCycle: '2025-2026' };
  assert.equal((await compileCropYear(db, sra, missing, { preview: true })).operationCount, 0);
  await assert.rejects(compileCropYear(db, sra, missing), { status: 409 });
  assert.equal([...db.records.keys()].filter(key => key.startsWith('crop_year_compilations/')).length, 0);
});

test('printable report escapes source and user names and retains source attribution', async () => {
  const compiled = await compileCropYear(database([report()]), { ...sra, name: '<script>alert(1)</script>' }, scope);
  const html = compilationHtml(compiled);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/); assert.match(html, /AUD-BF1-2026-09-V1/);
  assert.match(html, /does not declare/); assert.match(html, /02000001/);
});

test('backups include compilations and continue validating pre-feature archives', () => {
  const { BACKUP_COLLECTIONS, _test } = require('../services/backupService');
  assert.ok(BACKUP_COLLECTIONS.includes(COLLECTIONS.CROP_YEAR_COMPILATIONS));
  const collections = BACKUP_COLLECTIONS.filter(name => name !== COLLECTIONS.CROP_YEAR_COMPILATIONS);
  const core = { format: 'HUGPONG_LOGICAL_BACKUP', formatVersion: 1, schemaVersion: '2026-09-28', sourceProjectId: 'test-project', includedCollections: collections, collections: Object.fromEntries(collections.map(name => [name, []])), documentCount: 0 };
  const checksumSha256 = crypto.createHash('sha256').update(JSON.stringify(core)).digest('hex');
  const result = _test.validateBackupPayload({ ...core, checksumSha256 }, 'test-project');
  assert.deepEqual(result.collections.crop_year_compilations, []);
});

test('API create, history, preview and print share server totals and preserve client-independent identity', async () => {
  const db = database([report()]);
  const firebasePath = require.resolve('../firebase-admin');
  const prior = require.cache[firebasePath];
  require.cache[firebasePath] = { id: firebasePath, filename: firebasePath, loaded: true, exports: { db } };
  const router = require('../routes/cropYearCompilations');
  if (prior) require.cache[firebasePath] = prior; else delete require.cache[firebasePath];
  const call = async (method, path, input = {}) => {
    const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
    const req = { authUser: sra, query: scope, body: scope, params: {}, ...input };
    await router.stack.find(layer => layer.route?.path === path && layer.route.methods[method]).route.stack.at(-1).handle(req, res);
    return res;
  };
  const created = await call('post', '/', { body: { ...scope, id: 'CLIENT-ID', totalCost: 999999, sourceReports: [] } });
  assert.equal(created.statusCode, 201); assert.equal(created.body.data.totalCost, 100);
  assert.notEqual(created.body.data.id, 'CLIENT-ID');
  const listed = await call('get', '/');
  assert.equal(listed.body.data.length, 1); assert.equal(listed.body.data[0].id, created.body.data.id);
  const preview = await call('get', '/preview');
  assert.equal(preview.body.data.totalCost, 100);
  const printed = await call('get', '/:id/print', { params: { id: created.body.data.id } });
  assert.match(printed.body.data.html, /100.00/);
  const missing = await call('get', '/:id/print', { params: { id: 'CYA-MISSING' } });
  assert.equal(missing.statusCode, 404);
  const mismatch = await call('get', '/', { query: { ...scope, blockFarmId: 'BF-OTHER', cursor: created.body.data.id } });
  assert.equal(mismatch.statusCode, 400);
  for (let index = 0; index < 22; index += 1) {
    const id = `CYA-HISTORY-${index}`;
    db.records.set(`crop_year_compilations/${id}`, { ...created.body.data, id, compiledAt: `2025-01-${String(index + 1).padStart(2, '0')}T00:00:00.000Z` });
  }
  const firstPage = await call('get', '/');
  assert.equal(firstPage.body.data.length, 20); assert.equal(firstPage.body.hasMore, true);
  const secondPage = await call('get', '/', { query: { ...scope, cursor: firstPage.body.nextCursor } });
  assert.equal(secondPage.body.data.length, 3); assert.equal(secondPage.body.hasMore, false);
  assert.equal(new Set([...firstPage.body.data, ...secondPage.body.data].map(row => row.id)).size, 23);
  for (const role of ['MEMBER_FARMER', 'FARM_MANAGER', 'SUPER_ADMIN']) {
    let proceeded = false;
    const denied = { status(code) { this.code = code; return this; }, json(body) { this.body = body; } };
    router.stack[0].handle({ authUser: { role } }, denied, () => { proceeded = true; });
    assert.equal(denied.code, 403); assert.equal(proceeded, false);
  }
});

test('explicit crop-year preview refresh bypasses the generic response cache', () => {
  const { createScopedReadCache } = require('../services/scopedReadCache');
  const cache = createScopedReadCache();
  let nextCount = 0;
  const res = { set(name, value) { this[name] = value; } };
  for (let index = 0; index < 2; index += 1) cache.middleware({ method: 'GET', originalUrl: '/api/crop-year-compilations/preview?cropYearCycle=2026-2027', authUser: sra }, res, () => nextCount++);
  assert.equal(nextCount, 2); assert.equal(cache.size(), 0);
  assert.equal(res['Cache-Control'], 'private, no-store');
});
