'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { memoryFirestore } = require('./helpers/memoryFirestore');
const { COLLECTIONS, ROLES } = require('../schema/firestoreSchema');
const { queueAuditEvent } = require('../services/auditWriter');
const { publishSraPrice } = require('../services/priceService');
const { decoratePriceHistory, buildPriceAnalytics } = require('../services/priceAnalyticsService');
const { registerPushDevice, unregisterPushDevice, dispatchNotification, notificationInbox,
  canReceiveNotification, startNotificationDelivery, RETENTION_MS } = require('../services/systemNotificationService');
const { sendExpoPushNotification, checkExpoPushReceipt } = require('../services/mobilePushService');
const now = () => Date.now();
const actor = (id, role = ROLES.MEMBER_FARMER) => ({ employeeId: id, role, status: 'ACTIVE', authVersion: 1 });

async function event(database, eventType = 'SRA_PRICE_PUBLISHED', entityId = 'PRICE-NEW', createdAt = new Date().toISOString()) {
  await database.runTransaction(async tx => queueAuditEvent(tx, database, {
    id: `EVT-${entityId}`, eventType, entityType: 'TEST', entityId, actorUserId: 'ADMIN-1', createdAt
  }));
  return [...database.records].find(([key, value]) => key.startsWith(`${COLLECTIONS.NOTIFICATION_EVENTS}/`) && value.entityId === entityId)?.[1];
}

async function device(database, userId, token = 'ExpoPushToken[system-test-token]') {
  database.records.set(`users/${userId}`, actor(userId));
  await registerPushDevice(database, actor(userId), { token, clientInstanceId: `device-${userId}` });
}

test('price publication, audit and durable notification intent are atomic and replay-safe', async () => {
  const database = memoryFirestore();
  const input = { id: 'PRICE-NEW', effectiveDate: '2026-11-13', weekLabel: 'Week 2, November 2026',
    sugarPricePerLkg: 2500, molassesPricePerMetricTon: 9000, circularNumber: 'TEST-ONLY', source: 'Test-only fixture' };
  const context = { publishedByUserId: '02000001' };
  await publishSraPrice(database, input, context);
  await publishSraPrice(database, input, context);
  assert.equal([...database.records.keys()].filter(key => key.startsWith('sra_prices/')).length, 1);
  assert.equal([...database.records.keys()].filter(key => key.startsWith('audit_logs/')).length, 1);
  assert.equal([...database.records.keys()].filter(key => key.startsWith('notification_events/')).length, 1);
  assert.equal(database.records.get('notification_events/notif-price-PRICE-NEW').dispatchState, 'PENDING');
  await assert.rejects(publishSraPrice(database, { ...input, sugarPricePerLkg: 2600 }, context), /already belongs/);
  assert.equal(database.records.size, 3, 'conflicted publication cannot produce a phantom notification');
});

test('phone review requests and decisions create durable events while unrelated audits do not', async () => {
  const database = memoryFirestore();
  const request = await event(database, 'USER_PHONE_VERIFICATION_REVIEW_REQUESTED', 'MEMBER-1');
  assert.equal(request.type, 'verification-request');
  const decision = await event(database, 'USER_PHONE_VERIFIED_BY_AUTHORITY', 'MEMBER-2');
  assert.equal(decision.type, 'verification-result');
  assert.equal(await event(database, 'USER_PASSWORD_CHANGED', 'MEMBER-3'), undefined);
});

