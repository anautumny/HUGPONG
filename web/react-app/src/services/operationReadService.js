import { db, collection, onSnapshot, query, where } from './firebaseClient';
import { COLLECTIONS, fromOperation } from './firestoreSchema';

function normalizedRole(user) {
  return String(user?.canonicalRole || user?.role || user?.roleKey || '')
    .replace(/[\s-]+/g, '_')
    .toUpperCase();
}

function parseOperations(snapshot) {
  const operations = [];
  snapshot.forEach(documentSnapshot => {
    try {
      operations.push(fromOperation(documentSnapshot.id, documentSnapshot.data()));
    } catch (error) {
      console.warn('[OperationsService] Skip op doc:', documentSnapshot.id, error.message);
    }
  });
  return operations;
}

export function subscribeToOperationsData({ user, onUpdate, onError }) {
  let isSubscribed = true;
  const unsubscribers = [];
  const operationsByField = new Map();

  const emit = () => {
    if (!isSubscribed) return;
    const operations = Array.from(operationsByField.values()).flat();
    operations.sort((left, right) => new Date(right.performedOn || right.createdAt || 0)
      - new Date(left.performedOn || left.createdAt || 0));
    onUpdate({ operations, isLoading: false, error: null });
  };

  const reportError = error => {
    console.warn('[OperationsService] Ops listener note:', error.message);
    if (isSubscribed) onUpdate({ operations: [], isLoading: false, error: error.message });
    if (onError) onError(error);
  };

  const role = normalizedRole(user);
  if (role === 'SUPER_ADMIN') {
    onUpdate({ operations: [], isLoading: false, error: null });
    return () => { isSubscribed = false; };
  }

  if (role === 'SRA_ADMIN' || role === 'ADMIN') {
    const unsubscribe = onSnapshot(
      collection(db, COLLECTIONS.OPERATION_LOGS),
      snapshot => {
        operationsByField.set('__district__', parseOperations(snapshot));
        emit();
      },
      reportError
    );
    unsubscribers.push(unsubscribe);
  } else {
    const userId = String(user?.employeeId || user?.id || user?.userId || '').trim();
    const fieldQuery = role === 'FARM_MANAGER' || role === 'MANAGER'
      ? query(collection(db, COLLECTIONS.FIELDS), where('blockFarmId', '==', String(user?.blockFarmId || '').trim()))
      : query(collection(db, COLLECTIONS.FIELDS), where('memberUserId', '==', userId));
    let operationUnsubscribers = [];
    const unsubscribeFields = onSnapshot(fieldQuery, fieldSnapshot => {
      operationUnsubscribers.forEach(unsubscribe => unsubscribe());
      operationUnsubscribers = [];
      operationsByField.clear();
      if (fieldSnapshot.empty) {
        emit();
        return;
      }
      fieldSnapshot.forEach(fieldDocument => {
        const fieldId = fieldDocument.id;
        const unsubscribe = onSnapshot(
          query(collection(db, COLLECTIONS.OPERATION_LOGS), where('fieldId', '==', fieldId)),
          snapshot => {
            operationsByField.set(fieldId, parseOperations(snapshot));
            emit();
          },
          reportError
        );
        operationUnsubscribers.push(unsubscribe);
      });
    }, reportError);
    unsubscribers.push(unsubscribeFields, () => operationUnsubscribers.forEach(unsubscribe => unsubscribe()));
  }

  return () => {
    isSubscribed = false;
    unsubscribers.forEach(unsubscribe => {
      if (typeof unsubscribe === 'function') unsubscribe();
    });
  };
}
