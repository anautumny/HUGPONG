/**
 * ══════════════════════════════════════════════════════════════
 * HUGPONG Mobile — Descriptive Analytics Selectors
 * Pure, testable transformations strictly describing real
 * recorded agronomic, operational, and price data.
 * 100% mathematical parity with Web Analytics.
 * ══════════════════════════════════════════════════════════════
 */

import { CROP_STAGE_MAX, CROP_STAGE_MIN, SUGARCANE_STAGES } from '../constants/cropStages';

export { SUGARCANE_STAGES } from '../constants/cropStages';

export function formatCropYear(val) {
  if (!val) return '';
  const s = String(val).trim();
  const rangeMatch = s.match(/(\d{4})\s*[-–—/]\s*(\d{2,4})/);
  if (rangeMatch) {
    const start = parseInt(rangeMatch[1], 10);
    let end = parseInt(rangeMatch[2], 10);
    if (end < 100) end = Math.floor(start / 100) * 100 + end;
    return `${start}-${end}`;
  }
  const singleMatch = s.match(/(\d{4})/);
  if (singleMatch) {
    const start = parseInt(singleMatch[1], 10);
    return `${start}-${start + 1}`;
  }
  return s;
}

const canonicalStoredCropYear = value => {
  const match = String(value || '').trim().match(/^(\d{4})\s*[-–—/]\s*(\d{4})$/);
  if (!match || Number(match[2]) !== Number(match[1]) + 1) return '';
  return `${match[1]}-${match[2]}`;
};

export function filterOperationsByCropYearCycle({ operations = [], cropCycles = [], selectedSeason = 'ALL' }) {
  const cycleYearById = new Map(cropCycles.map(cycle => [cycle.id, canonicalStoredCropYear(cycle.cropYear)]));
  return operations.filter(operation => {
    if (!operation.cycleId) return false;
    if (selectedSeason === 'ALL') return true;
    return (canonicalStoredCropYear(operation.cropYearCycle) || cycleYearById.get(operation.cycleId)) === canonicalStoredCropYear(selectedSeason);
  });
}

const isAnalyticsOperation = operation => {
  const status = String(operation?.status || 'ACTIVE');
  return status === 'ACTIVE' || status === 'submitted'
    || (status === 'ARCHIVED' && operation?.archivedReason === 'CYCLE_COMPLETED');
};

/**
 * 1. Crop & Field Progress Selector
 */
export function selectCropFieldProgress({
  fields = [],
  cropCycles = [],
  selectedFarmId = 'ALL',
  selectedSeason = 'ALL'
}) {
  const cycleMap = new Map();
  const cyclesByField = new Map();
  cropCycles.forEach(c => {
    if (c.id) cycleMap.set(c.id, c);
    if (c.fieldId) cyclesByField.set(c.fieldId, [...(cyclesByField.get(c.fieldId) || []), c]);
  });
  const cycleForField = field => selectedSeason === 'ALL'
    ? cycleMap.get(field.currentCycleId)
    : (cyclesByField.get(field.id) || []).find(cycle => canonicalStoredCropYear(cycle.cropYear) === canonicalStoredCropYear(selectedSeason));

  const scopedFields = fields.filter(f => {
    if (selectedFarmId !== 'ALL' && f.blockFarmId !== selectedFarmId) return false;
    const cycle = cycleForField(f);
    const cropYear = canonicalStoredCropYear(cycle?.cropYear || f.cropYear || '');
    if (selectedSeason !== 'ALL' && (!cycle || cropYear !== canonicalStoredCropYear(selectedSeason))) return false;
    return true;
  });

  const totalPlots = scopedFields.length;
  const totalAcreageHa = scopedFields.reduce((sum, f) => sum + (Number(f.areaHa || f.hectares || f.ha || 0)), 0);

  const stageStats = {};
  SUGARCANE_STAGES.forEach(st => {
    stageStats[st.stageNumber] = {
      stageNumber: st.stageNumber,
      name: st.name,
      shortName: st.shortName,
      months: st.months,
      description: st.description,
      plotsCount: 0,
      areaHa: 0,
      percentOfArea: 0,
      fields: []
    };
  });

  scopedFields.forEach(f => {
    const cycle = cycleForField(f);
    const rawStage = Number(cycle?.currentStageNumber ?? f.stageNumber ?? f.currentStageNumber);
    if (!Number.isInteger(rawStage) || rawStage < CROP_STAGE_MIN || rawStage > CROP_STAGE_MAX) return;
    const validStage = rawStage;
    const ha = Number(f.areaHa || f.hectares || f.ha || 0);

    const st = stageStats[validStage];
    if (st) {
      st.plotsCount += 1;
      st.areaHa += ha;
      st.fields.push({
        id: f.id,
        blockFarmId: f.blockFarmId,
        blockFarmName: f.blockFarmName || f.blockFarmId,
        memberName: f.memberName || f.memberUserId || f.member,
        areaHa: ha,
        variety: f.variety || 'VMC 84-524',
        stageNumber: validStage
      });
    }
  });

  SUGARCANE_STAGES.forEach(st => {
    const s = stageStats[st.stageNumber];
    if (totalAcreageHa > 0) {
      s.percentOfArea = Number(((s.areaHa / totalAcreageHa) * 100).toFixed(1));
    } else {
      s.percentOfArea = 0;
    }
  });

  return {
    totalPlots,
    totalAcreageHa,
    stagesDistribution: Object.values(stageStats),
    activePlots: scopedFields
  };
}

