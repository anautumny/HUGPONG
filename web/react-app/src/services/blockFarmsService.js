import { fromBlockFarm, fromUser } from './firestoreSchema';
import {
  authenticatedRead,
  authenticatedRequest,
  subscribeToAuthenticatedLoader
} from './apiClient';

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

  return subscribeToAuthenticatedLoader(async ({ force }) => {
    const [farmsResult, fieldsResult, usersResult] = await Promise.all([
      authenticatedRead('/api/block-farms', { force }),
      authenticatedRead('/api/fields', { force }),
      isManager
        ? Promise.resolve({ data: [] })
        : authenticatedRead('/api/users', { force })
    ]);
    const blockFarms = (farmsResult.data || [])
      .map(farm => fromBlockFarm(farm.id, farm))
      .sort((left, right) => String(left.id).localeCompare(String(right.id)));
    const fields = (fieldsResult.data || [])
      .map(field => ({ id: field.id, ...field }))
      .sort((left, right) => String(left.id).localeCompare(String(right.id)));
    const farmManagers = (usersResult.data || [])
      .map(account => fromUser(account.id || account.employeeId, account))
      .filter(account => account.canonicalRole === 'FARM_MANAGER')
      .sort((left, right) => String(left.displayName || left.name || '').localeCompare(String(right.displayName || right.name || '')));
    return { blockFarms, fields, farmManagers };
  }, {
    onData: data => onUpdate({ ...data, isLoading: false, error: null }),
    onError: error => {
      if (onError) onError(error);
    }
  });
}

/**
 * Server-authoritative mutation to register a new block farm
 */
export async function createBlockFarm(payload) {
  return authenticatedRequest('/api/block-farms', {
    method: 'POST',
    body: payload
  });
}

/**
 * Server-authoritative mutation to update an existing block farm
 */
export async function updateBlockFarm(farmId, payload) {
  return authenticatedRequest(`/api/block-farms/${encodeURIComponent(farmId)}`, {
    method: 'PUT',
    body: payload
  });
}
