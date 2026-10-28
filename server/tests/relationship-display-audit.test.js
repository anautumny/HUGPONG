'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');

async function presentation(client) {
  const filename = client === 'mobile' ? 'mobile/src/domain/assignmentPresentation.js' : 'web/react-app/src/domain/assignmentPresentation.js';
  const source = fs.readFileSync(path.join(root, filename), 'utf8');
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
}

test('Web and Mobile show canonical farm relationships for pending and approved accounts', async () => {
  const farms = [{ id: 'BF-A', name: 'NACAYAO' }, { id: 'BF-B', name: 'Other Farm' }];
  for (const client of ['mobile', 'web']) {
    const { accountBlockFarmId, blockFarmDisplayName } = await presentation(client);
    const account = { status: 'ACTIVE', assignment: { blockFarmId: 'BF-A' }, requestedBlockFarmId: 'BF-B', blockFarm: 'Stale farm' };
    assert.equal(accountBlockFarmId(account), 'BF-A');
    assert.equal(blockFarmDisplayName(accountBlockFarmId(account), farms), 'NACAYAO');
    assert.equal(accountBlockFarmId({ ...account, status: 'PENDING' }), 'BF-B');
    assert.equal(accountBlockFarmId({ affiliatedBlockFarmId: 'BF-A' }), 'BF-A');
    assert.equal(blockFarmDisplayName('BF-A', []), 'BF-A', 'unloaded names do not erase assignments');
    assert.equal(blockFarmDisplayName('', farms), 'Unassigned');
    assert.equal(accountBlockFarmId({ blockFarm: 'NACAYAO' }), '', 'legacy names cannot invent relationships');
  }
});

test('matching manager names cannot pull another manager farm into the Mobile scope', async () => {
  const { managedBlockFarmIds } = await presentation('mobile');
  const farms = [
    { id: 'BF-A', managerUserId: 'MGR-1', managerName: 'Same Name' },
    { id: 'BF-B', managerUserId: 'MGR-2', managerName: 'Same Name' },
    { id: 'BF-C', managerName: 'Same Name' },
  ];
  assert.deepEqual([...managedBlockFarmIds(farms, 'MGR-1')], ['BF-A']);
  assert.deepEqual([...managedBlockFarmIds(farms, '')], []);
});

test('an assigned manager ID remains visible when their directory page is not cached', () => {
  const source = fs.readFileSync(path.join(root, 'mobile/src/data/dataStore.js'), 'utf8');
  const start = source.indexOf('export const resolveBlockFarmManager =');
  const end = source.indexOf('\nexport const ', start + 1);
  const users = [];
  const resolve = new Function('users', `${source.slice(start, end).replace('export const ', 'const ')}; return resolveBlockFarmManager;`)(users);
  assert.equal(resolve({ managerUserId: 'MGR-1' }), 'MGR-1');
  assert.equal(resolve({}), 'Unassigned');
  users.push({ id: 'MGR-1', displayName: 'Manager Name' });
  assert.equal(resolve({ managerUserId: 'MGR-1' }), 'Manager Name');
});

test('Mobile report adaptation retains server totals, canonical counts and explicit zero values', () => {
  const source = fs.readFileSync(path.join(root, 'mobile/src/data/firestoreSchema.js'), 'utf8')
    .replace(/^import[^;]+;\r?\n/gm, '').replace(/\bexport /g, '');
  const adapt = new Function('canonicalOperationUnit', `${source}; return fromAuditReportDocument;`)(value => value);
  const summary = { periodKey: '2026-09', status: 'CERTIFIED', operationCount: 30, fieldCount: 5, fieldsReported: 1,
    hectaresAudited: 7.5, totalCost: 30000, operationSnapshots: [{ fieldId: 'FLD-1', areaHa: 1, totalCost: 1000 }] };
  const result = adapt('REPORT-1', summary);
  assert.equal(result.totalLogs, 30);
  assert.equal(result.logsCount, 30);
  assert.equal(result.fieldCount, 5);
  assert.equal(result.fieldsReported, 5);
  assert.equal(result.totalCost, 30000);
  assert.equal(result.totalHectares, 7.5);
  assert.equal(result.month, '2026-09');
  const zero = adapt('REPORT-0', { ...summary, operationCount: 0, fieldCount: 0, totalCost: 0, hectaresAudited: 0 });
  for (const key of ['totalLogs', 'logsCount', 'fieldCount', 'fieldsReported', 'totalCost', 'totalHectares']) assert.equal(zero[key], 0, key);
  const legacy = adapt('LEGACY', { operationSnapshots: [{ fieldId: 'FLD-1', areaHa: 1, totalCost: 1000 }] });
  assert.equal(legacy.totalCost, 1000);
  assert.equal(legacy.fieldCount, 1);
});

test('certification confirmation uses the certified report farm and month rather than the viewer context', async () => {
  const { blockFarmDisplayName } = await presentation('mobile');
  const source = fs.readFileSync(path.join(root, 'mobile/src/screens/FieldOpsScreen.js'), 'utf8');
  const start = source.indexOf("'SRA Seal Issued'");
  const end = source.indexOf('\n      );', start);
  let notice;
  new Function('Alert', 'certifiedReport', 'report', 'blockFarms', 'blockFarmDisplayName', 'displayPeriod', 'auditorName',
    `Alert.alert(${source.slice(start, end)});`)(
    { alert: (_title, message) => { notice = message; } },
    { blockFarmId: 'BF-A', blockFarmName: 'NACAYAO', periodKey: '2026-09' },
    { blockFarmId: 'BF-A', periodKey: '2026-09' },
    [], blockFarmDisplayName, value => value, 'SRA Inspector');
  assert.match(notice, /NACAYAO \(2026-09\)/);
});

test('historical audit QR details cannot attribute another compiler work to the current viewer', async () => {
  const { blockFarmDisplayName } = await presentation('mobile');
  const source = fs.readFileSync(path.join(root, 'mobile/src/screens/FieldOpsScreen.js'), 'utf8');
  const start = source.indexOf('setActiveQRData({', source.indexOf('const report = validateCanonicalAuditReport(selectedAudit)'));
  const end = source.indexOf('\n      });', start) + '\n      });'.length;
  const evaluate = new Function('setActiveQRData', 'report', 'selectedAudit', 'session', 'blockFarms', 'blockFarmDisplayName', 'displayPeriod', 'hash', 'qrPayload', 'reportId', source.slice(start, end));
  let details;
  const report = { blockFarmId: 'BF-A', compiledByUserId: 'MGR-HISTORICAL', periodKey: '2026-09' };
  evaluate(value => { details = value; }, report, report, { employeeId: 'MGR-VIEWER', name: 'Current Manager', farm: 'Wrong Farm' },
    [{ id: 'BF-A', name: 'NACAYAO' }], blockFarmDisplayName, value => value, 'hash', {}, 'REPORT-1');
  assert.equal(details.blockFarm, 'NACAYAO');
  assert.equal(details.managerName, 'MGR-HISTORICAL');
  evaluate(value => { details = value; }, report, report, { employeeId: 'MGR-HISTORICAL', name: 'Actual Compiler' }, [], blockFarmDisplayName, value => value, 'hash', {}, 'REPORT-1');
  assert.equal(details.managerName, 'Actual Compiler');
});
