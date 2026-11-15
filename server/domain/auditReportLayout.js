'use strict';

// Presentation only. Crop identity stays unchanged. Numeric calendar-month
// columns show a full first year, then continue through the last recorded month.
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function monthKey(value) {
  const match = String(value || '').match(/^(\d{4})-(0[1-9]|1[0-2])(?:-|T|$)/);
  return match ? `${match[1]}-${match[2]}` : '';
}

function reportingMonthLabel(value) {
  const month = monthKey(value);
  return month ? `${MONTH_NAMES[Number(month.slice(5)) - 1]} ${month.slice(0, 4)}` : String(value || 'Not recorded');
}

function canonicalCycle(value) {
  const match = String(value || '').match(/^(\d{4})\s*[-\u2013\u2014/]\s*(\d{4})$/);
  return match && Number(match[2]) === Number(match[1]) + 1 ? `${match[1]}-${match[2]}` : '';
}

function operationMonth(operation, period = '') {
  return monthKey(operation?.performedOn || operation?.isoDate || operation?.date) || monthKey(period);
}

function auditReportLayout(report = {}, operations = report.operationSnapshots || report.operations || []) {
  const period = String(report.periodKey || report.period || report.month || '');
  const months = operations.map(operation => operationMonth(operation, period)).filter(Boolean).sort();
  const first = months[0] || monthKey(period);
  const last = months.at(-1) || first;
  const columns = [];
  if (first && last) {
    const start = Number(first.slice(0, 4)) * 12;
    const end = Math.max(start + 11, Number(last.slice(0, 4)) * 12 + Number(last.slice(5)) - 1);
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
    startMonth: columns[0] || first, endMonth: columns.at(-1) || last,
    timelineNote: 'Numbers are calendar months (1 = January, 12 = December). The first block shows months 1-12; continuation blocks end at the last recorded month. Continuation headers do not start a new crop.'
  };
}

function auditQuantityReadiness(operations = []) {
  const valid = value => value && Number.isFinite(Number(value.value ?? value.quantity))
    && Number(value.value ?? value.quantity) > 0 && String(value.unit || '').trim();
  const missingQuantityOperations = [];
  for (const operation of operations) {
    const items = Array.isArray(operation.lineItems) ? operation.lineItems : [];
    const componentCost = [...items, ...(operation.laborEntries || [])].reduce((sum, item) => sum + Number(item.subtotal || 0), 0);
    const baseCost = Number(operation.baseCost ?? Math.max(0, Number(operation.totalCost ?? operation.cost ?? 0) - componentCost));
    const requiresOperationQuantity = items.length === 0 || baseCost > 0;
    if ((requiresOperationQuantity && !valid(operation.quantity)) || items.some(item => !valid(item))) {
      missingQuantityOperations.push({ operationLogId: operation.operationLogId || operation.id || null,
        fieldId: operation.fieldId || null, operationName: operation.operationName || operation.name || 'Recorded operation',
        reason: 'Enter the operation quantity and select its unit, or complete each itemized expense quantity and unit.' });
    }
  }
  return { quantityReady: missingQuantityOperations.length === 0,
    missingQuantityCount: missingQuantityOperations.length, missingQuantityOperations };
}

// A plain operation's displayed unit cost includes its recorded labor, matching
// the audit ledger. Itemized expenses keep their own saved rates. No quantity
// is invented and financial component amounts remain separate from display rates.
function auditOperationPricing(operation) {
  const numeric = value => Number.isFinite(Number(value)) ? Number(value) : 0;
  const quantity = operation.quantity && typeof operation.quantity === 'object'
    ? operation.quantity.value : operation.quantity;
  const count = quantity != null && numeric(quantity) > 0 ? numeric(quantity) : null;
  const items = (operation.lineItems || []).map(item => ({ kind: 'expense', description: item.description || item.name || 'Expense',
    quantity: item.quantity == null ? null : numeric(item.quantity), unit: item.unit || '',
    rate: item.unitCost == null ? null : numeric(item.unitCost), amount: numeric(item.subtotal ?? numeric(item.quantity) * numeric(item.unitCost)), source: item }));
  const labor = (operation.laborEntries || []).map(item => {
    const days = item.days ?? item.quantity;
    const workerDays = days != null && numeric(days) > 0 ? numeric(item.workerCount ?? 1) * numeric(days) : null;
    return { kind: 'labor', description: 'Labor', quantity: workerDays, unit: 'worker-day',
      rate: item.rate == null ? null : numeric(item.rate), amount: numeric(item.subtotal) };
  });
  const total = numeric(operation.totalCost ?? operation.cost);
  const componentCost = [...items, ...labor].reduce((sum, item) => sum + item.amount, 0);
  const base = operation.baseCost == null ? Math.max(0, total - componentCost) : numeric(operation.baseCost);
  const selectedUnit = operation.quantity?.unit || operation.unit || '';
  const direct = base > 0 || count != null || String(selectedUnit).trim() ? [{ kind: 'direct', description: 'Recorded operation quantity', quantity: count,
    unit: selectedUnit, rate: count ? (items.length === 0 ? total : base) / count : null,
    rateBasis: items.length === 0 ? 'OPERATION_TOTAL' : 'BASE_COST',
    baseRate: count ? base / count : null, amount: base }] : [];
  const result = [...direct, ...items, ...labor];
  const remainder = Math.round((total - result.reduce((sum, item) => sum + item.amount, 0)) * 100) / 100;
  if (Math.abs(remainder) > 0.01 || !result.length) result.push({ kind: 'unrecorded', description: 'Other recorded cost',
    quantity: null, unit: '', rate: null, amount: remainder || total });
  return result;
}