/**
 * 2. Production Cost Selector
 */
export function selectProductionCost({
  operations = [],
  fields = [],
  blockFarms = [],
  selectedFarmId = 'ALL',
  selectedParcelId = 'ALL',
  selectedPeriod = 'ALL',
  isFarmManager = false
}) {
  const fieldMap = new Map(fields.map(f => [f.id, f]));

  const filteredOps = operations.filter(op => {
    if (!isAnalyticsOperation(op)) return false;

    if (selectedPeriod !== 'ALL') {
      const date = String(op.performedOn || op.isoDate || op.date || '');
      if (!date.startsWith(selectedPeriod)) return false;
    }

    if (selectedParcelId !== 'ALL' && op.fieldId !== selectedParcelId) {
      return false;
    }

    const field = fieldMap.get(op.fieldId);
    if (selectedFarmId !== 'ALL') {
      if (!field || field.blockFarmId !== selectedFarmId) return false;
    }

    return true;
  });

  const totalExpenditure = filteredOps.reduce((sum, op) => sum + (Number(op.totalCost != null ? op.totalCost : op.cost) || 0), 0);

  const relevantFieldIds = new Set(filteredOps.map(op => op.fieldId));
  const relevantFields = fields.filter(f => {
    if (selectedFarmId !== 'ALL' && f.blockFarmId !== selectedFarmId) return false;
    if (selectedParcelId !== 'ALL' && f.id !== selectedParcelId) return false;
    return relevantFieldIds.has(f.id);
  });
  const totalAuditedHa = relevantFields.reduce((sum, f) => sum + (Number(f.areaHa || f.hectares || f.ha || 0)), 0);

  const averageCostPerHa = totalAuditedHa > 0 ? Math.round(totalExpenditure / totalAuditedHa) : 0;

  let breakdownByEntity = [];

  if (isFarmManager || selectedParcelId !== 'ALL') {
    const scopedFields = fields.filter(f => (selectedFarmId === 'ALL' || f.blockFarmId === selectedFarmId) && (selectedParcelId === 'ALL' || f.id === selectedParcelId));
    breakdownByEntity = scopedFields.map(f => {
      const fOps = filteredOps.filter(op => op.fieldId === f.id);
      const cost = fOps.reduce((sum, op) => sum + (Number(op.totalCost != null ? op.totalCost : op.cost) || 0), 0);
      const ha = Number(f.areaHa || f.hectares || f.ha || 0);
      const costPerHa = ha > 0 ? Math.round(cost / ha) : 0;
      return {
        id: f.id,
        name: `${f.id} · ${f.memberName || f.memberUserId || f.member || 'Member'}`,
        type: 'field',
        totalCost: cost,
        areaHa: ha,
        costPerHa,
        opsCount: fOps.length
      };
    });
  } else {
    const scopedFarms = blockFarms.filter(b => selectedFarmId === 'ALL' || b.id === selectedFarmId);
    breakdownByEntity = scopedFarms.map(b => {
      const bFields = fields.filter(f => f.blockFarmId === b.id);
      const bFieldIds = new Set(bFields.map(f => f.id));
      const bOps = filteredOps.filter(op => bFieldIds.has(op.fieldId));
      const cost = bOps.reduce((sum, op) => sum + (Number(op.totalCost != null ? op.totalCost : op.cost) || 0), 0);
      const ha = bFields.reduce((sum, f) => sum + (Number(f.areaHa || f.hectares || f.ha || 0)), 0) || Number(b.declaredHa || b.declaredAreaHa || 0);
      const costPerHa = ha > 0 ? Math.round(cost / ha) : 0;
      return {
        id: b.id,
        name: b.name || b.id,
        type: 'farm',
        totalCost: cost,
        areaHa: ha,
        costPerHa,
        opsCount: bOps.length
      };
    });
  }

  breakdownByEntity.sort((a, b) => b.totalCost - a.totalCost);

  return {
    totalExpenditure,
    totalAuditedHa,
    averageCostPerHa,
    breakdownByEntity,
    operationsCount: filteredOps.length
  };
}

