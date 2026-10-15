'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { memoryFirestore } = require('./helpers/memoryFirestore');
const { createOtpService, OTP_TTL_MS } = require('../security/otp');
const { createAuditHash } = require('../schema/firestoreSchema');
const { assertReleaseEnvironment } = require('../../mobile/scripts/validateReleaseEnvironment.cjs');

function loadHandler(name, db, method = 'get', route = '/') {
  const firebasePath = require.resolve('../firebase-admin');
  const routePath = require.resolve(`../routes/${name}`);
  const prior = require.cache[firebasePath];
  require.cache[firebasePath] = { id: firebasePath, filename: firebasePath, loaded: true, exports: { db } };
  delete require.cache[routePath];
  const router = require(routePath);
  if (prior) require.cache[firebasePath] = prior; else delete require.cache[firebasePath];
  return router.stack.find(layer => layer.route?.path === route && layer.route.methods[method]).route.stack.at(-1).handle;
}
async function invoke(handler, user, { body = {}, query = {}, params = {} } = {}) {
  const response = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; } };
  await handler({ headers: {}, session: { user }, body, query, params }, response);
  return response;
}
const sra = { employeeId: '02000001', role: 'SRA_ADMIN' };
const manager = { employeeId: '03000001', role: 'FARM_MANAGER' };

test('OTP verification survives independent service instances and consumes once across concurrent requests', async () => {
  const db = memoryFirestore();
  const first = createOtpService(db), second = createOtpService(db);
  const challenge = await first.issueOtp('first-login', '04000001', '09171234567');
  const results = await Promise.all([first.verifyAndConsumeOtp('first-login', '04000001', '09171234567', challenge.code), second.verifyAndConsumeOtp('first-login', '04000001', '09171234567', challenge.code)]);
  assert.equal(results.filter(result => result.success).length, 1);
  assert.equal(JSON.stringify([...db.records.values()]).includes(challenge.code), false);
});

test('OTP attempt limits, resend cooldown, verified consumption, and late delivery revocation are durable', async () => {
  const db = memoryFirestore();
  const a = createOtpService(db), b = createOtpService(db);
  const now = Date.now();
  const old = await a.issueOtp('registration', 'phone', '09171234567', now);
  await assert.rejects(b.issueOtp('registration', 'phone', '09171234567', now + 1), { code: 'OTP_RATE_LIMITED' });
  const next = await b.issueOtp('registration', 'phone', '09171234567', now + 60001);
  await a.discardOtp('registration', 'phone', old.challengeId);
  assert.equal((await a.verifyOtp('registration', 'phone', '09171234567', next.code, now + 60002)).success, true);
  const consumed = await Promise.all([a.consumeVerifiedOtp('registration', 'phone', '09171234567', now + 60003), b.consumeVerifiedOtp('registration', 'phone', '09171234567', now + 60003)]);
  assert.deepEqual(consumed.sort(), [false, true]);
  const locked = await a.issueOtp('registration', 'attempts', '09171234567', now);
  for (let index = 0; index < 5; index++) await b.verifyOtp('registration', 'attempts', '09171234567', '000000', now + 1);
  assert.match((await a.verifyOtp('registration', 'attempts', '09171234567', locked.code, now + 2)).error, /too many/i);
  const expired = await a.issueOtp('registration', 'expiry', '09171234567', now);
  assert.match((await b.verifyOtp('registration', 'expiry', '09171234567', expired.code, now + OTP_TTL_MS)).error, /expired/);
  await assert.rejects(createOtpService(null).issueOtp('registration', 'none', '09171234567'), { code: 'OTP_STORAGE_UNAVAILABLE' });
});

function forgedReport() {
  const row = { id: 'AUD-FORGED-2026-09-V1', blockFarmId: 'BF-FAKE', periodKey: '2026-09', reportVersion: 1,
    compiledByUserId: '03009999', compiledAt: '2026-09-30T00:00:00.000Z',
    operationSnapshots: [{ operationLogId: 'LOG-FAKE', fieldId: 'FLD-FAKE', totalCost: 123 }],
    fieldSnapshots: [{ fieldId: 'FLD-FAKE', memberId: '04009999', areaHa: 1, operationLogIds: ['LOG-FAKE'] }],
    sourceLogIds: ['LOG-FAKE'], operationCount: 1, fieldCount: 1, memberCount: 1, hectaresAudited: 1, totalCost: 123 };
  row.integrityHash = createAuditHash(row.id, row.blockFarmId, row.periodKey, row.operationSnapshots);
  return row;
}

