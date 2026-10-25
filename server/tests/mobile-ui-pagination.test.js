'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');

const root = path.resolve(__dirname, '../..');
const mobileRequire = createRequire(path.join(root, 'mobile/package.json'));
const babel = mobileRequire('@babel/core');
const flatten = value => Array.isArray(value)
  ? Object.assign({}, ...value.filter(Boolean).map(flatten)) : value || {};
const native = {
  AppState: { addEventListener: () => ({ remove() {} }) }, Linking: { openSettings: async () => {} },
  View: 'View', TouchableOpacity: 'TouchableOpacity', FlatList: 'FlatList', ScrollView: 'ScrollView',
  Modal: 'Modal', KeyboardAvoidingView: 'KeyboardAvoidingView', Pressable: 'Pressable',
  PanResponder: { create: handlers => ({ panHandlers: handlers }) },
  Platform: { OS: 'ios' }, useWindowDimensions: () => ({ height: 640, width: 320, fontScale: 1 }),
  StyleSheet: { create: value => value, flatten, absoluteFillObject: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 } },
};

// Run the real components' handlers and hook updates without booting native
// Firebase or writing any records. Layout assertions describe the RN tree;
// device rendering still needs an Android/iOS smoke test.
function harness() {
  let slots = [], cursor = 0, effects = [], dirty = false;
  const same = (left, right) => left && right && left.length === right.length && left.every((item, i) => Object.is(item, right[i]));
  const React = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    Fragment: 'Fragment',
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
      return [slots[index], value => {
        const next = typeof value === 'function' ? value(slots[index]) : value;
        if (!Object.is(next, slots[index])) { slots[index] = next; dirty = true; }
      }];
    },
    useRef(initial) {
      const index = cursor++;
      return slots[index] ||= { current: initial };
    },
    useMemo(factory, deps) {
      const index = cursor++;
      if (!same(slots[index]?.deps, deps)) slots[index] = { deps, value: factory() };
      return slots[index].value;
    },
    useCallback(callback, deps) { return React.useMemo(() => callback, deps); },
    useEffect(callback, deps) {
      const index = cursor++;
      if (!same(slots[index]?.deps, deps)) {
        const previous = slots[index];
        slots[index] = { deps, callback };
        effects.push(() => { previous?.cleanup?.(); slots[index].cleanup = callback(); });
      }
    },
  };
  const modules = {};
  function load(relative, overrides = {}) {
    if (modules[relative]) return modules[relative];
    const filename = path.join(root, 'mobile/src', relative);
    const compiled = babel.transformSync(fs.readFileSync(filename, 'utf8'), {
      filename, configFile: false, babelrc: false,
      plugins: [mobileRequire.resolve('@babel/plugin-transform-react-jsx'), mobileRequire.resolve('@babel/plugin-transform-modules-commonjs')],
    }).code;
    const module = { exports: {} };
    const defaults = {
      react: React, 'react-native': native,
      '@expo/vector-icons': { Ionicons: 'Ionicons' },
      'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 0, right: 0 }) },
    };
    const requireMock = name => {
      if (name in overrides) return overrides[name];
      if (name in defaults) return defaults[name];
      if (name.endsWith('/theme')) return { COLORS: { primary: '#2D5016', border: '#DDD' }, SPACING: { lg: 16, md: 12, sm: 8 }, RADIUS: {}, SHADOW: {} };
      if (name.endsWith('/Typography')) return { AppText: 'Text', AppTextInput: 'TextInput' };
      if (name.endsWith('/i18n')) return { useTranslation: () => ({ t: (_key, fallback) => fallback }) };
      if (name.endsWith('/pagination')) return load('utils/pagination.js');
      if (name.endsWith('/notificationIdentity')) return load('domain/notificationIdentity.js');
      throw new Error(`Unexpected dependency ${name}`);
    };
    new Function('require', 'module', 'exports', compiled)(requireMock, module, module.exports);
    return modules[relative] = module.exports;
  }
  return {
    load,
    replayEffects() {
      slots.filter(slot => slot?.callback).forEach(slot => { slot.cleanup?.(); slot.cleanup = slot.callback(); });
    },
    render(component, props) {
      let tree, passes = 0;
      do {
        assert.ok(++passes < 20, 'render converges');
        dirty = false; cursor = 0; effects = [];
        tree = component(props);
        effects.forEach(effect => effect());
      } while (dirty);
      return tree;
    },
  };
}

function find(tree, predicate) {
  if (!tree || typeof tree !== 'object') return null;
  if (predicate(tree)) return tree;
  for (const child of (tree.props?.children || []).flat(Infinity)) {
    const result = find(child, predicate);
    if (result) return result;
  }
  return null;
}

