import { db, collection, onSnapshot } from './firebaseClient';
import { COLLECTIONS, fromBlockFarm, fromUser } from './firestoreSchema';
import { authenticatedRequest } from './apiClient';

/**
 * Real-time subscription to block farms, registered fields, and candidate farm managers
 */
export function subscribeToBlockFarmsData({ onUpdate, onError }) {
  let isSubscribed = true;
  const unsubscribers = [];

  const state = {
    blockFarms: [],
    fields: [],
    farmManagers: [],
    isLoading: true,
    error: null
  };
  const loaded = {
    blockFarms: false,
    fields: false,
    users: false
  };

  const emit = () => {
    if (!isSubscribed) return;
    onUpdate({
      ...state,
      isLoading: !Object.values(loaded).every(Boolean)
    });
  };

  try {
    // 1. Subscribe to Block Farms
    const farmsUnsub = onSnapshot(
      collection(db, COLLECTIONS.BLOCK_FARMS),
      snapshot => {
        const farms = [];
        snapshot.forEach(docSnap => {
          try {
            farms.push(fromBlockFarm(docSnap.id, docSnap.data()));
          } catch (e) {
            console.warn('[BlockFarmsService] Skip farm doc:', docSnap.id, e.message);
          }
        });
        state.blockFarms = farms;
        loaded.blockFarms = true;
        emit();
      },
      err => {
        console.warn('[BlockFarmsService] Block farms listener note:', err.message);
        state.error = err.message;
        loaded.blockFarms = true;
        emit();
      }
    );
    unsubscribers.push(farmsUnsub);

    // 2. Subscribe to Fields (for plot count & cultivated area)
    const fieldsUnsub = onSnapshot(
      collection(db, COLLECTIONS.FIELDS),
      snapshot => {
        const fields = [];
        snapshot.forEach(docSnap => {
          fields.push({ id: docSnap.id, ...docSnap.data() });
        });
        state.fields = fields;
        loaded.fields = true;
        emit();
      },
      err => {
        state.error = state.error || err.message;
        loaded.fields = true;
        emit();
      }
    );
    unsubscribers.push(fieldsUnsub);

    // 3. Subscribe to Users (for Farm Manager assignment)
    const usersUnsub = onSnapshot(
      collection(db, COLLECTIONS.USERS),
      snapshot => {
        const managers = [];
        snapshot.forEach(docSnap => {
          try {
            const u = fromUser(docSnap.id, docSnap.data());
            if (u.canonicalRole === 'FARM_MANAGER' || u.role === 'Farm Manager') {
              managers.push(u);
            }
          } catch (e) {}
        });
        state.farmManagers = managers;
        loaded.users = true;
        emit();
      },
      err => {
        state.error = state.error || err.message;
        loaded.users = true;
        emit();
      }
    );
    unsubscribers.push(usersUnsub);

    emit();
  } catch (err) {
    console.error('[BlockFarmsService] Subscription error:', err);
    if (onError) onError(err);
  }

  return () => {
    isSubscribed = false;
    unsubscribers.forEach(unsub => {
      try {
        if (typeof unsub === 'function') unsub();
      } catch (e) {}
    });
  };
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
