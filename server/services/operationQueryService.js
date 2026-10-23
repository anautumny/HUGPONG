'use strict';

const { COLLECTIONS, ROLES, canonicalRole } = require('../schema/firestoreSchema');
const { sortOperationsNewestFirst } = require('./recordOrdering');
const { presentOperationRecord } = require('../domain/presentationContract');
const { decodeCursor, pageLimit, pageEnvelope } = require('./cursorPagination');
const { scanScopedDocumentIds } = require('./scopedQueryFallback');

async function listOperationPage(database, user, options = {}) {
  const scope = await getOperationActorScope(database, user);
  const limit = pageLimit(options.limit, 100);
  const cursor = decodeCursor(options.cursor);
  const chunks = scope.all ? [null] : Array.from({ length: Math.ceil(scope.fieldIds.length / 10) }, (_, index) => scope.fieldIds.slice(index * 10, index * 10 + 10));
  const status = String(options.status || '').toUpperCase();
  const documents = [];
  for (const ids of chunks) {
    let query = database.collection(COLLECTIONS.OPERATION_LOGS);
    if (ids) query = query.where('fieldId', 'in', ids);
    const authorizedQuery = query;
    if (['ACTIVE', 'ARCHIVED'].includes(status)) query = query.where('status', '==', status);
    // Stable identity ordering needs no historical date backfill. Clients only
    // publish their complete, newest-first projection after following all pages.
    query = query.orderBy('__name__', 'asc');
    if (cursor) query = query.startAfter(cursor.id);
    let snapshot;
    try {
      snapshot = await query.limit(limit + 1).get();
    } catch (error) {
      if (!isMissingIndexError(error)) throw error;
      snapshot = { docs: await scanScopedDocumentIds(authorizedQuery, {
        after: cursor?.id, maximum: limit + 1,
        accept: doc => !['ACTIVE', 'ARCHIVED'].includes(status) || doc.data().status === status,
      }) };
    }
    documents.push(...snapshot.docs);
  }
  documents.sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
  const selected = pageEnvelope(documents, limit, document => document.id);
  const records = await enrichAmendmentEditors(database, selected.documents.map(doc => ({ id: doc.id, ...doc.data() })));
  return { data: records.map(presentOperationRecord), page: selected.page };
}

function normalizeOperationLimit(value) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    const error = new Error('Operation limit must be a positive integer.');
    error.status = 400;
    throw error;
  }
  return Math.min(parsed, 100);
}

function applyOperationLimit(query, limit) {
  if (!limit) return query;
  return query.orderBy('performedOn', 'desc').limit(limit);
}

function isMissingIndexError(error) {
  const code = String(error?.code ?? '').toLowerCase();
  return code === '9'
    || code === 'failed-precondition'
    || code === 'failed_precondition'
    || /requires an index/i.test(String(error?.message || ''));
}

async function getBoundedOperationSnapshot(baseQuery, limit) {
  try {
    return await applyOperationLimit(baseQuery, limit).get();
  } catch (error) {
    if (!limit || !isMissingIndexError(error)) throw error;
    console.warn('[Operations] Composite index unavailable; using the authorization-scoped fallback query.');
    return baseQuery.get();
  }
}

async function getOperationActorScope(database, user) {
  const userId = String(user?.employeeId || user?.userId || '').trim();
  const role = canonicalRole(user?.role || user?.roleKey);
  if (role === ROLES.SRA_ADMIN) {
    return { role, userId, all: true };
  }

  if (![ROLES.FARM_MANAGER, ROLES.MEMBER_FARMER].includes(role)) {
    const error = new Error('Role is not permitted to view field operations.');
    error.status = 403;
    throw error;
  }

  if (role === ROLES.FARM_MANAGER) {
    const farmSnapshot = await database.collection(COLLECTIONS.BLOCK_FARMS).where('managerUserId', '==', userId).get();
    const farmIds = farmSnapshot.docs.map(document => document.id);
    if (!farmIds.length) return { role, userId, fieldIds: [] };
    const fieldSnapshots = [];
    for (let index = 0; index < farmIds.length; index += 10) {
      fieldSnapshots.push(await database.collection(COLLECTIONS.FIELDS)
        .where('blockFarmId', 'in', farmIds.slice(index, index + 10)).get());
    }
    return {
      role,
      userId,
      fieldIds: fieldSnapshots.flatMap(snapshot => snapshot.docs.map(document => document.id))
    };
  }

  const fieldSnapshot = await database.collection(COLLECTIONS.FIELDS).where('memberUserId', '==', userId).get();
  return { role, userId, fieldIds: fieldSnapshot.docs.map(document => document.id) };
}

async function enrichAmendmentEditors(database, records) {
  const editorIds = Array.from(new Set(records.flatMap(record =>
    (record.amendments || []).map(amendment => String(amendment.amendedByUserId || '').trim())
  ).filter(Boolean)));
  const usersById = new Map();
  for (let index = 0; index < editorIds.length; index += 100) {
    const refs = editorIds.slice(index, index + 100).map(id => database.collection(COLLECTIONS.USERS).doc(id));
    const snapshots = refs.length ? await database.getAll(...refs) : [];
    snapshots.filter(snapshot => snapshot.exists).forEach(snapshot => usersById.set(snapshot.id, snapshot.data()));
  }
  return records.map(record => ({
    ...record,
    amendments: (record.amendments || []).map(amendment => {
      const editor = usersById.get(String(amendment.amendedByUserId || '').trim());
      return {
        ...amendment,
        amendedByName: amendment.amendedByName || editor?.displayName || editor?.name || '',
        amendedByRole: amendment.amendedByRole || editor?.role || ''
      };
    })
  }));
}

async function listOperationRecords(database, user, options = {}) {
  const scope = await getOperationActorScope(database, user);
  const requestedStatus = String(options.status || '').trim().toUpperCase();
  const status = ['ACTIVE', 'ARCHIVED'].includes(requestedStatus) ? requestedStatus : null;
  const limit = normalizeOperationLimit(options.limit);
  if (scope.all) {
    let query = database.collection(COLLECTIONS.OPERATION_LOGS);
    if (status) query = query.where('status', '==', status);
    const snapshot = await getBoundedOperationSnapshot(query, limit);
    const records = await enrichAmendmentEditors(database, snapshot.docs.map(document => ({ id: document.id, ...document.data() })));
    return sortOperationsNewestFirst(records.map(presentOperationRecord));
  }
  const records = [];
  for (let index = 0; index < scope.fieldIds.length; index += 10) {
    const fieldIds = scope.fieldIds.slice(index, index + 10);
    let query = database.collection(COLLECTIONS.OPERATION_LOGS).where('fieldId', 'in', fieldIds);
    if (status) query = query.where('status', '==', status);
    const snapshot = await getBoundedOperationSnapshot(query, limit);
    records.push(...snapshot.docs.map(document => presentOperationRecord({ id: document.id, ...document.data() })));
  }
  const enriched = await enrichAmendmentEditors(database, records);
  const sorted = sortOperationsNewestFirst(enriched);
  return limit ? sorted.slice(0, limit) : sorted;
}

module.exports = {
  listOperationPage,
  getOperationActorScope,
  getBoundedOperationSnapshot,
  isMissingIndexError,
  listOperationRecords,
  normalizeOperationLimit
};
