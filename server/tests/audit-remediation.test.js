'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { memoryFirestore } = require('./helpers/memoryFirestore');
const { ROLES, COLLECTIONS } = require('../schema/firestoreSchema');
const { accountUpdateActions, assertAccountUpdateAllowed } = require('../domain/accountUpdatePolicy');
const { listOperationPage, listOperationRecords } = require('../services/operationQueryService');
const user = (role, extra = {}) => ({ role, displayName: 'Fixture', phone: '09171234567', status: 'ACTIVE', updatedAt: '2026-10-18T09:00:00.000Z', ...extra });
const mutation = (key, version) => ({ mutationId: key, idempotencyKey: key, entityKey: 'fixture', baseVersion: version });
const sra = { employeeId: '02000001', role: ROLES.SRA_ADMIN };

function handler(name, db, method = 'get', endpoint = '/') {
  const firebase = require.resolve('../firebase-admin'), route = require.resolve(`../routes/${name}`);
  const prior = require.cache[firebase];
  require.cache[firebase] = { id: firebase, filename: firebase, loaded: true, exports: { db, admin: {}, auth: null } };
  delete require.cache[route];
  const router = require(route);
  if (prior) require.cache[firebase] = prior; else delete require.cache[firebase];
  return router.stack.find(layer => layer.route?.path === endpoint && layer.route.methods[method]).route.stack.at(-1).handle;
}
async function invoke(handle, actor, body = {}, query = {}, params = {}) {
  const res = { statusCode: 200, status(value) { this.statusCode = value; return this; }, json(value) { this.body = value; return this; } };
  await handle({ body, query, params, headers: {}, get: () => '', session: { user: actor } }, res);
  return res;
}

test('account transition matrix protects the stored role as well as the requested role', () => {
  for (const actor of Object.values(ROLES)) for (const current of Object.values(ROLES)) for (const requested of Object.values(ROLES)) {
    const allowed = actor === ROLES.SUPER_ADMIN || (actor === ROLES.SRA_ADMIN && current === ROLES.FARM_MANAGER && requested === current)
      || (actor === ROLES.FARM_MANAGER && current === ROLES.MEMBER_FARMER && requested === current);
    if (allowed) assert.doesNotThrow(() => assertAccountUpdateAllowed(actor, current, requested));
    else assert.throws(() => assertAccountUpdateAllowed(actor, current, requested), error => error.status === 403);
    assert.equal(accountUpdateActions(actor, current).allowedRoles.includes(requested), allowed);
  }
});

test('role escalation and administrative demotion requests leave the database unchanged', async () => {
  for (const [actor, current, requested] of [[sra, ROLES.FARM_MANAGER, ROLES.SRA_ADMIN], [{ employeeId: '03000001', role: ROLES.FARM_MANAGER }, ROLES.SUPER_ADMIN, ROLES.MEMBER_FARMER]]) {
    const db = memoryFirestore({ 'users/03000002': user(current, { affiliatedBlockFarmId: 'BF-1' }), 'block_farms/BF-1': { managerUserId: actor.employeeId } });
    const before = structuredClone([...db.records]);
    const response = await invoke(handler('users', db, 'patch', '/:userId'), actor, { role: requested }, {}, { userId: '03000002' });
    assert.equal(response.statusCode, 403, response.body.error);
    assert.deepEqual([...db.records], before);
  }
});

test('personnel edits reject a stale displayed version and accept a matching version', async () => {
  const db = memoryFirestore({ 'users/03000002': user(ROLES.FARM_MANAGER, { firstName: 'Newest', lastName: 'Name', displayName: 'Newest Name' }) });
  const patch = handler('users', db, 'patch', '/:userId');
  const before = structuredClone([...db.records]);
  const stale = await invoke(patch, sra, { firstName: 'Stale', lastName: 'Name', _mutation: mutation('MUT-STALE-ACCOUNT', '2026-10-17T09:00:00.000Z') }, {}, { userId: '03000002' });
  assert.equal(stale.statusCode, 409, stale.body.error);
  assert.equal(stale.body.data.current.displayName, 'Newest Name');
  assert.deepEqual([...db.records], before);
  const updated = await invoke(patch, sra, { firstName: 'Accepted', lastName: 'Name', _mutation: mutation('MUT-FRESH-ACCOUNT', '2026-10-18T09:00:00.000Z') }, {}, { userId: '03000002' });
  assert.equal(updated.statusCode, 200, updated.body.error);
  assert.equal(db.records.get('users/03000002').displayName, 'Accepted Name');
});

test('farm creation replays one request, rejects changed details, and requires a retained request key', async () => {
  const db = memoryFirestore(), create = handler('blockFarms', db, 'post');
  const body = { name: 'Farm', address: 'Fixture', declaredAreaHa: 10, _mutation: mutation('MUT-FARM-RETRY') };
  const [first, second] = await Promise.all([invoke(create, sra, body), invoke(create, sra, body)]);
  assert.deepEqual([first.statusCode, second.statusCode], [201, 200]);
  assert.equal(first.body.data.id, second.body.data.id);
  assert.equal([...db.records.keys()].filter(key => key.startsWith('block_farms/')).length, 1);
  assert.equal((await invoke(create, sra, { ...body, name: 'Changed' })).statusCode, 409);
  assert.equal((await invoke(create, sra, { ...body, _mutation: undefined })).statusCode, 400);
});