function auditPricingCells(pricing) {
  const money = value => Number(value).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const count = value => Number(value).toLocaleString('en-PH', { maximumFractionDigits: 6 });
  const units = new Map(), rates = new Map();
  for (const item of pricing) {
    const rawUnit = String(item.unit || '').trim();
    const unit = rawUnit.toLowerCase() === 'ha' ? 'HA' : rawUnit.toLowerCase() === 'sample' ? 'Sample' : rawUnit.toLowerCase();
    // QTY / UNIT belong to the user's recorded operation or expense selection.
    // Labor worker-count/day calculations remain in the financial breakdown.
    const selected = item.kind === 'direct' || item.kind === 'expense';
    if (selected && unit) {
      if (!units.has(unit)) units.set(unit, null);
      if (item.quantity != null) units.set(unit, (units.get(unit) || 0) + item.quantity);
    }
    const key = JSON.stringify([item.kind, unit, item.rate, item.baseRate ?? null]);
    const row = rates.get(key) || { ...item, unit, quantity: item.quantity == null ? null : 0, amount: 0 };
    if (item.quantity != null) row.quantity += item.quantity;
    row.amount += item.amount;
    rates.set(key, row);
  }
  const details = [...rates.values()];
  const orderedUnits = [...units].sort(([left], [right]) => Number(left === 'worker-day') - Number(right === 'worker-day') || left.localeCompare(right));
  const averages = orderedUnits.map(([unit, quantity]) => {
    const priced = details.filter(item => (item.kind === 'direct' || item.kind === 'expense')
      && item.unit === unit && item.rate != null && item.quantity != null);
    const pricedQuantity = priced.reduce((sum, item) => sum + item.quantity, 0);
    const rate = pricedQuantity > 0 ? priced.reduce((sum, item) => sum + item.quantity * item.rate, 0) / pricedQuantity : null;
    return { unit, quantity, rate, averaged: new Set(priced.map(item => item.rate)).size > 1 };
  });
  return {
    quantityLabel: units.size ? orderedUnits.map(([, quantity]) => quantity == null ? 'Not recorded' : count(quantity)).join('\n') : 'Not recorded',
    unitLabel: orderedUnits.map(([unit]) => unit).join('\n') || '-',
    unitCostLabel: averages.length ? averages.map(item => item.rate == null ? 'Not recorded'
      : `${money(item.rate)}${item.averaged ? ' (avg)' : ''}`).join('\n') : 'Not recorded',
    singleQuantity: units.size === 1 ? [...units.values()][0] : null,
    singleUnit: units.size === 1 ? [...units.keys()][0] : '',
    singleRate: averages.length === 1 ? averages[0].rate : null,
    hasMultipleRates: averages.length > 1 || averages.some(item => item.averaged),
    weightedUnitRates: averages,
    actualRateBreakdown: details
  };
}

