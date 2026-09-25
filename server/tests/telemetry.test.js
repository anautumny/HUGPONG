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
  classifyAccountActivity,
  aggregateSubjectTelemetry,
  buildSystemMonitor
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

function monitorDb({ users = [], telemetry = [] } = {}) {
  const collections = {
    users: users.map(record => ({ id: record.id, ...record })),
    terminal_diagnostics: telemetry.map(record => ({ id: record.id, ...record }))
  };
  const snapshot = records => ({
    docs: records.map(record => ({
      id: record.id,
      data: () => {
        const { id, ...data } = record;
        return data;
      }
    }))
  });
  return {
    collection(name) {
      const records = collections[name] || [];
      return {
        async get() {
          return snapshot(records);
        },
        where(field, operator, value) {
          assert.equal(operator, '==');
          return { get: async () => snapshot(records.filter(record => record[field] === value)) };
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

test('account activity monitoring uses the server-defined three-day and five-day thresholds', () => {
  const now = new Date('2026-09-26T00:00:00.000Z').getTime();
  assert.equal(classifyAccountActivity({ lastActiveAt: '2026-09-24T00:00:00.000Z' }, now).attentionStatus, 'WITHIN_WINDOW');
  assert.equal(classifyAccountActivity({ lastActiveAt: '2026-09-23T00:00:00.000Z' }, now).attentionStatus, 'NEEDS_ATTENTION');
  assert.equal(classifyAccountActivity({ lastActiveAt: '2026-09-21T00:00:00.000Z' }, now).attentionStatus, 'CRITICAL');

  const neverActive = classifyAccountActivity({ accountCreatedAt: '2026-09-22T00:00:00.000Z' }, now);
  assert.equal(neverActive.attentionStatus, 'NEEDS_ATTENTION');
  assert.equal(neverActive.basedOn, 'ACCOUNT_CREATED');
  assert.equal(neverActive.inactiveDays, 4);

  const missingDates = classifyAccountActivity({}, now);
  assert.equal(missingDates.attentionStatus, 'NEEDS_ATTENTION');
  assert.equal(missingDates.inactiveDays, null);
});

test('Super Admin system monitor aggregates active accounts and terminal sync without agricultural records', async () => {
  const db = monitorDb({
    users: [
      { id: '01000001', displayName: 'System Admin', role: 'SUPER_ADMIN', status: 'ACTIVE' },
      { id: '04000001', displayName: 'Farm Member', role: 'MEMBER_FARMER', status: 'ACTIVE' },
      { id: '04000002', displayName: 'Disabled Member', role: 'MEMBER_FARMER', status: 'DISABLED' }
    ],
    telemetry: [
      {
        id: 'member-mobile',
        schemaVersion: 2,
        userId: '04000001',
        platform: 'MOBILE',
        syncState: 'PENDING_SYNC',
        pendingMutationCount: 2,
        failedMutationCount: 0,
        syncReportedAt: '2026-09-26T04:00:00.000Z'
      }
    ]
  });

  const monitor = await buildSystemMonitor(db, { userId: '01000001', role: 'SUPER_ADMIN' });
  assert.equal(monitor.scope.systemWide, true);
  assert.deepEqual(monitor.subjects.map(subject => subject.userId).sort(), ['01000001', '04000001']);
  assert.equal(monitor.subjects.find(subject => subject.userId === '04000001').sync.pendingMutationCount, 2);
  await assert.rejects(
    () => buildSystemMonitor(db, { userId: '03000001', role: 'FARM_MANAGER' }),
    /requires Super Admin access/
  );
});

test('role routes and clients preserve agricultural/system separation and scoped refresh', () => {
  const root = path.resolve(__dirname, '../..');
  const route = fs.readFileSync(path.join(root, 'server/routes/telemetry.js'), 'utf8');
  const service = fs.readFileSync(path.join(root, 'server/services/telemetryService.js'), 'utf8');
  const webApp = fs.readFileSync(path.join(root, 'web/react-app/src/App.jsx'), 'utf8');
  const sidebar = fs.readFileSync(path.join(root, 'web/react-app/src/components/layout/Sidebar.jsx'), 'utf8');
  const dashboardService = fs.readFileSync(path.join(root, 'web/react-app/src/services/dashboardService.js'), 'utf8');
  const superAdminDashboard = fs.readFileSync(path.join(root, 'web/react-app/src/views/dashboard/SuperAdminDashboard.jsx'), 'utf8');
  const farmManagerDashboard = fs.readFileSync(path.join(root, 'web/react-app/src/views/dashboard/FarmManagerDashboard.jsx'), 'utf8');
  const sraAdminDashboard = fs.readFileSync(path.join(root, 'web/react-app/src/views/dashboard/SraAdminDashboard.jsx'), 'utf8');
  const recentOperationsTable = fs.readFileSync(path.join(root, 'web/react-app/src/components/dashboard/RecentOperationsTable.jsx'), 'utf8');
  const syncView = fs.readFileSync(path.join(root, 'web/react-app/src/views/sync/SyncView.jsx'), 'utf8');
  const syncTable = fs.readFileSync(path.join(root, 'web/react-app/src/components/sync/SyncTelemetryTable.jsx'), 'utf8');
  const syncSummary = fs.readFileSync(path.join(root, 'web/react-app/src/components/sync/SyncDiagnosticsSummary.jsx'), 'utf8');
  const webTelemetry = fs.readFileSync(path.join(root, 'web/react-app/src/services/telemetryService.js'), 'utf8');
  const mobileMonitor = fs.readFileSync(path.join(root, 'mobile/src/screens/SyncMonitorScreen.js'), 'utf8');
  const mobileManagerDashboard = fs.readFileSync(path.join(root, 'mobile/src/screens/manager/ManagerHomeView.js'), 'utf8');
  const mobileHome = fs.readFileSync(path.join(root, 'mobile/src/screens/HomeScreen.js'), 'utf8');

  assert.match(route, /AGRICULTURAL_ROLES = \[ROLES\.MEMBER_FARMER, ROLES\.FARM_MANAGER\]/);
  assert.match(route, /MONITOR_ROLES = \[\.\.\.AGRICULTURAL_ROLES, ROLES\.SUPER_ADMIN\]/);
  assert.match(route, /identity\.role === ROLES\.SUPER_ADMIN[\s\S]*buildSystemMonitor/);
  assert.match(webApp, /SYNC_MONITOR_ROLES = \[ROLE_KEYS\.FARM_MANAGER, ROLE_KEYS\.SUPER_ADMIN\]/);
  assert.match(webApp, /path="\/sync"[\s\S]*allowed=\{SYNC_MONITOR_ROLES\}/);
  assert.match(sidebar, /label: 'System Sync Monitor'[\s\S]{0,120}id: 'nav-system-sync'/);
  assert.match(sidebar, /label: 'System Sync Monitor'[\s\S]{0,80}icon: RefreshCw/);
  assert.match(dashboardService, /dashboardRead\('Terminal diagnostics', '\/api\/terminal-diagnostics'/);
  assert.match(dashboardService, /Terminal diagnostics[\s\S]*?\.catch\(\(\) => \(\{ data: \{ subjects: \[\] \} \}\)\)/);
  assert.match(dashboardService, /terminalDiagnostics: telemetryResult\.data\?\.subjects \|\| \[\]/);
  assert.match(dashboardService, /includeActivityMonitoring = roleKey === ROLE_KEYS\.FARM_MANAGER/);
  assert.match(dashboardService, /dashboardRead\('Member activity', '\/api\/terminal-diagnostics'/);
  assert.match(dashboardService, /terminalDiagnostics: activityResult\.result\.data\?\.subjects \|\| \[\]/);
  assert.match(dashboardService, /activityMonitoringError: activityResult\.error/);
  assert.doesNotMatch(superAdminDashboard, /99\.8%|Mobile Sync Reliability|Live Cloud Sync|AES-GCM|Support SLA/);
  assert.doesNotMatch(superAdminDashboard, /Browser Connection|Browser Online|Sync Attention|pendingSyncCount|failedSyncCount/);
  assert.match(superAdminDashboard, /Within 3-Day Window[\s\S]*Needs Attention[\s\S]*Critical/);
  assert.match(superAdminDashboard, /criticalAccounts[\s\S]*attentionAccounts[\s\S]*Review Activity/);
  assert.match(superAdminDashboard, /Governance Snapshot/);
  assert.match(superAdminDashboard, /to="\/support"[\s\S]*to="\/sync"[\s\S]*to="\/maintenance"/);
  assert.doesNotMatch(superAdminDashboard, /to="\/tickets"/);
  assert.match(superAdminDashboard, /diagnosticsReported[\s\S]*System totals are currently unavailable/);
  assert.doesNotMatch(superAdminDashboard, /Live data loaded/);
  assert.match(farmManagerDashboard, /critical-member-activity[\s\S]*member-activity-attention/);
  assert.match(farmManagerDashboard, /accountNameList\(criticalAccounts\)[\s\S]*accountNameList\(attentionAccounts\)/);
  assert.match(farmManagerDashboard, /Member Activity Alerts/);
  assert.match(farmManagerDashboard, /Review Members/);
  assert.match(farmManagerDashboard, /activityMonitoringError/);
  assert.match(sraAdminDashboard, /<RecentOperationsTable[\s\S]*showConsoleLink=\{false\}/);
  assert.match(recentOperationsTable, /showConsoleLink = true[\s\S]*\{showConsoleLink && \(/);
  assert.doesNotMatch(farmManagerDashboard, /Production Readiness|Active Milling|Standard Cycle|scheduled milling calendar/);
  assert.match(farmManagerDashboard, /Crop Year Cycles[\s\S]*activeCropCycles\.length[\s\S]*scopedFields\.length/);
  assert.match(farmManagerDashboard, /summarizeCropStages\(activeCropCycles\)/);
  assert.doesNotMatch(syncView, /Pending Mutations|Failed Mutations|Pending Updates|Failed Updates|Registered Terminals|Registered Devices|Accounts Reporting|Platform Terminal Synchronization/);
  assert.match(syncView, /Active Accounts[\s\S]*Within 3-Day Window[\s\S]*Needs Attention[\s\S]*Critical/);
  assert.match(syncView, /statusMode="activity"/);
  assert.match(syncView, /isSystemMonitor[\s\S]*showIcons=\{false\}/);
  assert.doesNotMatch(syncView, /AlertCircle|RefreshCw|lucide-react/);
  assert.match(syncView, /title="Member Activity Status"[\s\S]*showIcons=\{false\}[\s\S]*statusMode="activity"/);
  assert.doesNotMatch(syncSummary, /lucide-react|<Icon/);
  assert.match(syncSummary, /Activity Status[\s\S]*Last Sync Report/);
  assert.match(syncTable, /icon=\{showIcons \? Search : undefined\}/);
  assert.match(syncTable, /showIcons && <Users/);
  assert.match(syncTable, /activityAttentionPresentation\(subject\.activity\)/);
  assert.match(webTelemetry, /activity\.attentionStatus === 'CRITICAL'/);
  assert.match(service, /ATTENTION_INACTIVITY_MS = 3 \* DAY_MS/);
  assert.match(service, /CRITICAL_INACTIVITY_MS = 5 \* DAY_MS/);
  assert.match(service, /where\('blockFarmId', ids\.length === 1 \? '==' : 'in'/);
  assert.doesNotMatch(service, /collection\(COLLECTIONS\.FIELDS\)\.get\(\)/);
  assert.match(service, /filter\(user => user\.status === 'ACTIVE'\)/);
  assert.doesNotMatch(route, /req\.query.*blockFarmId|req\.body.*userId/);
  assert.match(mobileMonitor, /setInterval\(refresh, 30000\)/);
  assert.match(mobileMonitor, /navigation\.addListener\('blur', stop\)/);
  assert.match(mobileMonitor, /Member Activity Status/);
  assert.match(mobileMonitor, /activityStatusLabel\(member\.activity\)/);
  assert.match(mobileManagerDashboard, /fetchAgriculturalSyncMonitor/);
  assert.match(mobileManagerDashboard, /criticalAccounts[\s\S]*attentionAccounts[\s\S]*issueNames/);
  assert.match(mobileManagerDashboard, /CROP YEAR CYCLES[\s\S]*activeCropCycles\.length[\s\S]*managedFields\.length/);
  assert.match(mobileManagerDashboard, /summarizeCropStages\(activeCropCycles\)/);
  assert.match(mobileHome, /cropCycles=\{cropCycles\}/);
  assert.doesNotMatch(`${syncSummary}\n${syncView}\n${mobileMonitor}`, /Three days without activity|No activity for 3 days/i);
  assert.match(`${syncSummary}\n${syncView}\n${mobileMonitor}`, /not active for 3 days/i);
});
