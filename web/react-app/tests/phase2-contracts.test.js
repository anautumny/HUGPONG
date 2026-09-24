import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CROP_STAGE_MAX,
  CROP_STAGE_MIN,
  INITIAL_CROP_STAGE_OPTIONS,
  SUGARCANE_STAGES
} from '../src/constants/cropStages.js';
import {
  selectCropFieldProgress,
  selectOperationalCostBreakdown,
  selectPriceTrends,
  selectProductionCost
} from '../src/services/analyticsSelectors.js';
import { formatCropYear as formatDisplayCropYear } from '../src/utils/formatters.js';
import { formatCropYear as formatSchemaCropYear } from '../src/services/firestoreSchema.js';

test('the web crop-stage contract contains exactly the six current stages', () => {
  assert.equal(CROP_STAGE_MIN, 1);
  assert.equal(CROP_STAGE_MAX, 6);
  assert.deepEqual(SUGARCANE_STAGES.map(stage => stage.stageNumber), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(
    INITIAL_CROP_STAGE_OPTIONS,
    SUGARCANE_STAGES.map(stage => ({ value: String(stage.stageNumber), label: stage.name }))
  );
});

test('schema and display crop-year formatters preserve their existing fallback contracts', () => {
  assert.equal(formatSchemaCropYear('', ''), '');
  assert.equal(formatDisplayCropYear('', 'missing'), 'missing');
  assert.equal(formatSchemaCropYear('2026/27'), '2026-2027');
  assert.equal(formatDisplayCropYear('CY 2026'), '2026-2027');
});

test('crop progress uses the current crop-cycle stage and recorded field area', () => {
  const result = selectCropFieldProgress({
    fields: [
      { id: 'FLD-1', blockFarmId: 'BF-1', currentCycleId: 'CYC-1', cropYear: '2025-2026', areaHa: 2, stageNumber: 1 },
      { id: 'FLD-2', blockFarmId: 'BF-2', cropYear: '2026-2027', areaHa: 3, stageNumber: 6 }
    ],
    cropCycles: [
      { id: 'CYC-1', fieldId: 'FLD-1', cropYear: '2026-2027', currentStageNumber: 3 }
    ],
    selectedFarmId: 'BF-1',
    selectedSeason: '2026-2027'
  });

  assert.equal(result.totalPlots, 1);
  assert.equal(result.totalAcreageHa, 2);
  assert.equal(result.stagesDistribution.find(stage => stage.stageNumber === 3).plotsCount, 1);
});

test('production-cost and category selectors describe ACTIVE records only', () => {
  const fields = [{ id: 'FLD-1', blockFarmId: 'BF-1', areaHa: 2, memberName: 'Member One' }];
  const operations = [
    { id: 'LOG-1', fieldId: 'FLD-1', status: 'ACTIVE', category: 'prep', totalCost: 100, performedOn: '2026-09-01' },
    { id: 'LOG-2', fieldId: 'FLD-1', status: 'ARCHIVED', category: 'prep', totalCost: 900, performedOn: '2026-09-02' }
  ];

  const production = selectProductionCost({
    operations,
    fields,
    blockFarms: [{ id: 'BF-1', name: 'Farm One' }],
    selectedFarmId: 'BF-1',
    selectedPeriod: '2026-09',
    isFarmManager: true
  });
  const breakdown = selectOperationalCostBreakdown({
    operations,
    fields,
    selectedFarmId: 'BF-1',
    selectedPeriod: '2026-09'
  });

  assert.equal(production.totalExpenditure, 100);
  assert.equal(production.totalAuditedHa, 2);
  assert.equal(production.averageCostPerHa, 50);
  assert.equal(production.operationsCount, 1);
  assert.equal(breakdown.grandTotalCost, 100);
  assert.equal(breakdown.totalOpsCount, 1);
});

test('price trends preserve the canonical SRA units and latest values', () => {
  const result = selectPriceTrends({
    prices: [
      { effectiveDate: '2026-09-01', weekLabel: 'Week 1', sugarPricePerLkg: 2800, molassesPricePerMetricTon: 4100 },
      { effectiveDate: '2026-09-08', weekLabel: 'Week 2', sugarPricePerLkg: 2850, molassesPricePerMetricTon: 4200 }
    ]
  });

  assert.equal(result.trendPoints.length, 2);
  assert.equal(result.currentSugar, 2850);
  assert.equal(result.currentMolasses, 4200);
  assert.equal(result.minSugar, 2800);
  assert.equal(result.maxMolasses, 4200);
});
