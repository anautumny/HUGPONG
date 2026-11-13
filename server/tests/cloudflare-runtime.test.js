'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { memoryFirestore } = require('./helpers/memoryFirestore');
const { createChangeFeed } = require('../services/changeFeed');
const { createDurableRuntimeTasks } = require('../services/durableRuntimeTasks');
const { dispatchNotification, registerPushDevice } = require('../services/systemNotificationService');
const { COLLECTIONS, ROLES } = require('../schema/firestoreSchema');

test('response-independent work retains its own request lifetime without leaking between concurrent requests', async () => {
  const { runWithBackgroundTasks, trackBackgroundTask } = require('../services/backgroundTasks');
  const first = [], second = [];
  await Promise.all([
    runWithBackgroundTasks(promise => first.push(promise), async () => { await Promise.resolve(); trackBackgroundTask(Promise.resolve('first')); }),
    runWithBackgroundTasks(promise => second.push(promise), async () => { await Promise.resolve(); trackBackgroundTask(Promise.resolve('second')); })
  ]);
  assert.deepEqual(await Promise.all(first), ['first']);
  assert.deepEqual(await Promise.all(second), ['second']);
  trackBackgroundTask(Promise.resolve('standalone Node'));
  assert.equal(first.length, 1); assert.equal(second.length, 1);
});

test('Worker routing preserves API boundaries, legacy redirects and trusted proxy metadata', async () => {
  const { isGatewayPath, trustedProxyRequest } = await import('../../cloudflare/src/routing.mjs');
  for (const path of ['/api', '/api/prices', '/auth/login', '/health/ready', '/downloads/android/1.0.8',
    '/roles/farm-manager/dashboard.html', '/privacy-policy.html']) assert.equal(isGatewayPath(path), true, path);
  for (const path of ['/', '/dashboard', '/apiary', '/assets/app.js', '/index.html']) assert.equal(isGatewayPath(path), false, path);
  const input = new Request('https://hugpong.org/api/prices', { headers: {
    'x-forwarded-for': 'spoofed', 'x-forwarded-host': 'spoofed', 'x-forwarded-proto': 'http',
    forwarded: 'spoofed', 'cf-connecting-ip': '192.0.2.4', authorization: 'Bearer test-only', cookie: 'hugpong.sid=test-only'
  } });
  const trusted = trustedProxyRequest(input);
  assert.equal(trusted.headers.get('x-forwarded-for'), '192.0.2.4');
  assert.equal(trusted.headers.get('x-forwarded-host'), 'hugpong.org');
  assert.equal(trusted.headers.get('x-forwarded-proto'), 'https');
  assert.equal(trusted.headers.has('forwarded'), false);
  assert.equal(trusted.headers.get('authorization'), 'Bearer test-only');
  assert.equal(trusted.headers.get('cookie'), 'hugpong.sid=test-only');
});

test('preflight mode rejects all submissions before routing and active mode preserves the existing API', async () => {
  const { preflightRejection } = await import('../../cloudflare/src/routing.mjs');
  for (const method of ['POST', 'PATCH', 'PUT', 'DELETE']) {
    const request = new Request('https://hugpong.org/api/prices', { method });
    const response = preflightRejection(request, 'preflight');
    assert.equal(response.status, 503);
    assert.equal((await response.json()).code, 'GATEWAY_PREFLIGHT');
    assert.equal(preflightRejection(request, 'active'), null);
  }
  for (const method of ['GET', 'HEAD', 'OPTIONS']) assert.equal(preflightRejection(new Request('https://hugpong.org/health/live', { method }), 'preflight'), null);
  for (const path of ['/health', '/health/ready']) {
    const response = preflightRejection(new Request(`https://hugpong.org${path}`), 'preflight');
    assert.equal(response.status, 503);
    assert.equal((await response.json()).status, 'preflight');
  }
  assert.throws(() => preflightRejection(new Request('https://hugpong.org/'), undefined), /GATEWAY_MODE/);
});

test('single-authority commits fan out after persistence without starting a gRPC listener', async t => {
  const database = memoryFirestore();
  const invalidations = [];
  const feed = createChangeFeed({ database, singleWriter: true, invalidate: resources => invalidations.push(resources) });
  t.after(() => feed.stop());
  await feed.hydrate();
  const events = [];
  const res = Object.assign(new EventEmitter(), { status() { return this; }, set() {}, flushHeaders() {},
    write(chunk) { events.push(JSON.parse(chunk.slice(6))); return true; }, end() {} });
  feed.stream({}, res);
  await feed.publish(['prices', 'notifications']);
  assert.ok(events.at(-1).resources.includes('prices'));
  assert.notEqual(events[0].revision, events.at(-1).revision);
  assert.ok(database.records.get(`${COLLECTIONS.SYSTEM_METADATA}/realtime_revisions`).revisions.prices);
  assert.ok(invalidations.some(resources => resources.includes('prices')));
  res.emit('close');
  const restored = createChangeFeed({ database, singleWriter: true });
  t.after(() => restored.stop());
  await restored.hydrate();
  const reconnect = [];
  const second = Object.assign(new EventEmitter(), { status() { return this; }, set() {}, flushHeaders() {},
    write(chunk) { reconnect.push(JSON.parse(chunk.slice(6))); return true; }, end() {} });
  restored.stream({}, second);
  assert.equal(reconnect[0].reset, true);
  assert.equal(reconnect[0].revision, events.at(-1).revision);
  second.emit('close');
});

