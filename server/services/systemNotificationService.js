'use strict';

const { createHash, randomUUID } = require('node:crypto');
const { COLLECTIONS, ROLES, canonicalRole } = require('../schema/firestoreSchema');
const { assertPhoneVerificationAuthority } = require('../domain/phoneVerificationPolicy');
const { normalizeExpoPushToken, sendExpoPushNotification, checkExpoPushReceipt } = require('./mobilePushService');
const { encodeCursor, decodeCursor } = require('./cursorPagination');

const RETENTION_MS = 28 * 24 * 60 * 60 * 1000;
const CHANNEL_ID = 'system-updates';
const hash = value => createHash('sha256').update(value).digest('hex');
const userIdOf = user => String(user?.employeeId || user?.userId || user?.id || '').trim();

function notificationFromAudit(event) {
  const shared = { sourceEventId: event.id, entityId: event.entityId, createdAt: event.createdAt };
  if (event.eventType === 'SRA_PRICE_PUBLISHED') return {
    ...shared, id: `notif-price-${event.entityId}`, type: 'price', title: 'SRA price updated',
    body: 'An official SRA price reference has been published. Open HUGPONG to view the latest prices.', resources: ['prices']
  };
  if (event.eventType === 'USER_PHONE_VERIFICATION_REVIEW_REQUESTED') return {
    ...shared, id: `notif-${event.id}`, type: 'verification-request', title: 'Phone verification requested',
    body: 'An account is waiting for authorized phone verification. Open HUGPONG to review requests.', resources: ['users']
  };
  if (event.eventType === 'USER_PHONE_VERIFIED_BY_AUTHORITY') return {
    ...shared, id: `notif-${event.id}`, type: 'verification-result', title: 'Phone verification completed',
    body: 'Your phone verification has been completed. Open HUGPONG to continue account setup.', resources: ['session', 'users']
  };
  return null;
}

// The domain mutation, audit and notification intent commit atomically.
function queueSystemNotification(writer, database, audit) {
  const event = notificationFromAudit(audit);
  if (!event) return;
  const createdAtMs = Date.parse(event.createdAt);
  writer.create(database.collection(COLLECTIONS.NOTIFICATION_EVENTS).doc(event.id), {
    ...event, dispatchState: 'PENDING', nextAttemptAtMs: Date.now(), attempts: 0,
    expiresAtMs: createdAtMs + RETENTION_MS, deleteAfter: new Date(createdAtMs + RETENTION_MS)
  });
}

async function canReceiveNotification(database, event, actor) {
  const userId = userIdOf(actor);
  const role = canonicalRole(actor?.role || actor?.canonicalRole);
  if (!userId || actor?.status !== 'ACTIVE') return false;
  if (event.type === 'price') return [ROLES.MEMBER_FARMER, ROLES.FARM_MANAGER, ROLES.SRA_ADMIN].includes(role);
  if (event.type === 'verification-result') return userId === event.entityId;
  if (event.type !== 'verification-request') return false;
  if (![ROLES.FARM_MANAGER, ROLES.SRA_ADMIN, ROLES.SUPER_ADMIN].includes(role)) return false;
  const target = await database.collection(COLLECTIONS.USERS).doc(event.entityId).get();
  if (!target.exists || target.data().phoneVerifiedAt || !['ACTIVE', 'PENDING'].includes(target.data().status)) return false;
  const data = target.data();
  try {
    await assertPhoneVerificationAuthority(database, { actorId: userId, actorRole: role, targetUserId: target.id,
      targetRole: data.role, requestedBlockFarmId: data.requestedBlockFarmId, affiliatedBlockFarmId: data.affiliatedBlockFarmId });
    return true;
  } catch (error) {
    if (error.status === 403) return false;
    throw error;
  }
}

