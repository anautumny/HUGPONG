'use strict';

const session = require('express-session');

function serializable(value) {
  return JSON.parse(JSON.stringify(value));
}

class FirestoreSessionStore extends session.Store {
  constructor(database, {
    collectionName = 'server_sessions',
    defaultTtlMs = 7 * 24 * 60 * 60 * 1000,
    touchIntervalMs = 15 * 60 * 1000
  } = {}) {
    super();
    if (!database) throw new Error('Firestore is required for persistent sessions.');
    this.collection = database.collection(collectionName);
    this.defaultTtlMs = defaultTtlMs;
    this.touchIntervalMs = touchIntervalMs;
    this.lastPersistedAtBySid = new Map();
    this.inFlightGets = new Map();
  }

  get(sid, callback) {
    let request = this.inFlightGets.get(sid);
    if (!request) {
      request = this.collection.doc(sid).get().then(async snapshot => {
        if (!snapshot.exists) return null;
        const record = snapshot.data();
        if (Number(record.expiresAtMs || 0) <= Date.now()) {
          await snapshot.ref.delete().catch(() => {});
          this.lastPersistedAtBySid.delete(sid);
          return null;
        }
        this.lastPersistedAtBySid.set(sid, Date.parse(record.updatedAt || '') || Date.now());
        return record.session || null;
      }).finally(() => {
        if (this.inFlightGets.get(sid) === request) this.inFlightGets.delete(sid);
      });
      this.inFlightGets.set(sid, request);
    }
    request.then(value => callback(null, value ? serializable(value) : null)).catch(callback);
  }

  set(sid, sessionData, callback = () => {}) {
    const cookieExpiry = sessionData?.cookie?.expires ? new Date(sessionData.cookie.expires).getTime() : NaN;
    const expiresAtMs = Number.isFinite(cookieExpiry) ? cookieExpiry : Date.now() + this.defaultTtlMs;
    const persistedAt = Date.now();
    this.collection.doc(sid).set({
      session: serializable(sessionData),
      expiresAtMs,
      expiresAt: new Date(expiresAtMs),
      updatedAt: new Date(persistedAt).toISOString()
    }).then(() => {
      this.lastPersistedAtBySid.set(sid, persistedAt);
      callback(null);
    }).catch(callback);
  }

  destroy(sid, callback = () => {}) {
    this.collection.doc(sid).delete().then(() => {
      this.lastPersistedAtBySid.delete(sid);
      this.inFlightGets.delete(sid);
      callback(null);
    }).catch(error => {
      if (error?.code === 5) return callback(null);
      return callback(error);
    });
  }

  touch(sid, sessionData, callback = () => {}) {
    const lastPersistedAt = this.lastPersistedAtBySid.get(sid) || 0;
    if (Date.now() - lastPersistedAt < this.touchIntervalMs) return callback(null);
    this.set(sid, sessionData, callback);
  }
}

module.exports = FirestoreSessionStore;
