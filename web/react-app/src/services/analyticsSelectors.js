/**
 * ══════════════════════════════════════════════════════════════
 * HUGPONG — Descriptive Analytics Selectors
 * Pure, testable transformations strictly describing real
 * recorded agronomic, operational, and price data.
 * Zero benchmarks, zero forecasts, zero fake fallbacks.
 * ══════════════════════════════════════════════════════════════
 */

import { CROP_STAGE_MAX, CROP_STAGE_MIN, SUGARCANE_STAGES } from '../constants/cropStages.js';
import { formatCropYear } from '../utils/formatters.js';

/**
 * 1. Crop & Field Progress Selector
 * Describes actual parcel distribution across the 6 sugarcane growth stages.
 */
export function selectCropFieldProgress({
  fields = [],
  cropCycles = [],
  selectedFarmId = 'ALL',
  selectedSeason = 'ALL'
}) {
  const cycleMap = new Map();
  cropCycles.forEach(c => {
    if (c.id) cycleMap.set(c.id, c);
    if (c.fieldId) cycleMap.set(c.fieldId, c);
  });

  // Filter fields by scope and season
  const scopedFields = fields.filter(f => {
    if (selectedFarmId !== 'ALL' && f.blockFarmId !== selectedFarmId) return false;
    const cycle = cycleMap.get(f.currentCycleId) || cycleMap.get(f.id);
    const cropYear = formatCropYear(cycle?.cropYear || f.cropYear || '');
    if (selectedSeason !== 'ALL' && cropYear !== selectedSeason) return false;
    return true;
  });

  const totalPlots = scopedFields.length;
  const totalAcreageHa = scopedFields.reduce((sum, f) => sum + (Number(f.areaHa || f.hectares || 0)), 0);

  // Group by 6 stages
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
    const cycle = cycleMap.get(f.currentCycleId) || cycleMap.get(f.id);
    const rawStage = Number(cycle?.currentStageNumber || f.stageNumber || f.currentStageNumber || 1);
    const validStage = Math.max(CROP_STAGE_MIN, Math.min(CROP_STAGE_MAX, rawStage));
    const ha = Number(f.areaHa || f.hectares || 0);

    const st = stageStats[validStage];
    if (st) {
      st.plotsCount += 1;
      st.areaHa += ha;
      st.fields.push({
        id: f.id,
        blockFarmId: f.blockFarmId,
        blockFarmName: f.blockFarmName || f.blockFarmId,
        memberName: f.memberName || f.memberUserId,
        areaHa: ha,
        variety: f.variety || 'VMC 84-524',
        stageNumber: validStage
      });
    }
  });

  // Calculate percentages based strictly on real area
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
 * Describes total recorded production cost by Block Farm or member parcel.
 */
