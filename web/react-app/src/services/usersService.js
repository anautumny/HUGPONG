/**
 * ══════════════════════════════════════════════════════════════
 * HUGPONG — Users Service
 * Authoritative user directory, personnel provisioning, and status.
 * ══════════════════════════════════════════════════════════════
 */

import { db, collection, onSnapshot } from './firebaseClient';
import { COLLECTIONS, fromUser } from './firestoreSchema';
import { authenticatedRequest } from './apiClient';

/**
 * Real-time subscription to users directory
 * @param {Object} options
 * @param {Object} options.user - Current session user
 * @param {Function} options.onUpdate - Callback with { users, pendingUsers, isLoading, error }
 * @param {Function} [options.onError]
 */
export function subscribeToUsersData({ user, onUpdate, onError }) {
  let isSubscribed = true;

  // Initial authoritative API fetch
  authenticatedRequest('/api/users')
    .then(res => {
      if (!isSubscribed) return;
      if (res.success && Array.isArray(res.data)) {
        const users = res.data.map(u => fromUser(u.id || u.employeeId, u));
        const active = users.filter(u => u.status !== 'PENDING');
        const pending = users.filter(u => u.status === 'PENDING');
        onUpdate({ users: active, pendingUsers: pending, isLoading: false, error: null });
      }
    })
    .catch(err => {
      console.warn('[UsersService] Initial API fetch notice:', err.message);
    });

  // Real-time Firestore snapshot listener
  let unsub = null;
  try {
    const usersRef = collection(db, COLLECTIONS.USERS);
    unsub = onSnapshot(
      usersRef,
      snapshot => {
        if (!isSubscribed) return;
        const allUsers = [];
        snapshot.forEach(docSnap => {
          try {
            allUsers.push(fromUser(docSnap.id, docSnap.data()));
          } catch (e) {
            console.warn('[UsersService] Skip user doc:', docSnap.id, e.message);
          }
        });

        // Role-based directory scoping in client view:
        const userRole = String(user?.role || user?.roleKey || '').toUpperCase().replace(/ /g, '_');
        let scoped = allUsers;

        if (userRole === 'FARM_MANAGER') {
          // Farm Manager sees members of their assigned farm + themselves + pending applicants
          const activeFarmId = user?.blockFarmId || '';
          scoped = allUsers.filter(u => {
            if (u.canonicalRole === 'SUPER_ADMIN' || u.canonicalRole === 'SRA_ADMIN') return false;
            if (u.id === user?.id || u.id === user?.employeeId) return true;
            if (u.status === 'PENDING' && u.requestedBlockFarmId === activeFarmId) return true;
            return u.canonicalRole === 'MEMBER_FARMER';
          });
        } else if (userRole === 'SRA_ADMIN') {
          // SRA Admin sees Farm Managers and Members, but not Super Admins
          scoped = allUsers.filter(u => u.canonicalRole !== 'SUPER_ADMIN');
        }

        scoped.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));

        const active = scoped.filter(u => u.status !== 'PENDING');
        const pending = scoped.filter(u => u.status === 'PENDING');

        onUpdate({ users: active, pendingUsers: pending, isLoading: false, error: null });
      },
      err => {
        console.warn('[UsersService] Snapshot listener notice:', err.message);
        if (onError) onError(err);
      }
    );
  } catch (err) {
    console.warn('[UsersService] Could not establish Firestore listener:', err.message);
  }

  return () => {
    isSubscribed = false;
    if (typeof unsub === 'function') unsub();
  };
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
