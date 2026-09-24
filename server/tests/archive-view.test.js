'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  ARCHIVE_PAGE_SIZE,
  decodeArchiveCursor,
  listArchivedOperationPage
} = require('../services/archiveQueryService');

function makeSnapshot(entries) {
  return {
    docs: entries.map(([id, data]) => ({ id, exists: true, data: () => ({ ...data }) }))
  };
}

function fakeDatabase(collections) {
  function query(name, constraints = [], cursor = null, max = null) {
    const entries = Object.entries(collections[name] || {});
    return {
      where(field, operator, value) {
        return query(name, [...constraints, { field, operator, value }], cursor, max);
      },
      orderBy() { return this; },
      startAfter(archivedAt, id) { return query(name, constraints, { archivedAt, id }, max); },
      limit(value) { return query(name, constraints, cursor, value); },
      doc(id) {
        return {
          async get() {
            const data = collections[name]?.[id];
            return { id, exists: Boolean(data), data: () => data ? { ...data } : undefined };
          }
        };
      },
      async get() {
        let filtered = entries.filter(([id, data]) => constraints.every(({ field, operator, value }) => {
          const fieldValue = String(field) === '__name__' ? id : data[field];
          if (operator === 'in') return value.includes(fieldValue);
          return fieldValue === value;
        }));
        filtered.sort((left, right) => String(right[1].archivedAt || '').localeCompare(String(left[1].archivedAt || '')) || right[0].localeCompare(left[0]));
        if (cursor) {
          filtered = filtered.filter(([id, data]) =>
            String(data.archivedAt || '') < cursor.archivedAt
            || (String(data.archivedAt || '') === cursor.archivedAt && id < cursor.id));
        }
        if (max != null) filtered = filtered.slice(0, max);
        return makeSnapshot(filtered);
      }
    };
  }
  return { collection: name => query(name) };
}

function archiveRecord(index, overrides = {}) {
  const day = String(60 - index).padStart(2, '0');
  return {
    fieldId: index % 2 ? 'FLD-1' : 'FLD-2',
    cycleId: `${index % 2 ? 'FLD-1' : 'FLD-2'}-${index < 30 ? 'CY-2025' : 'CY-2026'}`,
    cropYearCycle: index < 30 ? '2025-2026' : '2026-2027',
    operationDefinitionId: index % 3 ? 'SRA-01' : 'SRA-14',
    operationName: 'Archived operation',
    status: 'ARCHIVED',
    archivedAt: `2026-09-${day}T08:00:00.000Z`,
    ...overrides
  };
}

const operationLogs = Object.fromEntries(Array.from({ length: 60 }, (_, index) => [
  `LOG-${String(index + 1).padStart(3, '0')}`,
  archiveRecord(index)
]));
operationLogs['ACTIVE-001'] = archiveRecord(1, { status: 'ACTIVE', archivedAt: null });

const database = fakeDatabase({
  block_farms: {
    'BF-1': { managerUserId: 'MGR-1' },
    'BF-2': { managerUserId: 'MGR-2' }
  },
  fields: {
    'FLD-1': { blockFarmId: 'BF-1', memberUserId: 'MEM-1' },
    'FLD-2': { blockFarmId: 'BF-2', memberUserId: 'MEM-2' }
  },
  operation_logs: operationLogs
});

test('archive cursor pagination loads 25, 25, then 10 newest-first without duplicates', async () => {
  const user = { employeeId: 'SRA-1', role: 'SRA_ADMIN' };
  const first = await listArchivedOperationPage(database, user);
  const second = await listArchivedOperationPage(database, user, { cursor: first.nextCursor });
  const third = await listArchivedOperationPage(database, user, { cursor: second.nextCursor });
  const records = [...first.data, ...second.data, ...third.data];
  assert.equal(ARCHIVE_PAGE_SIZE, 25);
  assert.equal(first.data.length, 25);
  assert.equal(second.data.length, 25);
  assert.equal(third.data.length, 10);
  assert.equal(new Set(records.map(record => record.id)).size, 60);
  assert.equal(first.hasMore, true);
  assert.equal(third.hasMore, false);
  assert.deepEqual(records, [...records].sort((left, right) => String(right.archivedAt).localeCompare(String(left.archivedAt)) || String(right.id).localeCompare(String(left.id))));
});