// Read-only print projection. Never replace signed operation snapshots with it.
function auditOperationGroups(report = {}, operations = report.operationSnapshots || report.operations || report.logs || []) {
  const groups = new Map();
  const normalized = value => String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
  const numeric = value => Number.isFinite(Number(value)) ? Number(value) : 0;
  const period = report.periodKey || report.period || report.month || '';
  const unitLabel = value => {
    const unit = normalized(value);
    return unit === 'ha' ? 'HA' : unit === 'sample' ? 'Sample' : unit;
  };
  const addArea = (row, month, area) => {
    row.areaHa += area;
    if (month) row.monthlyAreas[month] = (row.monthlyAreas[month] || 0) + area;
  };
  for (const operation of operations) {
    const name = String(operation.operationName || operation.name || 'Recorded operation').trim();
    const crop = canonicalCycle(operation.cropYearCycle || operation.cropYear)
      || canonicalCycle((report.fieldSnapshots || []).find(field => field.fieldId === operation.fieldId)?.cropYearCycle)
      || canonicalCycle(report.cropYearCycle)
      || canonicalCycle(report.cropYearCycles?.length === 1 ? report.cropYearCycles[0] : '');
    const stage = numeric(operation.stageNumber);
    const milling = stage === 6 || /milling|harvest|cutting|loading|hauling|trucking|bull cart/i.test(`${operation.category || ''} ${name}`);
    const key = JSON.stringify([normalized(operation.parentOperationDefinitionId || operation.operationDefinitionId || operation.operationId) || normalized(name), crop || operation.cycleId || operation.fieldId || 'unrecorded-cycle', stage, milling]);
    let group = groups.get(key);
    if (!group) {
      group = { ...operation, id: `audit-group-${groups.size + 1}`, operationLogId: `audit-group-${groups.size + 1}`,
        operationName: name, childOperationName: '', areaHa: 0, totalCost: 0, monthlyAreas: {}, sourceCount: 0,
        buckets: new Map(), pricing: [], hasExpenseItems: false, hasChildOperations: false };
      groups.set(key, group);
    }
    const area = numeric(operation.areaHa);
    const cost = numeric(operation.totalCost ?? operation.cost);
    const month = operationMonth(operation, period);
    addArea(group, month, area);
    group.totalCost += cost;
    group.sourceCount++;
    const pricing = auditOperationPricing(operation);
    group.pricing.push(...pricing);
    const expenses = Array.isArray(operation.lineItems) && operation.lineItems.length > 0;
    group.hasExpenseItems ||= expenses;
    group.hasChildOperations ||= Boolean(operation.childOperationDefinitionId || operation.childOperationId
      || (normalized(operation.childOperationName) && normalized(operation.childOperationName) !== normalized(name)));
    const items = expenses ? pricing.map(item => ({ ...item.source, description: item.description,
      quantity: item.quantity, unit: item.unit, unitCost: item.rate, subtotal: item.amount, pricing: [item] })) : [{
      description: operation.childOperationName || group.operationName,
      quantity: typeof operation.quantity === 'object' ? operation.quantity?.value ?? null : operation.quantity ?? null,
      unit: operation.quantity?.unit || operation.unit || '',
      unitCost: operation.unitCost,
      subtotal: cost, pricing
    }];
    const areasCounted = new Set();
    for (const item of items) {
      const quantity = item.quantity == null ? 0 : numeric(item.quantity);
      const subtotal = numeric(item.subtotal ?? quantity * numeric(item.unitCost));
      const rate = numeric(item.unitCost ?? (quantity ? subtotal / quantity : 0));
      const unit = unitLabel(item.unit);
      const description = String(item.description || item.name || operation.childOperationName || name).trim();
      const bucketKey = JSON.stringify([normalized(operation.childOperationDefinitionId || operation.childOperationId || operation.childOperationName), normalized(description), unit, expenses]);
      let bucket = group.buckets.get(bucketKey);
      if (!bucket) {
        bucket = { description, quantity: 0, unit, unitCost: rate, unitCostVaries: false, subtotal: 0, pricing: [], areaHa: 0, monthlyAreas: {} };
        group.buckets.set(bucketKey, bucket);
      }
      bucket.quantity += quantity;
      bucket.unitCostVaries ||= bucket.unitCost !== rate;
      bucket.subtotal += subtotal;
      bucket.pricing.push(...item.pricing);
      if (!areasCounted.has(bucketKey)) addArea(bucket, month, area);
      areasCounted.add(bucketKey);
    }
  }
  return [...groups.values()].flatMap(group => {
    const { buckets, hasExpenseItems, hasChildOperations, ...row } = group;
    const items = [...buckets.values()].map(item => {
      const cells = auditPricingCells(item.pricing);
      const laborDetail = hasExpenseItems && item.pricing.every(component => component.kind === 'labor');
      if (laborDetail) Object.assign(cells, { quantityLabel: '-', unitLabel: '-', unitCostLabel: '-' });
      return { ...item, priceCells: cells, quantity: cells.singleQuantity, unit: cells.singleUnit,
        unitCost: cells.singleRate, unitCostVaries: cells.hasMultipleRates };
    });
    if (!hasExpenseItems && !hasChildOperations) {
      const cells = auditPricingCells(row.pricing);
      return { ...row, childOperationName: '', priceCells: cells,
        quantity: { value: cells.singleQuantity, unit: cells.singleUnit }, unit: cells.singleUnit,
        unitCost: cells.singleRate, unitCostVaries: cells.hasMultipleRates, lineItems: [] };
    }
    return { ...row, lineItems: items };
  });
}

module.exports = { operationMonth, auditReportLayout, reportingMonthLabel, auditOperationGroups, auditOperationPricing, auditPricingCells, auditQuantityReadiness };
