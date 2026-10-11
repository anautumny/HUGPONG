'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  STAGING_CONFIRMATION,
  WRITE_CONFIRMATION,
  applicationLoadConfiguration,
  clientHeaders,
  operationPayload,
  measureApplicationCapacity
} = require('../scripts/measureApplicationCapacity');

const root = path.resolve(__dirname, '..', '..');

function response(status, payload) {
  return { ok: status >= 200 && status < 300, status, json: async () => payload };
}

function stagingEnvironment(overrides = {}) {
  return {
    APPLICATION_LOAD_CONFIRM: STAGING_CONFIRMATION,
    APPLICATION_LOAD_ENVIRONMENT: 'staging',
    APPLICATION_LOAD_BASE_URL: 'https://hugpong-beta.example.test',
    APPLICATION_LOAD_IDENTIFIER: 'dedicated-staging-manager',
    APPLICATION_LOAD_PASSWORD: 'never-print-this-password',
    APPLICATION_LOAD_PROFILE: 'both',
    APPLICATION_LOAD_READ_REQUESTS: '12',
    APPLICATION_LOAD_CONCURRENCY: '3',
    APPLICATION_LOAD_DUPLICATE_WRITES: '4',
    APPLICATION_LOAD_WRITE_CONFIRM: WRITE_CONFIRMATION,
    ...overrides
  };
}

test('application load configuration is staging-only, bounded, and explicit about writes', () => {
  const configuration = applicationLoadConfiguration(stagingEnvironment());
  assert.equal(configuration.origin, 'https://hugpong-beta.example.test');
  assert.deepEqual(configuration.platforms, ['web', 'mobile']);
  assert.equal(configuration.readRequests, 12);
  assert.equal(configuration.writeEnabled, true);

  assert.throws(
    () => applicationLoadConfiguration(stagingEnvironment({ APPLICATION_LOAD_ENVIRONMENT: 'production' })),
    /Production load testing is refused/
  );
  assert.throws(
    () => applicationLoadConfiguration(stagingEnvironment({ APPLICATION_LOAD_BASE_URL: 'https://hugpong.example.com' })),
    /hostname must visibly identify/
  );
  assert.throws(
    () => applicationLoadConfiguration(stagingEnvironment({ APPLICATION_LOAD_CONFIRM: '' })),
    /APPLICATION_LOAD_CONFIRM/
  );
  assert.throws(
    () => applicationLoadConfiguration(stagingEnvironment({ APPLICATION_LOAD_PROFILE: 'web' })),
    /requires the Mobile profile/
  );
});

test('Web and Mobile capacity profiles use the real client-platform contract', () => {
  const web = clientHeaders('web', 'web-token', true);
  const mobile = clientHeaders('mobile', 'mobile-token', true);
  assert.equal(web['x-client-platform'], 'web');
  assert.equal(web['x-device-model'], 'capacity-browser');
  assert.equal(mobile['x-client-platform'], 'mobile');
  assert.equal(mobile['x-device-model'], 'capacity-android');
  assert.equal(web.authorization, 'Bearer web-token');
  assert.equal(mobile.authorization, 'Bearer mobile-token');
});

