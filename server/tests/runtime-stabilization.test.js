'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

const dataStore = read('mobile/src/data/dataStore.js');
const syncEngine = read('mobile/src/services/syncEngine.js');
const outboxCore = read('mobile/src/services/mutationOutboxCore.js');
const networkService = read('mobile/src/services/networkService.js');
const app = read('mobile/App.js');
const fieldOps = read('mobile/src/screens/FieldOpsScreen.js');
const memberHome = read('mobile/src/screens/member/MemberHomeView.js');
const mobileSchema = read('mobile/src/data/firestoreSchema.js');
const homeScreen = read('mobile/src/screens/HomeScreen.js');
const authService = read('mobile/src/services/authService.js');
const authRoute = read('server/routes/auth.js');
const fieldsRoute = read('server/routes/fields.js');
const cropCycleRoute = read('server/routes/cropCycles.js');
const webOperations = read('web/react-app/src/services/operationReadService.js');
const webSchema = read('web/react-app/src/services/firestoreSchema.js');
const webFields = read('web/react-app/src/services/fieldsService.js');
const stages = JSON.parse(read('mobile/src/constants/cropStages.json'));

test('manual, automatic, and status UI share the canonical durable outbox', () => {
  assert.match(read('mobile/src/services/storageService.js'), /OUTBOX:\s*'@hugpong_outbox'/);
  assert.match(dataStore, /getOutboxQueue\(\)/);
  assert.match(syncEngine, /STORAGE_KEYS\.OUTBOX/);
  assert.doesNotMatch(dataStore, /syncQueue|pendingWrites|offlineQueue|pendingOperations/);
});

test('queue removal requires an explicit successful server acknowledgement', () => {
  assert.match(outboxCore, /response\.success !== true/);
  assert.match(outboxCore, /workingQueue = workingQueue\.filter/);
  assert.match(syncEngine, /saveItem\(STORAGE_KEYS\.OUTBOX, nextQueue\)/);
});

test('successful operation reconciliation clears every local unsynchronized marker', () => {
  assert.match(dataStore, /synced:\s*true/);
  assert.match(dataStore, /isOffline:\s*false/);
  assert.match(dataStore, /cloudQueueStatus:\s*'synced'/);
  assert.match(dataStore, /cleanupDuplicateLogs\(operationLogs\)/);
});