test('review notifications reuse the authoritative role and farm scope, and decisions belong only to the applicant', async () => {
  const database = memoryFirestore({
    'users/MEMBER-1': { role: ROLES.MEMBER_FARMER, status: 'ACTIVE', requestedBlockFarmId: 'FARM-1' },
    'block_farms/FARM-1': { managerUserId: 'MANAGER-1', status: 'ACTIVE' }
  });
  const request = await event(database, 'USER_PHONE_VERIFICATION_REVIEW_REQUESTED', 'MEMBER-1');
  assert.equal(await canReceiveNotification(database, request, actor('MANAGER-1', ROLES.FARM_MANAGER)), true);
  assert.equal(await canReceiveNotification(database, request, actor('OTHER-MANAGER', ROLES.FARM_MANAGER)), false);
  assert.equal(await canReceiveNotification(database, request, actor('SRA-1', ROLES.SRA_ADMIN)), true);
  assert.equal(await canReceiveNotification(database, request, actor('SUPER-1', ROLES.SUPER_ADMIN)), true);
  assert.equal(await canReceiveNotification(database, request, actor('MEMBER-1')), false);
  const decision = await event(database, 'USER_PHONE_VERIFIED_BY_AUTHORITY', 'MEMBER-2');
  assert.equal(await canReceiveNotification(database, decision, actor('MEMBER-2')), true);
  assert.equal(await canReceiveNotification(database, decision, actor('MEMBER-OTHER')), false);
  database.records.get('users/MEMBER-1').phoneVerifiedAt = new Date().toISOString();
  assert.equal(await canReceiveNotification(database, request, actor('SRA-1', ROLES.SRA_ADMIN)), false, 'completed requests no longer alert reviewers');
});

test('a phone token has one account owner; logout unregisters only the current installation', async () => {
  const database = memoryFirestore();
  await device(database, 'MEMBER-1');
  await registerPushDevice(database, actor('MEMBER-2'), { token: 'ExpoPushToken[system-test-token]', clientInstanceId: 'device-MEMBER-2' });
  const devices = [...database.records].filter(([key]) => key.startsWith('mobile_push_devices/'));
  assert.equal(devices.length, 1);
  assert.equal(devices[0][1].userId, 'MEMBER-2');
  await unregisterPushDevice(database, actor('MEMBER-1'), 'device-MEMBER-2');
  assert.equal(devices[0][1].enabled, true);
  await unregisterPushDevice(database, actor('MEMBER-2'), 'device-MEMBER-2');
  assert.equal([...database.records.values()].find(value => value.token)?.enabled, false);
});

test('concurrent API instances lease a durable event once and persist provider tickets', async () => {
  const database = memoryFirestore();
  await device(database, 'MEMBER-1');
  const notification = await event(database);
  const sent = [];
  const send = async (token, payload) => { sent.push({ token, payload }); return { success: true, ticketId: 'TEST-TICKET' }; };
  await Promise.all([dispatchNotification(database, notification.id, { send }), dispatchNotification(database, notification.id, { send })]);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].payload.channelId, 'system-updates');
  assert.ok(sent[0].payload.ttl > 86400, 'offline phones use provider store-and-forward, not TTL zero');
  assert.equal(sent[0].payload.data.recipientUserId, 'MEMBER-1');
  assert.equal(database.records.get(`notification_events/${notification.id}`).dispatchState, 'PENDING', 'provider receipt confirmation is still outstanding');
  assert.equal([...database.records.values()].find(value => value.ticketId)?.ticketId, 'TEST-TICKET');
  await dispatchNotification(database, notification.id, { send });
  assert.equal(sent.length, 1);
});

test('failed deliveries survive restart and retry without resending successful device tickets', async () => {
  const database = memoryFirestore();
  await device(database, 'MEMBER-1', 'ExpoPushToken[token-one]');
  await device(database, 'MEMBER-2', 'ExpoPushToken[token-two]');
  const notification = await event(database);
  const sent = [];
  await dispatchNotification(database, notification.id, { send: async token => {
    sent.push(token);
    return token.includes('one') ? { success: true, ticketId: 'ONE' } : { success: false, code: 'PUSH_PROVIDER_UNAVAILABLE' };
  } });
  assert.equal(database.records.get(`notification_events/${notification.id}`).dispatchState, 'PENDING');
  await dispatchNotification(database, notification.id, { now: now() + 600000, send: async token => {
    sent.push(token); return { success: true, ticketId: 'RETRY' };
  } });
  assert.equal(sent.filter(token => token.includes('one')).length, 1);
  assert.equal(sent.filter(token => token.includes('two')).length, 2);
});