test('a recomputed legacy QR hash cannot create or verify a missing authoritative report', async () => {
  const db = memoryFirestore();
  const body = { payload: { type: 'HUGPONG_AUDIT_TRANSFER', schemaVersion: 2, report: forgedReport() } };
  for (const endpoint of ['/qr/verify', '/qr/import']) {
    const response = await invoke(loadHandler('auditReports', db, 'post', endpoint), sra, { body });
    assert.equal(response.statusCode, 404);
  }
  assert.equal(db.records.size, 0);
});

test('legacy transfers resolve stored report data rather than trusting modified embedded fields', async () => {
  const stored = { ...forgedReport(), status: 'COMPILED' };
  const db = memoryFirestore({ [`audit_reports/${stored.id}`]: stored });
  const supplied = structuredClone(stored); supplied.compiledByUserId = '03008888'; supplied.fieldSnapshots[0].memberId = '04008888';
  const response = await invoke(loadHandler('auditReports', db, 'post', '/qr/import'), sra, { body: { payload: { type: 'HUGPONG_AUDIT_TRANSFER', schemaVersion: 2, report: supplied } } });
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.data.report.compiledByUserId, stored.compiledByUserId);
  assert.equal(response.body.data.report.fieldSnapshots[0].memberId, '04009999');
});

test('lost-response field retries create one field/cycle and reject key reuse with changed input', async () => {
  const db = memoryFirestore({ 'block_farms/BF-TEST': { managerUserId: manager.employeeId, status: 'ACTIVE', declaredAreaHa: 1 } });
  const handler = loadHandler('fields', db, 'post');
  const body = { blockFarmId: 'BF-TEST', areaHa: 1, _mutation: { mutationId: 'MUT-RETRY-FIELD', idempotencyKey: 'MUT-RETRY-FIELD', entityKey: 'fields/new' } };
  const [first, second] = await Promise.all([invoke(handler, manager, { body }), invoke(handler, manager, { body })]);
  assert.deepEqual([first.statusCode, second.statusCode].sort(), [200, 201]);
  assert.equal(first.body.data.field.id, second.body.data.field.id);
  for (const name of ['fields', 'crop_cycles', 'audit_logs', 'mutation_receipts']) assert.equal([...db.records.keys()].filter(key => key.startsWith(name+'/')).length, 1);
  const conflict = await invoke(handler, manager, { body: { ...body, areaHa: 0.5 } });
  assert.equal(conflict.statusCode, 409);
  assert.equal((await invoke(handler, manager, { body: { blockFarmId: 'BF-TEST', areaHa: 0.5 } })).statusCode, 400);
});

test('expired and unrelated recovery requests cannot hide a manager review, and all pages are reachable', async () => {
  const seed = { 'block_farms/BF-MINE': { managerUserId: manager.employeeId } };
  for (let index = 0; index < 120; index++) seed[`password_recovery_reviews/EXPIRED-${index}`] = { status: 'PENDING', role: 'MEMBER_FARMER', expiresAtMs: Date.now() - 1000, blockFarmId: 'BF-MINE' };
  for (let index = 0; index < 120; index++) seed[`password_recovery_reviews/OTHER-${index}`] = { status: 'PENDING', role: 'MEMBER_FARMER', expiresAtMs: Date.now() + 900000, blockFarmId: 'BF-OTHER' };
  for (let index = 0; index < 55; index++) seed[`password_recovery_reviews/MINE-${index.toString().padStart(3, '0')}`] = { status: 'PENDING', role: 'MEMBER_FARMER', userId: `0400${index}`, expiresAtMs: Date.now() + 900000, blockFarmId: 'BF-MINE' };
  const handler = loadHandler('recoveryReviews', memoryFirestore(seed));
  const first = await invoke(handler, manager);
  assert.equal(first.body.count, 50); assert.equal(first.body.hasMore, true);
  const second = await invoke(handler, manager, { query: { cursor: first.body.nextCursor } });
  assert.equal(second.body.count, 5); assert.equal(second.body.hasMore, false);
  assert.equal(new Set([...first.body.data, ...second.body.data].map(row => row.id)).size, 55);
});

