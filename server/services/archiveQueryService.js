'use strict';

const { FieldPath } = require('firebase-admin/firestore');
const { COLLECTIONS } = require('../schema/firestoreSchema');
const { getOperationActorScope } = require('./operationQueryService');

const ARCHIVE_PAGE_SIZE = 25;
const MAX_ARCHIVE_PAGE_SIZE = 100;

function requestError(message, status = 400) {
  return Object.assign(new Error(message), { status });
}

function optionalFilter(value, field, max = 120) {
  const clean = String(value || '').trim().toUpperCase();
  if (clean.length > max) throw requestError(`${field} exceeds ${max} characters.`);
  return clean || null;
}

function cropYearFilter(value) {
  const clean = String(value || '').trim();
  if (!clean) return null;
  const match = clean.match(/^(\d{4})-(\d{4})$/);
  if (!match || Number(match[2]) !== Number(match[1]) + 1) {
    throw requestError('cropYearCycle must use the canonical YYYY-YYYY annual range.');
  }
  return `${match[1]}-${match[2]}`;
}

function pageSize(value) {
  if (value == null || value === '') return ARCHIVE_PAGE_SIZE;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_ARCHIVE_PAGE_SIZE) {
    throw requestError(`limit must be an integer from 1 to ${MAX_ARCHIVE_PAGE_SIZE}.`);
  }
  return parsed;
}

function encodeArchiveCursor(record) {
  if (!record?.id || !record?.archivedAt) return null;
  return Buffer.from(JSON.stringify({ id: record.id, archivedAt: record.archivedAt }), 'utf8').toString('base64url');
}

function decodeArchiveCursor(value) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(String(value), 'base64url').toString('utf8'));
    if (!parsed?.id || !parsed?.archivedAt) throw new Error('Incomplete cursor.');
    return { id: String(parsed.id), archivedAt: String(parsed.archivedAt) };
  } catch (_error) {
    throw requestError('cursor is invalid or expired.');
  }
}

function compareArchivedNewestFirst(left, right) {
  const timeOrder = String(right.archivedAt || '').localeCompare(String(left.archivedAt || ''));
  return timeOrder || String(right.id || '').localeCompare(String(left.id || ''));
}

function matchesFilters(record, filters) {
  if (!record || String(record.status || '').toUpperCase() !== 'ARCHIVED') return false;
  if (filters.fieldId && record.fieldId !== filters.fieldId) return false;
  if (filters.cropYearCycle && record.cropYearCycle !== filters.cropYearCycle) return false;
  if (filters.operationDefinitionId && record.operationDefinitionId !== filters.operationDefinitionId) return false;
  return true;
}

async function listArchivedOperationPage(database, user, options = {}) {
  if (String(options.cycleId || '').trim()) {
    throw requestError('cycleId is an exact cycle identifier and is not supported as the annual archive filter. Use cropYearCycle.');
  }
  const filters = {
    fieldId: optionalFilter(options.fieldId, 'fieldId', 80),
    cropYearCycle: cropYearFilter(options.cropYearCycle),
    operationDefinitionId: optionalFilter(options.operationDefinitionId, 'operationDefinitionId'),
    search: optionalFilter(options.search, 'search')
  };
  const limit = pageSize(options.limit);
  const cursor = decodeArchiveCursor(options.cursor);
  const scope = await getOperationActorScope(database, user);

  if (filters.fieldId && !scope.all && !scope.fieldIds.includes(filters.fieldId)) {
    throw requestError('The selected field is outside the authorized archive scope.', 403);
  }

  // Search is intentionally an exact operation-ID query. Field authorization is
  // included in the database query, so an out-of-scope document is never fetched
  // and filtered afterward.
  if (filters.search) {
    const scopedFieldIds = filters.fieldId
      ? [filters.fieldId]
      : scope.all ? null : scope.fieldIds;
    if (Array.isArray(scopedFieldIds) && !scopedFieldIds.length) {
      return { data: [], hasMore: false, nextCursor: null, pageSize: limit };
    }
    const fieldChunks = scopedFieldIds === null
      ? [null]
      : Array.from({ length: Math.ceil(scopedFieldIds.length / 10) }, (_, index) => scopedFieldIds.slice(index * 10, index * 10 + 10));
    const searchSnapshots = await Promise.all(fieldChunks.map(async fieldIds => {
      let query = database.collection(COLLECTIONS.OPERATION_LOGS)
        .where(FieldPath.documentId(), '==', filters.search)
        .where('status', '==', 'ARCHIVED');
      if (fieldIds) {
        query = fieldIds.length === 1
          ? query.where('fieldId', '==', fieldIds[0])
          : query.where('fieldId', 'in', fieldIds);
      }
      if (filters.cropYearCycle) query = query.where('cropYearCycle', '==', filters.cropYearCycle);
      if (filters.operationDefinitionId) {
        query = query.where('operationDefinitionId', '==', filters.operationDefinitionId);
      }
      return query.limit(1).get();
    }));
    const data = searchSnapshots
      .flatMap(snapshot => snapshot.docs.map(document => ({ id: document.id, ...document.data() })))
      .filter(record => matchesFilters(record, filters))
      .slice(0, 1);
    return { data, hasMore: false, nextCursor: null, pageSize: limit };
  }

  const scopedFieldIds = filters.fieldId
    ? [filters.fieldId]
    : scope.all ? null : scope.fieldIds;
  if (Array.isArray(scopedFieldIds) && !scopedFieldIds.length) {
    return { data: [], hasMore: false, nextCursor: null, pageSize: limit };
  }

  const fieldChunks = scopedFieldIds === null
    ? [null]
    : Array.from({ length: Math.ceil(scopedFieldIds.length / 10) }, (_, index) => scopedFieldIds.slice(index * 10, index * 10 + 10));

  const snapshots = await Promise.all(fieldChunks.map(async fieldIds => {
    let query = database.collection(COLLECTIONS.OPERATION_LOGS)
      .where('status', '==', 'ARCHIVED');
    if (fieldIds) {
      query = fieldIds.length === 1
        ? query.where('fieldId', '==', fieldIds[0])
        : query.where('fieldId', 'in', fieldIds);
    }
    if (filters.cropYearCycle) query = query.where('cropYearCycle', '==', filters.cropYearCycle);
    if (filters.operationDefinitionId) {
      query = query.where('operationDefinitionId', '==', filters.operationDefinitionId);
    }
    query = query
      .orderBy('archivedAt', 'desc')
      .orderBy(FieldPath.documentId(), 'desc');
    if (cursor) query = query.startAfter(cursor.archivedAt, cursor.id);
    return query.limit(limit + 1).get();
  }));

  const recordsById = new Map();
  snapshots.forEach(snapshot => snapshot.docs.forEach(document => {
    recordsById.set(document.id, { id: document.id, ...document.data() });
  }));
  const ordered = Array.from(recordsById.values()).sort(compareArchivedNewestFirst);
  const data = ordered.slice(0, limit);
  return {
    data,
    hasMore: ordered.length > limit,
    nextCursor: ordered.length > limit ? encodeArchiveCursor(data[data.length - 1]) : null,
    pageSize: limit
  };
}

module.exports = {
  ARCHIVE_PAGE_SIZE,
  MAX_ARCHIVE_PAGE_SIZE,
  encodeArchiveCursor,
  decodeArchiveCursor,
  compareArchivedNewestFirst,
  listArchivedOperationPage
};