/**
 * 3. Operational Cost Breakdown Selector
 */
export function selectOperationalCostBreakdown({
  operations = [],
  fields = [],
  selectedFarmId = 'ALL',
  selectedPeriod = 'ALL'
}) {
  const fieldMap = new Map(fields.map(f => [f.id, f]));

  const categoryDefinitions = [
    { key: 'prep', label: 'Land Preparation', color: '#2D5016' },
    { key: 'plant', label: 'Planting & Seedcane', color: '#3E7345' },
    { key: 'fert', label: 'Fertilization & Lime', color: '#5B8C5A' },
    { key: 'weed', label: 'Cultivation & Weeding', color: '#4B5563' },
    { key: 'maint', label: 'Crop Maintenance', color: '#6B7280' },
    { key: 'harvest', label: 'Harvesting & Hauling', color: '#9CA3AF' }
  ];

  const catMap = new Map(categoryDefinitions.map(c => [c.key, { ...c, totalCost: 0, opsCount: 0, percentOfTotal: 0 }]));

  let grandTotalCost = 0;
  let totalOpsCount = 0;

  operations.forEach(op => {
    if (!isAnalyticsOperation(op)) return;

    if (selectedPeriod !== 'ALL') {
      const date = String(op.performedOn || op.isoDate || op.date || '');
      if (!date.startsWith(selectedPeriod)) return;
    }

    if (selectedFarmId !== 'ALL') {
      const field = fieldMap.get(op.fieldId);
      if (!field || field.blockFarmId !== selectedFarmId) return;
    }

    const catKey = String(op.category || 'prep').toLowerCase();
    const entry = catMap.get(catKey) || catMap.get('prep');
    const cost = Number(op.totalCost != null ? op.totalCost : op.cost) || 0;

    entry.totalCost += cost;
    entry.opsCount += 1;
    grandTotalCost += cost;
    totalOpsCount += 1;
  });

  const categories = Array.from(catMap.values()).map(cat => ({
    ...cat,
    percentOfTotal: grandTotalCost > 0 ? Number(((cat.totalCost / grandTotalCost) * 100).toFixed(1)) : 0
  }));

  const sortedCategories = [...categories].sort((a, b) => b.totalCost - a.totalCost);
  const topCategory = sortedCategories[0]?.totalCost > 0 ? sortedCategories[0] : null;

  return {
    grandTotalCost,
    totalOpsCount,
    categories,
    sortedCategories,
    topCategory
  };
}

/**
 * 4. Farm Operations Activity Selector
 */
export function selectFarmOperationsAnalytics({
  operations = [],
  fields = [],
  selectedFarmId = 'ALL',
  selectedPeriod = 'ALL'
}) {
  const fieldMap = new Map(fields.map(f => [f.id, f]));

  const opCounts = new Map();
  const monthlyCounts = new Map();
  let totalPeopleCount = 0;
  let totalOps = 0;
  let totalGroupOps = 0;

  operations.forEach(op => {
    if (!isAnalyticsOperation(op)) return;

    if (selectedPeriod !== 'ALL') {
      const date = String(op.performedOn || op.isoDate || op.date || '');
      if (!date.startsWith(selectedPeriod)) return;
    }

    if (selectedFarmId !== 'ALL') {
      const field = fieldMap.get(op.fieldId);
      if (!field || field.blockFarmId !== selectedFarmId) return;
    }

    totalOps += 1;
    totalPeopleCount += Number(op.peopleCount || op.people || 0);

    const isGroup = Array.isArray(op.lineItems || op.subItems) && (op.lineItems || op.subItems).length > 0;
    if (isGroup) totalGroupOps += 1;

    const opName = String(op.operationName || op.activity || 'Field Operation').trim();
    const existing = opCounts.get(opName) || {
      name: opName,
      category: op.category || 'prep',
      stageNumber: Number(op.stageNumber || 1),
      count: 0,
      totalCost: 0
    };
    existing.count += 1;
    existing.totalCost += Number(op.totalCost != null ? op.totalCost : op.cost) || 0;
    opCounts.set(opName, existing);

    const dateStr = String(op.performedOn || op.isoDate || op.date || '');
    const monthKey = dateStr.slice(0, 7);
    if (monthKey) {
      const mExisting = monthlyCounts.get(monthKey) || { period: monthKey, count: 0, cost: 0 };
      mExisting.count += 1;
      mExisting.cost += Number(op.totalCost != null ? op.totalCost : op.cost) || 0;
      monthlyCounts.set(monthKey, mExisting);
    }
  });

  const frequencyRanking = Array.from(opCounts.values())
    .map(item => ({
      ...item,
      avgCost: item.count > 0 ? Math.round(item.totalCost / item.count) : 0
    }))
    .sort((a, b) => b.count - a.count);

  const chronologicalActivity = Array.from(monthlyCounts.values())
    .sort((a, b) => a.period.localeCompare(b.period));

  return {
    totalOps,
    totalPeopleCount,
    totalGroupOps,
    frequencyRanking,
    chronologicalActivity
  };
}

