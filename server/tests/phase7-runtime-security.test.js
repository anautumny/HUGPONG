'use strict';

process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-only-session-secret-that-is-longer-than-32-characters';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  TAKEOVER_GRANT_TTL_MS,
  issueTakeoverGrant,
  verifyTakeoverGrant
} = require('../security/takeoverGrant');
const { assertManagerFieldAssignment } = require('../services/takeoverAuthorizationService');
const { attachTakeoverAuthorization } = require('../middleware/takeoverAuthorization');
const { requireRole } = require('../middleware/roleGuard');
const { ROLES } = require('../schema/firestoreSchema');

const read = relativePath => fs.readFileSync(path.resolve(__dirname, relativePath), 'utf8');

test('manager takeover grants are signed, actor-bound, field-bound, and short-lived', () => {
  const issuedAt = Date.parse('2026-09-23T08:00:00.000Z');
  const grant = issueTakeoverGrant({ actorId: '03000001', fieldId: 'fld-1' }, issuedAt);
  const valid = verifyTakeoverGrant(grant, {
    actorId: '03000001',
    fieldId: 'FLD-1',
    now: issuedAt + TAKEOVER_GRANT_TTL_MS - 1
  });
  assert.equal(valid.actorId, '03000001');
  assert.equal(valid.fieldId, 'FLD-1');
  assert.equal(valid.expiresAt - valid.issuedAt, 5 * 60 * 1000);
  assert.equal(verifyTakeoverGrant(grant, { actorId: '03000002', fieldId: 'FLD-1', now: issuedAt + 1 }), null);
  assert.equal(verifyTakeoverGrant(grant, { actorId: '03000001', fieldId: 'FLD-2', now: issuedAt + 1 }), null);
  assert.equal(verifyTakeoverGrant(grant, { actorId: '03000001', fieldId: 'FLD-1', now: issuedAt + TAKEOVER_GRANT_TTL_MS }), null);
  assert.equal(verifyTakeoverGrant(`${grant.slice(0, -1)}0`, { actorId: '03000001', fieldId: 'FLD-1', now: issuedAt + 1 }), null);
});

