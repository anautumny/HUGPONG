function list(value) {
  return Array.isArray(value) ? value : [];
}

function identity(user) {
  return String(user?.employeeId || user?.id || '').trim();
}

export function selectDashboardScope(replica, session) {
  const roleKey = session?.roleKey || '';
  const userId = identity(session?.user);
  const allFarms = list(replica?.blockFarms);
  const allFields = [...list(replica?.fields), ...list(replica?.archivedFields)];
  const allLogs = list(replica?.logs);

  let farms = allFarms;
  let fields = allFields;
  if (roleKey === 'manager') {
    farms = allFarms.filter(farm => farm.managerUserId === userId);
    const farmIds = new Set(farms.map(farm => farm.id));
    fields = allFields.filter(field => farmIds.has(field.blockFarmId));
  } else if (roleKey === 'member') {
    fields = allFields.filter(field => field.memberUserId === userId);
    const farmIds = new Set(fields.map(field => field.blockFarmId));
    farms = allFarms.filter(farm => farmIds.has(farm.id));
  }

  const fieldIds = new Set(fields.map(field => field.id));
  const logs = (roleKey === 'superadmin' || roleKey === 'admin')
    ? allLogs
    : allLogs.filter(log => fieldIds.has(log.fieldId));

  return { farms, fields, logs };
}

export function selectOverviewMetrics(replica, session) {
  const { farms, fields, logs } = selectDashboardScope(replica, session);
  return [
    { id: 'farms', label: 'Block Farms', value: farms.filter(farm => farm.status !== 'ARCHIVED').length },
    { id: 'fields', label: 'Active Fields', value: fields.filter(field => field.status === 'ACTIVE').length },
    { id: 'active-operations', label: 'Active Operations', value: logs.filter(log => log.status === 'ACTIVE').length },
    { id: 'archived-operations', label: 'Archived Operations', value: logs.filter(log => log.status === 'ARCHIVED').length }
  ];
}

export function selectLatestPrice(replica) {
  return list(replica?.priceHistory)
    .filter(price => /^\d{4}-\d{2}-\d{2}$/.test(String(price.effectiveDate || '')))
    .sort((a, b) => String(b.effectiveDate).localeCompare(String(a.effectiveDate)))[0] || null;
}