test('revoked or disabled accounts cannot receive pushes, and stale Expo tokens are disabled', async () => {
  const database = memoryFirestore();
  await device(database, 'MEMBER-1', 'ExpoPushToken[token-one]');
  await device(database, 'MEMBER-2', 'ExpoPushToken[token-two]');
  await device(database, 'MEMBER-3', 'ExpoPushToken[token-three]');
  database.records.get('users/MEMBER-1').authVersion = 2;
  database.records.get('users/MEMBER-2').status = 'DISABLED';
  const notification = await event(database);
  let sends = 0;
  await dispatchNotification(database, notification.id, { send: async () => { sends++; return { success: false, code: 'DeviceNotRegistered' }; } });
  assert.equal(sends, 1);
  assert.equal([...database.records.values()].find(value => value.userId === 'MEMBER-3' && value.token)?.enabled, false);
});

test('fanout reaches devices beyond the first page without continuous database polling', async () => {
  const database = memoryFirestore();
  for (let index = 0; index < 23; index++) await device(database, `MEM-${index}`, `ExpoPushToken[token-${index}]`);
  const notification = await event(database);
  let count = 0;
  await dispatchNotification(database, notification.id, { send: async () => ({ success: true, ticketId: `T-${++count}` }) });
  assert.equal(count, 23);
});

test('offline catch-up inbox is durable, scoped, paginated and expires only operational notification copies', async () => {
  const database = memoryFirestore();
  await event(database, 'SRA_PRICE_PUBLISHED', 'OLDER', new Date(now() - RETENTION_MS - 1).toISOString());
  await event(database, 'SRA_PRICE_PUBLISHED', 'NEW-1');
  await event(database, 'SRA_PRICE_PUBLISHED', 'NEW-2');
  const first = await notificationInbox(database, actor('MEMBER-1'), { limit: 1 });
  assert.equal(first.data.length, 1);
  assert.equal(first.page.hasMore, true);
  const next = await notificationInbox(database, actor('MEMBER-1'), { cursor: first.page.nextCursor, limit: 1 });
  assert.equal(next.data.length, 1);
  assert.notEqual(first.data[0].id, next.data[0].id);
  assert.equal((await notificationInbox(database, actor('SUPER-1', ROLES.SUPER_ADMIN))).data.length, 0);
  assert.ok(database.records.has('notification_events/notif-price-OLDER'), 'this test never deletes source or operational records');
});

test('delivery listener recovers from errors and stops subscriptions/timers on shutdown', async () => {
  let attach = 0, disposed = 0, snapshot, fail;
  const query = { where() { return this; }, orderBy() { return this; }, limit() { return this; },
    onSnapshot(ok, error) { attach++; snapshot = ok; fail = error; return () => { disposed++; }; } };
  const worker = startNotificationDelivery({ collection: () => query }, { retryMs: 2, logger: { warn() {} }, dispatch: async () => {} });
  snapshot({ docs: [] });
  fail();
  await new Promise(resolve => setTimeout(resolve, 12));
  assert.equal(attach, 2);
  worker.stop();
  assert.equal(disposed, 2);
});

test('same-week republications select the latest publication and analytics contain one point per week', () => {
  const before = { id: 'BEFORE', effectiveDate: '2026-11-06', publishedAt: '2026-11-06T00:00:00Z', sugarPricePerLkg: 2000, molassesPricePerMetricTon: 8000 };
  const older = { ...before, id: 'A-OLDER', effectiveDate: '2026-11-13', publishedAt: '2026-11-13T01:00:00Z', sugarPricePerLkg: 2100 };
  const newer = { ...older, id: 'Z-NEWER', publishedAt: '2026-11-13T02:00:00Z', sugarPricePerLkg: 2200 };
  const history = decoratePriceHistory([before, older, newer]);
  assert.equal(history[0].id, newer.id);
  assert.equal(history[0].sugarPriceChange, 200);
  assert.equal(history[1].sugarPriceChange, 100);
  const analytics = buildPriceAnalytics([before, older, newer]);
  assert.equal(analytics.weekly.trendPoints.length, 2);
  assert.equal(analytics.weekly.trendPoints.at(-1).sugarPrice, 2200);
});

