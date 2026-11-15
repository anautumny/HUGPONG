'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const mobileRequire = createRequire(path.join(root, 'mobile/package.json'));
const source = read('mobile/src/screens/FieldOpsScreen.js');

function helpers() {
  const context = {};
  vm.createContext(context);
  for (const file of ['utils/dataHelpers.js', 'domain/assignmentPresentation.js', 'domain/auditWorkflow.js']) {
    vm.runInContext(read(`mobile/src/${file}`).replace(/^import .*;\r?\n/gm, '').replace(/export /g, ''), context);
  }
  return vm.runInContext('({ uniqueRecordsById, managedBlockFarmIds, uniqueCropYears, canonicalStoredCropYear, canonicalAuditStatus, AUDIT_STATUS, operationAuditCoverage })', context);
}

// Exercise the real screen's derived-data declarations with its mutable store
// arrays and revision dependencies. Native rendering and Firebase stay outside
// this calculation test; data changes must still recompute the projections.
function selectors({ memoize = true } = {}) {
  const ast = mobileRequire('@babel/core').parseSync(source, { filename: 'FieldOpsScreen.jsx', configFile: false, babelrc: false, parserOpts: { plugins: ['jsx'] } });
  const body = ast.program.body.find(node => node.type === 'ExportDefaultDeclaration').declaration.body.body;
  const names = new Set(['canonicalBlockFarms', 'pendingAuditReports', 'managedFarmIds', 'accessibleFields', 'personalFields', 'auditCoverageByOperationId']);
  const declarations = body.filter(node => node.type === 'VariableDeclaration' && node.declarations.some(declaration => names.has(declaration.id.name)
    || declaration.id.properties?.some(property => property.key?.name === 'archiveCropYears')));
  assert.equal(declarations.length, 7);
  let cursor = 0, computations = 0;
  const slots = [];
  const context = { ...helpers(), fields: [], blockFarms: [{ id: 'BF', managerUserId: 'MANAGER' }], cropCycles: [], auditReports: [],
    dataRevision: 0, activeRole: 'Farm Manager', sessionUserId: 'MANAGER', session: { employeeId: 'MANAGER' }, deviceOnline: true,
    React: { useMemo(factory, dependencies) {
      const index = cursor++;
      if (!memoize || !slots[index] || !dependencies.every((value, i) => Object.is(value, slots[index].dependencies[i]))) {
        computations++;
        slots[index] = { dependencies: [...dependencies], value: factory() };
      }
      return slots[index].value;
    } } };
  vm.createContext(context);
  const project = vm.runInContext(`(function() { ${declarations.map(node => source.slice(node.start, node.end)).join('\n')}
    return { canonicalBlockFarms, pendingAuditReports, managedFarmIds, accessibleFields, personalFields, archiveCropYears, invalidArchiveCycles, auditCoverageByOperationId };
  })`, context);
  return { context, computations: () => computations, render(values = {}) { Object.assign(context, values); cursor = 0; return project(); } };
}