test('archive filters remain inside Farm Manager field scope', async () => {
  const user = { employeeId: 'MGR-1', role: 'FARM_MANAGER' };
  const page = await listArchivedOperationPage(database, user, {
    fieldId: 'FLD-1',
    cropYearCycle: '2025-2026',
    operationDefinitionId: 'SRA-01'
  });
  assert.ok(page.data.length > 0);
  assert.ok(page.data.every(record => record.fieldId === 'FLD-1' && record.cropYearCycle === '2025-2026' && record.operationDefinitionId === 'SRA-01'));
  await assert.rejects(
    listArchivedOperationPage(database, user, { fieldId: 'FLD-2' }),
    error => error.status === 403
  );
});

test('filtered archive pagination stays within the selected Crop Year Cycle', async () => {
  const user = { employeeId: 'SRA-1', role: 'SRA_ADMIN' };
  const first = await listArchivedOperationPage(database, user, { cropYearCycle: '2025-2026' });
  const second = await listArchivedOperationPage(database, user, {
    cropYearCycle: '2025-2026',
    cursor: first.nextCursor
  });
  const records = [...first.data, ...second.data];
  assert.equal(first.data.length, 25);
  assert.equal(second.data.length, 5);
  assert.equal(new Set(records.map(record => record.id)).size, 30);
  assert.ok(records.every(record => record.cropYearCycle === '2025-2026'));
  assert.deepEqual(new Set(records.map(record => record.fieldId)), new Set(['FLD-1', 'FLD-2']));
  assert.ok(new Set(records.map(record => record.cycleId)).size > 1, 'one annual filter must include field-specific cycles across authorized fields');
});

test('Crop Year Cycle and field filters combine without changing either selection', async () => {
  const user = { employeeId: 'SRA-1', role: 'SRA_ADMIN' };
  const page = await listArchivedOperationPage(database, user, {
    cropYearCycle: '2026-2027',
    fieldId: 'FLD-1'
  });
  assert.ok(page.data.length > 0);
  assert.ok(page.data.every(record => record.cropYearCycle === '2026-2027' && record.fieldId === 'FLD-1'));

  const empty = await listArchivedOperationPage(database, user, {
    cropYearCycle: '2024-2025',
    fieldId: 'FLD-1'
  });
  assert.deepEqual(empty.data, []);
  assert.equal(empty.hasMore, false);
});

test('archive rejects malformed Crop Year Cycle filters instead of fabricating an annual range', async () => {
  await assert.rejects(
    listArchivedOperationPage(database, { employeeId: 'SRA-1', role: 'SRA_ADMIN' }, { cropYearCycle: '2026' }),
    error => error.status === 400 && /canonical YYYY-YYYY/.test(error.message)
  );
  await assert.rejects(
    listArchivedOperationPage(database, { employeeId: 'SRA-1', role: 'SRA_ADMIN' }, { cycleId: 'FLD-1-CY-2025' }),
    error => error.status === 400 && /exact cycle identifier/.test(error.message)
  );
});

test('archive search is exact, authorized, and archived-only', async () => {
  const member = { employeeId: 'MEM-1', role: 'MEMBER_FARMER' };
  const own = await listArchivedOperationPage(database, member, { search: 'LOG-002' });
  const other = await listArchivedOperationPage(database, member, { search: 'LOG-001' });
  const active = await listArchivedOperationPage(database, member, { search: 'ACTIVE-001' });
  assert.equal(own.data.length, 1);
  assert.equal(other.data.length, 0);
  assert.equal(active.data.length, 0);
  assert.throws(() => decodeArchiveCursor('not-a-cursor'), /cursor is invalid/);
});

test('SRA archive scope remains district-wide and Super Admin remains governance-only', async () => {
  const sra = await listArchivedOperationPage(database, { employeeId: 'SRA-1', role: 'SRA_ADMIN' }, { fieldId: 'FLD-2' });
  assert.ok(sra.data.length > 0);
  assert.ok(sra.data.every(record => record.fieldId === 'FLD-2'));
  await assert.rejects(
    listArchivedOperationPage(database, { employeeId: 'SUPER-1', role: 'SUPER_ADMIN' }),
    error => error.status === 403
  );
});

