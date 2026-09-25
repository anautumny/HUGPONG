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
const rootNavigator = read('mobile/src/navigation/RootNavigator.js');
const fieldOps = read('mobile/src/screens/FieldOpsScreen.js');
const liveQrScanner = read('mobile/src/components/LiveQRScanner.js');
const webQrVerifier = read('web/react-app/src/components/audit/QRVerifierPanel.jsx');
const memberHome = read('mobile/src/screens/member/MemberHomeView.js');
const mobileSchema = read('mobile/src/data/firestoreSchema.js');
const homeScreen = read('mobile/src/screens/HomeScreen.js');
const authService = read('mobile/src/services/authService.js');
const mutationService = read('mobile/src/services/mutationService.js');
const authRoute = read('server/routes/auth.js');
const fieldsRoute = read('server/routes/fields.js');
const cropCycleRoute = read('server/routes/cropCycles.js');
const webOperations = read('web/react-app/src/services/operationReadService.js');
const webSchema = read('web/react-app/src/services/firestoreSchema.js');
const webFields = read('web/react-app/src/services/fieldsService.js');
const webAddOperation = read('web/react-app/src/components/operations/AddOperationModal.jsx');
const webOperationsView = read('web/react-app/src/views/operations/OperationsView.jsx');
const webSyncContext = read('web/react-app/src/context/SyncContext.jsx');
const webSyncIndicator = read('web/react-app/src/components/layout/SyncIndicator.jsx');
const webDashboardService = read('web/react-app/src/services/dashboardService.js');
const webDashboardView = read('web/react-app/src/views/dashboard/DashboardView.jsx');
const cropCycleOperations = read('server/services/cropCycleOperations.js');
const mobilePackage = read('mobile/package.json');
const mobileAppConfig = read('mobile/app.json');
const stages = JSON.parse(read('mobile/src/constants/cropStages.json'));
const { buildOperationLog } = require('../schema/firestoreSchema');

test('manual, automatic, and status UI share the canonical durable outbox', () => {
  assert.match(read('mobile/src/services/storageService.js'), /OUTBOX:\s*'@hugpong_outbox'/);
  assert.match(read('mobile/src/services/storageService.js'), /localOutboxStorageKey/);
  assert.match(dataStore, /getOutboxQueue\(\)/);
  assert.match(syncEngine, /localOutboxStorageKey/);
  assert.doesNotMatch(dataStore, /syncQueue|pendingWrites|offlineQueue|pendingOperations/);
});

test('queue removal requires an explicit successful server acknowledgement', () => {
  assert.match(outboxCore, /response\.success !== true/);
  assert.match(outboxCore, /workingQueue = workingQueue\.filter/);
  assert.match(syncEngine, /persistOutboxQueue\(nextQueue, processingOwnerId\)/);
});

test('durable outboxes are isolated by signed-in account and legacy shared entries stay quarantined', () => {
  const storageService = read('mobile/src/services/storageService.js');
  assert.match(syncEngine, /activeOutboxOwnerId/);
  assert.match(syncEngine, /ownerUserId:\s*activeOutboxOwnerId/);
  assert.match(syncEngine, /former unscoped/);
  assert.match(dataStore, /initSyncEngine\(CURRENT_SESSION\.employeeId \|\| CURRENT_SESSION\.id\)/);
  assert.match(dataStore, /CURRENT_SESSION = \{ \.\.\.DEFAULT_GUEST_SESSION \};\s*await initSyncEngine\(''\)/);
  assert.match(storageService, /key\.startsWith\('@hugpong_'\)/);
});

test('sync logging cannot claim completion while queued items remain', () => {
  assert.match(syncEngine, /if \(result\.remainingCount === 0\)/);
  assert.match(syncEngine, /\[SYNC\] Deferred:/);
  assert.match(syncEngine, /\[SYNC\] Incomplete:/);
});

test('successful operation reconciliation clears every local unsynchronized marker', () => {
  assert.match(dataStore, /synced:\s*true/);
  assert.match(dataStore, /isOffline:\s*false/);
  assert.match(dataStore, /cloudQueueStatus:\s*'synced'/);
  assert.match(dataStore, /cleanupDuplicateLogs\(operationLogs\)/);
});

