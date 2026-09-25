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
  subscribeToAuthenticatedLoader
} from './apiClient';
import { ROLE_KEYS } from '../utils/authRouting';
import {
  sortCropYearsNewestFirst,
  sortNewestFirst,
  sortOperationsNewestFirst
} from '../utils/recordOrdering';

const emptyDashboard = () => ({
  prices: [], currentPrice: null, previousPrice: null,
  fields: [], scopedFields: [], blockFarms: [], assignedBlockFarm: null,
  operations: [], recentOperations: [], cropCycles: [],
  supportTickets: [], auditReports: [], terminalDiagnostics: []
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

export function subscribeToDashboardData({ roleKey, user, onUpdate, onError }) {
  return subscribeToAuthenticatedLoader(async ({ force }) => {
    if (roleKey === ROLE_KEYS.SUPER_ADMIN) {
      const [ticketsResult, diagnosticsResult] = await Promise.all([
        authenticatedRead('/api/tickets', { force }),
        authenticatedRead('/api/terminal-diagnostics', { force })
      ]);
      return {
        ...emptyDashboard(),
        supportTickets: sortNewestFirst(
          (ticketsResult.data || []).map(ticket => fromTicket(ticket.id, ticket)),
          ['createdAt']
        ),
        terminalDiagnostics: sortNewestFirst(
          (diagnosticsResult.data || []).map(terminalDiagnostic),
          ['updatedAt']
        )
      };
    }

    const includeAudits = roleKey === ROLE_KEYS.SRA_ADMIN;
    const [pricesResult, fieldsResult, farmsResult, cyclesResult, logsResult, auditsResult] = await Promise.all([
      authenticatedRead('/api/prices', { force }),
      authenticatedRead('/api/fields', { force }),
      authenticatedRead('/api/block-farms', { force }),
      authenticatedRead('/api/crop-cycles', { force }),
      authenticatedRead('/api/logs?limit=5', { force }),
      includeAudits
        ? authenticatedRead('/api/audit-reports', { force })
        : Promise.resolve({ data: [] })
    ]);

    const prices = sortNewestFirst(
      (pricesResult.data || []).map(price => fromPrice(price.id, price)),
      ['effectiveDate']
    );
    const fields = (fieldsResult.data || [])
      .map(field => fromField(field.id, field))
      .sort((left, right) => String(left.id).localeCompare(String(right.id)));
    const blockFarms = (farmsResult.data || [])
      .map(farm => fromBlockFarm(farm.id, farm))
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
      currentPrice: prices[0] || null,
      previousPrice: prices[1] || null,
      fields,
      scopedFields: fields,
      blockFarms,
      assignedBlockFarm,
      cropCycles: sortCropYearsNewestFirst(cyclesResult.data || []),
      operations,
      recentOperations: operations.slice(0, 5),
      auditReports
    };
  }, {
    onData: data => onUpdate({ ...data, isLoading: false, error: null }),
    onError: error => {
      if (onError) onError(error);
    },
    resources: roleKey === ROLE_KEYS.SUPER_ADMIN
      ? ['tickets', 'terminal-diagnostics']
      : ['prices', 'fields', 'block-farms', 'crop-cycles', 'logs', 'audit-reports']
  });
}
