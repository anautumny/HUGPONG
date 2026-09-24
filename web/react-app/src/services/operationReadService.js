import { fromOperation } from './firestoreSchema';
import { subscribeToAuthenticatedResource } from './apiClient';
import { sortOperationsNewestFirst } from '../utils/recordOrdering';

function normalizedRole(user) {
  return String(user?.canonicalRole || user?.role || user?.roleKey || '')
    .replace(/[\s-]+/g, '_')
    .toUpperCase();
}

export function subscribeToOperationsData({ user, onUpdate, onError, status = '' }) {
  const role = normalizedRole(user);
  if (role === 'SUPER_ADMIN') {
    onUpdate({ operations: [], isLoading: false, error: null });
    return () => {};
  }

  const statusQuery = ['ACTIVE', 'ARCHIVED'].includes(String(status).toUpperCase())
    ? `?status=${String(status).toUpperCase()}`
    : '';
  return subscribeToAuthenticatedResource(`/api/logs${statusQuery}`, {
    onData: response => {
      const operations = sortOperationsNewestFirst((response.data || []).map(item => fromOperation(item.id, item)));
      onUpdate({ operations, isLoading: false, error: null });
    },
    onError: error => {
      if (onError) onError(error);
    }
  });
}
