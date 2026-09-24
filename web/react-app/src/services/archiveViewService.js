import { authenticatedRequest } from './apiClient';
import { fromOperation } from './firestoreSchema';

export const ARCHIVE_PAGE_SIZE = 25;
const ARCHIVE_CLEAR_VIEW_STORAGE_PREFIX = 'hugpong_archive_clear_view_v1';

function normalizePreferencePart(value) {
  return encodeURIComponent(String(value || '').trim().toLowerCase());
}

export function getArchiveClearViewPreferenceKey(user, roleKey = '', archiveContext = 'operations') {
  const userId = user?.employeeId || user?.id || user?.userId || user?.uid || user?.email;
  if (!userId) return '';
  const role = roleKey || user?.canonicalRole || user?.role || 'user';
  return [
    ARCHIVE_CLEAR_VIEW_STORAGE_PREFIX,
    normalizePreferencePart(role),
    normalizePreferencePart(userId),
    normalizePreferencePart(archiveContext)
  ].join(':');
}

export function readArchiveClearViewPreference(preferenceKey) {
  if (!preferenceKey || typeof localStorage === 'undefined') return false;
  try {
    return localStorage.getItem(preferenceKey) === 'true';
  } catch (error) {
    console.warn('[archiveViewService] Unable to read Clear View preference:', error);
    return false;
  }
}

export function writeArchiveClearViewPreference(preferenceKey, isCleared) {
  if (!preferenceKey || typeof localStorage === 'undefined') return false;
  try {
    localStorage.setItem(preferenceKey, String(Boolean(isCleared)));
    return true;
  } catch (error) {
    console.warn('[archiveViewService] Unable to save Clear View preference:', error);
    return false;
  }
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
  const params = new URLSearchParams({ limit: String(limit) });
  if (cursor) params.set('cursor', cursor);
  if (cropYearCycle) params.set('cropYearCycle', cropYearCycle);
  if (fieldId) params.set('fieldId', fieldId);
  if (operationDefinitionId) params.set('operationDefinitionId', operationDefinitionId);
  if (search.trim()) params.set('search', search.trim());
  const response = await authenticatedRequest(`/api/logs/archive?${params.toString()}`);
  return {
    records: (response.data || []).map(record => fromOperation(record.id, record)),
    nextCursor: response.nextCursor || null,
    hasMore: Boolean(response.hasMore),
    pageSize: Number(response.pageSize || limit)
  };
}
