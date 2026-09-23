import { db, collection, onSnapshot } from './firebaseClient';
import { COLLECTIONS, fromPrice, fromTicket, fromReport } from './firestoreSchema';
import { ROLE_KEYS } from '../utils/authRouting';
import { subscribeToFieldsData } from './fieldsService';
import { subscribeToOperationsData } from './operationReadService';

function parsePriceTime(price) {
  const value = price?.publishedAt || (price?.effectiveDate ? `${price.effectiveDate}T00:00:00Z` : '');
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export function subscribeToDashboardData({ roleKey, user, onUpdate, onError }) {
  let isSubscribed = true;
  const unsubscribers = [];
  const state = {
    prices: [], currentPrice: null, previousPrice: null,
    fields: [], scopedFields: [], blockFarms: [], assignedBlockFarm: null,
    operations: [], recentOperations: [], cropCycles: [],
    supportTickets: [], auditReports: [], terminalDiagnostics: [],
    isLoading: true, error: null
  };

  const emit = () => {
    if (!isSubscribed) return;
    state.scopedFields = state.fields;
    state.assignedBlockFarm = roleKey === ROLE_KEYS.FARM_MANAGER
      ? state.blockFarms.find(farm => farm.id === user?.blockFarmId) || state.blockFarms[0] || null
      : null;
    state.recentOperations = state.operations.slice(0, 5);
    onUpdate({ ...state, isLoading: false });
  };
  const fail = error => {
    state.error = error.message;
    emit();
    if (onError) onError(error);
  };

  if (roleKey !== ROLE_KEYS.SUPER_ADMIN) {
    unsubscribers.push(onSnapshot(collection(db, COLLECTIONS.SRA_PRICES), snapshot => {
      const prices = snapshot.docs.map(document => fromPrice(document.id, document.data()))
        .sort((left, right) => parsePriceTime(right) - parsePriceTime(left));
      state.prices = prices;
      state.currentPrice = prices[0] || null;
      state.previousPrice = prices[1] || null;
      emit();
    }, fail));

    unsubscribers.push(subscribeToFieldsData({
      user,
      onUpdate: data => {
        state.fields = data.fields || [];
        state.blockFarms = data.blockFarms || [];
        state.cropCycles = data.cropCycles || [];
        emit();
      },
      onError: fail
    }));

    unsubscribers.push(subscribeToOperationsData({
      user,
      onUpdate: data => {
        state.operations = data.operations || [];
        emit();
      },
      onError: fail
    }));
  }

  if (roleKey === ROLE_KEYS.SRA_ADMIN) {
    unsubscribers.push(onSnapshot(collection(db, COLLECTIONS.AUDIT_REPORTS), snapshot => {
      state.auditReports = snapshot.docs.map(document => fromReport(document.id, document.data()));
      emit();
    }, fail));
  }

  if (roleKey === ROLE_KEYS.SUPER_ADMIN) {
    unsubscribers.push(onSnapshot(collection(db, COLLECTIONS.SUPPORT_TICKETS), snapshot => {
      state.supportTickets = snapshot.docs.map(document => fromTicket(document.id, document.data()));
      emit();
    }, fail));
    unsubscribers.push(onSnapshot(collection(db, COLLECTIONS.TERMINAL_DIAGNOSTICS), snapshot => {
      state.terminalDiagnostics = snapshot.docs.map(document => ({ id: document.id, ...document.data() }));
      emit();
    }, fail));
  }

  emit();
  return () => {
    isSubscribed = false;
    unsubscribers.forEach(unsubscribe => {
      if (typeof unsubscribe === 'function') unsubscribe();
    });
  };
}