test('bounded notification pages resume after restart and retain receipt state across the entire fanout', async () => {
  const database = memoryFirestore();
  for (let index = 0; index < 3; index++) {
    const user = { employeeId: `MEM-${index}`, role: ROLES.MEMBER_FARMER, status: 'ACTIVE', authVersion: 1 };
    database.records.set(`users/${user.employeeId}`, user);
    await registerPushDevice(database, user, { token: `ExpoPushToken[test-${index}]`, clientInstanceId: `install-${index}` });
  }
  const id = 'test-notification';
  const ref = `${COLLECTIONS.NOTIFICATION_EVENTS}/${id}`;
  const now = Date.now();
  database.records.set(ref, { type: 'price', dispatchState: 'PENDING', nextAttemptAtMs: now,
    expiresAtMs: now + 86400000, createdAt: new Date(now).toISOString(), attempts: 0 });
  const sent = [];
  const options = { pageSize: 1, maxPages: 1, now: now + 100000,
    send: async token => { sent.push(token); return { success: true, ticketId: `ticket-${token}` }; } };
  for (let index = 0; index < 4; index++) {
    await dispatchNotification(database, id, options);
    assert.equal(sent.length, Math.min(index + 1, 3));
    if (index < 3) assert.ok(database.records.get(ref).deliveryCursor);
  }
  assert.equal(database.records.get(ref).deliveryCursor, null);
  assert.equal(database.records.get(ref).dispatchState, 'PENDING', 'all accepted tickets still require receipts');
  let checked = 0;
  for (let index = 0; index < 4; index++) await dispatchNotification(database, id, {
    ...options, now: now + 1000000, checkReceipt: async () => { checked++; return { success: true }; }
  });
  assert.equal(checked, 3);
  assert.equal(sent.length, 3, 'receipt recovery cannot resend accepted tickets');
  assert.equal(database.records.get(ref).dispatchState, 'COMPLETE');
});

function alarmStorage() {
  const values = new Map();
  return { alarm: null, values, async get(key) { return values.get(key); }, async put(key, value) { values.set(key, value); },
    async getAlarm() { return this.alarm; }, async setAlarm(value) { this.alarm = value; } };
}

test('durable alarms recover pending events and honor retry deadlines without an idle synchronization poll', async () => {
  const database = memoryFirestore();
  const storage = alarmStorage();
  let clock = 100000, sent = 0;
  const tasks = createDurableRuntimeTasks(database, storage, { now: () => clock, dispatch: async (_db, id, options) => {
    assert.equal(options.pageSize, 1); assert.equal(options.maxPages, 1); sent++;
    database.records.get(`${COLLECTIONS.NOTIFICATION_EVENTS}/${id}`).nextAttemptAtMs = clock + 900000;
  } });
  await tasks.initialize();
  assert.equal(storage.alarm, clock + 1000);
  database.records.set(`${COLLECTIONS.NOTIFICATION_EVENTS}/intent`, { dispatchState: 'PENDING', nextAttemptAtMs: clock });
  await tasks.drain();
  assert.equal(sent, 1);
  assert.equal(storage.alarm, clock + 900000);
  clock += 5000;
  await tasks.drain();
  assert.equal(sent, 1);
  database.records.clear();
  await tasks.drain();
  assert.equal(storage.alarm, storage.values.get('cleanupAt'), 'empty queue sleeps until existing retention work is due');
});

test('alarm failures retain a durable retry, and concurrent wakeups do not run duplicate dispatches', async () => {
  const database = memoryFirestore({ 'notification_events/event': { dispatchState: 'PENDING', nextAttemptAtMs: 0 } });
  const storage = alarmStorage();
  let calls = 0;
  const tasks = createDurableRuntimeTasks(database, storage, { now: () => 100000, logger: { warn() {} },
    dispatch: async () => { calls++; await Promise.resolve(); throw new Error('Transport unavailable'); } });
  await tasks.initialize();
  await Promise.all([tasks.drain(), tasks.drain()]);
  assert.equal(calls, 1);
  assert.equal(storage.alarm, 130000);
  assert.ok(database.records.has('notification_events/event'));
});