export function selectProductionCost({
  operations = [],
  fields = [],
  blockFarms = [],
  selectedFarmId = 'ALL',
  selectedPeriod = 'ALL',
  isFarmManager = false
}) {
  const fieldMap = new Map(fields.map(f => [f.id, f]));
  const farmMap = new Map(blockFarms.map(f => [f.id, f]));

  // Filter operations by period and scope
  const filteredOps = operations.filter(op => {
    if (op.status !== 'ACTIVE') return false;

    // Period filter: YYYY-MM
    if (selectedPeriod !== 'ALL') {
      const date = String(op.performedOn || op.isoDate || op.date || '');
      if (!date.startsWith(selectedPeriod)) return false;
    }

    // Farm scope filter
    const field = fieldMap.get(op.fieldId);
    if (selectedFarmId !== 'ALL') {
      if (!field || field.blockFarmId !== selectedFarmId) return false;
    }

    return true;
  });

  const totalExpenditure = filteredOps.reduce((sum, op) => sum + (Number(op.totalCost != null ? op.totalCost : op.cost) || 0), 0);

  // Derive relevant fields
  const relevantFieldIds = new Set(filteredOps.map(op => op.fieldId));
  const relevantFields = fields.filter(f => {
    if (selectedFarmId !== 'ALL' && f.blockFarmId !== selectedFarmId) return false;
    return relevantFieldIds.has(f.id);
  });
  const totalAuditedHa = relevantFields.reduce((sum, f) => sum + (Number(f.areaHa || f.hectares || 0)), 0);

  const averageCostPerHa = totalAuditedHa > 0 ? Math.round(totalExpenditure / totalAuditedHa) : 0;

  // Breakdown by entity:
  // If Farm Manager -> breakdown by member parcel
  // If SRA Admin / Super Admin -> breakdown by Block Farm
  let breakdownByEntity = [];

  if (isFarmManager) {
    // Member field breakdown
    const scopedFields = fields.filter(f => selectedFarmId === 'ALL' || f.blockFarmId === selectedFarmId);
    breakdownByEntity = scopedFields.map(f => {
      const fOps = filteredOps.filter(op => op.fieldId === f.id);
      const cost = fOps.reduce((sum, op) => sum + (Number(op.totalCost != null ? op.totalCost : op.cost) || 0), 0);
      const ha = Number(f.areaHa || f.hectares || 0);
      const costPerHa = ha > 0 ? Math.round(cost / ha) : 0;
      return {
        id: f.id,
        name: `${f.id} · ${f.memberName || f.memberUserId || 'Member'}`,
        type: 'field',
        totalCost: cost,
        areaHa: ha,
        costPerHa,
        opsCount: fOps.length
      };
    });
  } else {
    // Block Farm breakdown
    const scopedFarms = blockFarms.filter(b => selectedFarmId === 'ALL' || b.id === selectedFarmId);
    breakdownByEntity = scopedFarms.map(b => {
      const bFields = fields.filter(f => f.blockFarmId === b.id);
      const bFieldIds = new Set(bFields.map(f => f.id));
      const bOps = filteredOps.filter(op => bFieldIds.has(op.fieldId));
      const cost = bOps.reduce((sum, op) => sum + (Number(op.totalCost != null ? op.totalCost : op.cost) || 0), 0);
      const ha = bFields.reduce((sum, f) => sum + (Number(f.areaHa || f.hectares || 0)), 0) || Number(b.declaredHa || b.declaredAreaHa || 0);
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

  // Sort descending by total cost
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
 * Categorizes actual expenditure across the 6 canonical agronomic categories.
 */
export function selectOperationalCostBreakdown({
  operations = [],
  fields = [],
  selectedFarmId = 'ALL',
  selectedPeriod = 'ALL'
}) {
  const fieldMap = new Map(fields.map(f => [f.id, f]));

  const categoryDefinitions = [
    { key: 'prep', label: 'Land Preparation', color: '#2D5016', badgeClass: 'bg-primary-bg text-primary dark:text-primary-light' },
    { key: 'plant', label: 'Planting & Seedcane', color: '#3E7345', badgeClass: 'bg-bg text-hug-text border border-border' },
    { key: 'fert', label: 'Fertilization & Lime', color: '#5B8C5A', badgeClass: 'bg-bg text-hug-text border border-border' },
    { key: 'weed', label: 'Cultivation & Weeding', color: '#4B5563', badgeClass: 'bg-bg text-hug-text border border-border' },
    { key: 'maint', label: 'Crop Maintenance', color: '#6B7280', badgeClass: 'bg-bg text-hug-text border border-border' },
    { key: 'harvest', label: 'Harvesting & Hauling', color: '#9CA3AF', badgeClass: 'bg-bg text-hug-text border border-border' }
  ];

  const catMap = new Map(categoryDefinitions.map(c => [c.key, { ...c, totalCost: 0, opsCount: 0, percentOfTotal: 0 }]));

  let grandTotalCost = 0;
  let totalOpsCount = 0;

  operations.forEach(op => {
    if (op.status !== 'ACTIVE') return;

    if (selectedPeriod !== 'ALL') {
      const date = String(op.performedOn || op.isoDate || op.date || '');
      if (!date.startsWith(selectedPeriod)) return false;
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

  // Find top category
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
 * Aggregates frequency of recorded operations, labor volume, and timeline.
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
    if (op.status !== 'ACTIVE') return;

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

    const isGroup = Array.isArray(op.lineItems) && op.lineItems.length > 0;
    if (isGroup) totalGroupOps += 1;

    // Aggregate by operation name
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

    // Monthly chronological breakdown
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
 * Transforms official historical price circulars into chronological time-series points.
 */
export function selectPriceTrends({
  prices = [],
  timeframe = 'weekly' // 'weekly' | 'monthly'
}) {
  if (!prices || prices.length === 0) {
    return {
      trendPoints: [],
      minSugar: 0,
      maxSugar: 0,
      minMolasses: 0,
      maxMolasses: 0,
      currentSugar: 0,
      currentMolasses: 0
    };
  }

  // Sort chronological: oldest to newest for graphing
  const sorted = [...prices].sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate));

  let points = [];

  if (timeframe === 'monthly') {
    // Group by YYYY-MM, taking the latest price record of each month
    const monthMap = new Map();
    sorted.forEach(p => {
      const monthKey = String(p.effectiveDate).slice(0, 7);
      monthMap.set(monthKey, p); // overwrite with latest
    });
    points = Array.from(monthMap.values()).map(p => ({
      date: p.effectiveDate,
      periodLabel: new Date(`${p.effectiveDate}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
      sugarPrice: Number(p.sugarPricePerLkg || 0),
      sugarChange: Number(p.sugarPriceChange || 0),
      molassesPrice: Number(p.molassesPricePerMetricTon || 0),
      molassesChange: Number(p.molassesPriceChange || 0),
      circularNumber: p.circularNumber || p.source || 'Official Circular'
    }));
  } else {
    // Weekly points
    points = sorted.map(p => ({
      date: p.effectiveDate,
      periodLabel: p.weekLabel || p.effectiveDate,
      sugarPrice: Number(p.sugarPricePerLkg || 0),
      sugarChange: Number(p.sugarPriceChange || 0),
      molassesPrice: Number(p.molassesPricePerMetricTon || 0),
      molassesChange: Number(p.molassesPriceChange || 0),
      circularNumber: p.circularNumber || p.source || 'Official Circular'
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
    currentSugar: latest ? Number(latest.sugarPricePerLkg || 0) : 0,
    currentMolasses: latest ? Number(latest.molassesPricePerMetricTon || 0) : 0
  };
}
