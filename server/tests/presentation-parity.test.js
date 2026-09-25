'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  ROLE_DISPLAY_LABELS,
  STAGE_DISPLAY_LABELS,
  buildOperationPresentation,
  presentOperationRecord
} = require('../domain/presentationContract');

async function importStandaloneModule(relativePath) {
  const source = fs.readFileSync(path.resolve(__dirname, relativePath), 'utf8');
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
}

const fixtures = [
  { name: 'normal', record: { status: 'ACTIVE', submissionSource: 'MEMBER', isSupplemental: false, amendments: [] }, labels: [] },
  { name: 'supplemental', record: { status: 'ACTIVE', submissionSource: 'MEMBER', isSupplemental: true, amendments: [] }, labels: ['Supplemental'] },
  { name: 'takeover', record: { status: 'ACTIVE', submissionSource: 'MANAGER_TAKEOVER', isSupplemental: false, amendments: [] }, labels: ['Manager Takeover'] },
  { name: 'manager own field', record: { status: 'ACTIVE', submissionSource: 'FIELD_OWNER', isSupplemental: false, amendments: [] }, labels: ['Field Owner Entry'] },
  { name: 'amended', record: { status: 'ACTIVE', submissionSource: 'MEMBER', isSupplemental: false, amendments: [{ amendmentId: 'AMD-1' }] }, labels: ['Amended'] },
  { name: 'supplemental takeover', record: { status: 'ACTIVE', submissionSource: 'MANAGER_TAKEOVER', isSupplemental: true, amendments: [] }, labels: ['Supplemental', 'Manager Takeover'] },
  { name: 'supplemental amended', record: { status: 'ACTIVE', submissionSource: 'MEMBER', isSupplemental: true, amendments: [{ amendmentId: 'AMD-1' }] }, labels: ['Supplemental', 'Amended'] },
  { name: 'archived', record: { status: 'ARCHIVED', submissionSource: 'MEMBER', isSupplemental: false, amendments: [] }, labels: ['Archived'] },
  { name: 'all independent dimensions', record: { status: 'ARCHIVED', submissionSource: 'MANAGER_TAKEOVER', isSupplemental: true, amendments: [{ amendmentId: 'AMD-1' }] }, labels: ['Supplemental', 'Manager Takeover', 'Amended', 'Archived'] },
  { name: 'missing provenance is not guessed', record: { status: 'ACTIVE', isSupplemental: false, amendments: [] }, labels: [] }
];

test('server, Web, and Android resolve identical operation presentation semantics', async () => {
  const [web, mobile] = await Promise.all([
    importStandaloneModule('../../web/react-app/src/domain/presentationContract.js'),
    importStandaloneModule('../../mobile/src/domain/presentationContract.js')
  ]);

  for (const fixture of fixtures) {
    const serverValue = buildOperationPresentation(fixture.record);
    const webValue = web.buildOperationPresentation(fixture.record);
    const mobileValue = mobile.buildOperationPresentation(fixture.record);
    assert.deepEqual(webValue, serverValue, `Web mismatch: ${fixture.name}`);
    assert.deepEqual(mobileValue, serverValue, `Mobile mismatch: ${fixture.name}`);
    assert.deepEqual(serverValue.badges.map(badge => badge.label), fixture.labels);
    if (fixture.name === 'missing provenance is not guessed') {
      assert.equal(serverValue.hasExplicitSubmissionSource, false);
      assert.equal(serverValue.submissionSource, '');
    }
  }
});

test('presentation contract uses the approved roles and six Current Stage labels', async () => {
  const web = await importStandaloneModule('../../web/react-app/src/domain/presentationContract.js');
  const mobile = await importStandaloneModule('../../mobile/src/domain/presentationContract.js');
  const expectedRoles = {
    MEMBER_FARMER: 'Farm Member', FARM_MANAGER: 'Farm Manager', SRA_ADMIN: 'SRA Admin', SUPER_ADMIN: 'Super Admin'
  };
  const expectedStages = { 1: 'Land Preparation', 2: 'Planting', 3: 'Basal', 4: 'Weeding', 5: 'Top-Dress', 6: 'Harvest' };
  assert.deepEqual(ROLE_DISPLAY_LABELS, expectedRoles);
  assert.deepEqual(STAGE_DISPLAY_LABELS, expectedStages);
  assert.deepEqual(web.ROLE_DISPLAY_LABELS, expectedRoles);
  assert.deepEqual(mobile.ROLE_DISPLAY_LABELS, expectedRoles);
  assert.deepEqual(web.STAGE_DISPLAY_LABELS, expectedStages);
  assert.deepEqual(mobile.STAGE_DISPLAY_LABELS, expectedStages);
});

