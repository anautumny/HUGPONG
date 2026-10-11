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
  const authContext = fs.readFileSync(path.join(__dirname, '..', '..', 'web', 'react-app', 'src', 'context', 'AuthContext.jsx'), 'utf8');
  assert.match(source, /const readCache = new Map\(\)/);
  assert.match(source, /const inFlightReads = new Map\(\)/);
  assert.match(source, /inFlightReads\.has\(path\)/);
  assert.match(source, /announceServerMutation\(path\)/);
  assert.match(source, /hugpong:server-mutation/);
  assert.match(source, /forcedRefreshQueued/);
  assert.match(source, /void refresh\(\{ force: true \}\)/);
  assert.match(source, /READ_CACHE_TTL_MS = 2 \* 60 \* 1000/);
  assert.match(source, /DEFAULT_REFRESH_INTERVAL_MS = 30 \* 60 \* 1000/);
  assert.match(source, /FOCUS_REFRESH_MIN_AGE_MS = 10 \* 60 \* 1000/);
  assert.match(source, /Date\.now\(\) - lastSuccessfulRefreshAt >= FOCUS_REFRESH_MIN_AGE_MS/);
  assert.match(source, /export function clearAuthenticatedReadState\(\)[\s\S]*authenticatedReadGeneration \+= 1;[\s\S]*readCache\.clear\(\);[\s\S]*inFlightReads\.clear\(\);/);
  assert.match(source, /requestGeneration !== authenticatedReadGeneration[\s\S]*AUTH_CONTEXT_CHANGED/);
  assert.match(source, /if \(inFlightReads\.get\(path\) === request\) inFlightReads\.delete\(path\)/);
  assert.match(authContext, /const clearSession[\s\S]*clearAuthenticatedReadState\(\);/);
  assert.match(authContext, /const saveSession[\s\S]*clearAuthenticatedReadState\(\);/);
});

test('high-cost monitoring and mobile hydration use bounded refresh cadences', () => {
  const root = path.join(__dirname, '..', '..');
  const webTelemetry = webService('telemetryService.js');
  const diagnosticsView = fs.readFileSync(path.join(root, 'web/react-app/src/views/diagnostics/DiagnosticsConsoleView.jsx'), 'utf8');
  const maintenanceView = fs.readFileSync(path.join(root, 'web/react-app/src/views/maintenance/MaintenanceView.jsx'), 'utf8');
  const mobileStore = fs.readFileSync(path.join(root, 'mobile/src/data/dataStore.js'), 'utf8');
  const mobileMonitor = fs.readFileSync(path.join(root, 'mobile/src/screens/SyncMonitorScreen.js'), 'utf8');

  assert.match(webTelemetry, /intervalMs: 10 \* 60 \* 1000/);
  assert.doesNotMatch(diagnosticsView, /setInterval/);
  assert.match(maintenanceView, /5 \* 60 \* 1000/);
  assert.match(mobileStore, /CLOUD_REFRESH_INTERVAL_MS = 60 \* 60 \* 1000/);
  assert.match(mobileStore, /CLOUD_EXTENDED_REFRESH_INTERVAL_MS = 4 \* 60 \* 60 \* 1000/);
  assert.match(mobileStore, /setInterval\(refresh, CLOUD_REFRESH_INTERVAL_MS\)/);
  assert.match(mobileMonitor, /setInterval\(refresh, 10 \* 60 \* 1000\)/);
});

test('web startup excludes the Firestore SDK and lazy-loads role workspaces', () => {
  const firebaseClient = webService('firebaseClient.js');
  const app = fs.readFileSync(path.join(__dirname, '..', '..', 'web', 'react-app', 'src', 'App.jsx'), 'utf8');
  assert.doesNotMatch(firebaseClient, /firebase\/firestore|getFirestore|onSnapshot/);
  assert.match(app, /const DashboardView = lazyWithRecovery\(/);
  assert.match(app, /<Suspense fallback=\{<RouteLoadingState \/>\}>/);
});
