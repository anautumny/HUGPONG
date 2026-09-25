'use strict';

process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-only-session-secret-that-is-longer-than-32-characters';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  deviceDocumentId,
  recordActivity,
  recordSyncTelemetry,
  aggregateSubjectTelemetry
} = require('../services/telemetryService');

function memoryDb() {
  const records = new Map();
  return {
    records,
    collection() {
      return {
        doc(id) {
          return {
            async get() {
              return { exists: records.has(id), data: () => records.get(id) };
            },
            async set(patch, options) {
              const current = options?.merge ? records.get(id) || {} : {};
              records.set(id, { ...current, ...patch });
            }
          };
        }
      };
    }
  };
}

test('server derives stable device documents from authenticated owner, platform, and installation', () => {
  const first = deviceDocumentId('03000001', 'WEB', 'web-install-a');
  assert.equal(first, deviceDocumentId('03000001', 'WEB', 'web-install-a'));
  assert.notEqual(first, deviceDocumentId('03000001', 'MOBILE', 'mobile-install-a'));
  assert.notEqual(first, deviceDocumentId('03000002', 'WEB', 'web-install-a'));
});

test('Web login updates activity without overwriting Mobile synchronization', async () => {
  const db = memoryDb();
  await recordSyncTelemetry(db, {
    userId: '03000001',
    platform: 'MOBILE',
    clientInstanceId: 'mobile-install-a',
    pendingMutationCount: 2,
    failedMutationCount: 0,
    syncState: 'PENDING_SYNC',
    connectionState: 'ONLINE',
    syncSucceeded: true,
    at: '2026-09-25T05:45:00.000Z'
  });
  await recordActivity(db, {
    userId: '03000001',
    platform: 'WEB',
    clientInstanceId: 'web-install-a',
    event: 'LOGIN',
    at: '2026-09-25T06:00:00.000Z'
  });

  const records = [...db.records.values()];
  const aggregate = aggregateSubjectTelemetry({
    userId: '03000001',
    displayName: 'Manager',
    role: 'FARM_MANAGER',
    isSelf: true
  }, records, new Date('2026-09-25T06:01:00.000Z').getTime());

  assert.equal(aggregate.activity.lastActiveAt, '2026-09-25T06:00:00.000Z');
  assert.equal(aggregate.activity.lastPlatform, 'WEB');
  assert.equal(aggregate.sync.lastSuccessfulSyncAt, '2026-09-25T05:45:00.000Z');
  assert.equal(aggregate.sync.pendingMutationCount, 2);
  assert.equal(aggregate.sync.state, 'PENDING_SYNC');
});

test('failed sync attempts do not advance lastSuccessfulSyncAt and later reconnect does', async () => {
  const db = memoryDb();
  const identity = { userId: '04000001', platform: 'MOBILE', clientInstanceId: 'member-phone' };
  await recordSyncTelemetry(db, {
    ...identity,
    pendingMutationCount: 1,
    failedMutationCount: 1,
    syncState: 'SYNC_FAILED',
    connectionState: 'ONLINE',
    syncSucceeded: false,
    at: '2026-09-25T03:00:00.000Z'
  });
  let record = [...db.records.values()][0];
  assert.equal(record.lastSuccessfulSyncAt, undefined);

  await recordSyncTelemetry(db, {
    ...identity,
    pendingMutationCount: 0,
    failedMutationCount: 0,
    syncState: 'UP_TO_DATE',
    connectionState: 'ONLINE',
    syncSucceeded: true,
    at: '2026-09-25T04:00:00.000Z'
  });
  record = [...db.records.values()][0];
  assert.equal(record.lastSuccessfulSyncAt, '2026-09-25T04:00:00.000Z');
  assert.equal(record.pendingMutationCount, 0);
});