test('Clear View implementations are presentation-only and leave analytics and sync stores untouched', () => {
  const web = fs.readFileSync(path.join(__dirname, '..', '..', 'web', 'react-app', 'src', 'views', 'operations', 'OperationsView.jsx'), 'utf8');
  const mobile = fs.readFileSync(path.join(__dirname, '..', '..', 'mobile', 'src', 'screens', 'FieldOpsScreen.js'), 'utf8');
  const webClear = web.slice(web.indexOf('const clearArchiveView'), web.indexOf('const updateArchiveFilter'));
  const mobileClear = mobile.slice(mobile.indexOf('const clearArchiveView'), mobile.indexOf('const allFarmSubmittedLogs'));
  const combined = `${webClear}\n${mobileClear}`;
  assert.match(combined, /records: \[\]/);
  assert.match(combined, /isCleared: true/);
  assert.match(combined, /writeArchiveClearViewPreference\([^,]+, true\)/);
  assert.doesNotMatch(combined, /authenticatedRequest|archiveOperations|delete|operationLogs|outbox/i);
  assert.match(web, /Your archived records are still safely stored/);
  assert.match(mobile, /Your archived records are still safely stored/);
  assert.match(web, /if \(archiveState\.isCleared\) return/);
  assert.match(mobile, /if \(archiveState\.isCleared\) return/);
});

test('Clear View preference is local, user-scoped, and hydrated before archive reads', () => {
  const web = fs.readFileSync(path.join(__dirname, '..', '..', 'web', 'react-app', 'src', 'views', 'operations', 'OperationsView.jsx'), 'utf8');
  const mobile = fs.readFileSync(path.join(__dirname, '..', '..', 'mobile', 'src', 'screens', 'FieldOpsScreen.js'), 'utf8');
  const webService = fs.readFileSync(path.join(__dirname, '..', '..', 'web', 'react-app', 'src', 'services', 'archiveViewService.js'), 'utf8');
  const mobileService = fs.readFileSync(path.join(__dirname, '..', '..', 'mobile', 'src', 'services', 'archiveViewService.js'), 'utf8');
  const mobileStorage = fs.readFileSync(path.join(__dirname, '..', '..', 'mobile', 'src', 'services', 'storageService.js'), 'utf8');
  const webPreferenceSource = webService.slice(0, webService.indexOf('export function appendUniqueArchiveRecords'));
  const mobilePreferenceSource = mobileService.slice(0, mobileService.indexOf('export function appendUniqueArchiveRecords'));

  assert.match(webPreferenceSource, /user\?\.employeeId \|\| user\?\.id/);
  assert.match(webPreferenceSource, /archiveContext/);
  assert.match(webPreferenceSource, /localStorage\.getItem/);
  assert.match(webPreferenceSource, /localStorage\.setItem/);
  assert.match(mobilePreferenceSource, /user\?\.employeeId \|\| user\?\.id/);
  assert.match(mobilePreferenceSource, /archiveContext/);
  assert.match(mobilePreferenceSource, /getItem\(STORAGE_KEYS\.ARCHIVE_VIEW_PREFERENCES/);
  assert.match(mobilePreferenceSource, /saveItem\(STORAGE_KEYS\.ARCHIVE_VIEW_PREFERENCES/);
  assert.match(mobileStorage, /ARCHIVE_VIEW_PREFERENCES: '@hugpong_archive_view_preferences'/);

  assert.match(web, /hydratedArchivePreferenceKey !== archivePreferenceKey\) return;\s*if \(archiveState\.isCleared\) return;\s*loadArchivePage/);
  assert.match(mobile, /hydratedArchivePreferenceScope !== archivePreferenceScope\) return;\s*if \(archiveState\.isCleared\) return;\s*loadArchivePage/);
  assert.doesNotMatch(`${webPreferenceSource}\n${mobilePreferenceSource}`, /operation_logs|cropCycles|analytics|auditReports|outbox/i);
});