test('farm creation prevents inactive managers and competing assignments', async () => {
  const db = memoryFirestore({ 'users/03000001': user(ROLES.FARM_MANAGER) });
  const create = handler('blockFarms', db, 'post');
  const body = { name: 'Farm', address: 'Fixture', declaredAreaHa: 10, managerUserId: '03000001' };
  const responses = await Promise.all(['A', 'B'].map(key => invoke(create, sra, { ...body, _mutation: mutation(`MUT-ASSIGN-${key}`) })));
  assert.deepEqual(responses.map(row => row.statusCode).sort(), [201, 409]);
  assert.equal([...db.records.values()].filter(row => row.managerUserId === '03000001').length, 1);
  db.records.set('users/03000002', user(ROLES.FARM_MANAGER, { status: 'DISABLED' }));
  assert.equal((await invoke(create, sra, { ...body, managerUserId: '03000002', _mutation: mutation('MUT-INACTIVE-MANAGER') })).statusCode, 400);
});

test('amendment attribution retains recorded names/roles with legacy directory fallback', async () => {
  const db = memoryFirestore({
    'users/EDITOR': user(ROLES.SRA_ADMIN, { displayName: 'Current Name' }),
    'operation_logs/LOG-1': { status: 'ACTIVE', amendments: [
      { amendedByUserId: 'EDITOR', amendedByName: 'Historical Name', amendedByRole: ROLES.FARM_MANAGER },
      { amendedByUserId: 'EDITOR' },
    ] },
  });
  const records = await listOperationRecords(db, sra);
  assert.equal(records[0].amendments[0].amendedByName, 'Historical Name');
  assert.equal(records[0].amendments[0].amendedByRole, ROLES.FARM_MANAGER);
  assert.equal(records[0].amendments[1].amendedByName, 'Current Name');
});

test('price cursors reach all 110 records without overlaps and preserve changes at page boundaries', async () => {
  const seed = {};
  for (let index = 0; index < 110; index++) {
    const date = new Date(Date.UTC(2024, 0, 7 + index * 7)).toISOString().slice(0, 10);
    seed[`${COLLECTIONS.SRA_PRICES}/PRICE-${index}`] = { effectiveDate: date, weekLabel: `Week ${index}`, circularNumber: `TEST-${index}`, source: 'SRA fixture', publishedByUserId: '02000001', publishedAt: `${date}T00:00:00.000Z`, sugarPricePerLkg: 1000 + index, molassesPricePerMetricTon: 2000 + index };
  }
  const read = handler('prices', memoryFirestore(seed));
  const ids = [], sizes = [];
  let cursor;
  do {
    const response = await invoke(read, sra, {}, { limit: '52', cursor });
    assert.equal(response.statusCode, 200, response.body.error);
    ids.push(...response.body.data.map(row => row.id)); sizes.push(response.body.data.length);
    if (response.body.page.hasMore) assert.equal(response.body.data.at(-1).sugarPriceChange, 1);
    cursor = response.body.page.nextCursor;
  } while (cursor);
  assert.deepEqual(sizes, [52, 52, 6]);
  assert.equal(new Set(ids).size, 110);
  assert.equal((await invoke(read, sra, {}, { cursor: 'invalid' })).statusCode, 400);
});

test('operation pages merge field scopes without omitting ties or exposing another farm', async () => {
  const seed = { 'block_farms/BF-1': { managerUserId: 'MGR' } };
  for (let index = 0; index < 12; index++) seed[`fields/FLD-${index}`] = { blockFarmId: 'BF-1' };
  for (let index = 0; index < 235; index++) seed[`operation_logs/LOG-${String(index).padStart(4, '0')}`] = { fieldId: `FLD-${index % 12}`, performedOn: '2026-09-10', status: 'ACTIVE' };
  seed['operation_logs/SECRET'] = { fieldId: 'OTHER', status: 'ACTIVE' };
  const db = memoryFirestore(seed), all = [];
  let cursor;
  do {
    const response = await listOperationPage(db, { employeeId: 'MGR', role: ROLES.FARM_MANAGER }, { cursor, limit: 100 });
    assert.ok(response.data.length <= 100);
    all.push(...response.data.map(row => row.id)); cursor = response.page.nextCursor;
  } while (cursor);
  assert.equal(all.length, 235); assert.equal(new Set(all).size, 235);
  assert.equal(all.includes('SECRET'), false);
});

test('both operation transports collect 1,205 records and abort on account switches or a stuck cursor', async () => {
  const fs = require('node:fs'), path = require('node:path');
  const source = fs.readFileSync(path.resolve(__dirname, '../../mobile/src/services/operationPages.js'), 'utf8');
  assert.equal(source, fs.readFileSync(path.resolve(__dirname, '../../web/react-app/src/services/operationPages.js'), 'utf8'));
  const fetchPages = new Function(source.replace('export async function', 'async function') + '\nreturn fetchOperationPages;')();
  const rows = Array.from({ length: 1205 }, (_, index) => ({ id: `LOG-${index}` }));
  let requests = 0;
  const response = await fetchPages(async url => {
    const query = new URL(url, 'https://fixture').searchParams;
    assert.equal(query.get('paged'), '1'); assert.equal(query.get('limit'), '100');
    const start = Number(query.get('cursor') || 0), next = start + 100;
    requests++;
    return { data: rows.slice(start, next), page: { hasMore: next < rows.length, nextCursor: next < rows.length ? String(next) : null } };
  });
  assert.equal(requests, 13); assert.deepEqual(response.data, rows);
  let current = true;
  await assert.rejects(fetchPages(async () => { current = false; return { data: rows }; }, () => current), error => error.code === 'AUTH_CONTEXT_CHANGED');
  await assert.rejects(fetchPages(async () => ({ data: [], page: { hasMore: true, nextCursor: 'same' } })), /did not advance/);
});