test('pending count counts canonical mutations while avoiding a second count for their local operation overlay', () => {
  assert.match(dataStore, /const queue = getOutboxQueue\(\)/);
  assert.match(dataStore, /item\.mutationId \|\| item\.outboxId/);
  assert.match(dataStore, /if \(!representedByMutation\) pendingKeys\.add\(`local-operation:\$\{log\.id\}`\)/);
  assert.match(dataStore, /return pendingKeys\.size/);
  assert.doesNotMatch(homeScreen, /offlineLogsCount\s*=.*\+.*outboxCount/);
});

test('field sync badges derive status from the durable queue instead of removed document flags', () => {
  assert.match(dataStore, /export const getFieldSyncState = fieldId/);
  assert.match(dataStore, /getOutboxQueue\(\)\.forEach/);
  assert.match(fieldOps, /getFieldSyncState/);
  assert.doesNotMatch(fieldOps, /safeField\??\.synced|field\.synced|selectedField\??\.synced/);
});

test('automatic sync requires both NetInfo reachability and the configured gateway health check', () => {
  assert.match(networkService, /NetInfo\.addEventListener/);
  assert.match(networkService, /isConnected === true && state\.isInternetReachable !== false/);
  assert.match(networkService, /probeServerConnectivity\(\)/);
  assert.match(networkService, /SERVER_UNAVAILABLE/);
  assert.match(networkService, /setTimeout/);
  assert.doesNotMatch(networkService, /setInterval|clients3\.google/);
  assert.match(networkService, /NETWORK_RESTORED/);
});