test('takeover authorization denies wrong role, missing grant, and another manager block farm', async () => {
  const documents = {
    'fields/FLD-1': { blockFarmId: 'BF-1' },
    'block_farms/BF-1': { managerUserId: '03000001' }
  };
  const database = {
    collection(collectionName) {
      return {
        doc(id) {
          return {
            async get() {
              const data = documents[`${collectionName}/${id}`];
              return { exists: Boolean(data), data: () => data };
            }
          };
        }
      };
    }
  };
  await assert.rejects(
    assertManagerFieldAssignment(database, '03000002', 'FLD-1'),
    error => error.status === 403 && /outside your assigned block farm/i.test(error.message)
  );
  await assert.doesNotReject(assertManagerFieldAssignment(database, '03000001', 'FLD-1'));

  const response = { statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  let nextCalled = false;
  attachTakeoverAuthorization({ session: { user: { employeeId: '03000001', role: ROLES.FARM_MANAGER } }, headers: {} }, response, () => { nextCalled = true; });
  assert.equal(nextCalled, false);
  assert.equal(response.statusCode, 403);

  const wrongRoleResponse = { ...response, statusCode: 200, body: null };
  requireRole([ROLES.FARM_MANAGER])(
    { session: { user: { employeeId: '02000001', role: ROLES.SRA_ADMIN } } },
    wrongRoleResponse,
    () => { nextCalled = true; }
  );
  assert.equal(wrongRoleResponse.statusCode, 403);
});

test('takeover mutations require the server-verified grant on every manager write path', () => {
  const logs = read('../routes/logs.js');
  const cycles = read('../routes/cropCycles.js');
  const operations = read('../services/cropCycleOperations.js');
  assert.equal((logs.match(/attachTakeoverAuthorization/g) || []).length, 4);
  assert.equal((cycles.match(/attachTakeoverAuthorization/g) || []).length, 3);
  assert.match(operations, /user\.takeoverGrant\.fieldId !== normalizedFieldId/);
  assert.match(operations, /user\.takeoverGrant\.actorId !== identity\.actorId/);
});

test('Firestore read rules enforce operational scope and exclude Super Admin from agriculture', () => {
  const rules = read('../../firestore.rules');
  assert.match(rules, /manager\(\) && assignedFarm\(fieldData\.blockFarmId\)/);
  assert.match(rules, /MEMBER_FARMER[\s\S]{0,100}fieldData\.memberUserId == request\.auth\.uid/);
  assert.match(rules, /match \/operation_logs[\s\S]{0,150}canReadField\(resource\.data\.fieldId\)/);
  assert.match(rules, /match \/audit_reports[\s\S]{0,180}manager\(\) && assignedFarm\(resource\.data\.blockFarmId\)/);
  assert.match(rules, /match \/support_tickets[\s\S]{0,180}createdByUserId == request\.auth\.uid/);
  assert.match(rules, /sraAdmin\(\) && resource\.data\.role != 'SUPER_ADMIN'/);
  const agriculturalRules = ['block_farms', 'fields', 'crop_cycles', 'operation_logs', 'audit_reports', 'sra_prices']
    .map(name => rules.slice(rules.indexOf(`match /${name}/`), rules.indexOf('allow write: if false;', rules.indexOf(`match /${name}/`))))
    .join('\n');
  assert.doesNotMatch(agriculturalRules, /superAdmin\(\)|SUPER_ADMIN/);
});

test('Farm Manager operation subscriptions scope before analytics aggregation', () => {
  const source = read('../../web/react-app/src/services/operationReadService.js');
  const managerScope = source.indexOf("where('blockFarmId', '=='");
  const operationListener = source.indexOf("where('fieldId', '=='");
  assert.ok(managerScope >= 0 && operationListener > managerScope);
  assert.doesNotMatch(source, /FARM_MANAGER[\s\S]{0,500}collection\(db, COLLECTIONS\.OPERATION_LOGS\)[\s\S]{0,100}onSnapshot/);
});

test('Phase 7 removes SRA renewal, fabricated mobile prices, and pending operation UI', () => {
  const fieldOps = read('../../mobile/src/screens/FieldOpsScreen.js');
  const analyticsComponents = read('../../mobile/src/components/analytics/AnalyticsComponents.js');
  const analyticsScreen = read('../../mobile/src/screens/AnalyticsScreen.js');
  const home = read('../../mobile/src/screens/HomeScreen.js');
  const operationsView = read('../../web/react-app/src/views/operations/OperationsView.jsx');
  const managerDashboard = read('../../web/react-app/src/views/dashboard/FarmManagerDashboard.jsx');
  assert.match(fieldOps, /isFullyCompleted && activeRole === 'Member Farmer'/);
  assert.doesNotMatch(fieldOps, /SRA Admin Cycle Renewal|SRA Administrator, or authorized via Supervisor Takeover/);
  assert.doesNotMatch(analyticsComponents, /2650|9500|priceRecord\?\.sugarPrice\b|priceRecord\?\.molassesPrice\b/);
  assert.match(analyticsComponents, /No official price circular available/);
  assert.match(analyticsScreen, /newEffectiveDate/);
  assert.match(analyticsScreen, /newWeekLabel/);
  assert.match(analyticsScreen, /newCircularNumber/);
  assert.match(analyticsScreen, /newPriceSource/);
  assert.match(analyticsScreen, /m <= 0/);
  assert.match(analyticsScreen, /Incomplete Circular/);
  assert.match(analyticsComponents, /per Lkg \(50-kg bag\)/);
  assert.match(analyticsComponents, /per Metric Ton \(MT\)/);
  assert.match(home, /\/Lkg/);
  assert.match(home, /\/MT/);
  assert.doesNotMatch(home, /latest\.(?:price|molasses|week|date)\b/);
  assert.match(home, /latest\.sugarPricePerLkg/);
  assert.match(home, /latest\.molassesPricePerMetricTon/);
  assert.match(home, /latest\.weekLabel/);
  assert.match(home, /latest\.effectiveDate/);
  assert.doesNotMatch(operationsView, /Pending Verification|status === 'PENDING'/);
  assert.doesNotMatch(managerDashboard, /pendingOps|Pending Operation Record/);
});

test('Super Admin web navigation and routes are governance-only', () => {
  const sidebar = read('../../web/react-app/src/components/layout/Sidebar.jsx');
  const app = read('../../web/react-app/src/App.jsx');
  const sectionStart = sidebar.lastIndexOf("} else if (roleKey === ROLE_KEYS.SUPER_ADMIN)");
  const superSection = sidebar.slice(sectionStart, sidebar.indexOf('return sections;', sectionStart));
  assert.doesNotMatch(superSection, /nav-super-prices|nav-super-analytics|nav-farm-field-registry/);
  assert.match(app, /AGRICULTURAL_ROLES = \[ROLE_KEYS\.FARM_MANAGER, ROLE_KEYS\.SRA_ADMIN\]/);
  assert.match(app, /GOVERNANCE_ROLES = \[ROLE_KEYS\.SUPER_ADMIN\]/);
});