async function registerPushDevice(database, user, { token, clientInstanceId }) {
  const normalized = normalizeExpoPushToken(token);
  const userId = userIdOf(user);
  if (!normalized || !userId || !/^[A-Za-z0-9._:-]{1,160}$/.test(String(clientInstanceId || ''))) {
    throw Object.assign(new Error('A valid notification token and installation ID are required.'), { status: 400 });
  }
  const id = hash(normalized);
  const ref = database.collection(COLLECTIONS.MOBILE_PUSH_DEVICES).doc(id);
  await ref.set({ userId, token: normalized, clientInstanceId, enabled: true,
    authVersion: Number(user.authVersion || 1), updatedAt: new Date().toISOString() });
  return { registered: true };
}

async function unregisterPushDevice(database, user, clientInstanceId) {
  const matches = await database.collection(COLLECTIONS.MOBILE_PUSH_DEVICES).where('userId', '==', userIdOf(user)).get();
  for (const doc of matches.docs) {
    if (doc.data().clientInstanceId === clientInstanceId) await doc.ref.set({ enabled: false }, { merge: true });
  }
}

function publicNotification(event) {
  return { id: event.id, type: event.type, title: event.title, body: event.body, createdAt: event.createdAt,
    resources: event.resources, entityId: event.type === 'price' ? event.entityId : undefined };
}

async function notificationInbox(database, actor, { cursor, limit = 50, now = Date.now() } = {}) {
  let query = database.collection(COLLECTIONS.NOTIFICATION_EVENTS)
    .where('createdAt', '>=', new Date(now - RETENTION_MS).toISOString()).orderBy('createdAt', 'desc').orderBy('__name__', 'desc');
  const after = decodeCursor(cursor);
  if (after) query = query.startAfter(after.value, after.id);
  // Bounded scan and an explicit continuation, including pages with no authorized rows.
  const snapshot = await query.limit(limit + 1).get();
  const scanned = snapshot.docs.slice(0, limit);
  const role = canonicalRole(actor?.role || actor?.canonicalRole);
  const reviewEvents = userIdOf(actor) && actor?.status === 'ACTIVE' && [ROLES.FARM_MANAGER, ROLES.SRA_ADMIN, ROLES.SUPER_ADMIN].includes(role)
    ? scanned.map(doc => doc.data()).filter(event => event.type === 'verification-request' && event.expiresAtMs > now) : [];
  const lookup = new Map();
  const preload = async (collection, ids) => {
    const refs = [...new Set(ids.filter(Boolean))].map(id => database.collection(collection).doc(id));
    if (!refs.length) return [];
    const rows = typeof database.getAll === 'function' ? await database.getAll(...refs) : await Promise.all(refs.map(ref => ref.get()));
    rows.forEach((row, index) => lookup.set(`${collection}/${refs[index].id}`, row));
    return rows;
  };
  const targets = await preload(COLLECTIONS.USERS, reviewEvents.map(event => event.entityId));
  if (role === ROLES.FARM_MANAGER) await preload(COLLECTIONS.BLOCK_FARMS, targets.filter(row => row.exists).map(row => {
    const target = row.data();
    return String(target.requestedBlockFarmId || target.affiliatedBlockFarmId || '').trim().toUpperCase();
  }));
  // Request-scoped reads feed the existing authority policy; no authorization is cached across requests.
  const scopedDatabase = { collection: name => ({ doc: id => ({ get: async () => {
    const key = `${name}/${id}`;
    if (!lookup.has(key)) lookup.set(key, await database.collection(name).doc(id).get());
    return lookup.get(key);
  } }) }) };
  const data = [];
  for (const doc of scanned) {
    const event = { id: doc.id, ...doc.data() };
    if (event.expiresAtMs > now && await canReceiveNotification(scopedDatabase, event, actor)) data.push(publicNotification(event));
  }
  const last = scanned.at(-1);
  return { data, page: { hasMore: snapshot.docs.length > limit,
    nextCursor: snapshot.docs.length > limit && last ? encodeCursor(last.data().createdAt, last.id) : null } };
}

