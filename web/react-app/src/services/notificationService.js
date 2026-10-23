import { authenticatedRequest } from './apiClient';

// Web consumers use the same account-owned state as Mobile. These POST reads
// bypass cached GET projections; a delayed caller from another session is
// rejected by the server's expectedUserId precondition.
export function fetchNotificationState(userId, ids) {
  return authenticatedRequest('/api/notifications/state/query', {
    method: 'POST', body: { ids, expectedUserId: userId },
  });
}

export function updateNotificationState(userId, ids, action) {
  return authenticatedRequest('/api/notifications/state', {
    method: 'POST', body: { ids, action, expectedUserId: userId },
  });
}
