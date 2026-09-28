'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  allowedRolesForRequest,
  requireAccountReady,
  requireApiPermission
} = require('../middleware/requestPermissions');
const { ROLES } = require('../schema/firestoreSchema');
const { resolveAccountAssignments } = require('../services/accountAuthorization');

const root = path.resolve(__dirname, '..', '..');
const routeMounts = Object.freeze({
  'prices.js': '/api/prices',
  'users.js': '/api/users',
  'blockFarms.js': '/api/block-farms',
  'fields.js': '/api/fields',
  'logs.js': '/api/logs',
  'cropCycles.js': '/api/crop-cycles',
  'auditReports.js': '/api/audit-reports',
  'tickets.js': '/api/tickets',
  'sms.js': '/api/sms',
  'auditEvents.js': '/api/audit-events',
  'telemetry.js': '/api/terminal-diagnostics',
  'systemDiagnostics.js': '/api/system-diagnostics',
  'diagnostics.js': '/api/diagnostics'
});

function responseRecorder() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

test('every mounted API route has an explicit method/path permission policy', () => {
  for (const [file, mount] of Object.entries(routeMounts)) {
    const source = fs.readFileSync(path.join(root, 'server', 'routes', file), 'utf8');
    const routes = source.matchAll(/router\.(get|post|put|patch|delete)\('([^']+)'/g);
    for (const route of routes) {
      const method = route[1].toUpperCase();
      const routePath = route[2] === '/' ? '' : route[2].replace(/:[A-Za-z0-9_]+/g, 'SAMPLE');
      const fullPath = `${mount}${routePath}`;
      assert.ok(allowedRolesForRequest(method, fullPath)?.length, `${method} ${fullPath} has no permission policy`);
    }
  }
});

test('unknown API routes and unauthorized roles fail closed', () => {
  assert.equal(allowedRolesForRequest('GET', '/api/not-yet-approved'), null);
  assert.deepEqual(allowedRolesForRequest('POST', '/api/prices'), [ROLES.SRA_ADMIN]);

  const missingPolicyResponse = responseRecorder();
  requireApiPermission({ method: 'GET', originalUrl: '/api/not-yet-approved', authUser: { canonicalRole: ROLES.SUPER_ADMIN } }, missingPolicyResponse, () => {});
  assert.equal(missingPolicyResponse.statusCode, 403);
  assert.equal(missingPolicyResponse.body.code, 'API_PERMISSION_POLICY_MISSING');

  const wrongRoleResponse = responseRecorder();
  requireApiPermission({ method: 'POST', originalUrl: '/api/prices', authUser: { canonicalRole: ROLES.FARM_MANAGER } }, wrongRoleResponse, () => {});
  assert.equal(wrongRoleResponse.statusCode, 403);
  assert.equal(wrongRoleResponse.body.code, 'FORBIDDEN');
});

test('application-data access requires completed account setup', () => {
  for (const user of [
    { phoneVerified: false, requiresPasswordChange: false },
    { phoneVerified: true, requiresPasswordChange: true }
  ]) {
    const response = responseRecorder();
    let continued = false;
    requireAccountReady({ authUser: user }, response, () => { continued = true; });
    assert.equal(continued, false);
    assert.equal(response.statusCode, 403);
    assert.equal(response.body.code, 'ACCOUNT_SETUP_REQUIRED');
  }

  const response = responseRecorder();
  let continued = false;
  requireAccountReady({ authUser: { phoneVerified: true, requiresPasswordChange: false } }, response, () => { continued = true; });
  assert.equal(continued, true);
});

test('server mounts the fail-closed API boundary before every data router', () => {
  const server = fs.readFileSync(path.join(root, 'server', 'server.js'), 'utf8');
  const boundary = server.indexOf("app.use('/api', requireAuth, createAuthenticatedApiRateLimit(), requireAccountReady, requireApiPermission)");
  assert.ok(boundary > 0);
  for (const mount of Object.values(routeMounts)) {
    assert.ok(server.indexOf(`app.use('${mount}'`) > boundary, `${mount} must be mounted after the API permission boundary`);
  }
});

test('authenticated Web and Mobile requests always declare their client platform', () => {
  const web = fs.readFileSync(path.join(root, 'web', 'react-app', 'src', 'services', 'apiClient.js'), 'utf8');
  const mobile = fs.readFileSync(path.join(root, 'mobile', 'src', 'services', 'authService.js'), 'utf8');
  assert.match(web, /webClientHeaders[\s\S]*'x-client-platform': 'web'/);
  assert.match(web, /authenticatedRequest[\s\S]*webClientHeaders\(\)/);
  assert.match(mobile, /mobileHeaders[\s\S]*'x-client-platform': 'mobile'/);
  assert.match(mobile, /authenticatedRequest[\s\S]*mobileHeaders\(clientInstanceId\)/);
});

test('active database assignments replace stale session assignment claims', async () => {
  const snapshots = {
    block_farms: [
      { id: 'BF-OLD', value: { managerUserId: '03000001', status: 'ARCHIVED' } },
      { id: 'BF-NEW', value: { managerUserId: '03000001', status: 'ACTIVE' } }
    ],
    fields: []
  };
  const database = {
    collection(name) {
      return {
        where() {
          return {
            async get() {
              return { docs: snapshots[name].map(item => ({ id: item.id, data: () => item.value })) };
            }
          };
        }
      };
    }
  };

  const assignments = await resolveAccountAssignments(database, '03000001', ROLES.FARM_MANAGER);
  assert.deepEqual(assignments, { blockFarmId: 'BF-NEW', fieldId: '' });
  const middleware = fs.readFileSync(path.join(root, 'server', 'middleware', 'auth.js'), 'utf8');
  assert.match(middleware, /resolveAccountAssignments\(db, userId, currentRole\)/);
  assert.doesNotMatch(middleware, /blockFarmId: presented\.blockFarmId/);
});

test('every authentication route is either protected or explicitly public and throttled', () => {
  const source = fs.readFileSync(path.join(root, 'server', 'routes', 'auth.js'), 'utf8');
  const declarations = Array.from(source.matchAll(/router\.(get|post|put|patch|delete)\('([^']+)'/g));
  const publicRoutes = new Set([
    'POST /mobile-session',
    'POST /password-recovery/request',
    'POST /password-recovery/verify',
    'POST /password-recovery/complete',
    'POST /login',
    'POST /registration-otp/request',
    'POST /registration-otp/verify',
    'POST /register',
    'POST /logout'
  ]);

  for (let index = 0; index < declarations.length; index += 1) {
    const declaration = declarations[index];
    const key = `${declaration[1].toUpperCase()} ${declaration[2]}`;
    const segment = source.slice(declaration.index, declarations[index + 1]?.index || source.length);
    if (segment.includes('requireAuth')) continue;
    assert.ok(publicRoutes.has(key), `${key} is neither authenticated nor on the reviewed public allowlist`);
    if (key !== 'POST /logout') {
      assert.match(segment, /RateLimit/, `${key} must have a request throttle`);
    }
  }
});