async function dispatchNotification(database, eventId, { send = sendExpoPushNotification, checkReceipt = checkExpoPushReceipt, now = Date.now(), owner = randomUUID(), pageSize = 20, maxPages = Infinity } = {}) {
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 20 || !(maxPages === Infinity || Number.isInteger(maxPages) && maxPages >= 1)) {
    throw new Error('Invalid notification dispatch page bounds.');
  }
  const ref = database.collection(COLLECTIONS.NOTIFICATION_EVENTS).doc(eventId);
  const event = await database.runTransaction(async tx => {
    const doc = await tx.get(ref);
    if (!doc.exists) return null;
    const event = { id: doc.id, ...doc.data() };
    if (event.dispatchState !== 'PENDING' || event.nextAttemptAtMs > now) return null;
    if (event.expiresAtMs <= now) { tx.update(ref, { dispatchState: 'EXPIRED' }); return null; }
    tx.update(ref, { leaseOwner: owner, nextAttemptAtMs: now + 300000 });
    return event;
  });
  if (!event) return;
  let retry = event.deliveryRetry === true;
  let awaitingReceipt = event.deliveryAwaitingReceipt === true;
  let cursor = event.deliveryCursor || null;
  let pages = 0;
  try {
    do {
      let query = database.collection(COLLECTIONS.MOBILE_PUSH_DEVICES).orderBy('__name__');
      if (cursor) query = query.startAfter(cursor);
      const devices = await query.limit(pageSize).get();
      for (const doc of devices.docs) {
        const device = doc.data();
        if (!device.enabled) continue;
        const account = await database.collection(COLLECTIONS.USERS).doc(device.userId).get();
        if (!account.exists || Number(account.data().authVersion || 1) !== device.authVersion
          || canonicalRole(account.data().role) === ROLES.SUPER_ADMIN) continue;
        if (!await canReceiveNotification(database, event, { ...account.data(), employeeId: account.id })) continue;
        const receiptRef = database.collection(COLLECTIONS.NOTIFICATION_DELIVERIES).doc(hash(`${eventId}:${doc.id}`));
        const receipt = await receiptRef.get();
        const previous = receipt.data() || {};
        if (previous.permanent || previous.confirmed || previous.unconfirmed) continue;
        const disableDevice = () => database.runTransaction(async tx => {
          const latest = await tx.get(doc.ref);
          if (latest.data()?.userId === device.userId) tx.update(doc.ref, { enabled: false });
        });
        if (previous.accepted) {
          if (now - Date.parse(previous.attemptedAt) < 900000) { awaitingReceipt = true; continue; }
          const result = await checkReceipt(previous.ticketId);
          if (result.pending) {
            // Expo removes receipts after 24 hours. Keep an honest terminal
            // state instead of claiming a handset delivery or resending forever.
            if (now - Date.parse(previous.attemptedAt) >= 86400000) await receiptRef.set({ unconfirmed: true }, { merge: true });
            else awaitingReceipt = true;
            continue;
          }
          if (result.success) { await receiptRef.set({ confirmed: true, confirmedAt: new Date(now).toISOString() }, { merge: true }); continue; }
          const permanent = ['DeviceNotRegistered', 'MessageTooBig'].includes(result.code);
          await receiptRef.set({ accepted: false, permanent, errorCode: result.code }, { merge: true });
          if (result.code === 'DeviceNotRegistered') await disableDevice();
          retry ||= !permanent;
          continue;
        }
        // Recheck binding immediately before send: account switching must not
        // reuse an earlier page's token ownership.
        const current = await doc.ref.get();
        if (!current.data()?.enabled || current.data().userId !== device.userId) continue;
        const result = await send(device.token, { title: event.title, body: event.body, channelId: CHANNEL_ID,
          ttl: Math.max(1, Math.min(2419200, Math.floor((event.expiresAtMs - now) / 1000))), tag: event.id,
          data: { hugpongType: 'system-update', notificationId: event.id, recipientUserId: device.userId, resources: event.resources } });
        const permanent = ['DeviceNotRegistered', 'MessageTooBig', 'PUSH_TOKEN_INVALID'].includes(result.code);
        await receiptRef.set({ eventId, deviceId: doc.id, userId: device.userId, accepted: result.success === true,
          permanent, ticketId: result.ticketId || null, errorCode: result.code || null,
          attemptedAt: new Date(now).toISOString(), deleteAfter: new Date(event.expiresAtMs) });
        if (result.code === 'DeviceNotRegistered') await disableDevice();
        awaitingReceipt ||= result.success === true;
        if (!result.success && !permanent) retry = true;
      }
      cursor = devices.docs.length === pageSize ? devices.docs.at(-1).id : null;
      pages++;
      // Renew the distributed lease for large recipient sets.
      if (cursor && pages < maxPages) await ref.set({ nextAttemptAtMs: Date.now() + 300000 }, { merge: true });
    } while (cursor && pages < maxPages);
    await database.runTransaction(async tx => {
      const latest = await tx.get(ref);
      if (latest.data()?.leaseOwner !== owner) return;
      // Small durable pages let a free Worker alarm finish below its outbound
      // request limit. Resume the same fanout after eviction, retaining retry
      // state until the entire recipient set has been scanned.
      tx.update(ref, { dispatchState: cursor || retry || awaitingReceipt ? 'PENDING' : 'COMPLETE',
        attempts: (event.attempts || 0) + (cursor ? 0 : 1),
        deliveryCursor: cursor, deliveryRetry: !!cursor && retry, deliveryAwaitingReceipt: !!cursor && awaitingReceipt,
        nextAttemptAtMs: Date.now() + (cursor ? 1000 : retry ? Math.min(300000, 1000 * 2 ** Math.min(event.attempts || 0, 9)) : 900000), leaseOwner: null });
    });
  } catch (error) {
    // The durable lease expires; the listener timer retries after process or provider failure.
    throw error;
  }
}

