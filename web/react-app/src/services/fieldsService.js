import { db, collection, onSnapshot } from './firebaseClient';
import {
  COLLECTIONS,
  fromField,
  fromBlockFarm,
  fromUser
} from './firestoreSchema';
import { authenticatedRequest } from './apiClient';

/**
 * Real-time subscription to fields, parent block farms, and member users
 */
export function subscribeToFieldsData({ user, onUpdate, onError }) {
  let isSubscribed = true;
  const unsubscribers = [];

  const state = {
    fields: [],
    cropCycles: [],
    blockFarms: [],
    memberUsers: [],
    isLoading: true,
    error: null
  };
  const loaded = {
    fields: false,
    cropCycles: false,
    blockFarms: false,
    memberUsers: false
  };

  const emit = () => {
    if (!isSubscribed) return;

    // Map fields with crop cycle and member details
    const cycleMap = new Map(state.cropCycles.map(c => [c.id || c.fieldId, c]));
    const memberMap = new Map();
    state.memberUsers.forEach(u => {
      if (u.id) memberMap.set(u.id, u);
      if (u.employeeId) memberMap.set(u.employeeId, u);
    });
    const farmMap = new Map(state.blockFarms.map(f => [f.id, f]));

    const userId = String(user?.employeeId || user?.id || user?.userId || '').trim();
    const normalizedRole = String(user?.canonicalRole || user?.role || user?.roleKey || '').replace(/[\s-]+/g, '_').toUpperCase();
    const managerFarmIds = new Set(
      state.blockFarms
        .filter(farm => farm.managerUserId === userId)
        .map(farm => farm.id)
    );
    const scopedFields = normalizedRole === 'FARM_MANAGER' || normalizedRole === 'MANAGER'
      ? state.fields.filter(field => managerFarmIds.has(field.blockFarmId))
      : normalizedRole === 'MEMBER_FARMER' || normalizedRole === 'MEMBER'
        ? state.fields.filter(field => field.memberUserId === userId)
        : state.fields;

    const enrichedFields = scopedFields.map(f => {
      const cycle = cycleMap.get(f.currentCycleId) || cycleMap.get(f.id) || null;
      const member = memberMap.get(f.memberUserId) || null;
      const farm = farmMap.get(f.blockFarmId) || null;

      return {
        ...f,
        stageNumber: cycle?.currentStageNumber || f.stageNumber || 1,
        cropCycle: cycle,
        memberName: member?.displayName || member?.name || f.memberUserId || 'Unassigned',
        memberPhone: member?.phone || member?.contact || '',
        blockFarmName: farm?.name || f.blockFarmId || 'Unknown Farm'
      };
    });

    onUpdate({
      ...state,
      fields: enrichedFields,
      isLoading: !Object.values(loaded).every(Boolean)
    });
  };

  try {
    // 1. Subscribe to Fields
    const fieldsUnsub = onSnapshot(
      collection(db, COLLECTIONS.FIELDS),
      snapshot => {
        const fields = [];
        snapshot.forEach(docSnap => {
          try {
            fields.push(fromField(docSnap.id, docSnap.data()));
          } catch (e) {
            console.warn('[FieldsService] Skip field doc:', docSnap.id, e.message);
          }
        });
        state.fields = fields;
        loaded.fields = true;
        emit();
      },
      err => {
        console.warn('[FieldsService] Fields listener note:', err.message);
        state.error = err.message;
        loaded.fields = true;
        emit();
      }
    );
    unsubscribers.push(fieldsUnsub);

    // 2. Subscribe to Crop Cycles
    const cyclesUnsub = onSnapshot(
      collection(db, COLLECTIONS.CROP_CYCLES),
      snapshot => {
        const cycles = [];
        snapshot.forEach(docSnap => {
          cycles.push({ id: docSnap.id, ...docSnap.data() });
        });
        state.cropCycles = cycles;
        loaded.cropCycles = true;
        emit();
      },
      err => {
        state.error = state.error || err.message;
        loaded.cropCycles = true;
        emit();
      }
    );
    unsubscribers.push(cyclesUnsub);

    // 3. Subscribe to Block Farms
    const farmsUnsub = onSnapshot(
      collection(db, COLLECTIONS.BLOCK_FARMS),
      snapshot => {
        const farms = [];
        snapshot.forEach(docSnap => {
          try {
            farms.push(fromBlockFarm(docSnap.id, docSnap.data()));
          } catch (e) {}
        });
        state.blockFarms = farms;
        loaded.blockFarms = true;
        emit();
      },
      err => {
        state.error = state.error || err.message;
        loaded.blockFarms = true;
        emit();
      }
    );
    unsubscribers.push(farmsUnsub);

    // 4. Subscribe to Users (Member Farmers for assignment)
    const usersUnsub = onSnapshot(
      collection(db, COLLECTIONS.USERS),
      snapshot => {
        const users = [];
        snapshot.forEach(docSnap => {
          try {
            users.push(fromUser(docSnap.id, docSnap.data()));
          } catch (e) {}
        });
        state.memberUsers = users.filter(u => u.canonicalRole === 'MEMBER_FARMER');
        loaded.memberUsers = true;
        emit();
      },
      err => {
        state.error = state.error || err.message;
        loaded.memberUsers = true;
        emit();
      }
    );
    unsubscribers.push(usersUnsub);

    emit();
  } catch (err) {
    console.error('[FieldsService] Subscription error:', err);
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
 * Server-authoritative mutations via Express API
 */
export async function createField(payload) {
  return authenticatedRequest('/api/fields', {
    method: 'POST',
    body: payload
  });
}

export async function updateField(fieldId, payload) {
  return authenticatedRequest(`/api/fields/${encodeURIComponent(fieldId)}`, {
    method: 'PATCH',
    body: payload
  });
}

export async function archiveField(fieldId) {
  return authenticatedRequest(`/api/fields/${encodeURIComponent(fieldId)}/archive`, {
    method: 'POST'
  });
}
