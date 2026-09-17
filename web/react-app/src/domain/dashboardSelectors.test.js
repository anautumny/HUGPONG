import { describe, expect, it } from 'vitest';
import { selectDashboardScope, selectLatestPrice, selectOverviewMetrics } from './dashboardSelectors';

const replica = {
  blockFarms: [
    { id: 'BF-1', managerUserId: 'MGR-1', status: 'ACTIVE' },
    { id: 'BF-2', managerUserId: 'MGR-2', status: 'ACTIVE' }
  ],
  fields: [
    { id: 'F-1', blockFarmId: 'BF-1', memberUserId: 'MEM-1', status: 'ACTIVE' },
    { id: 'F-2', blockFarmId: 'BF-2', memberUserId: 'MEM-2', status: 'ACTIVE' }
  ],
  logs: [
    { id: 'L-1', fieldId: 'F-1', status: 'ACTIVE' },
    { id: 'L-2', fieldId: 'F-1', status: 'ARCHIVED' },
    { id: 'L-3', fieldId: 'F-2', status: 'ACTIVE' }
  ],
  priceHistory: [
    { id: 'P-OLD', effectiveDate: '2026-09-01' },
    { id: 'P-NEW', effectiveDate: '2026-09-17' }
  ]
};

describe('dashboard selectors', () => {
  it('keeps administrators in system scope', () => {
    const scope = selectDashboardScope(replica, { roleKey: 'admin', user: { employeeId: 'SRA-1' } });
    expect(scope.farms).toHaveLength(2);
    expect(scope.logs).toHaveLength(3);
  });

  it('limits a Farm Manager overview to managed farms and their fields', () => {
    const session = { roleKey: 'manager', user: { employeeId: 'MGR-1' } };
    const scope = selectDashboardScope(replica, session);
    expect(scope.farms.map(item => item.id)).toEqual(['BF-1']);
    expect(scope.fields.map(item => item.id)).toEqual(['F-1']);
    expect(scope.logs.map(item => item.id)).toEqual(['L-1', 'L-2']);
    expect(selectOverviewMetrics(replica, session).map(item => item.value)).toEqual([1, 1, 1, 1]);
  });

  it('limits a Member Farmer overview to assigned fields', () => {
    const scope = selectDashboardScope(replica, { roleKey: 'member', user: { employeeId: 'MEM-2' } });
    expect(scope.fields.map(item => item.id)).toEqual(['F-2']);
    expect(scope.logs.map(item => item.id)).toEqual(['L-3']);
  });

  it('selects only the latest canonically dated price', () => {
    expect(selectLatestPrice(replica).id).toBe('P-NEW');
    expect(selectLatestPrice({ priceHistory: [{ effectiveDate: 'September 17' }] })).toBeNull();
  });

  it('keeps archived fields in scope so their historical operations remain visible', () => {
    const archivedReplica = { blockFarms: [{ id: 'BF-1', managerUserId: 'MGR-1' }], fields: [], archivedFields: [{ id: 'F-OLD', blockFarmId: 'BF-1', status: 'ARCHIVED' }], logs: [{ id: 'L-OLD', fieldId: 'F-OLD', status: 'ARCHIVED' }] };
    const scope = selectDashboardScope(archivedReplica, { roleKey: 'manager', user: { employeeId: 'MGR-1' } });
    expect(scope.fields.map(item => item.id)).toEqual(['F-OLD']);
    expect(scope.logs.map(item => item.id)).toEqual(['L-OLD']);
  });
});
