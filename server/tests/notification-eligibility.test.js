'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { memoryFirestore } = require('./helpers/memoryFirestore');
const { queueAuditEvent } = require('../services/auditWriter');
const { notificationInbox, ensureNotificationStart, registerPushDevice, dispatchNotification } = require('../services/systemNotificationService');
const { openNotificationSubscription, closeNotificationSubscription, subscriptionRef } = require('../services/notificationSubscriptions');

const HOUR = 3600000;
function fixture() {
  const now = Date.now();
  const user = { employeeId: '04000077', role: 'MEMBER_FARMER', status: 'ACTIVE', authVersion: 1,
    createdAt: new Date(now - 6 * HOUR).toISOString() };
  const database = memoryFirestore({ 'users/04000077': user });
  const event = async (id, timestamp) => database.runTransaction(async transaction => queueAuditEvent(transaction, database, {
    id: `AUDIT-${id}`, eventType: 'SRA_PRICE_PUBLISHED', entityId: id,
    actorUserId: '02000001', entityType: 'SRA_PRICE',
    createdAt: new Date(timestamp).toISOString()
  }));
  return { database, user, now, event };
}

test('notification eligibility excludes pre-account, pre-login and logged-out events while retaining signed-in history', async () => {
  const { database, user, now, event } = fixture();
  user.notificationStartedAt = await ensureNotificationStart(database, user.employeeId, new Date(now - 4 * HOUR).toISOString());
  await openNotificationSubscription(database, user, 'DEVICE', { freshLogin: true, now: now - 4 * HOUR });
  await event('BEFORE-ACCOUNT', now - 7 * HOUR);
  await event('BEFORE-LOGIN', now - 5 * HOUR);
  await event('WHILE-SIGNED-IN', now - 3 * HOUR);
  await closeNotificationSubscription(database, user, 'DEVICE', now - 2 * HOUR);
  await event('WHILE-SIGNED-OUT', now - 1.5 * HOUR);
  await openNotificationSubscription(database, user, 'DEVICE', { freshLogin: true, now: now - HOUR });
  await event('AFTER-RETURN', now - 0.5 * HOUR);
  const inbox = await notificationInbox(database, user, { now });
  assert.deepEqual(inbox.data.map(event => event.id), ['notif-price-AFTER-RETURN', 'notif-price-WHILE-SIGNED-IN']);
});

test('first-login baseline is persisted once and existing accounts cannot inherit historical broadcasts', async () => {
  const { database, user, now, event } = fixture();
  await event('OLD-BROADCAST', now - HOUR);
  const start = await ensureNotificationStart(database, user.employeeId, new Date(now).toISOString());
  assert.equal(await ensureNotificationStart(database, user.employeeId, new Date(now + HOUR).toISOString()), start);
  assert.equal(database.records.get('users/04000077').notificationStartedAt, start);
  await openNotificationSubscription(database, user, 'DEVICE', { freshLogin: true, now });
  const inbox = await notificationInbox(database, { ...user, notificationStartedAt: start }, { now });
  assert.equal(inbox.data.length, 0);
  await assert.rejects(ensureNotificationStart(database, 'MISSING'), /active account/);
});

test('a reconnect preserves the signed-in interval and cannot reopen an explicitly logged-out subscription', async () => {
  const { database, user, now } = fixture();
  await openNotificationSubscription(database, user, 'DEVICE', { freshLogin: true, now: now - 2 * HOUR });
  await openNotificationSubscription(database, user, 'DEVICE', { now: now - HOUR });
  const ref = subscriptionRef(database, user, 'DEVICE');
  assert.equal((await ref.get()).data().activeFrom, now - 2 * HOUR);
  await closeNotificationSubscription(database, user, 'DEVICE', now);
  assert.equal(await openNotificationSubscription(database, user, 'DEVICE', { now: now + HOUR }), false);
  assert.equal((await ref.get()).data().activeFrom, null);
});

test('logout prevents push delivery and late device registration even when the token binding is still enabled', async () => {
  const { database, user, now, event } = fixture();
  user.notificationStartedAt = await ensureNotificationStart(database, user.employeeId, new Date(now - HOUR).toISOString());
  await openNotificationSubscription(database, user, 'DEVICE', { freshLogin: true, now: now - HOUR });
  await registerPushDevice(database, user, { clientInstanceId: 'DEVICE', token: 'ExpoPushToken[test-notification-device]' });
  await closeNotificationSubscription(database, user, 'DEVICE');
  await event('AFTER-LOGOUT', Date.now());
  let sends = 0;
  await dispatchNotification(database, 'notif-price-AFTER-LOGOUT', { send: async () => { sends++; return { success: true }; } });
  assert.equal(sends, 0);
  await assert.rejects(registerPushDevice(database, user, { clientInstanceId: 'DEVICE', token: 'ExpoPushToken[test-notification-device]' }), /Sign in again/);
});

test('Mobile Home never synthesizes a new price alert from history or exposes another same-name account draft', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../../mobile/src/screens/HomeScreen.js'), 'utf8');
  const begin = source.indexOf('const generateDynamicNotifications =');
  const end = source.indexOf('export default function HomeScreen', begin);
  const dependencies = {
    getSortedPrices: () => [{ id: 'HISTORICAL-PRICE', effectiveDate: '2025-01-01' }],
    operationLogs: [], draftLogs: [], blockFarms: [], fields: [],
    getSystemNotifications: () => [], getPendingSyncCount: () => 0,
    getOutboxQueue: () => [], getOperationCapabilities: () => ({ canPlan: false }),
    collectPlannerEntries: () => [], getPlannerReminderGroups: () => ({ overdue: [], today: [], tomorrow: [] }),
    notificationEventId: name => name, sortNewestFirst: rows => rows,
    priceText: () => 'cached price'
  };
  const generate = new Function(...Object.keys(dependencies), source.slice(begin, end) + '; return generateDynamicNotifications;')(...Object.values(dependencies));
  assert.deepEqual(generate({ employeeId: 'NEW', role: 'Farm Member' }, [], []), []);
  assert.deepEqual(generate({ employeeId: 'MANAGER', name: 'Same Name', role: 'Farm Manager' }, [
    { id: 'OTHER-ACCOUNT-DRAFT', createdByUserId: 'OTHER', authorName: 'Same Name', fieldId: 'OTHER-FIELD' }
  ], []), []);
  assert.deepEqual(generate({}, [], []), []);
});

test('a delayed logout or device registration from an earlier login cannot disable the newer login', async () => {
  const { database, user, now } = fixture();
  const first = await openNotificationSubscription(database, user, 'DEVICE', { freshLogin: true, now: now - 2 * HOUR });
  const oldSession = { ...user, notificationSessionKey: first.sessionKey };
  const second = await openNotificationSubscription(database, user, 'DEVICE', { freshLogin: true, now: now - HOUR });
  assert.notEqual(first.sessionKey, second.sessionKey);
  assert.equal(await closeNotificationSubscription(database, oldSession, 'DEVICE', now), false);
  assert.equal((await subscriptionRef(database, user, 'DEVICE').get()).data().activeFrom, now - HOUR);
  await assert.rejects(registerPushDevice(database, oldSession, { clientInstanceId: 'DEVICE', token: 'ExpoPushToken[old-session-device]' }), /Sign in again/);
});