test('mobile edits queued during an in-flight sync inherit acknowledged versions and then drain', async () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../../mobile/src/services/syncEngine.js'), 'utf8').replace(/^import[\s\S]*?;\r?$/gm, '').replace(/\bexport /g, '');
  const store = new Map(); let sequence = 0;
  const context = { console: { info() {}, warn() {} }, require: () => require('../../mobile/src/services/mutationOutboxCore'), STORAGE_KEYS: {},
    getItem: async (key, fallback) => store.get(key) || fallback, saveItem: async (key, value) => { store.set(key, value); return true; },
    localOutboxStorageKey: id => 'outbox-'+id, createClientRecordId: () => 'AUDIT-'+(++sequence), setTimeout, clearTimeout, Date, Map, Set, Uint32Array };
  vm.createContext(context); vm.runInContext(source, context);
  await context.initSyncEngine('04000001');
  await context.enqueueOutboxItem('field_upsert', { id: 'FLD-1', areaHa: 1 });
  await context.processOutbox(async () => {
    await context.enqueueOutboxItem('field_upsert', { id: 'FLD-1', areaHa: 2 });
    return { success: true, data: { updatedAt: 'server-v2' } };
  });
  const retained = context.getOutboxQueue();
  assert.equal(retained.length, 1); assert.equal(retained[0].baseVersion, 'server-v2'); assert.equal(retained[0].dependsOnMutationId, null);
  await context.processOutbox(async () => ({ success: true, data: { updatedAt: 'server-v3' } }));
  assert.equal(context.getOutboxQueue().length, 0);
  assert.throws(() => context.generateLogId(), /Field identity/); assert.throws(() => context.generateDraftId(), /Field identity/);
});

test('mobile release validation rejects local/HTTP origins and accepts the configured beta origin', () => {
  const firebase = Object.fromEntries(['API_KEY', 'AUTH_DOMAIN', 'PROJECT_ID', 'STORAGE_BUCKET', 'MESSAGING_SENDER_ID', 'APP_ID'].map(key => [`EXPO_PUBLIC_FIREBASE_${key}`, 'test-value']));
  for (const origin of ['', 'http://public.com', 'https://localhost', 'https://192.168.1.2', 'https://user:pass@public.com', 'https://public.com/api']) assert.throws(() => assertReleaseEnvironment({ ...firebase, EXPO_PUBLIC_API_BASE_URL: origin }));
  assert.equal(assertReleaseEnvironment({ ...firebase, EXPO_PUBLIC_API_BASE_URL: 'https://hugpong-beta.onrender.com' }), 'https://hugpong-beta.onrender.com');
});

test('mobile enrollment retries share one durable key across concurrent calls and a service restart', async () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../../mobile/src/services/enrollmentIntentService.js'), 'utf8').replace(/^import[^\n]+\r?\n/gm, '').replace(/\bexport /g, '');
  const saved = new Map(); let generated = 0;
  const load = () => {
    const context = { Map, Promise, encodeURIComponent, getItem: async key => saved.get(key),
      saveItem: async (key, value) => { saved.set(key, structuredClone(value)); return true; }, removeItem: async key => saved.delete(key), createClientRecordId: () => `MUT-TEST-${++generated}` };
    vm.createContext(context); vm.runInContext(source, context); return context;
  };
  const first = load();
  const payload = { blockFarmId: 'BF-1', areaHa: 1 };
  const intents = await Promise.all([first.fieldEnrollmentIntent('03000001', payload), first.fieldEnrollmentIntent('03000001', payload)]);
  assert.equal(generated, 1); assert.equal(intents[0].mutation.idempotencyKey, intents[1].mutation.idempotencyKey);
  const restarted = await load().fieldEnrollmentIntent('03000001', payload);
  assert.equal(restarted.mutation.idempotencyKey, intents[0].mutation.idempotencyKey);
  const otherUser = await load().fieldEnrollmentIntent('03000002', payload);
  assert.notEqual(otherUser.mutation.idempotencyKey, restarted.mutation.idempotencyKey);
});

test('web enrollment retries preserve their key across reloads without storing the field payload', async () => {
  const { webcrypto } = require('node:crypto');
  const saved = new Map(); let generated = 0;
  const source = fs.readFileSync(path.resolve(__dirname, '../../web/react-app/src/services/enrollmentIntentService.js'), 'utf8').replace(/^import[^\n]+\r?\n/gm, '').replace(/\bexport /g, '');
  const load = () => {
    const context = { crypto: webcrypto, TextEncoder, Uint8Array, localStorage: { getItem: key => saved.get(key), setItem: (key, value) => saved.set(key, value) }, createMutationContext: () => ({ mutationId: `MUT-WEB-${++generated}`, idempotencyKey: `MUT-WEB-${generated}`, entityKey: 'fields' }) };
    vm.createContext(context); vm.runInContext(source, context); return context;
  };
  const payload = { blockFarmId: 'BF-1', memberUserId: '04000001', areaHa: 1 };
  const first = await load().fieldEnrollmentIntent('03000001', payload);
  const retry = await load().fieldEnrollmentIntent('03000001', payload);
  assert.equal(first.mutation.idempotencyKey, retry.mutation.idempotencyKey);
  assert.equal(generated, 1);
  assert.equal(JSON.stringify([...saved.values()]).includes('04000001'), false);
});
