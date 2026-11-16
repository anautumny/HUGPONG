'use strict';

const { createHash, randomUUID } = require('node:crypto');
const { COLLECTIONS } = require('../schema/firestoreSchema');
const RETENTION_MS = 28 * 24 * 60 * 60 * 1000;
const SESSION_MS = 7 * 24 * 60 * 60 * 1000;
const idOf = user => String(user?.employeeId || user?.userId || user?.id || '').trim();
const instanceOf = instance => String(instance || 'legacy-client').slice(0, 160);

function subscriptionRef(database, user, instance) {
  const key = createHash('sha256').update(JSON.stringify([idOf(user), instanceOf(instance)])).digest('hex');
  return database.collection(COLLECTIONS.NOTIFICATION_SUBSCRIPTIONS).doc(key);
}

function coversEvent(subscription, event, activeOnly = false) {
  const timestamp = Date.parse(event.createdAt || '');
  if (!Number.isFinite(timestamp)) return false;
  const periods = activeOnly ? [] : [...(subscription.periods || [])];
  if (subscription.activeFrom != null) periods.push({ from: subscription.activeFrom, to: subscription.expiresAtMs });
  return periods.some(period => timestamp >= period.from && timestamp < period.to);
}

// One record per account and installation preserves signed-in intervals.
// A reconnect extends an existing interval; an explicit new login starts one.
async function openNotificationSubscription(database, user, instance, { freshLogin = false, now = Date.now() } = {}) {
  const ref = subscriptionRef(database, user, instance);
  return database.runTransaction(async transaction => {
    const snapshot = await transaction.get(ref);
    const current = snapshot.data() || {};
    if (snapshot.exists && current.activeFrom == null && !freshLogin) return false;
    const periods = (current.periods || []).filter(period => period.to > now - RETENTION_MS);
    const sameSession = !freshLogin && current.activeFrom != null && current.expiresAtMs > now
      && current.authVersion === Number(user.authVersion || 1);
    if (sameSession && current.expiresAtMs - now > SESSION_MS - 60 * 60 * 1000) return { sessionKey: current.sessionKey };
    if (!sameSession && current.activeFrom != null && current.authVersion === Number(user.authVersion || 1)) {
      periods.push({ from: current.activeFrom, to: Math.min(current.expiresAtMs, now) });
    }
    const sessionKey = sameSession ? current.sessionKey : randomUUID();
    transaction.set(ref, {
      userId: idOf(user), clientInstanceId: instanceOf(instance), authVersion: Number(user.authVersion || 1),
      periods, sessionKey, activeFrom: sameSession ? current.activeFrom : now, expiresAtMs: now + SESSION_MS,
      updatedAt: new Date(now).toISOString(), deleteAfter: new Date(now + SESSION_MS + RETENTION_MS)
    });
    return { sessionKey };
  });
}

async function closeNotificationSubscription(database, user, instance, now = Date.now()) {
  const ref = subscriptionRef(database, user, instance);
  return database.runTransaction(async transaction => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) return false;
    const current = snapshot.data();
    if (user.notificationSessionKey && user.notificationSessionKey !== current.sessionKey) return false;
    if (current.activeFrom == null) return true;
    const periods = (current.periods || []).filter(period => period.to > now - RETENTION_MS);
    periods.push({ from: current.activeFrom, to: Math.min(current.expiresAtMs, now) });
    transaction.update(ref, { periods, activeFrom: null, updatedAt: new Date(now).toISOString() });
    return true;
  });
}

async function notificationSubscriptions(database, user) {
  const snapshot = await database.collection(COLLECTIONS.NOTIFICATION_SUBSCRIPTIONS).where('userId', '==', idOf(user)).get();
  return snapshot.docs.map(doc => {
    const subscription = doc.data();
    // Revoked credentials cannot keep an interval open indefinitely. Prior
    // completed intervals remain history owned by this same account.
    if (subscription.authVersion !== Number(user.authVersion || 1)) return { ...subscription, activeFrom: null };
    return subscription;
  });
}

module.exports = { subscriptionRef, coversEvent, openNotificationSubscription, closeNotificationSubscription, notificationSubscriptions };