test('archive year controls deduplicate canonical years and never concatenate field IDs', () => {
  const web = fs.readFileSync(path.join(__dirname, '..', '..', 'web', 'react-app', 'src', 'views', 'operations', 'OperationsView.jsx'), 'utf8');
  const mobile = fs.readFileSync(path.join(__dirname, '..', '..', 'mobile', 'src', 'screens', 'FieldOpsScreen.js'), 'utf8');
  for (const source of [web, mobile]) {
    assert.match(source, /uniqueCropYears\(authorizedArchiveCycles\)/);
    assert.match(source, /invalidArchiveCycles/);
    assert.doesNotMatch(source, /formatCropYearDisplay\(cycle\.cropYear\).*cycle\.fieldId/);
    assert.doesNotMatch(source, /updateArchiveFilter\('cycleId'/);
  }
});

test('Show Records restarts at page one with preserved filters on web and mobile', () => {
  const web = fs.readFileSync(path.join(__dirname, '..', '..', 'web', 'react-app', 'src', 'views', 'operations', 'OperationsView.jsx'), 'utf8');
  const mobile = fs.readFileSync(path.join(__dirname, '..', '..', 'mobile', 'src', 'screens', 'FieldOpsScreen.js'), 'utf8');
  for (const source of [web, mobile]) {
    const clearStart = source.indexOf('const clearArchiveView');
    const clearEnd = source.indexOf('};', clearStart) + 2;
    const clearSource = source.slice(clearStart, clearEnd);
    assert.doesNotMatch(clearSource, /setArchiveFilters/);
    assert.match(source, /Show Records/);
    assert.match(source, /const showArchiveRecords[\s\S]*writeArchiveClearViewPreference\([^,]+, false\)[\s\S]*loadArchivePage\(\{ append: false \}\)/);
    assert.match(source, /loadArchivePage\(\{ append: false \}\)/);
    assert.match(source, /cursor: append \? archiveState\.nextCursor : null/);
  }
});

test('archive clients use the read-only paged endpoint and preserve canonical analytics stores', () => {
  const webService = fs.readFileSync(path.join(__dirname, '..', '..', 'web', 'react-app', 'src', 'services', 'archiveViewService.js'), 'utf8');
  const mobileService = fs.readFileSync(path.join(__dirname, '..', '..', 'mobile', 'src', 'services', 'archiveViewService.js'), 'utf8');
  for (const source of [webService, mobileService]) {
    assert.match(source, /ARCHIVE_PAGE_SIZE = 25/);
    assert.match(source, /\/api\/logs\/archive\?/);
    assert.doesNotMatch(source, /method:\s*['"](?:POST|PATCH|PUT|DELETE)/);
    assert.match(source, /cropYearCycle/);
    assert.doesNotMatch(source, /cycleId/);
  }
  assert.doesNotMatch(`${webService}\n${mobileService}`, /analytics|outbox|auditReports|cropCycles/);
});

test('Firestore index configuration covers every supported archive filter combination', () => {
  const configuration = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'firestore.indexes.json'), 'utf8'));
  const requiredIndexes = [
    ['status'],
    ['fieldId', 'status'],
    ['cropYearCycle', 'status'],
    ['operationDefinitionId', 'status'],
    ['cropYearCycle', 'fieldId', 'status'],
    ['fieldId', 'operationDefinitionId', 'status'],
    ['cropYearCycle', 'operationDefinitionId', 'status'],
    ['cropYearCycle', 'fieldId', 'operationDefinitionId', 'status']
  ].map(fields => [
    ...fields.map(fieldPath => [fieldPath, 'ASCENDING']),
    ['archivedAt', 'DESCENDING'],
    ['__name__', 'DESCENDING']
  ]);
  const configuredIndexes = configuration.indexes
    .filter(index => index.collectionGroup === 'operation_logs' && index.queryScope === 'COLLECTION')
    .map(index => index.fields.map(field => [field.fieldPath, field.order]));
  requiredIndexes.forEach(requiredFields => {
    assert.ok(
      configuredIndexes.some(fields => JSON.stringify(fields) === JSON.stringify(requiredFields)),
      `Missing operation_logs index: ${JSON.stringify(requiredFields)}`
    );
  });
  assert.equal(configuredIndexes.some(fields => fields.some(([fieldPath]) => fieldPath === 'cycleId')), false);
});