test('pending count deduplicates an operation and its outbox envelope', () => {
  assert.match(dataStore, /const pendingKeys = new Set\(getOutboxQueue\(\)/);
  assert.match(dataStore, /pendingKeys\.add\(`operation_logs\/\$\{log\.id\}`\)/);
  assert.match(dataStore, /return pendingKeys\.size/);
  assert.doesNotMatch(homeScreen, /offlineLogsCount\s*=.*\+.*outboxCount/);
});

test('automatic sync uses persistent NetInfo reachability instead of screen lifecycle polling', () => {
  assert.match(networkService, /NetInfo\.addEventListener/);
  assert.match(networkService, /isConnected === true && state\.isInternetReachable === true/);
  assert.doesNotMatch(networkService, /setInterval|clients3\.google/);
  assert.match(networkService, /NETWORK_RESTORED/);
});

test('startup, foreground, reconnect, post-mutation, and manual triggers converge on one sync function', () => {
  assert.match(dataStore, /performMobileSync\('APP_START'\)/);
  assert.match(dataStore, /performMobileSync\('POST_MUTATION'\)/);
  assert.match(dataStore, /NETWORK_RESTORED/);
  assert.match(app, /performMobileSync\('APP_FOREGROUND'\)/);
  assert.match(homeScreen, /performMobileSync\('MANUAL_SYNC'\)/);
});

test('concurrent triggers reuse single-flight promises and release locks in finally', () => {
  assert.match(syncEngine, /runOutboxSingleFlight/);
  assert.match(outboxCore, /finally \{\s*activePromise = null/);
  assert.match(dataStore, /if \(mobileSyncPromise\) return mobileSyncPromise/);
  assert.match(dataStore, /finally \{\s*mobileSyncPromise = null/);
});

test('startup migration recovers stale syncing entries as retryable', () => {
  assert.match(outboxCore, /item\?\.status === 'syncing' \? 'retryable'/);
  assert.match(syncEngine, /migrateOutbox\(savedOutbox\)/);
});

test('sync refreshes server authorization from Firebase without replaying a stale server token', () => {
  assert.match(authService, /getIdToken\(true\)/);
  assert.match(authService, /\/auth\/mobile-session/);
  assert.match(authRoute, /auth\.verifyIdToken\(firebaseIdToken, true\)/);
  assert.match(authRoute, /snapshot\.data\(\)\.status !== 'ACTIVE'/);
});

test('Farm Manager takeover grants are transient and offline takeover is stopped', () => {
  assert.match(outboxCore, /takeoverGrant:\s*null/);
  assert.match(syncEngine, /transientTakeoverGrants/);
  assert.match(dataStore, /Takeover changes require a live server connection/);
});

test('Farm Member stage completion uses the permitted crop-cycle route, not field upsert', () => {
  const completionFlow = fieldOps.slice(fieldOps.indexOf('const toggleTaskStatus'), fieldOps.indexOf('const selectSraOperation'));
  assert.match(completionFlow, /updateFieldStageAndCycle/);
  assert.doesNotMatch(completionFlow, /saveFieldPlot\(/);
  assert.match(cropCycleRoute, /requireRole\(\[ROLES\.MEMBER_FARMER, ROLES\.FARM_MANAGER\]\)/);
  assert.match(cropCycleRoute, /router\.patch\('\/:id\/stage', requireAuth/);
  assert.match(fieldsRoute, /router\.patch\('\/:id', requireAuth, requireRole\(\[ROLES\.FARM_MANAGER\]\)/);
});

test('normal Farm Member completion does not synthesize or request a takeover grant', () => {
  assert.match(fieldOps, /updateFieldStageAndCycle\(safeField\.id/);
  assert.doesNotMatch(fieldOps.slice(fieldOps.indexOf('const toggleTaskStatus'), fieldOps.indexOf('const selectSraOperation')), /verifyCurrentPassword/);
});

test('all six canonical stages are available to the Active Field view', () => {
  assert.deepEqual(stages.map(stage => stage.stageNumber), [1, 2, 3, 4, 5, 6]);
  assert.match(memberHome, /SUGARCANE_STAGES\.find\(stage => stage\.stageNumber === Number\(primaryField\.stageNumber\)\)/);
});

test('Active Field shows an honest unset state and never fabricates Stage 1', () => {
  assert.match(memberHome, /Current stage not set/);
  assert.doesNotMatch(memberHome, /primaryField\.stage\b/);
  assert.match(mobileSchema, /canonicalStageNumber[\s\S]*:\s*null/);
  assert.doesNotMatch(mobileSchema, /stageNumber:\s*Number\(cycle\?\.currentStageNumber \|\| 1\)/);
});

test('stage reconciliation updates the same canonical stageNumber used by Home', () => {
  assert.match(dataStore, /targetField\.stageNumber = Number\(serverCycle\.currentStageNumber\)/);
  assert.match(dataStore, /saveItem\(STORAGE_KEYS\.FIELDS, fields\)/);
  assert.match(dataStore, /\[FIELD\] Stage refreshed/);
  assert.match(webFields, /stageNumber:\s*cycle\?\.currentStageNumber \?\? null/);
  assert.doesNotMatch(webSchema, /stageNumber:\s*Number\(cycle\?\.currentStageNumber \|\| 1\)/);
});

test('accepted operation submission force-closes while failure returns with form state intact', () => {
  assert.match(fieldOps, /submissionSynced = !outcome\.queued/);
  assert.match(fieldOps, /setShowLog\(false\);[\s\S]*Keep stage active/);
  assert.match(fieldOps, /Operation Not Submitted[\s\S]*return;/);
  assert.match(fieldOps, /setLogForm\(previous => \(\{ \.\.\.previous, id: newLog\.id \}\)\)/);
});

test('operation submission has a synchronous duplicate-tap lock and processing UI guard', () => {
  assert.match(fieldOps, /submissionLockRef\.current/);
  assert.match(fieldOps, /if \(isSavingLog \|\| submissionLockRef\.current\) return/);
  assert.match(fieldOps, /disabled=\{isSavingLog\}/);
  assert.match(fieldOps, /submissionLockRef\.current = false/);
});

test('manual sync summaries remain honest when records remain', () => {
  assert.match(homeScreen, /Sync Incomplete/);
  assert.match(homeScreen, /result\.remainingCount/);
  assert.match(read('mobile/src/components/AppHeader.js'), /failed, and \$\{remaining\} remain queued/);
  assert.match(read('mobile/src/screens/SyncMonitorScreen.js'), /result\.failedCount/);
});

test('server log creation remains idempotent by stable client operation ID', () => {
  const service = read('server/services/cropCycleOperations.js');
  assert.match(service, /existingSnapshot\.exists/);
  assert.match(service, /return \{ replayed: true, id: logId, record: current \}/);
  assert.match(service, /transaction\.create\(targetRef, payload\)/);
});

test('assigned Farm Manager web reads operations by scoped field IDs before analytics', () => {
  assert.match(webOperations, /where\('blockFarmId', '==', String\(user\?\.blockFarmId \|\| ''\)\.trim\(\)\)/);
  assert.match(webOperations, /where\('fieldId', '==', fieldId\)/);
  assert.doesNotMatch(webOperations, /FARM_MANAGER[\s\S]{0,300}collection\(db, COLLECTIONS\.OPERATION_LOGS\)[\s\S]{0,100}onSnapshot/);
});