test('mobile startup tolerates an older APK without the NetInfo native module', () => {
  const authService = read('mobile/src/services/authService.js');
  assert.doesNotMatch(networkService, /^import NetInfo/m);
  assert.match(networkService, /try \{\s*const netInfoModule = require\('@react-native-community\/netinfo'\)/);
  assert.match(networkService, /NetInfo\?\.fetch/);
  assert.match(networkService, /probeServerConnectivity\(\)/);
  assert.match(authService, /fetchFromApi\('\/health'/);
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

test('mobile publishes agricultural sync telemetry only for member and manager sessions', () => {
  assert.match(dataStore, /const canReportAgriculturalSyncTelemetry/);
  assert.match(dataStore, /role === ROLES\.MEMBER_FARMER \|\| role === ROLES\.FARM_MANAGER/);
  assert.match(dataStore, /if \(canReportAgriculturalSyncTelemetry\(\)\) \{\s*reportMobileSync/);
  assert.match(dataStore, /CURRENT_SESSION\.name && canReportAgriculturalSyncTelemetry\(\)/);
});

test('startup migration recovers stale syncing entries as retryable', () => {
  assert.match(outboxCore, /status === 'syncing'.*return 'retryable'/);
  assert.match(syncEngine, /migrateOutbox\(savedOutbox\)/);
});

test('sync refreshes server authorization from Firebase without replaying a stale server token', () => {
  assert.match(authService, /getIdToken\(true\)/);
  assert.match(authService, /\/auth\/mobile-session/);
  assert.match(authRoute, /auth\.verifyIdToken\(firebaseIdToken, true\)/);
  assert.match(authRoute, /snapshot\.data\(\)\.status !== 'ACTIVE'/);
});

test('mobile cloud refresh starts only after the Firebase and server sessions agree', () => {
  assert.match(dataStore, /!auth\?\.currentUser \|\| auth\.currentUser\.uid !== sessionUserId/);
  assert.match(dataStore, /const token = await getItem\(STORAGE_KEYS\.AUTH_TOKEN\)/);
  assert.match(dataStore, /if \(!token \|\| !activeRole \|\| !sessionUserId \|\| !accountReady\) return false/);
  assert.match(dataStore, /await restartCloudSyncIfReady\(\)/);
  assert.match(dataStore, /stop\.initialRefresh = refresh\(\)/);
  assert.match(dataStore, /activeRole === ROLES\.SRA_ADMIN/);
  assert.match(dataStore, /await activeCloudSyncStop\.initialRefresh/);
  assert.doesNotMatch(dataStore, /__unassigned__|\*\*unassigned\*\*/);
});

test('SRA mobile sessions require live connectivity and sign out when connectivity is lost', () => {
  assert.match(dataStore, /restoredRole === ROLES\.SRA_ADMIN && !\(await checkConnectivity\(\{ force: true \}\)\)/);
  assert.match(dataStore, /reason: 'sra_online_required'/);
  assert.match(rootNavigator, /activeSession\?\.role === 'SRA Admin'/);
  assert.match(rootNavigator, /logoutUser\(\{ skipRemote: true \}\)/);
  assert.match(rootNavigator, /routes: \[\{ name: 'Login', params: \{ sessionNotice \} \}\]/);
});

test('SRA district summaries use only canonical farms and current-cycle active logs', () => {
  assert.match(fieldOps, /const selectedFarmIds = new Set\(selectedFarmRecords\.map\(farm => farm\.id\)\)/);
  assert.match(fieldOps, /const farmFields = fields\.filter\(field => selectedFarmIds\.has\(field\.blockFarmId\)\)/);
  assert.match(fieldOps, /log\.status === 'ACTIVE'/);
  assert.match(fieldOps, /!field\.currentCycleId \|\| log\.cycleId === field\.currentCycleId/);
  assert.match(fieldOps, /Current Cycle Logs/);
});

test('mobile persists complete farm topology while SRA refuses cached district snapshots', () => {
  const storageService = read('mobile/src/services/storageService.js');
  assert.match(storageService, /BLOCK_FARMS:\s*'@hugpong_block_farms'/);
  assert.match(storageService, /CROP_CYCLES:\s*'@hugpong_crop_cycles'/);
  assert.match(dataStore, /\[STORAGE_KEYS\.BLOCK_FARMS, blockFarms\]/);
  assert.match(dataStore, /\[STORAGE_KEYS\.CROP_CYCLES, cropCycles\]/);
  assert.match(dataStore, /SRA is online-only[\s\S]*clearCanonicalRuntimeData\(\)/);
});

test('mobile canonical reads use role-scoped server APIs without direct Firestore listeners', () => {
  for (const endpoint of [
    '/api/block-farms',
    '/api/fields',
    '/api/crop-cycles',
    '/api/logs',
    '/api/prices',
    '/api/tickets',
    '/api/users',
    '/api/audit-reports',
    '/api/audit-events'
  ]) {
    assert.match(dataStore, new RegExp(`authenticatedRequest\\('${endpoint}'`));
  }
  assert.doesNotMatch(dataStore, /firebase\/firestore|onSnapshot|collection\(db|doc\(db/);
});

test('mobile canonical refresh treats missing or malformed response collections as empty arrays', () => {
  assert.match(dataStore, /const responseRecords = response => Array\.isArray\(response\?\.data\) \? response\.data : \[\]/);
  assert.match(dataStore, /responseRecords\(reportsResponse\)\.map/);
  assert.match(dataStore, /reports: responseRecords\(response\)\.map/);
});

test('Field Ops initializes local logs before evaluating hook dependencies that read logs.length', () => {
  const declaration = fieldOps.indexOf('const [logs, setLogs] = useState');
  const dependencyRead = fieldOps.indexOf('logs.length, auditReports.length');
  assert.ok(declaration >= 0, 'logs state declaration must exist');
  assert.ok(dependencyRead >= 0, 'logs.length dependency must exist');
  assert.ok(declaration < dependencyRead, 'logs state must be initialized before logs.length is evaluated');
  assert.match(fieldOps, /useState\(\(\) => Array\.isArray\(operationLogs\) \? \[\.\.\.operationLogs\] : \[\]\)/);
});

test('Android QR scanner uses the native device scanner and tightly cropped image decoding', () => {
  assert.match(liveQrScanner, /CameraView, scanFromURLAsync, useCameraPermissions/);
  assert.match(liveQrScanner, /import \* as ImagePicker from 'expo-image-picker'/);
  assert.match(liveQrScanner, /hardwareAccelerated/);
  assert.match(liveQrScanner, /CameraView\.launchScanner/);
  assert.match(liveQrScanner, /CameraView\.onModernBarcodeScanned/);
  assert.match(liveQrScanner, /CameraView\.isModernBarcodeScannerAvailable/);
  assert.match(liveQrScanner, /Allow Camera/);
  assert.match(liveQrScanner, /Upload QR Image/);
  assert.match(liveQrScanner, /launchImageLibraryAsync/);
  assert.match(liveQrScanner, /allowsEditing: true/);
  assert.match(liveQrScanner, /aspect: \[1, 1\]/);
  assert.match(liveQrScanner, /scanFromURLAsync/);
  assert.match(liveQrScanner, /scanLocked/);
  assert.doesNotMatch(liveQrScanner, /onCameraReady=|onMountError=|onBarcodeScanned=|StyleSheet\.absoluteFillObject|TextInput|showManualInput|Animated|scanLaser|cameraFrame/);
});

test('SRA receive workflow separates real scanning from online transfer-code lookup', () => {
  assert.match(fieldOps, /Receive Audit Report/);
  assert.match(fieldOps, />Scan QR</);
  assert.match(fieldOps, />Input Code</);
  assert.match(fieldOps, /source === 'manual'/);
  assert.match(fieldOps, /\^\(AUD\|RPT\|HUG\)-\[A-Z0-9-\]\+\$/);
  assert.match(mutationService, /\/api\/audit-reports\/qr\/verify/);
  assert.match(fieldOps, /assembleAuditQrParts/);
  assert.match(fieldOps, /await verifyAuditQr\(pendingScannedPayload\)/);
  assert.match(fieldOps, /await importAuditQr\(pendingScannedPayload\)/);
  assert.match(webQrVerifier, /BrowserQRCodeReader/);
  assert.match(webQrVerifier, /decodeFromImageUrl/);
  assert.match(webQrVerifier, />\s*Upload QR\s*</);
  assert.match(webQrVerifier, />\s*Input Code\s*</);
  assert.doesNotMatch(webQrVerifier, /decodeFromConstraints|getUserMedia|WebQrCameraScanner|>\s*Scan QR\s*</);
  assert.doesNotMatch(webQrVerifier, /textarea/);
  assert.doesNotMatch(fieldOps, /commitExplicitMutation\('audit_qr_import'/);
  assert.doesNotMatch(fieldOps, /STRUCTURE_VALID_CLOUD_PENDING|CACHED_AUTHORITY_MATCH|offline structural verification/);
});

test('compiled operations expose audit-state indicators on Web and Mobile', () => {
  assert.match(webOperationsView, /operationAuditCoverage\(auditReports\)/);
  assert.match(webOperationsView, /<AuditCoverageBadge coverage=\{auditCoverage\}/);
  assert.match(webOperationsView, /header: 'Audit'/);
  assert.match(fieldOps, /operationAuditCoverage\(auditReports\)/);
  assert.match(fieldOps, /auditCoverage\.label/);
  assert.match(fieldOps, /Audit Report:/);
});

test('SRA-only mutations bypass and clear the mobile offline outbox', () => {
  assert.match(dataStore, /sraOnlineOnlyMutations = new Set\(\['audit_qr_import', 'audit_certification', 'audit_return', 'price', 'user_approve'\]\)/);
  assert.match(dataStore, /activeRole === ROLES\.SRA_ADMIN \|\| sraOnlineOnlyMutations\.has\(type\)/);
  assert.match(dataStore, /executeMutationViaApi\([^;]+includeMutation: false/);
  assert.match(dataStore, /restoredRole === ROLES\.SRA_ADMIN && getOutboxCount\(\) > 0\) await clearOutbox\(\)/);
  assert.match(dataStore, /roleUpper === ROLES\.SRA_ADMIN && getOutboxCount\(\) > 0\) await clearOutbox\(\)/);
});

test('dashboard connectivity reflects API health and reports the failing resource', () => {
  assert.match(webSyncContext, /fetch\('\/health'/);
  assert.match(webSyncContext, /setApiReachable\(response\.ok && result\.success === true\)/);
  assert.match(webSyncIndicator, /Server Unavailable/);
  assert.match(webDashboardService, /async function dashboardRead/);
  assert.match(webDashboardService, /async function readRecentOperations/);
  assert.match(webDashboardService, /Recent operations.*\/api\/logs\?limit=5/);
  assert.match(webDashboardService, /error\.isMissingIndex[\s\S]*\/api\/logs'/);
  assert.doesNotMatch(webDashboardService, /new Error\(`\$\{label\} could not be loaded: \$\{error\.message/);
  assert.match(webDashboardView, /error: err\?\.message/);
});

test('clearing the mobile data cache preserves the authenticated session pair', () => {
  const resetFlow = dataStore.slice(dataStore.indexOf('export const resetLocalCache'), dataStore.indexOf('export const listenToCloudSync'));
  assert.match(resetFlow, /getItem\(STORAGE_KEYS\.AUTH_TOKEN\)/);
  assert.match(resetFlow, /\[STORAGE_KEYS\.SESSION, activeSession\]/);
  assert.match(resetFlow, /\[STORAGE_KEYS\.AUTH_TOKEN, authToken\]/);
  assert.match(resetFlow, /multiSave\(preservedAuth\)/);
});

test('mobile API requests use one configured origin without runtime host discovery', () => {
  const apiConfig = read('mobile/src/config/apiConfig.js');
  assert.match(apiConfig, /process\.env\.EXPO_PUBLIC_API_BASE_URL/);
  assert.match(apiConfig, /must use HTTPS in production/);
  assert.match(authService, /getApiBaseUrl\(\)/);
  assert.doesNotMatch(authService, /NativeModules|SourceCode|resolveMetroApiUrl|10\.0\.2\.2|localhost|for \(const origin of origins\)/);
});

test('new operation forms cannot attach photos while legacy evidence remains schema-readable', () => {
  const smallPayload = Buffer.from('photo evidence').toString('base64');
  const operation = buildOperationLog({
    fieldId: 'FLD-001',
    cycleId: 'CYC-FLD-001-001',
    submittedByUserId: '04000001',
    submissionSource: 'MEMBER',
    operationDefinitionId: 'SRA-02',
    operationName: 'Land Preparation',
    category: 'prep',
    stageNumber: 1,
    performedOn: '2026-09-23',
    areaHa: 1,
    peopleCount: 2,
    quantity: null,
    totalCost: 100,
    lineItems: [],
    photoEvidence: {
      dataUrl: `data:image/jpeg;base64,${smallPayload}`,
      mimeType: 'image/jpeg',
      fileName: 'field.jpg',
      byteSize: 14,
      capturedAt: '2026-09-23T00:00:00.000Z'
    }
  });
  assert.equal(operation.photoEvidence.fileName, 'field.jpg');
  assert.match(webSchema, /photoEvidence: photoEvidence\(value\.photoEvidence\)/);
  assert.doesNotMatch(fieldOps, /photoEvidence|ImagePicker|preparePhotoEvidence|form_attach_photo/);
  assert.doesNotMatch(webAddOperation, /photoEvidence|resizePhotoEvidence|Choose Photo|Field Photo/);
  assert.match(mobilePackage, /expo-image-picker/);
  assert.match(mobileAppConfig, /expo-image-picker/);
  assert.doesNotMatch(mobilePackage, /expo-image-manipulator/);
  assert.match(cropCycleOperations, /submissionSource:[^\n]+\n\s*photoEvidence: null/);
  assert.match(cropCycleOperations, /photoEvidence: existing\.photoEvidence \|\| null/);

  const oversized = Buffer.alloc(614401).toString('base64');
  assert.throws(() => buildOperationLog({
    ...operation,
    photoEvidence: {
      dataUrl: `data:image/jpeg;base64,${oversized}`,
      mimeType: 'image/jpeg',
      byteSize: 614401,
      capturedAt: '2026-09-23T00:00:00.000Z'
    }
  }), /600 KB/);
});

test('mobile uses Block Farm terminology and derives the selected-field stage from stageNumber', () => {
  const translations = read('mobile/src/services/i18n.js');
  const profile = read('mobile/src/screens/ProfileScreen.js');
  assert.doesNotMatch(translations, /profile_block_farm:\s*'[^']*Location/);
  assert.doesNotMatch(profile, /Block Farm Location/);
  assert.match(fieldOps, /INITIAL_STAGES\.find\(item => item\.number === Number\(field\?\.stageNumber\)\)/);
  assert.match(fieldOps, /Current stage not set/);
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
  const mobileAnalytics = read('mobile/src/services/analyticsSelectors.js');
  const webAnalytics = read('web/react-app/src/services/analyticsSelectors.js');
  assert.match(memberHome, /Current stage not set/);
  assert.doesNotMatch(memberHome, /primaryField\.stage\b/);
  assert.match(mobileSchema, /canonicalStageNumber[\s\S]*:\s*null/);
  assert.doesNotMatch(mobileSchema, /stageNumber:\s*Number\(cycle\?\.currentStageNumber \|\| 1\)/);
  assert.doesNotMatch(mobileAnalytics, /currentStageNumber \|\| f\.stageNumber \|\| f\.currentStageNumber \|\| 1/);
  assert.doesNotMatch(webAnalytics, /currentStageNumber \|\| f\.stageNumber \|\| f\.currentStageNumber \|\| 1/);
  assert.match(mobileAnalytics, /if \(!Number\.isInteger\(rawStage\)/);
  assert.match(webAnalytics, /if \(!Number\.isInteger\(rawStage\)/);
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
  assert.match(read('mobile/src/components/AppHeader.js'), /syncResultMessage\(result\)/);
  assert.match(read('mobile/src/screens/SyncMonitorScreen.js'), /getOutboxDiagnostics/);
  assert.match(read('mobile/src/domain/syncPresentation.js'), /Reason:/);
});

test('server log creation remains idempotent by stable client operation ID', () => {
  const service = read('server/services/cropCycleOperations.js');
  assert.match(service, /existingSnapshot\.exists/);
  assert.match(service, /return \{ replayed: true, id: logId, record: current \}/);
  assert.match(service, /transaction\.create\(targetRef, payload\)/);
});

test('assigned Farm Manager web operations use the server-scoped API before analytics', () => {
  const operationQuery = read('server/services/operationQueryService.js');
  assert.match(webOperations, /subscribeToAuthenticatedResource\(`\/api\/logs\$\{statusQuery\}`/);
  assert.doesNotMatch(webOperations, /onSnapshot|collection\(db|where\(/);
  assert.match(operationQuery, /where\('managerUserId', '==', userId\)/);
  assert.match(operationQuery, /where\('fieldId', 'in', fieldIds\)/);
});

test('web and mobile sign-out entry points require confirmation and expose guarded loading states', () => {
  const webSidebar = read('web/react-app/src/components/layout/Sidebar.jsx');
  const webLogin = read('web/react-app/src/views/LoginView.jsx');
  const mobileProfile = read('mobile/src/screens/ProfileScreen.js');
  const mobileLogin = read('mobile/src/screens/auth/LoginScreen.js');

  assert.match(webSidebar, /isSignOutConfirmOpen/);
  assert.match(webSidebar, /loadingText="Signing out\.\.\."/);
  assert.match(webLogin, /isSetupSignOutConfirmOpen/);
  assert.match(webLogin, /handleConfirmSetupSignOut/);
  assert.match(mobileProfile, /const \[isSigningOut, setIsSigningOut\]/);
  assert.match(mobileProfile, /disabled=\{isSigningOut\}/);
  assert.match(mobileLogin, /Sign Out and Stop Account Setup\?/);
  assert.match(mobileLogin, /await logoutUser\(\)/);
  assert.match(mobileLogin, /setupSigningOut \? 'Signing Out\.\.\.' : 'Sign Out'/);
});