test('the Mobile price browser reaches older pages and ignores responses after closing', async () => {
  const runtime = harness();
  let account = { employeeId: 'MEM-1' }, release;
  const calls = [];
  const first = Array.from({ length: 50 }, (_, index) => ({ id: `PRICE-${index}`, effectiveDate: '2026-09-27', sugarPricePerLkg: index + 1000 }));
  const pagination = runtime.load('components/ui/Pagination.js');
  const Sheet = runtime.load('components/PriceHistorySheet.js', {
    './AnimatedBottomSheet': 'Sheet', './ui/Pagination': { __esModule: true, default: 'Pagination', usePagination: pagination.usePagination },
    '../data/dataStore': { getCurrentSession: () => account },
    '../utils/pricePresentation': { priceText: value => String(value) },
    '../services/authService': { authenticatedRequest: async url => {
      calls.push(url);
      if (calls.length === 1) return { data: first, page: { nextCursor: 'older' } };
      return new Promise(resolve => { release = () => resolve({ data: [{ id: 'OLD', effectiveDate: '2020-01-01' }], page: { nextCursor: null } }); });
    } },
  }).default;
  let props = { visible: true, ownerId: 'MEM-1', onClose() {} };
  runtime.render(Sheet, props); await new Promise(resolve => setImmediate(resolve));
  let tree = runtime.render(Sheet, props);
  assert.equal(find(tree, node => node.type === 'Pagination').props.total, 50);
  const more = find(tree, node => node.type === 'TouchableOpacity' && node.props.children.some(child => child?.props?.children.includes('Load older price records')));
  const pending = more.props.onPress();
  assert.match(calls[1], /cursor=older/);
  props = { ...props, visible: false }; runtime.render(Sheet, props);
  release(); await pending;
  tree = runtime.render(Sheet, props);
  assert.equal(find(tree, node => node.type === 'Pagination').props.total, 0);
  account = { employeeId: 'OTHER' };
});

test('Web takeover authorization expires and resets when changing fields or accounts', t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const runtime = harness();
  let user = { employeeId: 'MGR-1' };
  const field = { id: 'FLD-1', areaHa: 1, currentCycleId: 'CYC-1', stageNumber: 1 };
  const fields = [field, { ...field, id: 'FLD-2' }];
  const View = runtime.load('../../web/react-app/src/views/operations/TakeOverView.jsx', {
    '../../context/AuthContext': { useAuth: () => ({ user, roleKey: 'FARM_MANAGER' }) },
    '../../utils/authRouting': { ROLE_KEYS: { FARM_MANAGER: 'FARM_MANAGER' } },
    '../../services/fieldsService': { subscribeToFieldsData: ({ onUpdate }) => { onUpdate({ fields, isLoading: false }); return () => {}; } },
    '../../services/operationsService': { createOperation: async () => ({ success: true }) },
    '../../constants/cropStages': { CROP_STAGE_MAX: 6, SUGARCANE_STAGES: [{ stageNumber: 1, name: 'Land Preparation' }] },
    '../../domain/operationCatalogue': { getOperationsForStage: () => [], getOperationDefinition: () => null },
    '../../domain/operationUnits': { OPERATION_UNITS: ['ha'] },
    '../../domain/sugarcaneVarieties': { SUGARCANE_VARIETIES: [] },
    '../../services/apiClient': {}, '../../utils/secureId': { createClientRecordId: () => 'LOG-TEST' },
    '../../domain/operationSubmission': runtime.load('../../web/react-app/src/domain/operationSubmission.js'),
    '../../components/dashboard/CompactDashboardHeader': 'Header',
    '../../components/ui': Object.fromEntries(['FormField', 'Input', 'Select', 'Button', 'StatusBadge', 'Badge', 'ConfirmDialog'].map(name => [name, name])),
    '../../components/operations/TakeOverAuthModal': 'AuthModal',
    '../../components/operations/UnconfirmedOperationNotice': 'UnconfirmedOperationNotice',
    '../../utils/formatters': { formatCurrency: value => value, formatHectares: value => value },
    'lucide-react': {},
    'react-router-dom': { useNavigate: () => () => {}, useSearchParams: () => [{ get: () => 'FLD-1' }] },
  }).default;
  const render = () => runtime.render(View, {});
  const hasActiveBanner = tree => Boolean(find(tree, node => node.type === 'span' && node.props.children.includes('Manager Takeover Active')));
  let tree = render();
  assert.equal(hasActiveBanner(tree), false);
  find(tree, node => node.type === 'AuthModal').props.onAuthorized(field, 'grant', Date.now() + 1000);
  assert.equal(hasActiveBanner(render()), true);
  t.mock.timers.tick(1000);
  tree = render();
  assert.equal(hasActiveBanner(tree), false);
  find(tree, node => node.type === 'AuthModal').props.onAuthorized(field, 'renewed-grant', Date.now() + 1000);
  tree = render();
  assert.equal(hasActiveBanner(tree), true);
  find(tree, node => node.type === 'Select' && node.props.id === 'takeover-field-selector').props.onChange({ target: { value: 'FLD-2' } });
  tree = render();
  assert.equal(hasActiveBanner(tree), false);
  find(tree, node => node.type === 'AuthModal').props.onAuthorized(field, 'stale-field-grant', Date.now() + 1000);
  assert.equal(hasActiveBanner(render()), false);
  find(render(), node => node.type === 'AuthModal').props.onAuthorized(fields[1], 'grant-2', Date.now() + 1000);
  assert.equal(hasActiveBanner(render()), true);
  user = { employeeId: 'MGR-2' };
  assert.equal(hasActiveBanner(render()), false);
});

