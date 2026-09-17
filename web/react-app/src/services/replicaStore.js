import { subscribeCollection } from './firebaseClient';

const EMPTY_REPLICA = Object.freeze({
  blockFarms: [], fields: [], archivedFields: [], cropCycles: [], users: [], logs: [], priceHistory: [],
  supportTickets: [], auditReports: [], systemHistory: [], terminalDiagnostics: []
});
const listeners = new Set();
let replica = { ...EMPTY_REPLICA };
let activeUserId = '';
let unsubscribers = [];

const cacheKey = userId => `hugpong_react_replica_v1:${userId}`;

function readCache(userId) {
  try {
    const value = JSON.parse(localStorage.getItem(cacheKey(userId)) || 'null');
    if (!value || typeof value !== 'object') return { ...EMPTY_REPLICA };
    return Object.fromEntries(Object.keys(EMPTY_REPLICA).map(key => [key, Array.isArray(value[key]) ? value[key] : []]));
  } catch (error) { return { ...EMPTY_REPLICA }; }
}

function publish(next) {
  replica = next;
  if (activeUserId) localStorage.setItem(cacheKey(activeUserId), JSON.stringify(replica));
  listeners.forEach(listener => listener(replica));
}

function replace(key, records) {
  if (key === 'fields') {
    publish({ ...replica, fields: records.filter(item => item.status === 'ACTIVE'), archivedFields: records.filter(item => item.status === 'ARCHIVED') });
    return;
  }
  const sorted = key === 'priceHistory'
    ? [...records].sort((a, b) => String(b.effectiveDate || '').localeCompare(String(a.effectiveDate || '')))
    : key === 'systemHistory'
      ? [...records].sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
      : records;
  publish({ ...replica, [key]: sorted });
}

const COLLECTION_MAP = Object.freeze({
  block_farms: 'blockFarms', fields: 'fields', crop_cycles: 'cropCycles', operation_logs: 'logs',
  sra_prices: 'priceHistory', support_tickets: 'supportTickets', users: 'users', audit_reports: 'auditReports',
  audit_logs: 'systemHistory', terminal_diagnostics: 'terminalDiagnostics'
});

export function startReplica(session) {
  const userId = String(session?.user?.employeeId || session?.user?.id || '');
  if (!userId || session?.roleKey === 'member') return () => undefined;
  if (activeUserId === userId && unsubscribers.length) return stopReplica;
  stopReplica();
  activeUserId = userId;
  replica = readCache(userId);
  listeners.forEach(listener => listener(replica));
  unsubscribers = Object.entries(COLLECTION_MAP).map(([collectionName, key]) => subscribeCollection(
    collectionName, records => replace(key, records),
    error => console.warn(`[HUGPONG] ${collectionName} read subscription:`, error.message)
  ));
  return stopReplica;
}

export function stopReplica() {
  unsubscribers.forEach(unsubscribe => unsubscribe());
  unsubscribers = [];
  activeUserId = '';
}

export function clearReplicaCache(userId) {
  const targetUserId = String(userId || activeUserId || '').trim();
  if (targetUserId) localStorage.removeItem(cacheKey(targetUserId));
  if (!targetUserId || targetUserId === activeUserId) publish({ ...EMPTY_REPLICA });
}

export const getReplica = () => replica;
export function subscribeReplica(listener) { listeners.add(listener); return () => listeners.delete(listener); }