test('Mobile operation projections avoid repeated scans during input while reacting to live data, role and offline scope', t => {
  const measures = [];
  for (const memoize of [false, true]) {
    const runtime = selectors({ memoize });
    for (let i = 0; i < 1000; i++) runtime.context.fields.push({ id: `FIELD-${i}`, blockFarmId: 'BF', memberUserId: i ? 'MEMBER' : 'MANAGER' });
    for (let i = 0; i < 2000; i++) runtime.context.cropCycles.push({ id: `CYCLE-${i}`, fieldId: `FIELD-${i % 1000}`, cropYear: '2026-2027' });
    for (let i = 0; i < 200; i++) runtime.context.auditReports.push({ id: `REPORT-${i}`, status: 'PENDING_REVIEW', sourceLogIds: [`LOG-${i}`] });
    const first = runtime.render();
    const start = performance.now();
    for (let i = 0; i < 50; i++) {
      const next = runtime.render();
      assert.equal(next.accessibleFields.length, 1000);
      if (memoize) assert.equal(next.accessibleFields, first.accessibleFields, 'local input renders reuse the field projection');
    }
    measures.push({ memoize, calculations: runtime.computations(), inputRerenders: 50, elapsedMs: Math.round((performance.now() - start) * 100) / 100 });
    assert.equal(runtime.computations(), memoize ? 7 : 357);
    runtime.context.fields.push({ id: 'NEW-FIELD', blockFarmId: 'BF', memberUserId: 'MEMBER' });
    runtime.context.auditReports[0].status = 'CERTIFIED';
    const fresh = runtime.render({ dataRevision: 1 });
    assert.equal(fresh.accessibleFields.length, 1001);
    assert.equal(fresh.pendingAuditReports.length, 199);
    assert.equal(fresh.auditCoverageByOperationId.get('LOG-0').status, 'CERTIFIED');
    assert.equal(runtime.render({ deviceOnline: false }).accessibleFields.length, 1, 'offline manager scope remains personal fields only');
    assert.equal(runtime.render({ deviceOnline: true, activeRole: 'Farm Member', sessionUserId: 'MEMBER', session: { employeeId: 'MEMBER' } }).accessibleFields.length, 1000);
    runtime.context.blockFarms[0].managerUserId = 'OTHER-MANAGER';
    const reassigned = runtime.render({ dataRevision: 2, activeRole: 'Farm Manager', sessionUserId: 'MANAGER', session: { employeeId: 'MANAGER' } });
    assert.equal(reassigned.accessibleFields.length, 1, 'updated manager assignment invalidates the memo without losing the personal field');
  }
  t.diagnostic(JSON.stringify({ fixture: { fields: 1000, cycles: 2000, reports: 200 }, measures }));
});

test('Mobile operations use one store subscription and project each new assignment and edit once', () => {
  const start = source.indexOf('  useEffect(() => {\n    // One projection subscription');
  const end = source.indexOf('\n  const selectSraOperation', start);
  assert.ok(start > 0 && end > start);
  let changed, subscribed = 0, removed = 0, selected = null, revisions = 0, logCopies = 0, draftCopies = 0;
  let session = { employeeId: 'MANAGER', role: 'Farm Manager' }, online = true;
  const fields = [{ id: 'FIELD-1', blockFarmId: 'BF-1' }, { id: 'FIELD-2', blockFarmId: 'BF-2' }];
  const blockFarms = [{ id: 'BF-1', managerUserId: 'MANAGER' }, { id: 'BF-2', managerUserId: 'OTHER' }];
  const context = { ...helpers(), fields, blockFarms, operationLogs: [], pendingUsers: [], draftLogsStore: [],
    getCurrentSession: () => session, getNetworkStatus: () => online, getIsSynced: () => true,
    getFieldStages: () => [], setDataRevision: update => { revisions = update(revisions); },
    setSessionLocal() {}, setActiveRole() {}, setSyncedState() {}, setPendingUsersList() {},
    setLogs: () => logCopies++, setDraftLogs: () => draftCopies++, setCycleTasksByField: update => update({}),
    setSelectedField: value => { selected = typeof value === 'function' ? value(selected) : value; },
    subscribe: callback => { subscribed++; changed = callback; return () => removed++; } };
  let cleanup;
  context.useEffect = callback => { cleanup = callback(); };
  vm.createContext(context); vm.runInContext(source.slice(start, end), context);
  assert.equal(selected.id, 'FIELD-1'); assert.equal(subscribed, 1);
  blockFarms[0].managerUserId = 'OTHER'; blockFarms[1].managerUserId = 'MANAGER';
  fields[1].stageNumber = 3;
  changed();
  assert.equal(selected.id, 'FIELD-2'); assert.equal(selected.stageNumber, 3);
  assert.equal(revisions, 1); assert.equal(logCopies, 1); assert.equal(draftCopies, 1);
  online = false; changed(); assert.equal(selected, null, 'offline callbacks cannot retain another member field');
  cleanup(); assert.equal(removed, 1);
  assert.equal((source.match(/const unsubscribe = subscribe\(/g) || []).length, 1, 'the screen must not register a second projection subscription');
});
