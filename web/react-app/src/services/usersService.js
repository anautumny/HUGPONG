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
  return subscribeToAuthenticatedResource('/api/users', {
    onData: response => {
      const users = (response.data || [])
        .map(record => fromUser(record.id || record.employeeId, record))
        .sort((left, right) => String(left.name || '').localeCompare(String(right.name || '')));
      const active = users.filter(record => record.status !== 'PENDING');
      const pendingUsers = users.filter(record => record.status === 'PENDING');
      onUpdate({ users: active, pendingUsers, isLoading: false, error: null });
    },
    onError: error => {
      console.warn('[UsersService] API subscription notice:', error.message);
      if (onError) onError(error);
    }
  });
}

/**
 * Fetch users via authoritative API
 */
export async function fetchUsers() {
  return authenticatedRequest('/api/users');
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

/**
 * Request SMS OTP for personnel phone verification
 */
export async function requestPhoneVerification(phone, displayName) {
  return authenticatedRequest('/api/users/phone-verification/request', {
    method: 'POST',
    body: { phone, displayName }
  });
}

/**
 * Verify SMS OTP for personnel phone verification
 */
export async function verifyPhoneOtp(phone, code) {
  return authenticatedRequest('/api/users/phone-verification/verify', {
    method: 'POST',
    body: { phone, code }
  });
}