function scannerHarness({ permission = { granted: true }, pickImage, readImage, onSettings = async () => {}, onPermissionRefresh = async () => permission, appState = native.AppState } = {}) {
  const runtime = harness();
  const Scanner = runtime.load('components/LiveQRScanner.js', {
    'react-native': { ...native, AppState: appState, Linking: { openSettings: onSettings } },
    '../theme': { FONT_FAMILY: {} },
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView', useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) },
    'expo-camera': {
      CameraView: 'Camera', useCameraPermissions: () => [permission, async () => permission, onPermissionRefresh],
      scanFromURLAsync: readImage || (async () => [{ data: 'image-payload' }]),
    },
    'expo-image-picker': { launchImageLibraryAsync: pickImage || (async () => ({ assets: [{ uri: 'test-image' }] })) },
  }).default;
  return { ...runtime, render: props => runtime.render(Scanner, props) };
}

test('HUGPONG camera locks duplicate events, recovers after an invalid scan and effect replay, and resets on reopen', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const runtime = scannerHarness();
  const received = [];
  const props = { visible: true, onCodeDetected: async (code, meta) => {
    received.push([code, meta.source]);
    if (code === 'invalid') throw new Error('Invalid report');
    return { continueScanning: false };
  } };
  let tree = runtime.render(props);
  runtime.replayEffects(); // React development effect setup/cleanup replay.
  const scan = find(tree, node => node.type === 'Camera').props.onBarcodeScanned;
  await Promise.all([scan({ data: 'invalid' }), scan({ data: 'invalid' })]);
  assert.equal(received.length, 1);
  t.mock.timers.tick(1600);
  tree = runtime.render(props);
  await find(tree, node => node.type === 'Camera').props.onBarcodeScanned({ nativeEvent: { data: ' report-code ' } });
  assert.deepEqual(received[1], ['report-code', 'camera']);
  tree = runtime.render(props);
  assert.equal(find(tree, node => node.type === 'Camera').props.onBarcodeScanned, undefined);
  runtime.render({ ...props, visible: false });
  tree = runtime.render(props);
  await find(tree, node => node.type === 'Camera').props.onBarcodeScanned({ raw: 'report-code' });
  assert.equal(received.length, 3, 'a new scanner session accepts the same code');
});

test('QR image upload works without camera permission and stops after close, without racing live scans', async () => {
  let releasePicker;
  const pendingImage = new Promise(resolve => { releasePicker = resolve; });
  const received = [];
  const runtime = scannerHarness({ pickImage: () => pendingImage });
  const props = { visible: true, onCodeDetected: async (...args) => received.push(args), onClose() {} };
  let tree = runtime.render(props);
  const cameraScan = find(tree, node => node.type === 'Camera').props.onBarcodeScanned;
  const uploading = find(tree, node => node.props?.onPress?.name === 'uploadQrImage').props.onPress();
  await cameraScan({ data: 'camera-race' });
  assert.equal(received.length, 0);
  find(tree, node => node.props?.accessibilityLabel === 'Back').props.onPress();
  runtime.render({ ...props, visible: false });
  tree = runtime.render(props);
  releasePicker({ assets: [{ uri: 'late-image' }] });
  await uploading;
  assert.equal(received.length, 0, 'closed session must not deliver its delayed image into the reopened scanner');
  assert.equal(find(runtime.render(props), node => node.props?.onPress?.name === 'uploadQrImage').props.disabled, false);

  const denied = scannerHarness({ permission: { granted: false, canAskAgain: false } });
  tree = denied.render(props);
  assert.equal(find(tree, node => node.type === 'Camera'), null);
  await find(tree, node => node.props?.onPress?.name === 'uploadQrImage').props.onPress();
  assert.deepEqual(received, [['image-payload', { source: 'image' }]]);
});

test('Web manual report entry validates, previews without importing, and imports only on confirmation', async () => {
  const runtime = harness();
  const calls = [], opened = [];
  const report = { reportId: 'AUD-BF1-2026-09', status: 'COMPILED' };
  const Panel = runtime.load('../../web/react-app/src/components/audit/QRVerifierPanel.jsx', {
    'lucide-react': {}, '../ui/Button': 'Button',
    '../../services/auditService': {
      verifyAuditQr: async code => { calls.push(['verify', code]); return { data: { report, integrityVerified: true } }; },
      importAuditQr: async code => { calls.push(['import', code]); return { data: { report: { ...report, status: 'PENDING_REVIEW' } } }; },
    },
  }).default;
  const props = { onSelectReport: value => opened.push(value) };
  const render = () => runtime.render(Panel, props);
  let tree = render();
  find(tree, node => node.type === 'Button' && node.props.children.includes('Input Code')).props.onClick();
  tree = render();
  find(tree, node => node.type === 'input').props.onChange({ target: { value: 'invalid' } });
  await find(render(), node => node.type === 'form').props.onSubmit({ preventDefault() {} });
  assert.equal(calls.length, 0);
  find(render(), node => node.type === 'input').props.onChange({ target: { value: ' aud-bf1-2026-09 ' } });
  await find(render(), node => node.type === 'form').props.onSubmit({ preventDefault() {} });
  assert.deepEqual(calls, [['verify', report.reportId]]);
  assert.equal(opened.length, 0);
  tree = render();
  await find(tree, node => node.type === 'Button' && node.props.children.includes('Import Report')).props.onClick();
  assert.deepEqual(calls, [['verify', report.reportId], ['verify', report.reportId], ['import', report.reportId]]);
  assert.equal(opened[0].status, 'PENDING_REVIEW');
  assert.ok(find(render(), node => node.type === 'Button' && node.props.children.includes('View Existing Report')));
});

