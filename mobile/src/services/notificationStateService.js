import { authenticatedRequest } from './authService';
import { getItem, saveItem, STORAGE_KEYS } from './storageService';

// The account-scoped cache is a replica plus pending offline intents. Only a
// successful API acknowledgement removes an intent; logout does not erase it.
export function createNotificationStateClient({ userId, isCurrent, request, readCache, writeCache, onChange, onPendingChange }) {
  let state = { read: [], dismissed: [], pendingRead: [], pendingDismissed: [] };
  let chain = Promise.resolve();
  let cacheChain = Promise.resolve();
  let activeRefresh = null;
  let lastRefresh = '', refreshedAt = 0;
  const unique = values => [...new Set(values)];
  const publish = () => {
    if (!isCurrent()) return;
    onChange?.({ read: [...state.read], dismissed: [...state.dismissed] });
    onPendingChange?.(unique([...state.pendingRead, ...state.pendingDismissed]).length);
  };
  const persist = () => {
    const snapshot = Object.fromEntries(Object.entries(state).map(([key, ids]) => [key, [...ids]]));
    const next = cacheChain.then(() => writeCache(snapshot));
    cacheChain = next.catch(() => {});
    return next;
  };
  const serialize = work => {
    const next = chain.then(work);
    chain = next.catch(() => {});
    return next;
  };
  const ready = serialize(async () => {
    const cached = await readCache();
    for (const key of Object.keys(state)) state[key] = Array.isArray(cached?.[key]) ? unique(cached[key].filter(id => typeof id === 'string')) : [];
    publish();
  });
  async function flush() {
    for (const [key, action] of [['pendingRead', 'read'], ['pendingDismissed', 'dismiss']]) {
      while (state[key].length && isCurrent()) {
        const ids = state[key].slice(0, 100);
        const result = await request('/api/notifications/state', { ids, action, expectedUserId: userId });
        if (!result.success || !Array.isArray(result.data) || ids.some(id => !result.data.some(row => row.id === id && row.read === true && (action !== 'dismiss' || row.dismissed === true)))) {
          throw new Error('Notification update was not confirmed.');
        }
        // Never turn a dismissal back into unread when an older read arrives.
        state[key] = state[key].filter(id => !ids.includes(id));
        merge(result.data);
        await persist();
        publish();
      }
    }
  }
  function merge(rows) {
    state.read = unique([...state.read, ...rows.filter(row => row.read || row.dismissed).map(row => row.id)]);
    state.dismissed = unique([...state.dismissed, ...rows.filter(row => row.dismissed).map(row => row.id)]);
  }
  return {
    ready,
    mark(ids, action) {
      return ready.then(async () => {
        if (!isCurrent()) return;
        const values = unique(ids.filter(id => typeof id === 'string' && id));
        state.read = unique([...state.read, ...values]);
        if (action === 'dismiss') state.dismissed = unique([...state.dismissed, ...values]);
        const key = action === 'dismiss' ? 'pendingDismissed' : 'pendingRead';
        state[key] = unique([...state[key], ...values]);
        publish();
        if (await persist() === false) throw new Error('Notification changes could not be saved on this device.');
        serialize(flush).catch(() => { /* Pending intents retry on refresh/reconnect. */ });
      });
    },
    refresh(ids, { force = false } = {}) {
      if (activeRefresh) return activeRefresh;
      activeRefresh = serialize(async () => {
        if (!isCurrent()) return;
        const fingerprint = JSON.stringify([...new Set(ids)].sort());
        if (!force && fingerprint === lastRefresh && Date.now() - refreshedAt < 15000 && !state.pendingRead.length && !state.pendingDismissed.length) return;
        try {
          await flush();
          for (let offset = 0; offset < ids.length && isCurrent(); offset += 100) {
            const result = await request('/api/notifications/state/query', { ids: ids.slice(offset, offset + 100), expectedUserId: userId });
            if (!result.success || !Array.isArray(result.data)) throw new Error('Notification state could not be retrieved.');
            merge(result.data);
          }
          await persist();
          lastRefresh = fingerprint; refreshedAt = Date.now();
          publish();
        } catch { /* Keep the cached projection and pending offline intents. */ }
      }).finally(() => { activeRefresh = null; });
      return activeRefresh;
    },
  };
}

export function createAccountNotificationState(userId, isCurrent, onChange, onPendingChange) {
  const key = `${STORAGE_KEYS.NOTIFICATION_STATE}:${userId}`;
  return createNotificationStateClient({
    userId, isCurrent, onChange, onPendingChange,
    request: (path, body) => authenticatedRequest(path, { method: 'POST', body }),
    readCache: () => getItem(key, null),
    writeCache: value => saveItem(key, value),
  });
}
