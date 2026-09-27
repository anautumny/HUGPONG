'use strict';

const session = require('express-session');

function serializable(value) {
  return JSON.parse(JSON.stringify(value));
}

class FirestoreSessionStore extends session.Store {
  constructor(database, { collectionName = 'server_sessions', defaultTtlMs = 7 * 24 * 60 * 60 * 1000 } = {}) {
    super();
    if (!database) throw new Error('Firestore is required for persistent sessions.');
    this.collection = database.collection(collectionName);
    this.defaultTtlMs = defaultTtlMs;
  }

  get(sid, callback) {
    this.collection.doc(sid).get().then(async snapshot => {
      if (!snapshot.exists) return callback(null, null);
      const record = snapshot.data();
      if (Number(record.expiresAtMs || 0) <= Date.now()) {
        await snapshot.ref.delete().catch(() => {});
        return callback(null, null);
      }
      return callback(null, record.session || null);
    }).catch(callback);
  }

  set(sid, sessionData, callback = () => {}) {
    const cookieExpiry = sessionData?.cookie?.expires ? new Date(sessionData.cookie.expires).getTime() : NaN;
    const expiresAtMs = Number.isFinite(cookieExpiry) ? cookieExpiry : Date.now() + this.defaultTtlMs;
    this.collection.doc(sid).set({
      session: serializable(sessionData),
      expiresAtMs,
      expiresAt: new Date(expiresAtMs),
      updatedAt: new Date().toISOString()
    }).then(() => callback(null)).catch(callback);
  }

  destroy(sid, callback = () => {}) {
    this.collection.doc(sid).delete().then(() => callback(null)).catch(error => {
      if (error?.code === 5) return callback(null);
      return callback(error);
    });
  }

  touch(sid, sessionData, callback = () => {}) {
    this.set(sid, sessionData, callback);
  }
}

module.exports = FirestoreSessionStore;