test('newest cross-platform activity wins without changing prior device sync', async () => {
  const db = memoryDb();
  const userId = '03000001';
  await recordSyncTelemetry(db, {
    userId,
    platform: 'MOBILE',
    clientInstanceId: 'manager-phone',
    pendingMutationCount: 0,
    failedMutationCount: 0,
    syncState: 'UP_TO_DATE',
    connectionState: 'ONLINE',
    syncSucceeded: true,
    at: '2026-09-25T05:00:00.000Z'
  });
  await recordActivity(db, { userId, platform: 'WEB', clientInstanceId: 'manager-browser', event: 'LOGIN', at: '2026-09-25T06:00:00.000Z' });
  await recordActivity(db, { userId, platform: 'MOBILE', clientInstanceId: 'manager-phone', event: 'FOREGROUND', at: '2026-09-25T07:00:00.000Z' });
  const aggregate = aggregateSubjectTelemetry({ userId, displayName: 'Manager', role: 'FARM_MANAGER' }, [...db.records.values()], new Date('2026-09-25T07:01:00.000Z').getTime());
  assert.equal(aggregate.activity.lastPlatform, 'MOBILE');
  assert.equal(aggregate.activity.lastActiveAt, '2026-09-25T07:00:00.000Z');
  assert.equal(aggregate.sync.lastSuccessfulSyncAt, '2026-09-25T05:00:00.000Z');
});

test('background synchronization changes sync time without manufacturing user activity', async () => {
  const db = memoryDb();
  await recordSyncTelemetry(db, {
    userId: '04000001',
    platform: 'MOBILE',
    clientInstanceId: 'member-phone',
    pendingMutationCount: 0,
    failedMutationCount: 0,
    syncState: 'UP_TO_DATE',
    connectionState: 'ONLINE',
    syncSucceeded: true,
    at: '2026-09-25T05:00:00.000Z'
  });
  const record = [...db.records.values()][0];
  assert.equal(record.lastSuccessfulSyncAt, '2026-09-25T05:00:00.000Z');
  assert.equal(record.lastActiveAt, undefined);
});

test('stale successful reports become not reported while their historical time remains', () => {
  const aggregate = aggregateSubjectTelemetry({ userId: '04000001', displayName: 'Member', role: 'MEMBER_FARMER' }, [{
    schemaVersion: 2,
    userId: '04000001',
    platform: 'MOBILE',
    syncState: 'UP_TO_DATE',
    pendingMutationCount: 0,
    failedMutationCount: 0,
    syncReportedAt: '2026-09-20T00:00:00.000Z',
    lastSuccessfulSyncAt: '2026-09-20T00:00:00.000Z'
  }], new Date('2026-09-25T00:00:00.000Z').getTime());
  assert.equal(aggregate.sync.state, 'UNKNOWN');
  assert.equal(aggregate.sync.lastSuccessfulSyncAt, '2026-09-20T00:00:00.000Z');
  assert.equal(aggregate.connection.state, 'UNKNOWN');
});

test('role routes and clients preserve agricultural/system separation and scoped refresh', () => {
  const root = path.resolve(__dirname, '../..');
  const route = fs.readFileSync(path.join(root, 'server/routes/telemetry.js'), 'utf8');
  const service = fs.readFileSync(path.join(root, 'server/services/telemetryService.js'), 'utf8');
  const webApp = fs.readFileSync(path.join(root, 'web/react-app/src/App.jsx'), 'utf8');
  const sidebar = fs.readFileSync(path.join(root, 'web/react-app/src/components/layout/Sidebar.jsx'), 'utf8');
  const mobileMonitor = fs.readFileSync(path.join(root, 'mobile/src/screens/SyncMonitorScreen.js'), 'utf8');

  assert.match(route, /AGRICULTURAL_ROLES = \[ROLES\.MEMBER_FARMER, ROLES\.FARM_MANAGER\]/);
  assert.match(webApp, /path="\/sync"[\s\S]*allowed=\{\[ROLE_KEYS\.FARM_MANAGER\]\}/);
  assert.doesNotMatch(sidebar, /label: 'Sync Monitor'[\s\S]{0,120}id: 'nav-sync'/);
  assert.match(service, /where\('blockFarmId', ids\.length === 1 \? '==' : 'in'/);
  assert.doesNotMatch(service, /collection\(COLLECTIONS\.FIELDS\)\.get\(\)/);
  assert.match(service, /filter\(user => user\.status === 'ACTIVE'\)/);
  assert.doesNotMatch(route, /req\.query.*blockFarmId|req\.body.*userId/);
  assert.match(mobileMonitor, /setInterval\(refresh, 30000\)/);
  assert.match(mobileMonitor, /navigation\.addListener\('blur', stop\)/);
});
