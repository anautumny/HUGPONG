

// Presentation only: crop years identify crops; calendar dates place work in a month.
export function operationMonth(operation, period = '') {
  const recorded = String(operation?.performedOn || operation?.isoDate || operation?.date || '');
  const match = recorded.match(/^(\d{4})-(0[1-9]|1[0-2])(?:-|$)/);
  if (match) return `${match[1]}-${match[2]}`;
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(period) ? period : '';
}

export function auditReportLayout(report = {}, operations = report.operationSnapshots || report.operations || []) {
  const period = String(report.periodKey || report.period || report.month || '');
  const months = operations.map(operation => operationMonth(operation, period)).filter(Boolean);
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) months.push(period);
  const years = [...new Set(months.map(month => month.slice(0, 4)))].sort();
  const columns = years.flatMap(year => Array.from({ length: 12 }, (_, index) => `${year}-${String(index + 1).padStart(2, '0')}`));
  return { period, years, columns, columnCount: columns.length + 7 };
}
