import { authenticatedRequest, captureAuthenticatedContext } from './apiClient';

// Web consumers use the same account-owned state as Mobile. These POST reads
// bypass cached GET projections; a delayed caller from another session is
// rejected by the server's expectedUserId precondition.
export function fetchNotificationState(userId, ids) {
  if (Array.isArray(ids) && ids.length === 0) return Promise.resolve({ success: true, data: [] });
  return authenticatedRequest('/api/notifications/state/query', {
    method: 'POST', body: { ids, expectedUserId: userId },
  });
}

export function updateNotificationState(userId, ids, action) {
  return authenticatedRequest('/api/notifications/state', {
    method: 'POST', body: { ids, action, expectedUserId: userId },
  });
}

// Bulk actions cover the authorized inbox, including unloaded/empty filtered
// pages. Existing account-owned state writes remain the only mutation path.
export async function updateAllNotificationState(userId, action, { isCurrent = () => true } = {}) {
  if (!['read', 'dismiss'].includes(action)) throw new Error('Choose read or clear notifications.');
  const sameSession = captureAuthenticatedContext();
  const check = () => {
    if (!sameSession() || !isCurrent()) throw Object.assign(new Error('The notification account changed.'), { code: 'AUTH_CONTEXT_CHANGED' });
  };
  const ids = new Set(), cursors = new Set();
  let cursor = null;
  do {
    check();
    const page = await authenticatedRequest(`/api/notifications/inbox?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
    check();
    if (!Array.isArray(page.data)) throw new Error('Notifications could not be loaded. Please retry.');
    page.data.forEach(item => ids.add(item.id));
    cursor = page.page?.hasMore ? page.page.nextCursor : null;
    if (page.page?.hasMore && (!cursor || cursors.has(cursor))) throw new Error('Notification history could not be continued. Please retry.');
    if (cursor) cursors.add(cursor);
  } while (cursor);
  const values = [...ids], data = [];
  for (let offset = 0; offset < values.length; offset += 100) {
    check();
    const batch = values.slice(offset, offset + 100);
    const result = await updateNotificationState(userId, batch, action);
    check();
    if (!Array.isArray(result.data) || batch.some(id => !result.data.some(row => row.id === id && row.read === true && (action !== 'dismiss' || row.dismissed === true)))) {
      throw new Error('Notification update was not confirmed. Please retry.');
    }
    data.push(...result.data);
  }
  return { success: true, data };
}