test('API presentation metadata is response-only and leaves the canonical record untouched', () => {
  const record = { id: 'LOG-1', status: 'ACTIVE', submissionSource: 'MANAGER_TAKEOVER', isSupplemental: true, amendments: [] };
  const presented = presentOperationRecord(record);
  assert.notStrictEqual(presented, record);
  assert.equal(record.presentation, undefined);
  assert.deepEqual(presented.presentation.badges.map(badge => badge.label), ['Supplemental', 'Manager Takeover']);
});

async function importAnalytics(relativePath) {
  const stages = require('../domain/cropStages.json');
  let source = fs.readFileSync(path.resolve(__dirname, relativePath), 'utf8');
  source = source
    .replace(/import \{ CROP_STAGE_MAX, CROP_STAGE_MIN, SUGARCANE_STAGES \} from '[^']+';/, [
      `const SUGARCANE_STAGES = ${JSON.stringify(stages)};`,
      'const CROP_STAGE_MIN = 1;',
      'const CROP_STAGE_MAX = 6;'
    ].join('\n'))
    .replace(/export \{ SUGARCANE_STAGES \} from '[^']+';\s*/, '')
    .replace(/import \{ canonicalStoredCropYear \} from '[^']+';/, `const canonicalStoredCropYear = value => {
      const match = String(value || '').trim().match(/^(\\d{4})-(\\d{4})$/);
      return match && Number(match[2]) === Number(match[1]) + 1 ? match[0] : '';
    };`);
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
}

test('Web and Android analytics produce identical values for the same canonical scope', async () => {
  const [web, mobile] = await Promise.all([
    importAnalytics('../../web/react-app/src/services/analyticsSelectors.js'),
    importAnalytics('../../mobile/src/services/analyticsSelectors.js')
  ]);
  const fields = [
    { id: 'FLD-1', blockFarmId: 'BF-1', currentCycleId: 'CYC-1', areaHa: 2, stageNumber: 2, memberName: 'One' },
    { id: 'FLD-2', blockFarmId: 'BF-1', currentCycleId: 'CYC-2', areaHa: 3, stageNumber: 4, memberName: 'Two' }
  ];
  const cropCycles = [
    { id: 'CYC-1', fieldId: 'FLD-1', cropYear: '2026-2027', currentStageNumber: 2 },
    { id: 'CYC-2', fieldId: 'FLD-2', cropYear: '2026-2027', currentStageNumber: 4 }
  ];
  const operations = [
    { id: 'A', fieldId: 'FLD-1', cycleId: 'CYC-1', cropYearCycle: '2026-2027', status: 'ACTIVE', category: 'plant', operationName: 'Planting Operations (Labor & Handling)', totalCost: 1000, peopleCount: 4, performedOn: '2026-09-02', lineItems: [{}] },
    { id: 'B', fieldId: 'FLD-2', cycleId: 'CYC-2', cropYearCycle: '2026-2027', status: 'ACTIVE', category: 'weed', operationName: 'Weeding Operations (Hilamon & Herbicides)', totalCost: 9000, peopleCount: 8, performedOn: '2026-09-03', lineItems: [{}] }
  ];
  const scope = { selectedFarmId: 'BF-1', selectedParcelId: 'FLD-1', selectedPeriod: '2026-09' };
  const progressArgs = { fields, cropCycles, selectedFarmId: scope.selectedFarmId, selectedParcelId: scope.selectedParcelId, selectedSeason: '2026-2027' };
  const productionArgs = { operations, fields, blockFarms: [{ id: 'BF-1', name: 'Farm' }], ...scope, isFarmManager: true };
  const metricArgs = { operations, fields, ...scope };

  assert.deepEqual(web.selectCropFieldProgress(progressArgs), mobile.selectCropFieldProgress(progressArgs));
  assert.deepEqual(web.selectProductionCost(productionArgs), mobile.selectProductionCost(productionArgs));
  assert.deepEqual(web.selectOperationalCostBreakdown(metricArgs), mobile.selectOperationalCostBreakdown(metricArgs));
  assert.deepEqual(web.selectFarmOperationsAnalytics(metricArgs), mobile.selectFarmOperationsAnalytics(metricArgs));
});