test('Mobile manual entry and camera use the same verified preview; offline references wait for the server', async () => {
  const source = fs.readFileSync(path.join(root, 'mobile/src/screens/FieldOpsScreen.js'), 'utf8');
  const start = source.indexOf('  const handleScanOrSubmitCode =');
  const end = source.indexOf('\n  useEffect(', start);
  assert.ok(start > 0 && end > start);
  const calls = [], alerts = [], queued = [], previews = [];
  let online = true, integrity = true;
  const reference = JSON.stringify({ type: 'HUGPONG_AUDIT_TRANSFER', schemaVersion: 4, encoding: 'REPORT_REFERENCE', reportId: 'AUD-EXAMPLE', integrityHash: 'HUG-HASH' });
  const dependencies = {
    getNetworkStatus: () => online,
    verifyAuditQr: async value => { calls.push(value); return { data: { integrityVerified: true, report: { reportId: 'AUD-EXAMPLE' } } }; },
    validateCanonicalAuditReport: report => report,
    verifyLocalAuditIntegrity: async () => integrity,
    queueAuditReferenceForRetry: async (...args) => queued.push(args),
    Alert: { alert: (...args) => alerts.push(args) },
    decodeAuditQrPart: () => { throw new Error('Not multipart'); },
    decodeAuditQrPayload: () => ({ referenceOnly: true, reportId: 'AUD-EXAMPLE' }),
    setPendingScannedPayload() {}, setScannedAuditDuplicate() {},
    setScannedAuditReport: report => previews.push(report),
    setShowTransferCodeInput() {}, setShowAuditReceiveOptions() {}, setShowSRAInspectModal() {},
    setShowScanner() {}, rememberLastScannedAudit: async () => {},
  };
  const handler = new Function(...Object.keys(dependencies), `${source.slice(start, end)}\nreturn handleScanOrSubmitCode;`)(...Object.values(dependencies));
  await handler('invalid', { source: 'manual' });
  assert.equal(calls.length, 0); assert.equal(alerts.length, 1);
  await handler(' aud-example ', { source: 'manual' });
  await handler(reference, { source: 'camera' });
  assert.deepEqual(calls, ['AUD-EXAMPLE', reference]);
  assert.deepEqual(previews[0], previews[1]);
  integrity = false;
  await handler('AUD-EXAMPLE', { source: 'manual' });
  assert.equal(previews.length, 2, 'failed integrity cannot open a preview');
  online = false;
  await handler('AUD-EXAMPLE', { source: 'manual' });
  await handler(reference, { source: 'camera' });
  assert.equal(queued.length, 2);
  assert.equal(calls.length, 3, 'offline capture does not claim a verified server report');
});

