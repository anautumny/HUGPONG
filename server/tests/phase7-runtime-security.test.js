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

test('takeover authorization denies wrong role and another manager block farm while own-field requests reach server authorization', async () => {
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
  assert.equal(nextCalled, true);
  assert.equal(response.statusCode, 200);

  const wrongRoleResponse = { ...response, statusCode: 200, body: null };
  requireRole([ROLES.FARM_MANAGER])(
    { session: { user: { employeeId: '02000001', role: ROLES.SRA_ADMIN } } },
    wrongRoleResponse,
    () => { nextCalled = true; }
  );
  assert.equal(wrongRoleResponse.statusCode, 403);
});

test('manager write paths attach optional verified grants and central service distinguishes ownership from takeover', () => {
  const logs = read('../routes/logs.js');
  const cycles = read('../routes/cropCycles.js');
  const operations = read('../services/cropCycleOperations.js');
  assert.equal((logs.match(/attachTakeoverAuthorization/g) || []).length, 4);
  assert.equal((cycles.match(/attachTakeoverAuthorization/g) || []).length, 4);
  assert.match(operations, /operationAuthorization\(user/);
  assert.match(operations, /TAKEOVER_AUTHORIZATION_REQUIRED/);
  const middleware = read('../middleware/takeoverAuthorization.js');
  assert.match(middleware, /if \(!rawGrant\) return next\(\)/);
  assert.match(middleware, /verifyTakeoverGrant/);
});

test('Firestore rules force every operational read through the scoped API', () => {
  const rules = read('../../firestore.rules');
  for (const collection of ['block_farms', 'fields', 'crop_cycles', 'operation_logs', 'audit_reports', 'sra_prices', 'support_tickets']) {
    assert.match(rules, new RegExp(`match \/${collection}\/[\\s\\S]{0,100}allow read, write: if false;`));
  }
  assert.doesNotMatch(rules, /allow read: if|allow write: if (?!false)/);
});

test('Farm Manager operation subscriptions delegate scoped aggregation to the server', () => {
  const webSource = read('../../web/react-app/src/services/operationReadService.js');
  const serverSource = read('../services/operationQueryService.js');
  assert.match(webSource, /subscribeToAuthenticatedResource\(`\/api\/logs\$\{statusQuery\}`/);
  assert.doesNotMatch(webSource, /onSnapshot|collection\(db|where\(/);
  assert.match(serverSource, /where\('managerUserId', '==', userId\)/);
  assert.match(serverSource, /where\('fieldId', 'in', fieldIds\)/);
});

test('Field Operations exposes one Manager Takeover exit action', () => {
  const operationsView = read('../../web/react-app/src/views/operations/OperationsView.jsx');
  assert.equal((operationsView.match(/>\s*Exit Manager Takeover\s*</g) || []).length, 1);
  assert.match(operationsView, /Active Manager Takeover banner/);
});

test('Phase 7 removes SRA renewal, fabricated mobile prices, and pending operation UI', () => {
  const fieldOps = read('../../mobile/src/screens/FieldOpsScreen.js');
  const analyticsComponents = read('../../mobile/src/components/analytics/AnalyticsComponents.js');
  const analyticsScreen = read('../../mobile/src/screens/AnalyticsScreen.js');
  const home = read('../../mobile/src/screens/HomeScreen.js');
  const operationsView = read('../../web/react-app/src/views/operations/OperationsView.jsx');
  const managerDashboard = read('../../web/react-app/src/views/dashboard/FarmManagerDashboard.jsx');
  assert.match(fieldOps, /isFullyCompleted && activeRole === 'Farm Member'/);
  assert.doesNotMatch(fieldOps, /SRA Admin Cycle Renewal|SRA Admin, or authorized via Manager Takeover/);
  assert.doesNotMatch(analyticsComponents, /2650|9500|priceRecord\?\.sugarPrice\b|priceRecord\?\.molassesPrice\b/);
  assert.match(analyticsComponents, /No price reference available/);
  assert.match(analyticsScreen, /newEffectiveDate/);
  assert.match(analyticsScreen, /newWeekLabel/);
  assert.match(analyticsScreen, /newCircularNumber/);
  assert.match(analyticsScreen, /newPriceSource/);
  assert.match(analyticsScreen, /m <= 0/);
  assert.match(analyticsScreen, /Incomplete Circular/);
  assert.match(analyticsComponents, /\/Lkg/);
  assert.match(analyticsComponents, /\/MT/);
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
  assert.match(superSection, /label: 'System Sync Monitor'[\s\S]{0,120}id: 'nav-system-sync'/);
  assert.match(app, /AGRICULTURAL_ROLES = \[ROLE_KEYS\.FARM_MANAGER, ROLE_KEYS\.SRA_ADMIN\]/);
  assert.match(app, /GOVERNANCE_ROLES = \[ROLE_KEYS\.SUPER_ADMIN\]/);
  assert.match(app, /SYNC_MONITOR_ROLES = \[ROLE_KEYS\.FARM_MANAGER, ROLE_KEYS\.SUPER_ADMIN\]/);
});
