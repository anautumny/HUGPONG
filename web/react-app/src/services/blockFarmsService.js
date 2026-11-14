import { fromBlockFarm, fromUser } from './firestoreSchema';
import {
  authenticatedRead,
  authenticatedRequest,
  subscribeToAuthenticatedLoader,
  settleResourceReads
} from './apiClient';
import { uniqueRecordsById } from '../utils/recordOrdering';

/**
 * Real-time subscription to block farms, registered fields, and candidate farm managers
 */
export function subscribeToBlockFarmsData({ user, onUpdate, onError }) {
  const role = String(user?.canonicalRole || user?.role || user?.roleKey || '').replace(/[\s-]+/g, '_').toUpperCase();
  const isManager = role === 'FARM_MANAGER' || role === 'MANAGER';
  if (role === 'SUPER_ADMIN') {
    onUpdate({ blockFarms: [], fields: [], farmManagers: [], isLoading: false, error: null });
    return () => {};
  }

  const previous = new Map();
  return subscribeToAuthenticatedLoader(async ({ force, retryOnly }) => {
    const { values: [farmsResult, fieldsResult, usersResult], refreshError } = await settleResourceReads([
      () => authenticatedRead('/api/block-farms', { force }),
      () => authenticatedRead('/api/fields', { force }),
      () => isManager
        ? Promise.resolve({ data: [] })
        : authenticatedRead('/api/users', { force })
    ], previous, { retryOnly, groups: [[0, 1]] });
    const blockFarms = uniqueRecordsById((farmsResult.data || [])
      .map(farm => fromBlockFarm(farm.id, farm)))
      .sort((left, right) => String(left.id).localeCompare(String(right.id)));
    const fields = (fieldsResult.data || [])
      .map(field => ({ id: field.id, ...field }))
      .sort((left, right) => String(left.id).localeCompare(String(right.id)));
    const farmManagers = (usersResult.data || [])
      .map(account => fromUser(account.id || account.employeeId, account))
      .filter(account => account.canonicalRole === 'FARM_MANAGER' && String(account.status || '').toUpperCase() === 'ACTIVE')
      .sort((left, right) => String(left.displayName || left.name || '').localeCompare(String(right.displayName || right.name || '')));
    return { blockFarms, fields, farmManagers, refreshError };
  }, {
    onData: data => onUpdate({ ...data, isLoading: false, error: data.refreshError?.message || null }),
    onError: error => {
      if (onError) onError(error);
    },
    resources: isManager
      ? ['block-farms', 'fields']
      : ['block-farms', 'fields', 'users']
  });
}

/**
 * Server-authoritative mutation to register a new block farm
 */
export async function createBlockFarm(payload, ownerId) {
  const { creationIntent } = await import('./enrollmentIntentService');
  const intent = await creationIntent(ownerId, payload, 'block-farms');
  const result = await authenticatedRequest('/api/block-farms', {
    method: 'POST',
    body: { ...payload, _mutation: intent.mutation }
  });
  localStorage.removeItem(intent.storageKey);
  return result;
}

/**
 * Server-authoritative mutation to update an existing block farm
 */
export async function updateBlockFarm(farmId, payload, baseVersion = null) {
  return authenticatedRequest(`/api/block-farms/${encodeURIComponent(farmId)}`, {
    method: 'PUT',
    body: payload,
    baseVersion
  });
}
