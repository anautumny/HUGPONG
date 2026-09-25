'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function webService(file) {
  return fs.readFileSync(path.join(__dirname, '..', '..', 'web', 'react-app', 'src', 'services', file), 'utf8');
}

test('web agricultural reads use authenticated server scope without direct Firestore listeners', () => {
  const contracts = [
    ['fieldsService.js', ['/api/fields', '/api/crop-cycles', '/api/block-farms', '/api/users']],
    ['blockFarmsService.js', ['/api/block-farms', '/api/fields', '/api/users']],
    ['operationReadService.js', ['/api/logs']],
    ['pricesService.js', ['/api/prices']],
    ['auditService.js', ['/api/audit-reports']],
    ['dashboardService.js', ['/api/prices', '/api/fields', '/api/block-farms', '/api/crop-cycles', '/api/logs', '/api/audit-reports']]
  ];

  contracts.forEach(([file, endpoints]) => {
    const source = webService(file);
    assert.doesNotMatch(source, /from ['"]\.\/firebaseClient['"]|\bonSnapshot\b|\bcollection\s*\(db|\bdoc\s*\(db/);
    endpoints.forEach(endpoint => assert.match(source, new RegExp(endpoint.replaceAll('/', '\\/'))));
  });
});

test('web API reads coalesce in-flight work and invalidate after authoritative mutations', () => {
  const source = webService('apiClient.js');
  assert.match(source, /const readCache = new Map\(\)/);
  assert.match(source, /const inFlightReads = new Map\(\)/);
  assert.match(source, /inFlightReads\.has\(path\)/);
  assert.match(source, /announceServerMutation\(path\)/);
  assert.match(source, /hugpong:server-mutation/);
  assert.match(source, /forcedRefreshQueued/);
  assert.match(source, /void refresh\(\{ force: true \}\)/);
});

test('web startup excludes the Firestore SDK and lazy-loads role workspaces', () => {
  const firebaseClient = webService('firebaseClient.js');
  const app = fs.readFileSync(path.join(__dirname, '..', '..', 'web', 'react-app', 'src', 'App.jsx'), 'utf8');
  assert.doesNotMatch(firebaseClient, /firebase\/firestore|getFirestore|onSnapshot/);
  assert.match(app, /const DashboardView = lazy\(/);
  assert.match(app, /<Suspense fallback=\{<RouteLoadingState \/>\}>/);
});