test('Mobile Home immediately renders read/dismiss changes and keeps them after a data refresh', async () => {
  const runtime = harness();
  const listeners = new Set();
  const account = { employeeId: 'MEM-1', role: 'Farm Member' };
  const service = runtime.load('services/notificationStateService.js', { './authService': {}, './storageService': {} });
  const Home = runtime.load('screens/HomeScreen.js', {
    'react-native': { ...native, Dimensions: { get: () => ({ width: 360 }) }, AppState: { addEventListener: () => ({ remove() {} }) } },
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
    '../theme': { COLORS: {}, FONT_FAMILY: {}, SPACING: {}, RADIUS: {}, SHADOW: {} },
    '../components/PriceReferenceCard': 'PriceCard', '../components/AppHeader': 'AppHeader',
    '../components/ui/Pagination': { default: 'Pagination', usePagination: items => ({ items }) },
    '../components/ui': { ScreenHeader: 'ScreenHeader' }, '../components/OfflineBanner': 'OfflineBanner',
    '../components/PublishPriceModal': 'PublishPriceModal',
    './member/MemberHomeView': 'MemberHome', './manager/ManagerHomeView': 'ManagerHome', './sra/SRAHomeView': 'SRAHome',
    '../utils/pricePresentation': { priceText: () => '100' },
    '../utils/dataHelpers': { sortNewestFirst: items => items },
    '../utils/dialogs': { safeAlert() {} },
    '../domain/operationAuthorization': { getOperationCapabilities: () => ({ canPlan: true }) },
    '../domain/plannerNotifications': { collectPlannerEntries: () => [], getPlannerReminderGroups: () => ({ overdue: [], today: [], tomorrow: [] }) },
    '../services/i18n': { useTranslation: () => ({ t: (_key, fallback) => fallback, formatSyncTime: value => value }) },
    '../services/networkService': { getNetworkStatus: () => true, subscribeToNetwork: () => () => {} },
    '../services/syncEngine': { getOutboxQueue: () => [] },
    '../services/recoveryNotificationService': { requestApplicationNotificationPermission: async () => ({ supported: true, granted: true }) },
    '../services/notificationStateService': {
      createAccountNotificationState: (userId, isCurrent, onChange) => service.createNotificationStateClient({ userId, isCurrent, onChange,
        readCache: async () => null, writeCache: async () => true,
        request: async (_url, body) => ({ success: true, data: body.ids.map(id => ({ id, read: false, dismissed: false })) }),
      }),
    },
    '../data/dataStore': {
      getCurrentSession: () => account, getIsSynced: () => true,
      currentPrice: {}, currentMarketObservation: {}, priceAnalytics: {},
      fields: [], cropCycles: [], blockFarms: [], draftLogs: [], operationLogs: [],
      getPendingSyncCount: () => 0,
      subscribe: callback => { listeners.add(callback); return () => listeners.delete(callback); },
      getSortedPrices: () => [{ id: 'PRICE-1', effectiveDate: '2026-09-27', weekLabel: 'Week 4' }],
    },
  }).default;
  const props = { navigation: { navigate() {} } };
  const render = () => runtime.render(Home, props);
  let tree = render();
  await new Promise(resolve => setImmediate(resolve));
  find(tree, node => node.type === 'AppHeader').props.right.props.onPress();
  tree = render();
  let row = find(tree, node => node.type === 'TouchableOpacity' && node.props.onPress?.toString().includes('handleNotifPress(n)'));
  assert.ok(row);
  const readAll = find(tree, node => node.type === 'ScreenHeader').props.rightAction.props.children.flat(Infinity).find(node => node?.props?.onPress?.name === 'handleMarkAllRead');
  assert.ok(readAll);
  readAll.props.onPress();
  await new Promise(resolve => setImmediate(resolve));
  tree = render();
  row = find(tree, node => node.type === 'TouchableOpacity' && node.props.onPress?.toString().includes('handleNotifPress(n)'));
  assert.equal(find(row, node => node.type === 'View' && node.props.style?.width === 6), null, 'unread dot disappears');
  listeners.forEach(callback => callback());
  tree = render();
  row = find(tree, node => node.type === 'TouchableOpacity' && node.props.onPress?.toString().includes('handleNotifPress(n)'));
  assert.equal(find(row, node => node.type === 'View' && node.props.style?.width === 6), null, 'data refresh preserves read status');
  find(row, node => node.type === 'TouchableOpacity' && node.props.onPress?.toString().includes('stopPropagation')).props.onPress({ stopPropagation() {} });
  await new Promise(resolve => setImmediate(resolve));
  tree = render();
  assert.equal(find(tree, node => node.type === 'TouchableOpacity' && node.props.onPress?.toString().includes('handleNotifPress(n)')), null);
  listeners.forEach(callback => callback());
  assert.equal(find(render(), node => node.type === 'TouchableOpacity' && node.props.onPress?.toString().includes('handleNotifPress(n)')), null);
});

test('mobile pages cover every record once, clamp after deletions, and reset for weekly/monthly filters', () => {
  const runtime = harness();
  const { usePagination } = runtime.load('components/ui/Pagination.js');
  const records = Array.from({ length: 23 }, (_, id) => ({ id }));
  const original = [...records];
  const render = (items = records, resetKey = 'weekly') => runtime.render(props => usePagination(props.items, { resetKey: props.resetKey }), { items, resetKey });
  let page = render();
  const visited = [];
  for (let number = 1; number <= 3; number++) {
    page.setPage(number); page = render();
    visited.push(...page.items);
  }
  assert.deepEqual(visited, original);
  assert.equal(page.start, 21); assert.equal(page.end, 23);
  assert.equal(page.totalPages, 3);
  page = render(records.slice(0, 11));
  assert.equal(page.page, 2); assert.equal(page.items.length, 1);
  page = render();
  assert.equal(page.page, 2, 'new additions do not resurrect an obsolete page');
  assert.equal(render(records, 'monthly').page, 1);
  page = render([], 'monthly');
  assert.equal(page.start, 0); assert.equal(page.end, 0); assert.equal(page.page, 1);
  assert.deepEqual(records, original, 'paging does not mutate API records');
});

test('selection searches IDs and descriptions, preserves raw values, and resets on reopening', () => {
  const runtime = harness();
  const { SearchableSelectContent } = runtime.load('components/ui/SearchableSelect.js', { '../AnimatedBottomSheet': 'Sheet' });
  let selection, closed = 0;
  const options = [0, 'ALL', { id: 'FLD-123', label: 'Field 123', sublabel: 'Dale Mago' }, { id: 'FLD-456', label: 'Field 456' }];
  const props = { options, selectedValue: 'FLD-123', onSelect: value => { selection = value; }, onClose: () => closed++, resetKey: true };
  let tree = runtime.render(SearchableSelectContent, props);
  find(tree, node => node.type === 'TextInput').props.onChangeText('dale');
  tree = runtime.render(SearchableSelectContent, props);
  let list = find(tree, node => node.type === 'FlatList');
  assert.equal(list.props.data.length, 1);
  const row = list.props.renderItem({ item: list.props.data[0] });
  assert.equal(row.props.accessibilityState.checked, true);
  row.props.onPress();
  assert.equal(selection, options[2]); assert.equal(closed, 1);
  runtime.render(SearchableSelectContent, { ...props, resetKey: false });
  tree = runtime.render(SearchableSelectContent, props);
  list = find(tree, node => node.type === 'FlatList');
  assert.equal(list.props.data.length, 4);
  list.props.renderItem({ item: list.props.data[0] }).props.onPress();
  assert.equal(selection, 0, 'numeric zero stays a valid option');
  assert.equal(list.props.style.flexShrink, 1, 'long lists shrink within the sheet');
});

