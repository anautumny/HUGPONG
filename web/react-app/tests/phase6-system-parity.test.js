import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import * as webSchema from '../src/services/firestoreSchema.js';
import * as webAnalytics from '../src/services/analyticsSelectors.js';

const require = createRequire(import.meta.url);
const serverSchema = require('../../../server/schema/firestoreSchema.js');
const testDir = path.dirname(fileURLToPath(import.meta.url));

async function importSource(relativePath, transform = source => source) {
  const source = fs.readFileSync(path.resolve(testDir, relativePath), 'utf8');
  const prepared = transform(source);
  const url = `data:text/javascript;base64,${Buffer.from(prepared).toString('base64')}`;
  return import(url);
}

async function loadMobileSchema() {
  return importSource('../../../mobile/src/data/firestoreSchema.js');
}

async function loadMobileAnalytics() {
  const stages = JSON.parse(fs.readFileSync(
    path.resolve(testDir, '../../../mobile/src/constants/cropStages.json'),
    'utf8'
  ));
  const prelude = [
    `const SUGARCANE_STAGES = Object.freeze(${JSON.stringify(stages)});`,
    `const CROP_STAGE_MIN = ${stages[0].stageNumber};`,
    `const CROP_STAGE_MAX = ${stages[stages.length - 1].stageNumber};`
  ].join('\n');

  return importSource('../../../mobile/src/services/analyticsSelectors.js', source => source
    .replace(
      /^import \{ CROP_STAGE_MAX, CROP_STAGE_MIN, SUGARCANE_STAGES \} from '\.\.\/constants\/cropStages';\r?\n/m,
      `${prelude}\n`
    )
    .replace(
      /^export \{ SUGARCANE_STAGES \} from '\.\.\/constants\/cropStages';\r?\n/m,
      'export { SUGARCANE_STAGES };\n'
    ));
}

const plain = value => JSON.parse(JSON.stringify(value));

test('server, web, and Android share collection, role, and platform contracts', async () => {
  const mobileSchema = await loadMobileSchema();
  const { USER_CREDENTIALS: _serverOnlyCredentials, ...publicCollections } = serverSchema.COLLECTIONS;

  assert.deepEqual(plain(webSchema.COLLECTIONS), publicCollections);
  assert.deepEqual(plain(mobileSchema.COLLECTIONS), publicCollections);

  const aliases = [
    'MEMBER', 'Member Farmer', 'MEMBER_FARMER',
    'MANAGER', 'Farm Manager', 'FARM_MANAGER',
    'ADMIN', 'SRA Admin', 'SRA_ADMIN',
    'SUPERADMIN', 'Super Admin', 'SUPER_ADMIN'
  ];
  aliases.forEach(alias => {
    const expected = serverSchema.canonicalRole(alias);
    assert.equal(webSchema.role(alias), expected);
    assert.equal(mobileSchema.canonicalRole(alias), expected);
  });

  Object.values(serverSchema.ROLES).forEach(role => {
    ['web', 'mobile'].forEach(platform => {
      const expected = serverSchema.isRoleAllowedOnPlatform(role, platform);
      assert.equal(webSchema.isRoleAllowedOnPlatform(role, platform), expected);
      assert.equal(mobileSchema.isRoleAllowedOnPlatform(role, platform), expected);
    });
  });
});

test('server, web, and Android serialize the same canonical operation record', async () => {
  const mobileSchema = await loadMobileSchema();
  const operation = {
    fieldId: 'field-001',
    cycleId: 'cyc-field-001-001',
    submittedByUserId: 'USR-001',
    submissionSource: 'MEMBER',
    operationDefinitionId: 'SRA-02',
    operationName: 'Land Preparation',
    category: 'prep',
    stageNumber: 1,
    performedOn: '2026-09-20',
    areaHa: 2,
    peopleCount: 4,
    quantity: { value: 2, unit: 'ha', inputName: '' },
    totalCost: 1000,
    lineItems: [{
      lineItemId: 'LINE-1',
      description: 'Disc plowing',
      quantity: 2,
      unit: 'ha',
      unitCost: 500,
      subtotal: 1000
    }],
    isSupplemental: false,
    amendments: [],
    status: 'ACTIVE',
    createdAt: '2026-09-20T08:00:00.000Z',
    updatedAt: '2026-09-20T08:00:00.000Z',
    archivedAt: null,
    archivedByUserId: null
  };

  const expected = serverSchema.buildOperationLog(operation);
  assert.deepEqual(plain(webSchema.toOperation(operation)), expected);
  assert.deepEqual(plain(mobileSchema.toOperationLogDocument(operation)), expected);
});

