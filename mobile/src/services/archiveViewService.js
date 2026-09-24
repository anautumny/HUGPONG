import { authenticatedRequest } from './authService';
import { fromOperationLogDocument } from '../data/firestoreSchema';
import { getItem, saveItem, STORAGE_KEYS } from './storageService';

export const ARCHIVE_PAGE_SIZE = 25;
let archivePreferenceWriteQueue = Promise.resolve();

function normalizePreferencePart(value) {
  return encodeURIComponent(String(value || '').trim().toLowerCase());
}

export function getArchiveClearViewPreferenceScope(user, archiveContext = 'operations') {
  const userId = user?.employeeId || user?.id || user?.userId || user?.uid || user?.email;
  if (!userId) return '';
  const role = user?.canonicalRole || user?.role || 'user';
  return [
    normalizePreferencePart(role),
    normalizePreferencePart(userId),
    normalizePreferencePart(archiveContext)
  ].join(':');
}

export async function readArchiveClearViewPreference(preferenceScope) {
  if (!preferenceScope) return false;
  const preferences = await getItem(STORAGE_KEYS.ARCHIVE_VIEW_PREFERENCES, {});
  return preferences?.[preferenceScope] === true;
}

export async function writeArchiveClearViewPreference(preferenceScope, isCleared) {
  if (!preferenceScope) return false;
  archivePreferenceWriteQueue = archivePreferenceWriteQueue.catch(() => false).then(async () => {
    const preferences = await getItem(STORAGE_KEYS.ARCHIVE_VIEW_PREFERENCES, {});
    return saveItem(STORAGE_KEYS.ARCHIVE_VIEW_PREFERENCES, {
      ...(preferences && typeof preferences === 'object' ? preferences : {}),
      [preferenceScope]: Boolean(isCleared)
    });
  });
  return archivePreferenceWriteQueue;
}

export function appendUniqueArchiveRecords(existing = [], incoming = []) {
  const records = new Map(existing.map(record => [record.id, record]));
  incoming.forEach(record => records.set(record.id, record));
  return Array.from(records.values());
}

export async function fetchArchivedOperations({
  cursor = null,
  cropYearCycle = '',
  fieldId = '',
  operationDefinitionId = '',
  search = '',
  limit = ARCHIVE_PAGE_SIZE
} = {}) {
  const params = [
    ['limit', String(limit)],
    ['cursor', cursor],
    ['cropYearCycle', cropYearCycle],
    ['fieldId', fieldId],
    ['operationDefinitionId', operationDefinitionId],
    ['search', search.trim()]
  ]
    .filter(([, value]) => value)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');
  const response = await authenticatedRequest(`/api/logs/archive?${params}`);
  return {
    records: (response.data || []).map(record => fromOperationLogDocument(record.id, record)),
    nextCursor: response.nextCursor || null,
    hasMore: Boolean(response.hasMore),
    pageSize: Number(response.pageSize || limit)
  };
}