function startNotificationDelivery(database, { logger = console, retryMs = 1000, dispatch = dispatchNotification } = {}) {
  let stopped = false, unsubscribe = null, timer = null, listenerRetry = null, running = false, pending = [], retryAttempt = 0;
  const schedule = delay => { clearTimeout(timer); if (!stopped) { timer = setTimeout(drain, delay); timer.unref?.(); } };
  async function drain() {
    if (stopped || running) return;
    running = true;
    try {
      const due = pending.find(event => event.nextAttemptAtMs <= Date.now());
      if (due) await dispatch(database, due.id);
    } catch { logger.warn('[Notifications] Durable delivery deferred; retry scheduled.'); }
    finally {
      running = false;
      // Snapshot changes provide new work; a one-shot timer handles retry/lease deadlines.
      if (pending.length) schedule(Math.max(1000, Math.min(...pending.map(event => event.nextAttemptAtMs)) - Date.now()));
    }
  }
  function listen() {
    if (stopped) return;
    unsubscribe = database.collection(COLLECTIONS.NOTIFICATION_EVENTS).where('dispatchState', '==', 'PENDING')
      .orderBy('nextAttemptAtMs').limit(25).onSnapshot(snapshot => {
        retryAttempt = 0;
        pending = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        if (pending.length) schedule(Math.max(0, Math.min(...pending.map(event => event.nextAttemptAtMs)) - Date.now()));
        else { clearTimeout(timer); timer = null; }
      }, () => {
        unsubscribe?.(); unsubscribe = null;
        clearTimeout(timer);
        if (!stopped) {
          listenerRetry = setTimeout(listen, Math.min(30000, retryMs * 2 ** Math.min(retryAttempt++, 5)));
          listenerRetry.unref?.();
        }
        logger.warn('[Notifications] Delivery listener disconnected; retry scheduled.');
      });
  }
  listen();
  return { stop() { stopped = true; clearTimeout(timer); clearTimeout(listenerRetry); unsubscribe?.(); } };
}

module.exports = { RETENTION_MS, CHANNEL_ID, notificationFromAudit, queueSystemNotification, canReceiveNotification,
  registerPushDevice, unregisterPushDevice, notificationInbox, dispatchNotification, startNotificationDelivery };