test('web and Android serialize the same audit report and all platforms serialize the same SRA price', async () => {
  const mobileSchema = await loadMobileSchema();
  const operationSnapshot = {
    operationLogId: 'LOG-001',
    fieldId: 'FIELD-001',
    cycleId: 'CYC-FIELD-001-001',
    operationDefinitionId: 'SRA-02',
    operationName: 'Land Preparation',
    category: 'prep',
    stageNumber: 1,
    performedOn: '2026-09-20',
    areaHa: 2,
    peopleCount: 4,
    quantity: null,
    totalCost: 1000,
    lineItems: []
  };
  const report = {
    blockFarmId: 'bf-001',
    period: '2026-09',
    status: 'PENDING',
    qrHash: 'HUG-TEST-HASH',
    compiledByUserId: 'MGR-001',
    compiledAt: '2026-09-21T08:00:00.000Z',
    operationSnapshots: [operationSnapshot],
    certificationNotes: '',
    certifiedByUserId: null,
    certifiedAt: null,
    createdAt: '2026-09-21T08:00:00.000Z',
    updatedAt: '2026-09-21T08:00:00.000Z'
  };
  assert.deepEqual(
    plain(mobileSchema.toAuditReportDocument(report)),
    plain(webSchema.toReport(report))
  );

  const price = {
    effectiveDate: '2026-09-21',
    weekLabel: 'Week 3, September 2026',
    sugarPricePerLkg: 2500,
    sugarPriceChange: 25,
    molassesPricePerMetricTon: 9000,
    molassesPriceChange: -50,
    circularNumber: 'SRA-2026-09-03',
    source: 'SRA Circular',
    publishedByUserId: 'SRA-001',
    publishedAt: '2026-09-21T08:00:00.000Z'
  };
  const expectedPrice = serverSchema.buildSraPrice(price);
  assert.deepEqual(plain(webSchema.toPrice(price)), expectedPrice);
  assert.deepEqual(plain(mobileSchema.toPriceDocument(price)), expectedPrice);
});

test('web and Android analytics produce equal canonical metrics for equal data and scope', async () => {
  const mobileAnalytics = await loadMobileAnalytics();
  const fields = [
    { id: 'FIELD-001', blockFarmId: 'BF-001', currentCycleId: 'CYC-FIELD-001-001', memberUserId: 'MEM-001', memberName: 'Ana', areaHa: 2 },
    { id: 'FIELD-002', blockFarmId: 'BF-002', currentCycleId: 'CYC-FIELD-002-001', memberUserId: 'MEM-002', memberName: 'Ben', areaHa: 3 }
  ];
  const cropCycles = [
    { id: 'CYC-FIELD-001-001', fieldId: 'FIELD-001', cropYear: '2026-2027', currentStageNumber: 2 },
    { id: 'CYC-FIELD-002-001', fieldId: 'FIELD-002', cropYear: '2026-2027', currentStageNumber: 5 }
  ];
  const blockFarms = [
    { id: 'BF-001', name: 'North Farm', declaredAreaHa: 2 },
    { id: 'BF-002', name: 'South Farm', declaredAreaHa: 3 }
  ];
  const operations = [
    { id: 'LOG-001', fieldId: 'FIELD-001', status: 'ACTIVE', operationName: 'Planting', category: 'plant', stageNumber: 2, performedOn: '2026-09-10', areaHa: 2, peopleCount: 4, totalCost: 2000, lineItems: [] },
    { id: 'LOG-002', fieldId: 'FIELD-002', status: 'ACTIVE', operationName: 'Top-Dress', category: 'maint', stageNumber: 5, performedOn: '2026-09-12', areaHa: 3, peopleCount: 5, totalCost: 3000, lineItems: [{ lineItemId: 'LINE-2' }] },
    { id: 'LOG-003', fieldId: 'FIELD-001', status: 'ARCHIVED', operationName: 'Old Work', category: 'prep', stageNumber: 1, performedOn: '2026-08-01', areaHa: 2, peopleCount: 1, totalCost: 999, lineItems: [] }
  ];
  const prices = [
    { effectiveDate: '2026-09-07', weekLabel: 'Week 1, September 2026', sugarPricePerLkg: 2450, sugarPriceChange: 0, molassesPricePerMetricTon: 8900, molassesPriceChange: 0, circularNumber: 'SRA-1' },
    { effectiveDate: '2026-09-14', weekLabel: 'Week 2, September 2026', sugarPricePerLkg: 2500, sugarPriceChange: 50, molassesPricePerMetricTon: 9000, molassesPriceChange: 100, circularNumber: 'SRA-2' }
  ];

  const cropInput = { fields, cropCycles, selectedFarmId: 'ALL', selectedSeason: '2026-2027' };
  assert.deepEqual(plain(mobileAnalytics.selectCropFieldProgress(cropInput)), plain(webAnalytics.selectCropFieldProgress(cropInput)));

  const productionInput = { operations, fields, blockFarms, selectedFarmId: 'ALL', selectedPeriod: '2026-09', isFarmManager: false };
  assert.deepEqual(plain(mobileAnalytics.selectProductionCost(productionInput)), plain(webAnalytics.selectProductionCost(productionInput)));

  const breakdownInput = { operations, fields, selectedFarmId: 'ALL', selectedPeriod: '2026-09' };
  const categoryProjection = result => ({
    ...result,
    categories: result.categories.map(({ badgeClass: _badgeClass, ...category }) => category),
    sortedCategories: result.sortedCategories.map(({ badgeClass: _badgeClass, ...category }) => category),
    topCategory: result.topCategory
      ? (({ badgeClass: _badgeClass, ...category }) => category)(result.topCategory)
      : null
  });
  assert.deepEqual(
    plain(categoryProjection(mobileAnalytics.selectOperationalCostBreakdown(breakdownInput))),
    plain(categoryProjection(webAnalytics.selectOperationalCostBreakdown(breakdownInput)))
  );

  const activityInput = { operations, fields, selectedFarmId: 'ALL', selectedPeriod: '2026-09' };
  assert.deepEqual(plain(mobileAnalytics.selectFarmOperationsAnalytics(activityInput)), plain(webAnalytics.selectFarmOperationsAnalytics(activityInput)));

  const priceInput = { prices, timeframe: 'weekly' };
  assert.deepEqual(plain(mobileAnalytics.selectPriceTrends(priceInput)), plain(webAnalytics.selectPriceTrends(priceInput)));
});
