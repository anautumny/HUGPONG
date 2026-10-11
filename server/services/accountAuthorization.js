'use strict';

const { COLLECTIONS, ROLES, canonicalRole } = require('../schema/firestoreSchema');

// Assignment lookups are repeated by every endpoint in the initial dashboard
// request burst. Cache only assignment projections, never account status or
// authVersion, so deactivation and session revocation remain live DB checks.
const ASSIGNMENT_CACHE_TTL_MS = 60 * 1000;
const ASSIGNMENT_CACHE_MAX_ENTRIES = 500;
const assignmentCaches = new WeakMap();

function cacheFor(database) {
  let cache = assignmentCaches.get(database);
  if (!cache) {
    cache = new Map();
    assignmentCaches.set(database, cache);
  }
  return cache;
}

function assignmentCacheKey(userId, role, account = {}) {
  return [
    String(userId || '').trim(),
    canonicalRole(role),
    String(account?.affiliatedBlockFarmId || '').trim().toUpperCase()
  ].join('|');
}

function copyAssignments(value) {
  return { blockFarmId: value?.blockFarmId || '', fieldId: value?.fieldId || '' };
}

function pruneCache(cache, now = Date.now()) {
  for (const [key, entry] of cache) {
    if (!entry.promise && entry.expiresAt <= now) cache.delete(key);
  }
  while (cache.size >= ASSIGNMENT_CACHE_MAX_ENTRIES) {
    cache.delete(cache.keys().next().value);
  }
}

function activeDocuments(snapshot) {
  return (snapshot?.docs || [])
    .filter(document => String(document.data()?.status || 'ACTIVE').toUpperCase() === 'ACTIVE')
    .sort((left, right) => String(left.id).localeCompare(String(right.id)));
}

async function activeAffiliatedBlockFarmId(database, account = {}) {
  const blockFarmId = String(account.affiliatedBlockFarmId || '').trim().toUpperCase();
  if (!blockFarmId) return '';
  const farm = await database.collection(COLLECTIONS.BLOCK_FARMS).doc(blockFarmId).get();
  if (!farm.exists || String(farm.data()?.status || 'ACTIVE').toUpperCase() !== 'ACTIVE') return '';
  return farm.id;
}

async function resolveAccountAssignmentsUncached(database, userId, role, account = null) {
  if (!database) throw new Error('Database is required to resolve account assignments.');
  const canonical = canonicalRole(role);
  if (canonical === ROLES.FARM_MANAGER) {
    const [farms, fields] = await Promise.all([
      database.collection(COLLECTIONS.BLOCK_FARMS).where('managerUserId', '==', userId).get(),
      database.collection(COLLECTIONS.FIELDS).where('memberUserId', '==', userId).get()
    ]);
    const field = activeDocuments(fields)[0] || null;
    const farm = activeDocuments(farms)[0] || null;
    return {
      blockFarmId: field ? String(field.data().blockFarmId || '') : (farm?.id || ''),
      fieldId: field?.id || ''
    };
  }
  if (canonical === ROLES.MEMBER_FARMER) {
    const fields = await database.collection(COLLECTIONS.FIELDS).where('memberUserId', '==', userId).get();
    const field = activeDocuments(fields)[0] || null;
    if (field) {
      return { blockFarmId: String(field.data().blockFarmId || ''), fieldId: field.id };
    }
    let authoritativeAccount = account;
    if (!authoritativeAccount) {
      const user = await database.collection(COLLECTIONS.USERS).doc(userId).get();
      authoritativeAccount = user.exists ? user.data() : {};
    }
    return {
      blockFarmId: await activeAffiliatedBlockFarmId(database, authoritativeAccount),
      fieldId: ''
    };
  }
  return { blockFarmId: '', fieldId: '' };
}

async function resolveAccountAssignments(database, userId, role, account = null) {
  if (!database) throw new Error('Database is required to resolve account assignments.');
  const cache = cacheFor(database);
  const key = assignmentCacheKey(userId, role, account);
  const now = Date.now();
  const cached = cache.get(key);
  if (cached?.promise) return copyAssignments(await cached.promise);
  if (cached && cached.expiresAt > now) return copyAssignments(cached.value);
  if (cached) cache.delete(key);
  pruneCache(cache, now);

  const promise = resolveAccountAssignmentsUncached(database, userId, role, account)
    .then(value => {
      const stable = Object.freeze(copyAssignments(value));
      // An ownership mutation can invalidate this key while its original read
      // is still in flight. Do not let that older read repopulate the cache.
      if (cache.get(key)?.promise === promise) {
        cache.set(key, { value: stable, expiresAt: Date.now() + ASSIGNMENT_CACHE_TTL_MS });
      }
      return stable;
    })
    .catch(error => {
      cache.delete(key);
      throw error;
    });
  cache.set(key, { promise, expiresAt: Number.POSITIVE_INFINITY });
  return copyAssignments(await promise);
}

function invalidateAccountAssignments(database, userIds = []) {
  if (!database) return;
  const cache = assignmentCaches.get(database);
  if (!cache) return;
  const normalized = new Set(
    (Array.isArray(userIds) ? userIds : [userIds])
      .map(value => String(value || '').trim())
      .filter(Boolean)
  );
  if (!normalized.size) {
    cache.clear();
    return;
  }
  for (const key of cache.keys()) {
    if (normalized.has(key.split('|', 1)[0])) cache.delete(key);
  }
}

module.exports = {
  ASSIGNMENT_CACHE_TTL_MS,
  invalidateAccountAssignments,
  resolveAccountAssignments
};
