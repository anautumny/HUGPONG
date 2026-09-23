import { db, collection, doc, onSnapshot, query, where } from './firebaseClient';
import { COLLECTIONS, fromField, fromBlockFarm, fromUser } from './firestoreSchema';
import { authenticatedRequest } from './apiClient';

function normalizedRole(user) {
  return String(user?.canonicalRole || user?.role || user?.roleKey || '')
    .replace(/[\s-]+/g, '_')
    .toUpperCase();
}

export function subscribeToFieldsData({ user, onUpdate, onError }) {
  let isSubscribed = true;
  const unsubscribers = [];
  let cycleUnsubscribers = [];
  const role = normalizedRole(user);
  const userId = String(user?.employeeId || user?.id || user?.userId || '').trim();
  const state = { fields: [], cropCycles: [], blockFarms: [], memberUsers: [], error: null };
  const loaded = { fields: false, cropCycles: false, blockFarms: false, memberUsers: false };

  const emit = () => {
    if (!isSubscribed) return;
    const cycleMap = new Map(state.cropCycles.map(cycle => [cycle.id, cycle]));
    const memberMap = new Map();
    state.memberUsers.forEach(member => {
      if (member.id) memberMap.set(member.id, member);
      if (member.employeeId) memberMap.set(member.employeeId, member);
    });
    const farmMap = new Map(state.blockFarms.map(farm => [farm.id, farm]));
    const fields = state.fields.map(field => {
      const cycle = cycleMap.get(field.currentCycleId) || null;
      const member = memberMap.get(field.memberUserId) || null;
      const farm = farmMap.get(field.blockFarmId) || null;
      return {
        ...field,
        stageNumber: cycle?.currentStageNumber ?? null,
        cropCycle: cycle,
        memberName: member?.displayName || member?.name || field.memberUserId || 'Unassigned',
        memberPhone: member?.phone || member?.contact || '',
        blockFarmName: farm?.name || field.blockFarmId || 'Unknown Farm'
      };
    });
    onUpdate({ ...state, fields, isLoading: !Object.values(loaded).every(Boolean) });
  };

  const noteError = error => {
    state.error = state.error || error.message;
    if (onError) onError(error);
    emit();
  };

  if (role === 'SUPER_ADMIN') {
    Object.keys(loaded).forEach(key => { loaded[key] = true; });
    emit();
    return () => { isSubscribed = false; };
  }

  const rebuildScopedCycleListeners = fieldIds => {
    cycleUnsubscribers.forEach(unsubscribe => unsubscribe());
    cycleUnsubscribers = [];
    state.cropCycles = [];
    if (!fieldIds.length) {
      loaded.cropCycles = true;
      emit();
      return;
    }
    const cyclesByField = new Map();
    fieldIds.forEach(fieldId => {
      const unsubscribe = onSnapshot(
        query(collection(db, COLLECTIONS.CROP_CYCLES), where('fieldId', '==', fieldId)),
        snapshot => {
          cyclesByField.set(fieldId, snapshot.docs.map(document => ({ id: document.id, ...document.data() })));
          state.cropCycles = Array.from(cyclesByField.values()).flat();
          loaded.cropCycles = true;
          emit();
        },
        error => {
          loaded.cropCycles = true;
          noteError(error);
        }
      );
      cycleUnsubscribers.push(unsubscribe);
    });
  };

  const fieldsReference = role === 'FARM_MANAGER' || role === 'MANAGER'
    ? query(collection(db, COLLECTIONS.FIELDS), where('blockFarmId', '==', String(user?.blockFarmId || '').trim()))
    : role === 'MEMBER_FARMER' || role === 'MEMBER'
      ? query(collection(db, COLLECTIONS.FIELDS), where('memberUserId', '==', userId))
      : collection(db, COLLECTIONS.FIELDS);
  unsubscribers.push(onSnapshot(fieldsReference, snapshot => {
    state.fields = snapshot.docs.map(document => fromField(document.id, document.data()));
    loaded.fields = true;
    if (role !== 'SRA_ADMIN' && role !== 'ADMIN') rebuildScopedCycleListeners(state.fields.map(field => field.id));
    emit();
  }, error => {
    loaded.fields = true;
    noteError(error);
  }));

  if (role === 'SRA_ADMIN' || role === 'ADMIN') {
    unsubscribers.push(onSnapshot(collection(db, COLLECTIONS.CROP_CYCLES), snapshot => {
      state.cropCycles = snapshot.docs.map(document => ({ id: document.id, ...document.data() }));
      loaded.cropCycles = true;
      emit();
    }, error => {
      loaded.cropCycles = true;
      noteError(error);
    }));
  }

  const farmsReference = role === 'FARM_MANAGER' || role === 'MANAGER'
    ? doc(db, COLLECTIONS.BLOCK_FARMS, String(user?.blockFarmId || 'UNASSIGNED'))
    : role === 'MEMBER_FARMER' || role === 'MEMBER'
      ? doc(db, COLLECTIONS.BLOCK_FARMS, String(user?.blockFarmId || 'UNASSIGNED'))
      : collection(db, COLLECTIONS.BLOCK_FARMS);
  unsubscribers.push(onSnapshot(farmsReference, snapshot => {
    state.blockFarms = snapshot.docs
      ? snapshot.docs.map(document => fromBlockFarm(document.id, document.data()))
      : snapshot.exists() ? [fromBlockFarm(snapshot.id, snapshot.data())] : [];
    loaded.blockFarms = true;
    emit();
  }, error => {
    loaded.blockFarms = true;
    noteError(error);
  }));

  authenticatedRequest('/api/users')
    .then(result => {
      if (!isSubscribed) return;
      state.memberUsers = (result.data || [])
        .map(member => fromUser(member.id || member.employeeId, member))
        .filter(member => member.canonicalRole === 'MEMBER_FARMER');
    })
    .catch(noteError)
    .finally(() => {
      loaded.memberUsers = true;
      emit();
    });

  emit();
  return () => {
    isSubscribed = false;
    [...unsubscribers, ...cycleUnsubscribers].forEach(unsubscribe => {
      if (typeof unsubscribe === 'function') unsubscribe();
    });
  };
}

export async function createField(payload) {
  return authenticatedRequest('/api/fields', { method: 'POST', body: payload });
}

export async function updateField(fieldId, payload) {
  return authenticatedRequest(`/api/fields/${encodeURIComponent(fieldId)}`, { method: 'PATCH', body: payload });
}

export async function archiveField(fieldId) {
  return authenticatedRequest(`/api/fields/${encodeURIComponent(fieldId)}/archive`, { method: 'POST' });
}
