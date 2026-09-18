import { db, collection, onSnapshot, query } from './firebaseClient';
import {
  COLLECTIONS,
  fromPrice,
  fromField,
  fromBlockFarm,
  fromOperation,
  fromTicket,
  fromReport
} from './firestoreSchema';
import { ROLE_KEYS } from '../utils/authRouting';

function parsePriceTime(p) {
  if (p?.publishedAt) {
    const t = new Date(p.publishedAt).getTime();
    if (!isNaN(t)) return t;
  }
  if (p?.effectiveDate) {
    const t = new Date(`${p.effectiveDate}T00:00:00Z`).getTime();
    if (!isNaN(t)) return t;
  }
  return 0;
}

export function subscribeToDashboardData({ roleKey, user, onUpdate, onError }) {
  let isSubscribed = true;
  const unsubscribers = [];

  const state = {
    prices: [],
    currentPrice: null,
    previousPrice: null,
    fields: [],
    blockFarms: [],
    assignedBlockFarm: null,
    operations: [],
    recentOperations: [],
    cropCycles: [],
    supportTickets: [],
    auditReports: [],
    terminalDiagnostics: [],
    isLoading: true,
    error: null
  };

  const emit = () => {
    if (!isSubscribed) return;

    // Resolve assigned block farm for Farm Manager
    if (roleKey === ROLE_KEYS.FARM_MANAGER) {
      const assigned = state.blockFarms.find(
        bf =>
          (user?.blockFarmId && bf.id === user.blockFarmId) ||
          (user?.employeeId && bf.managerUserId === user.employeeId) ||
          (user?.id && bf.managerUserId === user.id)
      ) || null;
      state.assignedBlockFarm = assigned;

      // Filter fields by assigned block farm
      if (assigned) {
        state.scopedFields = state.fields.filter(f => f.blockFarmId === assigned.id);
      } else {
        state.scopedFields = state.fields;
      }

      // Filter operations for scoped fields
      const fieldIds = new Set(state.scopedFields.map(f => f.id));
      state.recentOperations = state.operations
        .filter(op => fieldIds.has(op.fieldId))
        .slice(0, 5);
    } else {
      state.scopedFields = state.fields;
      state.recentOperations = state.operations.slice(0, 5);
    }

    onUpdate({ ...state, isLoading: false });
  };

  try {
    // 1. Subscribe to SRA Prices
    const priceUnsub = onSnapshot(
      collection(db, COLLECTIONS.SRA_PRICES),
      snapshot => {
        const prices = [];
        snapshot.forEach(docSnap => {
          try {
            prices.push(fromPrice(docSnap.id, docSnap.data()));
          } catch (e) {
            console.warn('[DashboardService] Skip price doc:', docSnap.id, e.message);
          }
        });
        prices.sort((a, b) => parsePriceTime(b) - parsePriceTime(a));
        state.prices = prices;
        state.currentPrice = prices[0] || null;
        state.previousPrice = prices[1] || null;
        emit();
      },
      err => {
        console.warn('[DashboardService] Prices listener note:', err.message);
        state.error = err.message;
        emit();
      }
    );
    unsubscribers.push(priceUnsub);

    // 2. Subscribe to Block Farms
    const bfUnsub = onSnapshot(
      collection(db, COLLECTIONS.BLOCK_FARMS),
      snapshot => {
        const farms = [];
        snapshot.forEach(docSnap => {
          try {
            farms.push(fromBlockFarm(docSnap.id, docSnap.data()));
          } catch (e) {
            console.warn('[DashboardService] Skip block farm doc:', docSnap.id, e.message);
          }
        });
        state.blockFarms = farms;
        emit();
      },
      err => {
        console.warn('[DashboardService] Block farms listener note:', err.message);
        emit();
      }
    );
    unsubscribers.push(bfUnsub);

    // 3. Subscribe to Active Fields
    const fieldsUnsub = onSnapshot(
      collection(db, COLLECTIONS.FIELDS),
      snapshot => {
        const fields = [];
        snapshot.forEach(docSnap => {
          try {
            const data = docSnap.data();
            if (data.status === 'ACTIVE' || !data.status) {
              fields.push(fromField(docSnap.id, data));
            }
          } catch (e) {
            console.warn('[DashboardService] Skip field doc:', docSnap.id, e.message);
          }
        });
        state.fields = fields;
        emit();
      },
      err => {
        console.warn('[DashboardService] Fields listener note:', err.message);
        emit();
      }
    );
    unsubscribers.push(fieldsUnsub);

    // 4. Subscribe to Operation Logs (Recent activity)
    const opsUnsub = onSnapshot(
      collection(db, COLLECTIONS.OPERATION_LOGS),
      snapshot => {
        const logs = [];
        snapshot.forEach(docSnap => {
          try {
            const data = docSnap.data();
            if (data.status === 'ACTIVE' || !data.status) {
              logs.push(fromOperation(docSnap.id, data));
            }
          } catch (e) {
            console.warn('[DashboardService] Skip op log doc:', docSnap.id, e.message);
          }
        });
        // Sort descending by loggedAt
        logs.sort((a, b) => new Date(b.loggedAt || 0) - new Date(a.loggedAt || 0));
        state.operations = logs;
        emit();
      },
      err => {
        console.warn('[DashboardService] Operations listener note:', err.message);
        emit();
      }
    );
    unsubscribers.push(opsUnsub);

    // 5. Role-specific listeners for SRA Admin & Super Admin
    if (roleKey === ROLE_KEYS.SRA_ADMIN || roleKey === ROLE_KEYS.SUPER_ADMIN) {
      const auditUnsub = onSnapshot(
        collection(db, COLLECTIONS.AUDIT_REPORTS),
        snapshot => {
          const reports = [];
          snapshot.forEach(docSnap => {
            try {
              reports.push(fromReport(docSnap.id, docSnap.data()));
            } catch (e) {
              console.warn('[DashboardService] Skip audit report:', docSnap.id, e.message);
            }
          });
          state.auditReports = reports;
          emit();
        },
        () => emit()
      );
      unsubscribers.push(auditUnsub);
    }

    if (roleKey === ROLE_KEYS.SUPER_ADMIN) {
      const ticketsUnsub = onSnapshot(
        collection(db, COLLECTIONS.SUPPORT_TICKETS),
        snapshot => {
          const tickets = [];
          snapshot.forEach(docSnap => {
            try {
              tickets.push(fromTicket(docSnap.id, docSnap.data()));
            } catch (e) {
              console.warn('[DashboardService] Skip ticket doc:', docSnap.id, e.message);
            }
          });
          state.supportTickets = tickets;
          emit();
        },
        () => emit()
      );
      unsubscribers.push(ticketsUnsub);

      const diagUnsub = onSnapshot(
        collection(db, COLLECTIONS.TERMINAL_DIAGNOSTICS),
        snapshot => {
          const diags = [];
          snapshot.forEach(docSnap => diags.push({ id: docSnap.id, ...docSnap.data() }));
          state.terminalDiagnostics = diags;
          emit();
        },
        () => emit()
      );
      unsubscribers.push(diagUnsub);
    }

    // Emit initial loading state
    emit();
  } catch (err) {
    console.error('[DashboardService] Subscription error:', err);
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
