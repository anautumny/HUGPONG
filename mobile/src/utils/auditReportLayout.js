// Presentation only. Crop identity stays unchanged. Numeric calendar-month
// columns run from the first included operation through the last included one.
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function monthKey(value) {
  const match = String(value || '').match(/^(\d{4})-(0[1-9]|1[0-2])(?:-|T|$)/);
  return match ? `${match[1]}-${match[2]}` : '';
}

export function reportingMonthLabel(value) {
  const month = monthKey(value);
  return month ? `${MONTH_NAMES[Number(month.slice(5)) - 1]} ${month.slice(0, 4)}` : String(value || 'Not recorded');
}

function canonicalCycle(value) {
  const match = String(value || '').match(/^(\d{4})\s*[-\u2013\u2014/]\s*(\d{4})$/);
  return match && Number(match[2]) === Number(match[1]) + 1 ? `${match[1]}-${match[2]}` : '';
}

export function operationMonth(operation, period = '') {
  return monthKey(operation?.performedOn || operation?.isoDate || operation?.date) || monthKey(period);
}

export function auditReportLayout(report = {}, operations = report.operationSnapshots || report.operations || []) {
  const period = String(report.periodKey || report.period || report.month || '');
  const months = operations.map(operation => operationMonth(operation, period)).filter(Boolean).sort();
  const first = months[0] || monthKey(period);
  const last = months.at(-1) || first;
  const columns = [];
  if (first && last) {
    const start = Number(first.slice(0, 4)) * 12 + Number(first.slice(5)) - 1;
    const end = Number(last.slice(0, 4)) * 12 + Number(last.slice(5)) - 1;
    if (end - start > 1200) throw new Error('The audit timeline exceeds 100 years. Review the recorded crop dates.');
    for (let index = start; index <= end; index++) {
      columns.push(`${String(Math.floor(index / 12)).padStart(4, '0')}-${String(index % 12 + 1).padStart(2, '0')}`);
    }
  }
  const cycleForOperation = operation => canonicalCycle(operation.cropYearCycle || operation.cropYear)
    || canonicalCycle((report.fieldSnapshots || []).find(field => field.fieldId === operation.fieldId)?.cropYearCycle);
  const operationCycles = [...new Set(operations.map(cycleForOperation).filter(Boolean))].sort();
  const fallbackCycles = [...new Set([report.cropYearCycle, ...(Array.isArray(report.cropYearCycles) ? report.cropYearCycles : [])].map(canonicalCycle).filter(Boolean))].sort();
  const sourceCycles = operationCycles.length ? operationCycles : fallbackCycles;
  const anchorCycle = sourceCycles[0] || '';
  const anchorYear = first.slice(0, 4);
  const firstYearByCycle = new Map();
  for (const operation of operations) {
    const cycle = cycleForOperation(operation);
    const year = operationMonth(operation, period).slice(0, 4);
    if (cycle && year && (!firstYearByCycle.has(cycle) || year < firstYearByCycle.get(cycle))) firstYearByCycle.set(cycle, year);
  }
  const years = [...new Set(columns.map(month => month.slice(0, 4)))];
  const groups = years.map(year => {
    const yearColumns = columns.filter(month => month.startsWith(`${year}-`));
    const recordedCycles = [...new Set(operations.filter(operation => operationMonth(operation, period).startsWith(`${year}-`)).map(cycleForOperation).filter(Boolean))];
    const cropYearCycles = (recordedCycles.length ? recordedCycles : (anchorCycle ? [anchorCycle] : [])).map(cycle => {
      const base = Number(cycle.slice(0, 4)) + Number(year) - Number(firstYearByCycle.get(cycle) || anchorYear);
      return `${base}-${base + 1}`;
    }).sort();
    const cropYearCycle = cropYearCycles.length === 1 ? cropYearCycles[0] : '';
    const label = cropYearCycles.length ? `Crop Year Cycle ${cropYearCycles.join(' / ')}` : 'Crop Year Cycle not recorded';
    return { year, cropYearCycle, cropYearCycles, label, columns: yearColumns };
  });
  return {
    period, periodLabel: reportingMonthLabel(period), years, columns, groups,
    columnLabels: Object.fromEntries(columns.map(month => [month, Number(month.slice(5))])),
    columnCount: columns.length + 7,
    startMonth: first, endMonth: last,
    timelineNote: 'Numbers are calendar months (1 = January, 12 = December). The timeline runs from the first included operation to the last; continuation headers do not start a new crop.'
  };
}