test('analytics filters reuse their sheet and apply drafts only after explicit Apply', () => {
  const runtime = harness();
  const { AnalyticsScopeModal } = runtime.load('components/analytics/AnalyticsComponents.js', {
    '../AnimatedBottomSheet': 'Sheet',
    '../ui': { SearchableSelect: 'Select', Card: 'Card', PrimaryButton: 'Primary', SecondaryButton: 'Secondary' },
    '../ui/SearchableSelect': { SearchableSelectContent: 'Picker' },
    '../PriceReferenceCard': 'PriceReferenceCard',
    '../../services/analyticsSelectors': { filterOperationsByCropYearCycle: ({ operations }) => operations },
  });
  let closed = 0;
  const applied = [];
  const props = { visible: true, onClose: () => closed++, onApply: value => applied.push(value),
    selectedSeason: '2026-2027', selectedFarmId: 'ALL', selectedFieldId: 'ALL', selectedPeriod: 'ALL',
    fields: [{ id: 'PLOT-1', blockFarmId: 'BF-1' }], operations: [{ fieldId: 'PLOT-1', performedOn: '2026-10-01' }],
  };
  let tree = runtime.render(AnalyticsScopeModal, props);
  const selector = find(tree, node => node.type === 'Select' && node.props.label === 'REPORTING PERIOD / MONTH');
  assert.equal(selector.props.options[0].id, 'ALL');
  assert.equal(selector.props.options[0].label, 'All Months');
  selector.props.onOpen({ title: 'Select month', options: selector.props.options });
  tree = runtime.render(AnalyticsScopeModal, props);
  assert.equal(tree.type, 'Sheet');
  assert.ok(find(tree, node => node.type === 'Picker'));
  tree.props.onClose();
  tree = runtime.render(AnalyticsScopeModal, props);
  assert.equal(closed, 0);
  assert.ok(find(tree, node => node.type === 'Select'));
  tree.props.onClose();
  assert.equal(closed, 1);
  assert.deepEqual(applied, [], 'dismissing does not apply anything');
  find(tree, node => node.type === 'Select' && node.props.label === 'REPORTING PERIOD / MONTH').props.onSelect({ id: '2026-10' });
  tree = runtime.render(AnalyticsScopeModal, props);
  assert.deepEqual(applied, [], 'changing a draft does not refresh analytics');
  find(tree, node => node.type === 'Primary').props.onPress();
  assert.equal(applied[0].period, '2026-10');
  assert.equal(closed, 2);
  runtime.render(AnalyticsScopeModal, { ...props, visible: false });
  tree = runtime.render(AnalyticsScopeModal, props);
  assert.equal(find(tree, node => node.type === 'Select' && node.props.label === 'REPORTING PERIOD / MONTH').props.selectedValue, 'ALL', 'reopening starts from applied props');
});

test('a native sheet respects safe edges, blocks backdrop dismissal, and reopens during a close', () => {
  const runtime = harness();
  const animations = [], frames = new Map();
  let nextFrame = 0;
  const oldRequest = global.requestAnimationFrame, oldCancel = global.cancelAnimationFrame;
  global.requestAnimationFrame = callback => { frames.set(++nextFrame, callback); return nextFrame; };
  global.cancelAnimationFrame = id => frames.delete(id);
  const Animated = {
    add: () => 0,
    spring: () => ({ start() {} }),
    View: 'AnimatedView',
    Value: class { setValue() {} interpolate() { return 0; } },
    timing: (_value, config) => {
      const animation = { config, start: callback => { animation.callback = callback; animations.push(animation); }, stop: () => animation.callback?.({ finished: false }) };
      return animation;
    },
  };
  try {
    const Sheet = runtime.load('components/AnimatedBottomSheet.js', {
      'react-native': { ...native, Animated, Easing: { out: value => value, in: value => value, cubic: 'cubic' } },
    }).default;
    let closed = 0;
    const props = { visible: true, onClose: () => closed++, children: 'content' };
    let tree = runtime.render(Sheet, props);
    for (const [id, callback] of frames) { frames.delete(id); callback(); }
    animations.at(-1).callback({ finished: true });
    tree = runtime.render(Sheet, props);
    const layer = find(tree, node => node.type === 'KeyboardAvoidingView');
    assert.equal(flatten(layer.props.style).paddingTop, 59);
    const panel = layer.props.children[0];
    assert.equal(flatten(panel.props.style).paddingBottom, 34);
    assert.equal(flatten(panel.props.style).overflow, 'hidden');
    const backdrop = tree.props.children[0].props.children[0];
    assert.equal(backdrop.props.onPress, undefined);
    tree.props.onRequestClose(); assert.equal(closed, 1);
    runtime.render(Sheet, { ...props, visible: false });
    assert.equal(animations.at(-1).config.toValue, 0);
    tree = runtime.render(Sheet, props);
    for (const [id, callback] of frames) { frames.delete(id); callback(); }
    assert.equal(animations.at(-1).config.toValue, 1);
    animations.at(-1).callback({ finished: true });
    assert.ok(runtime.render(Sheet, props), 'sheet remains visible after interrupted close');
    tree = runtime.render(Sheet, { ...props, dismissible: true, expandable: true });
    find(tree, node => node.type === 'Pressable').props.onPress();
    assert.equal(closed, 2, 'filter sheets support background-tap dismissal');
    const handle = find(tree, node => node.props.accessibilityLabel === 'Sheet controls');
    assert.equal(handle.props.onMoveShouldSetPanResponder(null, { dx: 60, dy: 8 }), false);
    assert.equal(handle.props.onMoveShouldSetPanResponder(null, { dx: 0, dy: 60 }), true);
    handle.props.onPanResponderRelease(null, { dy: -60, vy: -1 });
    tree = runtime.render(Sheet, { ...props, dismissible: true, expandable: true });
    assert.equal(flatten(find(tree, node => node.type === 'KeyboardAvoidingView').props.children[0].props.style).height, 535);
    handle.props.onPanResponderRelease(null, { dy: 120, vy: 1 });
    assert.equal(closed, 3, 'downward drags dismiss the sheet');
  } finally {
    global.requestAnimationFrame = oldRequest; global.cancelAnimationFrame = oldCancel;
  }
});

