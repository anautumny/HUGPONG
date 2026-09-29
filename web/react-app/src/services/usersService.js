/**
 * ══════════════════════════════════════════════════════════════
 * HUGPONG — Users Service
 * Authoritative user directory, personnel provisioning, and status.
 * ══════════════════════════════════════════════════════════════
 */

import { fromUser } from './firestoreSchema';
import { authenticatedRequest, subscribeToAuthenticatedResource } from './apiClient';

/**
 * Periodic server-authoritative subscription to the scoped users directory
 * @param {Object} options
 * @param {Object} options.user - Current session user
 * @param {Function} options.onUpdate - Callback with { users, pendingUsers, isLoading, error }
 * @param {Function} [options.onError]
 */
export function subscribeToUsersData({ user, onUpdate, onError }) {
  let records = [];
  let nextCursor = null;
  let hasMore = false;
  let loadingMore = false;

  const present = () => {
    const mapped = records
      .filter(record => record && typeof record === 'object')
      .map(record => fromUser(String(record.id || record.employeeId || '').trim(), record))
      .filter(record => record.id)
      .sort((left, right) => String(left.name || '').localeCompare(String(right.name || '')));
    onUpdate({
      users: mapped.filter(record => record.status !== 'PENDING'),
      pendingUsers: mapped.filter(record => record.status === 'PENDING'),
      hasMore,
      isLoadingMore: loadingMore,
      isLoading: false,
      error: null
    });
  };

  const unsubscribe = subscribeToAuthenticatedResource('/api/users?limit=50', {
    onData: response => {
      records = Array.isArray(response?.data) ? response.data : [];
      nextCursor = response.page?.nextCursor || null;
      hasMore = Boolean(response.page?.hasMore && nextCursor);
      present();
    },
    onError: error => {
      console.warn('[UsersService] User directory refresh was deferred.');
      if (onError) onError(error);
    }
  });
  unsubscribe.loadMore = async () => {
    if (!hasMore || !nextCursor || loadingMore) return;
    loadingMore = true;
    present();
    try {
      const response = await authenticatedRequest(`/api/users?limit=50&cursor=${encodeURIComponent(nextCursor)}`);
      const byId = new Map(records.map(record => [String(record.id || record.employeeId), record]));
      (response.data || []).forEach(record => byId.set(String(record.id || record.employeeId), record));
      records = Array.from(byId.values());
      nextCursor = response.page?.nextCursor || null;
      hasMore = Boolean(response.page?.hasMore && nextCursor);
    } catch (error) {
      if (onError) onError(error);
    } finally {
      loadingMore = false;
      present();
    }
  };
  return unsubscribe;
}

/**
 * Fetch users via authoritative API
 */
export async function fetchUsers({ cursor = null, limit = 50 } = {}) {
  const query = new URLSearchParams({ limit: String(limit) });
  if (cursor) query.set('cursor', cursor);
  return authenticatedRequest(`/api/users?${query.toString()}`);
}

/**
 * Provision new account or approve pending registration
 */
export async function approveOrProvisionUser(payload) {
  return authenticatedRequest('/api/users/approve', {
    method: 'POST',
    body: payload
  });
}

/**
 * Update user details
 */
export async function updateUser(userId, payload) {
  return authenticatedRequest(`/api/users/${encodeURIComponent(userId)}`, {
    method: 'PATCH',
    body: payload
  });
}

/**
 * Toggle user account status (ACTIVE <-> DISABLED)
 */
export async function toggleUserStatus(userId, currentStatus) {
  const newStatus = currentStatus === 'ACTIVE' ? 'DISABLED' : 'ACTIVE';
  return authenticatedRequest(`/api/users/${encodeURIComponent(userId)}`, {
    method: 'PATCH',
    body: { status: newStatus }
  });
}