test('malformed Expo success responses are failures instead of silently losing delivery intent', async () => {
  const result = await sendExpoPushNotification('ExpoPushToken[token-test]', { title: 'Test' }, {
    fetchImpl: async () => ({ ok: true, json: async () => ({}) })
  });
  assert.equal(result.success, false);
});

test('real price API pages same-date revisions by publication time without missing or repeating a row', async () => {
  const database = memoryFirestore();
  for (let index = 0; index < 65; index++) database.records.set(`sra_prices/PRICE-${String(65 - index).padStart(3, '0')}`, {
    effectiveDate: '2026-11-13', publishedAt: new Date(Date.UTC(2026, 10, 13, 0, index)).toISOString(),
    publishedByUserId: '02000001', weekLabel: 'Week 2, November 2026', circularNumber: `TEST-${index}`,
    source: 'Test-only fixture', sugarPricePerLkg: 2000 + index, molassesPricePerMetricTon: 8000
  });
  const firebase = require.resolve('../firebase-admin'), route = require.resolve('../routes/prices');
  const previous = require.cache[firebase];
  require.cache[firebase] = { id: firebase, filename: firebase, loaded: true, exports: { db: database } };
  delete require.cache[route];
  const router = require('../routes/prices');
  if (previous) require.cache[firebase] = previous; else delete require.cache[firebase];
  const handler = router.stack.find(layer => layer.route?.path === '/' && layer.route.methods.get).route.stack.at(-1).handle;
  const rows = []; let cursor;
  do {
    const response = { statusCode: 200, status(value) { this.statusCode = value; return this; }, json(value) { this.body = value; return this; } };
    await handler({ query: { limit: '7', cursor } }, response);
    assert.equal(response.statusCode, 200);
    rows.push(...response.body.data);
    cursor = response.body.page.nextCursor;
  } while (cursor);
  assert.equal(rows.length, 65);
  assert.equal(new Set(rows.map(row => row.id)).size, 65);
  assert.equal(rows[0].sugarPricePerLkg, 2064);
  assert.equal(rows.at(-1).sugarPricePerLkg, 2000);
});

test('accepted tickets are checked later, and confirmed provider handoff does not resend a notification', async () => {
  const database = memoryFirestore(); await device(database, 'MEMBER-1');
  const notification = await event(database);
  let sends = 0;
  const send = async () => { sends++; return { success: true, ticketId: 'TICKET-1' }; };
  await dispatchNotification(database, notification.id, { send });
  let checks = 0;
  await dispatchNotification(database, notification.id, { now: now() + 960000, send, checkReceipt: async ticket => {
    checks++; assert.equal(ticket, 'TICKET-1'); return { success: true };
  } });
  assert.equal(sends, 1); assert.equal(checks, 1);
  assert.equal(database.records.get(`notification_events/${notification.id}`).dispatchState, 'COMPLETE');
  assert.equal([...database.records.values()].find(value => value.ticketId)?.confirmed, true);
});

test('a rejected provider receipt disables an unregistered device instead of claiming delivery', async () => {
  const database = memoryFirestore(); await device(database, 'MEMBER-1');
  const notification = await event(database);
  await dispatchNotification(database, notification.id, { send: async () => ({ success: true, ticketId: 'TICKET-1' }) });
  await dispatchNotification(database, notification.id, { now: now() + 960000,
    checkReceipt: async () => ({ success: false, code: 'DeviceNotRegistered' }) });
  const receipt = [...database.records.values()].find(value => value.ticketId);
  assert.equal(receipt.accepted, false); assert.equal(receipt.permanent, true);
  assert.equal([...database.records.values()].find(value => value.token)?.enabled, false);
  const pending = await checkExpoPushReceipt('TICKET', { fetchImpl: async () => ({ ok: true, json: async () => ({ data: {} }) }) });
  assert.equal(pending.pending, true, 'missing receipts are not successful deliveries');
});