test('mobile member review opens without compiling and keeps calling separate from continuing', () => {
  const runtime = harness();
  const Review = runtime.load('components/AuditMemberReviewSheet.js', {
    './AnimatedBottomSheet': 'Sheet',
    './ui/Pagination': { __esModule: true, default: 'Pagination', usePagination: items => ({ items }) },
  }).default;
  let called = null, compiled = 0, closed = 0;
  const data = {
    blockFarmId: 'BF-1', periodKey: '2026-10', operationCount: 3, canCompile: true,
    memberFollowUps: [
      { memberId: 'M-1', memberName: 'Member One', contactNumber: '09170000001', fieldIds: ['FLD-1'], hasMonthlyOperations: false, activity: { attentionStatus: 'NEEDS_ATTENTION', inactiveDays: 3 }, activityNote: '3 days since last recorded account activity.' },
      { memberId: 'M-2', memberName: 'Member Two', contactNumber: null, fieldIds: [], hasMonthlyOperations: false, activity: null, activityNote: 'Account activity unavailable.' },
    ],
  };
  const props = { data, onCall: phone => { called = phone; }, onContinue: () => compiled++, onClose: () => closed++ };
  let tree = runtime.render(Review, props);
  assert.equal(compiled, 0);
  const list = find(tree, node => node.type === 'FlatList');
  const callableRow = list.props.renderItem({ item: data.memberFollowUps[0] });
  find(callableRow, node => node.props?.accessibilityLabel === 'Call Member One').props.onPress();
  assert.equal(called, '09170000001');
  assert.equal(compiled, 0, 'calling does not compile or verify a report');
  const missingPhoneRow = list.props.renderItem({ item: data.memberFollowUps[1] });
  assert.equal(find(missingPhoneRow, node => node.props?.accessibilityLabel?.startsWith('Call unavailable')).props.disabled, true);
  const continueButton = find(tree, node => node.type === 'TouchableOpacity'
    && find(node, child => child.type === 'Text' && child.props.children.includes('Compile Available Operations')));
  assert.equal(continueButton.props.disabled, false);
  continueButton.props.onPress();
  assert.equal(compiled, 1);
  tree.props.onClose(); assert.equal(closed, 1);
  tree = runtime.render(Review, { ...props, data: { ...data, canCompile: false, operationCount: 0 } });
  assert.equal(find(tree, node => node.type === 'TouchableOpacity'
    && find(node, child => child.type === 'Text' && child.props.children.includes('Compile Available Operations'))).props.disabled, true);
  tree = runtime.render(Review, { ...props, data: null });
  assert.equal(tree.props.visible, false);
  assert.equal(find(tree, node => node.type === 'FlatList').props.data.length, 2, 'closing preserves the previous rows until the sheet finishes animating');
});

test('web member review offers user-initiated telephone links and disables missing contacts', () => {
  const runtime = harness();
  const Review = runtime.load('../../web/react-app/src/components/audit/AuditMemberReview.jsx', {
    'lucide-react': { Phone: 'Phone' }, '../ui': { TablePagination: 'Pagination' },
  }).default;
  const tree = runtime.render(Review, { data: {
    periodKey: '2026-10', operationCount: 1, canCompile: true,
    memberFollowUps: [
      { memberId: 'M-1', memberName: 'Member One', contactNumber: '0917 000 0001', fieldIds: ['FLD-1'], hasMonthlyOperations: false },
      { memberId: 'M-2', memberName: 'Member Two', contactNumber: null, fieldIds: [], hasMonthlyOperations: false },
    ],
  } });
  assert.equal(find(tree, node => node.type === 'a').props.href, 'tel:09170000001');
  assert.equal(find(tree, node => node.type === 'button').props.disabled, true);
});