/**
 * 5. SRA Price Trends Selector
 */
export function selectPriceTrends({
  prices = [],
  timeframe = 'weekly'
}) {
  if (!prices || prices.length === 0) {
    return {
      trendPoints: [],
      minSugar: null,
      maxSugar: null,
      minMolasses: null,
      maxMolasses: null,
      currentSugar: null,
      currentMolasses: null
    };
  }

  const canonicalPrices = prices.filter(price =>
    /^\d{4}-\d{2}-\d{2}$/.test(price?.effectiveDate || '')
    && Number.isFinite(Number(price?.sugarPricePerLkg)) && Number(price.sugarPricePerLkg) > 0
    && Number.isFinite(Number(price?.molassesPricePerMetricTon)) && Number(price.molassesPricePerMetricTon) > 0
  );
  if (!canonicalPrices.length) {
    return {
      trendPoints: [], minSugar: null, maxSugar: null,
      minMolasses: null, maxMolasses: null,
      currentSugar: null, currentMolasses: null
    };
  }
  const sorted = [...canonicalPrices].sort((a, b) => {
    const da = a.effectiveDate;
    const db = b.effectiveDate;
    return da.localeCompare(db);
  });

  let points = [];

  if (timeframe === 'monthly') {
    const monthMap = new Map();
    sorted.forEach(p => {
      const d = p.effectiveDate;
      const monthKey = String(d).slice(0, 7);
      monthMap.set(monthKey, p);
    });
    points = Array.from(monthMap.values()).map(p => ({
      date: p.effectiveDate,
      periodLabel: new Date(`${p.effectiveDate}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
      sugarPrice: Number(p.sugarPricePerLkg),
      sugarChange: Number(p.sugarPriceChange),
      molassesPrice: Number(p.molassesPricePerMetricTon),
      molassesChange: Number(p.molassesPriceChange),
      circularNumber: p.circularNumber
    }));
  } else {
    points = sorted.map(p => ({
      date: p.effectiveDate,
      periodLabel: p.weekLabel || p.effectiveDate,
      sugarPrice: Number(p.sugarPricePerLkg),
      sugarChange: Number(p.sugarPriceChange),
      molassesPrice: Number(p.molassesPricePerMetricTon),
      molassesChange: Number(p.molassesPriceChange),
      circularNumber: p.circularNumber
    }));
  }

  const sugarValues = points.map(p => p.sugarPrice).filter(v => v > 0);
  const molassesValues = points.map(p => p.molassesPrice).filter(v => v > 0);

  const minSugar = sugarValues.length > 0 ? Math.min(...sugarValues) : 0;
  const maxSugar = sugarValues.length > 0 ? Math.max(...sugarValues) : 0;
  const minMolasses = molassesValues.length > 0 ? Math.min(...molassesValues) : 0;
  const maxMolasses = molassesValues.length > 0 ? Math.max(...molassesValues) : 0;

  const latest = sorted[sorted.length - 1] || null;

  return {
    trendPoints: points,
    minSugar,
    maxSugar,
    minMolasses,
    maxMolasses,
    currentSugar: latest ? Number(latest.sugarPricePerLkg) : null,
    currentMolasses: latest ? Number(latest.molassesPricePerMetricTon) : null
  };
}