test('staging measurement exercises authenticated reads and proves duplicate writes converge on one operation', async () => {
  const configuration = applicationLoadConfiguration(stagingEnvironment());
  let operationCreated = false;
  let archiveRequests = 0;
  const observedPlatforms = new Set();
  const fakeFetch = async (url, options = {}) => {
    const parsed = new URL(url);
    const platform = options.headers?.['x-client-platform'];
    if (platform) observedPlatforms.add(platform);
    if (parsed.pathname === '/auth/login') {
      const body = JSON.parse(options.body);
      return response(200, {
        success: true,
        token: `${body.clientPlatform}-staging-token`,
        user: { employeeId: 'MGR-STAGING', canonicalRole: 'FARM_MANAGER' }
      });
    }
    if (parsed.pathname === '/api/fields' && options.method === 'GET') {
      return response(200, {
        success: true,
        data: [{
          id: 'FLD-STAGING',
          status: 'ACTIVE',
          memberUserId: 'MGR-STAGING',
          currentCycleId: 'CYC-STAGING',
          blockFarmId: 'BF-STAGING',
          areaHa: 2
        }]
      });
    }
    if (parsed.pathname === '/api/crop-cycles' && options.method === 'GET') {
      return response(200, {
        success: true,
        data: [{
          id: 'CYC-STAGING',
          fieldId: 'FLD-STAGING',
          status: 'ACTIVE',
          cropYear: '2026-2027',
          currentStageNumber: 3
        }]
      });
    }
    if (parsed.pathname === '/api/logs' && options.method === 'POST') {
      const body = JSON.parse(options.body);
      const replayed = operationCreated;
      operationCreated = true;
      return response(replayed ? 200 : 201, {
        success: true,
        replayed,
        data: { id: body.id }
      });
    }
    if (parsed.pathname === '/api/logs/archive' && options.method === 'POST') {
      archiveRequests += 1;
      return response(200, { success: true, archivedCount: 1 });
    }
    return response(200, { success: true, data: [] });
  };

  const report = await measureApplicationCapacity(configuration, fakeFetch);
  assert.equal(report.passed, true);
  assert.equal(report.reads.requests, 12);
  assert.equal(report.reads.failed, 0);
  assert.deepEqual(Array.from(observedPlatforms).sort(), ['mobile', 'web']);
  assert.equal(report.duplicateWrite.attempts, 4);
  assert.equal(report.duplicateWrite.created, 1);
  assert.equal(report.duplicateWrite.replayed, 3);
  assert.equal(report.duplicateWrite.oneCanonicalRecord, true);
  assert.equal(report.duplicateWrite.archivedAfterTest, true);
  assert.equal(archiveRequests, 1);
  const serialized = JSON.stringify(report);
  assert.doesNotMatch(serialized, /never-print-this-password|staging-token|MGR-STAGING/);
});

test('duplicate operation payload stays inside canonical field area and carries one stable mutation identity', () => {
  const payload = operationPayload(
    { id: 'FLD-1', blockFarmId: 'BF-1', areaHa: 2 },
    { id: 'CYC-1', cropYear: '2026-2027', currentStageNumber: 4 },
    'LOAD-ONE'
  );
  assert.equal(payload.areaHa, 0.01);
  assert.equal(payload.operationDefinitionId, 'CUSTOM');
  assert.equal(payload.stageNumber, 1);
  assert.equal(payload.isSupplemental, true);
  assert.equal(payload._mutation.mutationId, payload._mutation.idempotencyKey);
  assert.match(payload._mutation.entityKey, /LOAD-ONE/);
  assert.throws(
    () => operationPayload(
      { id: 'FLD-1', blockFarmId: 'BF-1', areaHa: 0.005 },
      { id: 'CYC-1', cropYear: '2026-2027', currentStageNumber: 1 },
      'LOAD-TWO'
    ),
    /valid registered area/
  );
});

test('Phase 4 remains an operator tool and does not add production load controls to either client', () => {
  const script = fs.readFileSync(path.join(root, 'server/scripts/measureApplicationCapacity.js'), 'utf8');
  const web = fs.readFileSync(path.join(root, 'web/react-app/src/App.jsx'), 'utf8');
  const mobile = fs.readFileSync(path.join(root, 'mobile/App.js'), 'utf8');
  assert.match(script, /x-client-platform/);
  assert.match(script, /Production load testing is refused/);
  assert.match(script, /CREATE_AND_ARCHIVE_STAGING_OPERATION/);
  assert.doesNotMatch(web, /measureApplicationCapacity|APPLICATION_LOAD_WRITE_CONFIRM/);
  assert.doesNotMatch(mobile, /measureApplicationCapacity|APPLICATION_LOAD_WRITE_CONFIRM/);
});