test('web compilation first refreshes member review and writes only after explicit continuation', async () => {
  const runtime = harness();
  const calls = [];
  const review = { blockFarmId: 'BF-1', periodKey: '2026-09', operationCount: 1, canCompile: true, memberFollowUps: [] };
  const Modal = runtime.load('../../web/react-app/src/components/audit/AuditCompilationModal.jsx', {
    'lucide-react': {}, qrcode: {}, '../ui/Modal': 'Modal', '../ui/Button': 'Button',
    './QRCodeView': 'QRCode', './AuditMemberReview': 'MemberReview',
    '../../services/auditService': {
      fetchNextAuditPeriod: async () => ({ success: true, data: review }),
      fetchAuditReadiness: async () => { calls.push('readiness'); return { success: true, data: review }; },
      compileAuditReport: async () => { calls.push('compile'); return { success: true, data: { id: 'AUD-1' } }; },
    },
    '../../domain/auditWorkflow': {
      AUDIT_STATUS: { COMPILED: 'COMPILED', PENDING_SUBMISSION: 'PENDING_SUBMISSION', PENDING_REVIEW: 'PENDING_REVIEW' },
      canonicalAuditStatus: value => value,
      auditReportsForFarmPeriod: () => [], reportedOperationIds: () => new Set(),
    },
  }).default;
  const props = { isOpen: true, blockFarm: { id: 'BF-1', name: 'Assigned farm' }, onClose: () => {} };
  runtime.render(Modal, props);
  await new Promise(resolve => setImmediate(resolve));
  let tree = runtime.render(Modal, props);
  const firstAction = find(tree.props.footer, node => node.type === 'Button' && node.props.onClick && node.props.variant === 'primary');
  assert.ok(!firstAction.props.disabled);
  await firstAction.props.onClick();
  assert.deepEqual(calls, ['readiness']);
  tree = runtime.render(Modal, props);
  assert.ok(find(tree, node => node.type === 'MemberReview'));
  const continuation = find(tree.props.footer, node => node.type === 'Button' && node.props.variant === 'primary');
  assert.ok(continuation.props.children.includes('Compile Available Operations'));
  await continuation.props.onClick();
  assert.deepEqual(calls, ['readiness', 'compile']);
});


test('web filter draft rerenders keep focus and Escape uses the latest callback', async () => {
  const runtime = harness();
  const Modal = runtime.load('../../web/react-app/src/components/ui/Modal.jsx', { 'react-dom': { createPortal: value => value }, 'lucide-react': { X: 'X' } }).default;
  const originalDocument = global.document, originalWindow = global.window;
  let keyHandler, closeCalls = 0, staleCalls = 0, initialFocuses = 0;
  const trigger = { focus() { global.document.activeElement = this; } };
  const close = { focus() { initialFocuses++; global.document.activeElement = this; } };
  const select = { focus() { global.document.activeElement = this; } };
  global.document = { activeElement: trigger, body: { style: { overflow: '' } } };
  global.window = { addEventListener(_event, handler) { keyHandler = handler; }, removeEventListener() {} };
  try {
    const tree = runtime.render(Modal, { isOpen: true, onClose: () => staleCalls++ });
    tree.props.children[0].props.ref.current = { querySelectorAll: () => [close, select] };
    await new Promise(resolve => setTimeout(resolve, 70));
    select.focus();
    runtime.render(Modal, { isOpen: true, onClose: () => closeCalls++ });
    await new Promise(resolve => setTimeout(resolve, 70));
    assert.equal(global.document.activeElement, select);
    assert.equal(initialFocuses, 1);
    keyHandler({ key: 'Escape', preventDefault() {} });
    assert.equal(closeCalls, 1); assert.equal(staleCalls, 0);
    runtime.render(Modal, { isOpen: false });
    assert.equal(global.document.activeElement, trigger);
    assert.equal(global.document.body.style.overflow, '');
  } finally { global.document = originalDocument; global.window = originalWindow; }
});

test('a permanently denied scanner opens Settings and rechecks permission on return', async () => {
  let onAppState, settings = 0, refreshed = 0;
  const permission = { granted: false, canAskAgain: false };
  const runtime = scannerHarness({ permission, onSettings: async () => settings++, onPermissionRefresh: async () => { refreshed++; return permission; }, appState: { addEventListener(_event, handler) { onAppState = handler; return { remove() {} }; } } });
  const props = { visible: true, onClose() {} };
  const tree = runtime.render(props);
  function textContains(node, value) { return JSON.stringify(node).includes(value); }
  const button = find(tree, node => node.type === 'TouchableOpacity' && textContains(node, 'Open Settings'));
  assert.ok(button);
  await button.props.onPress(); assert.equal(settings, 1);
  onAppState('active'); await new Promise(resolve => setImmediate(resolve)); assert.equal(refreshed, 1);
  permission.granted = true;
  assert.ok(find(runtime.render(props), node => node.type === 'Camera'));
});
