import {
  fromBlockFarm,
  fromField,
  fromOperation,
  fromPrice,
  fromReport,
  fromTicket
} from './firestoreSchema';
import {
  authenticatedRead,
  subscribeToAuthenticatedLoader,
  settleResourceReads
} from './apiClient';
import { ROLE_KEYS } from '../utils/authRouting';
import {
  sortCropYearsNewestFirst,
  sortNewestFirst,
  sortOperationsNewestFirst,
  uniqueRecordsById
} from '../utils/recordOrdering';

const emptyDashboard = () => ({
  prices: [], currentPrice: null, previousPrice: null,
  fields: [], scopedFields: [], blockFarms: [], assignedBlockFarm: null,
  operations: [], recentOperations: [], cropCycles: [],
  supportTickets: [], auditReports: [], terminalDiagnostics: [],
  activityMonitoringError: null, systemDiagnosticsError: null
});

function terminalDiagnostic(data) {
  return {
    id: data.id,
    deviceId: data.deviceId || data.id,
    userId: data.userId || '',
    model: data.model || 'Android Terminal',
    os: data.os || 'Android',
    appVersion: data.appVersion || 'v1.0.0',
    battery: data.battery || '—',
    cachedLogs: Number(data.cachedLogs || 0),
    status: data.status || 'SYNCED',
    updatedAt: data.updatedAt || null
  };
}

async function dashboardRead(label, path, force) {
  try {
    return await authenticatedRead(path, { force });
  } catch (error) {
    const missingIndex = /failed[_ -]?precondition|requires an index/i.test(String(error?.message || ''));
    const detail = error?.isNetworkError
      ? 'The HUGPONG server could not be reached.'
      : error?.status === 401
        ? 'Your session has expired. Please sign in again.'
        : missingIndex
          ? 'A required database index is not available yet.'
          : 'The server rejected the request.';
    const wrapped = new Error(`${label} could not be loaded. ${detail}`);
    wrapped.cause = error;
    wrapped.status = error.status;
    wrapped.code = error.code;
    wrapped.isMissingIndex = missingIndex;
    wrapped.retryAfterMs = error.retryAfterMs;
    throw wrapped;
  }
}

async function readRecentOperations(force) {
  try {
    return await dashboardRead('Recent operations', '/api/logs?limit=5', force);
  } catch (error) {
    if (!error.isMissingIndex) throw error;
    console.warn('[Dashboard] Recent-operation index unavailable; retrying the authorization-scoped compatibility read.');
    return dashboardRead('Recent operations', '/api/logs', true);
  }
}

export function subscribeToDashboardData({ roleKey, user, onUpdate, onError }) {
  const previous = new Map();
  return subscribeToAuthenticatedLoader(async ({ force, retryOnly }) => {
    if (roleKey === ROLE_KEYS.SUPER_ADMIN) {
      const { values: [ticketsResult, diagnosticsState, telemetryState], refreshError, errors } = await settleResourceReads([
        () => dashboardRead('Support tickets', '/api/tickets', force),
        () => dashboardRead('System diagnostics', '/api/system-diagnostics', force),
        () => dashboardRead('Terminal diagnostics', '/api/terminal-diagnostics', force)
      ], previous, { retryOnly });
      return {
        ...emptyDashboard(),
        refreshError,
        supportTickets: sortNewestFirst(
          (ticketsResult.data || []).map(ticket => fromTicket(ticket.id, ticket)),
          ['createdAt']
        ),
        terminalDiagnostics: telemetryState.data?.subjects || [],
        systemDiagnostics: Array.isArray(diagnosticsState.data) ? {} : diagnosticsState.data || {},
        activityMonitoringError: errors[2]?.message || null,
        systemDiagnosticsError: errors[1]?.message || null
      };
    }

    const includeAudits = roleKey === ROLE_KEYS.SRA_ADMIN;
    const includeActivityMonitoring = roleKey === ROLE_KEYS.FARM_MANAGER;
    const { values: [pricesResult, fieldsResult, farmsResult, cyclesResult, logsResult, auditsResult, activityResult], refreshError, errors } = await settleResourceReads([
      () => dashboardRead('Published prices', '/api/prices?limit=2', force),
      () => dashboardRead('Fields', '/api/fields', force),
      () => dashboardRead('Block farms', '/api/block-farms', force),
      () => dashboardRead('Crop Year Cycles', '/api/crop-cycles', force),
      () => readRecentOperations(force),
      () => includeAudits
        ? dashboardRead('Audit reports', '/api/audit-reports', force)
        : Promise.resolve({ data: [] }),
      () => includeActivityMonitoring
        ? dashboardRead('Member activity', '/api/terminal-diagnostics', force)
        : Promise.resolve({ data: { subjects: [] } })
    ], previous, { retryOnly, groups: [[1, 2, 3, 4]] });

    const prices = sortNewestFirst(
      (pricesResult.data || []).map(price => fromPrice(price.id, price)),
      ['effectiveDate'], ['publishedAt']
    );
    const fields = (fieldsResult.data || [])
      .map(field => fromField(field.id, field))
      .sort((left, right) => String(left.id).localeCompare(String(right.id)));
    const blockFarms = uniqueRecordsById((farmsResult.data || [])
      .map(farm => fromBlockFarm(farm.id, farm)))
      .sort((left, right) => String(left.id).localeCompare(String(right.id)));
    const operations = sortOperationsNewestFirst(
      (logsResult.data || []).map(operation => fromOperation(operation.id, operation))
    );
    const auditReports = sortNewestFirst(
      (auditsResult.data || []).map(report => fromReport(report.id, report)),
      ['compiledAt', 'createdAt']
    );
    const assignedBlockFarm = roleKey === ROLE_KEYS.FARM_MANAGER
      ? blockFarms.find(farm => farm.id === user?.blockFarmId) || blockFarms[0] || null
      : null;

    return {
      ...emptyDashboard(),
      prices,
      refreshError,
      currentPrice: prices[0] || null,
      previousPrice: prices[1] || null,
      fields,
      scopedFields: fields,
      blockFarms,
      assignedBlockFarm,
      cropCycles: sortCropYearsNewestFirst(cyclesResult.data || []),
      operations,
      recentOperations: operations.slice(0, 5),
      auditReports,
      terminalDiagnostics: activityResult.data?.subjects || [],
      activityMonitoringError: errors[6]?.message || null
    };
  }, {
    onData: data => onUpdate({ ...data, isLoading: false, error: data.refreshError?.message || null }),
    onError: error => {
      if (onError) onError(error);
    },
    resources: roleKey === ROLE_KEYS.SUPER_ADMIN
      ? ['tickets', 'terminal-diagnostics']
      : roleKey === ROLE_KEYS.FARM_MANAGER
        ? ['prices', 'fields', 'block-farms', 'crop-cycles', 'logs', 'terminal-diagnostics']
        : ['prices', 'fields', 'block-farms', 'crop-cycles', 'logs', 'audit-reports']
  });
}
