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
    memo: component => component,
    createContext(defaultValue) {
      const context = { _currentValue: defaultValue, Provider: ({ value, children }) => { context._currentValue = value; return children; } };
      return context;
    },
    useContext(context) {
      return context?._currentValue;
    },
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
      if (name.endsWith('/i18n')) return {
        useTranslation: () => ({ t: (_key, fallback) => fallback }),
        formatPhaseMonth: (s) => {
          const m = String(s || '').match(/^(\d{4})-(0[1-9]|1[0-2])$/);
          if (!m) return s;
          const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
          return `${months[parseInt(m[2], 10) - 1]} ${m[1]}`;
        },
        formatPeriodDisplay: (s) => s
      };
      if (name.endsWith('/pagination')) return load('utils/pagination.js');
      if (name.endsWith('/ui/Pagination')) return { __esModule: true, default: 'Pagination', usePagination: load('components/ui/Pagination.js').usePagination };
      if (name.endsWith('/ui/useConfirmation')) return load('../../web/react-app/src/components/ui/useConfirmation.jsx');
      if (name === './ConfirmDialog') return { __esModule: true, default: 'ConfirmDialog' };
      if (name.endsWith('/notificationIdentity')) return load('domain/notificationIdentity.js');
      if (name.endsWith('/syncPresentation')) return load('domain/syncPresentation.js');
      if (name.endsWith('/haptics')) return { hapticFeedback: { light: () => {}, success: () => {}, warning: () => {}, error: () => {} } };
      if (name.endsWith('/BlurTargetContext')) return { useBlurTarget: () => ({ requestBlur: () => {}, releaseBlur: () => {} }), BlurTargetProvider: ({ children }) => children };
      if (name.endsWith('/ExpandedSheetContext')) return { useExpandedSheet: () => ({ expanded: false, isExpanded: false, setExpanded: () => {} }), ExpandedSheetContext: { Provider: ({ children }) => children } };
      if (name.endsWith('/AnimatedBottomSheet')) return { default: 'Sheet', useExpandedSheet: () => ({ expanded: false, isExpanded: false }), ExpandedSheetContext: { Provider: ({ children }) => children } };
      if (name.endsWith('/formatters')) return {
        formatPeriodDisplay: (s) => {
          const m = String(s || '').match(/^(\d{4})-(0[1-9]|1[0-2])$/);
          if (!m) return s || '—';
          const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
          return `${months[parseInt(m[2], 10) - 1]} ${m[1]}`;
        }
      };
      throw new Error(`Unexpected dependency ${name}`);
    };
    new Function('require', 'module', 'exports', compiled)(requireMock, module, module.exports);
    return modules[relative] = module.exports;
  }
  return {
    load,
    unmount() { slots.filter(slot => slot?.cleanup).forEach(slot => slot.cleanup()); },
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

test('Mobile saved-login recovery resumes on reconnect, including connectivity returning during the restore check', async () => {
  const tick = () => new Promise(resolve => setImmediate(resolve));
  for (const reconnectDuringRestore of [false, true]) {
    const runtime = harness();
    let online = false, onNetwork, finishFirst, calls = 0, subscribed = 0, removed = 0;
    const destinations = [];
    const animation = () => ({ start() {} });
    const Splash = runtime.load('screens/auth/SplashScreen.js', {
      'react-native': { ...native, Image: 'Image', ActivityIndicator: 'Spinner', Dimensions: { get: () => ({ width: 320, height: 640 }) },
        Animated: { Value: class {}, View: 'AnimatedView', createAnimatedComponent: () => 'AnimatedText', sequence: animation, parallel: animation, spring: animation, timing: animation } },
      '../../theme': { COLORS: {}, FONT_FAMILY: {} },
      '../../services/storageService': { getItem: async () => true },
      '../../data/dataStore': { restoreSessionFromToken: async () => {
        calls++;
        return calls === 1 ? new Promise(resolve => { finishFirst = resolve; }) : { success: true, user: { employeeId: 'SAVED-USER' } };
      } },
      '../../services/networkService': { getNetworkStatus: () => online, subscribeToNetwork: callback => {
        subscribed++; onNetwork = callback; callback(online); return () => removed++;
      } },
      '../../../assets/icon-foreground.png': 'Logo'
    }).default;
    const props = { navigation: { replace: destination => destinations.push(destination) } };
    const loading = runtime.render(Splash, props);
    assert.equal(find(loading, node => node.type === 'Spinner').props.size, 'large');
    assert.equal(find(loading, node => node.type === 'Text' && /Restoring your account|data_restoring_account/.test(node.props.children.join(''))), null);
    await tick();
    assert.equal(calls, 1);
    if (reconnectDuringRestore) { online = true; onNetwork(true); }
    finishFirst({ success: false, reason: 'SESSION_RESTORE_DEFERRED', error: 'Connect once to verify your saved account.' });
    await tick();
    if (!reconnectDuringRestore) {
      assert.ok(find(runtime.render(Splash, props), node => node.type === 'Text' && node.props.children.includes('Connect once to verify your saved account.')));
      assert.deepEqual(destinations, []); assert.equal(calls, 1, 'offline restoration does not poll');
      online = true; onNetwork(true); await tick();
    }
    assert.deepEqual(destinations, ['MainTabs']); assert.equal(calls, 2);
    onNetwork(true); await tick(); assert.equal(calls, 2, 'repeated network events do not repeat the completed repair');
    runtime.unmount(); onNetwork(true); await tick();
    assert.equal(calls, 2); assert.equal(subscribed, 1); assert.equal(removed, 1);
  }
});

test('Mobile uses one header spinner for manual and automatic refresh, stops offline, and never falsely reports failed reads as synced', async () => {
  for (const role of ['Farm Member', 'Farm Manager', 'SRA Admin']) {
    const runtime = harness();
    let status = { ownerUserId: 'LOCAL-USER', phase: 'READY' }, online = true, pending = 0, synced = true;
    let accountChanged, networkChanged, accountListeners = 0, networkListeners = 0, starts = 0, stops = 0, retryReads = 0, resolveUpload;
    const Header = runtime.load('components/AppHeader.js', {
      '../theme': { COLORS: { primary: '#2D5016' }, FONT_FAMILY: { display: 'TestDisplay' } },
      'react-native': { ...native, Image: 'Image', useWindowDimensions: () => ({ width: 320, height: 640, fontScale: 1.8 }),
        Animated: { Value: class { setValue() {} interpolate() { return 0; } }, View: 'AnimatedView', timing: () => ({}),
          loop: () => ({ start() { starts++; }, stop() { stops++; } }) }, Easing: {} },
      '../data/dataStore': { subscribe: callback => { accountListeners++; accountChanged = callback; return () => {}; },
        getIsSynced: () => synced, getCloudDataStatus: () => status,
        getCurrentSession: () => ({ employeeId: 'LOCAL-USER', role }), getPendingSyncCount: () => pending,
        performMobileSync: async () => resolveUpload ? new Promise(resolve => { resolveUpload = resolve; }) : ({ remainingCount: 0 }),
        restartCloudSyncIfReady: async () => { retryReads++; status = { ...status, phase: 'READY' }; accountChanged(); return true; } },
      '../services/networkService': { getNetworkStatus: () => online, getConnectivityDetails: () => ({ status: online ? 'ONLINE' : 'OFFLINE' }),
        CONNECTIVITY_STATUS: {}, checkConnectivity: async () => true,
        subscribeToNetwork: callback => { networkListeners++; networkChanged = callback; return () => {}; } },
      '../utils/dialogs': { safeAlert() {} }, '@react-navigation/native': { useNavigation: () => ({ navigate() {} }) },
      '../domain/syncPresentation': { syncResultMessage: () => '' }, '../../assets/icon-foreground.png': 'Logo'
    }).default;
    const render = () => runtime.render(Header, {});
    const pill = tree => find(tree, node => node.type === 'TouchableOpacity' && node.props.accessibilityHint === 'Open connection and sync details');
    let tree = render();
    assert.equal(tree.type, 'View'); assert.equal(pill(tree).props.accessibilityLabel, 'Online and synchronized');
    assert.equal(find(pill(tree), node => node.type === 'AnimatedView'), null, 'a synced cloud never shares a native animated wrapper');
    status = { ...status, phase: 'LOADING' }; accountChanged(); tree = render();
    assert.equal(pill(tree).props.accessibilityState.busy, true); assert.equal(pill(tree).props.disabled, true);
    assert.ok(find(tree, node => node.type === 'Text' && node.props.children.includes('Syncing...')), 'busy text remains visible on narrow/large-font screens');
    assert.ok(find(tree, node => node.type === 'Ionicons' && node.props.name === 'sync-outline'));
    assert.ok(find(pill(tree), node => node.type === 'AnimatedView'), 'only the syncing symbol rotates');
    assert.equal(starts, 1); render(); assert.equal(starts, 1, 're-renders do not start duplicate animations');
    online = false; networkChanged(false); tree = render();
    assert.equal(stops, 1); assert.match(pill(tree).props.accessibilityLabel, /^Offline/);
    assert.equal(find(pill(tree), node => node.type === 'AnimatedView'), null, 'offline clouds cannot inherit a partial spinner rotation');
    online = true; networkChanged(true); status = { ...status, phase: 'ERROR' }; accountChanged(); tree = render();
    assert.match(pill(tree).props.accessibilityLabel, /Retry synchronization/); assert.equal(pill(tree).props.disabled, false);
    await pill(tree).props.onPress(); tree = render(); assert.equal(retryReads, 1);
    assert.equal(pill(tree).props.accessibilityLabel, 'Online and synchronized');
    assert.equal(find(pill(tree), node => node.type === 'AnimatedView'), null, 'successful refresh returns to a fresh static cloud wrapper');
    if (role !== 'SRA Admin') {
      pending = 1; synced = false; accountChanged(); tree = render(); resolveUpload = true;
      const uploading = pill(tree).props.onPress(); tree = render();
      const before = starts; assert.equal(pill(tree).props.accessibilityState.busy, true);
      status = { ...status, phase: 'LOADING' }; accountChanged(); render(); assert.equal(starts, before);
      pending = 0; synced = true; const complete = resolveUpload; resolveUpload = null; complete({ remainingCount: 0 }); await uploading;
      tree = render(); assert.equal(pill(tree).props.accessibilityState.busy, true, 'read refresh outlives a finished manual upload');
      status = { ...status, phase: 'READY' }; accountChanged(); tree = render();
      assert.equal(pill(tree).props.accessibilityState.busy, false); assert.equal(pill(tree).props.accessibilityLabel, 'Online and synchronized');
    }
    status = { ownerUserId: 'OTHER-USER', phase: 'LOADING' }; accountChanged(); tree = render();
    assert.equal(pill(tree).props.accessibilityState.busy, false, 'an obsolete owner cannot activate the current account spinner');
    assert.equal(accountListeners, 1); assert.equal(networkListeners, 1);
  }
  for (const file of ['navigation/RootNavigator.js', 'components/InitialDataLoading.js', 'components/AppHeader.js', 'components/ui/index.js']) {
    assert.doesNotMatch(fs.readFileSync(path.join(root, 'mobile/src', file), 'utf8'), /DataRefreshNotice/, 'the extra message row is completely removed');
  }
});

test('analytics tabs retain full labels and selection on narrow screens and large system fonts', () => {
  for (const dimensions of [
    { width: 320, height: 640, fontScale: 1 },
    { width: 366, height: 740, fontScale: 1 },
    { width: 366, height: 740, fontScale: 1.8 },
    { width: 768, height: 1024, fontScale: 1 },
  ]) {
    const runtime = harness();
    const Tabs = runtime.load('components/analytics/AnalyticsTabs.js', {
      'react-native': { ...native, useWindowDimensions: () => dimensions },
    }).default;
    let activeTab = 'overview';
    const render = () => runtime.render(Tabs, { activeTab, onChange: key => { activeTab = key; } });
    let tree = render();
    assert.equal(tree.type, 'ScrollView');
    assert.equal(tree.props.horizontal, true, 'large fonts can overflow horizontally without wrapping');
    for (const [key, label] of [['overview', 'Overview'], ['costs', 'Costs'], ['operations', 'Operations'], ['market', 'Market']]) {
      const button = find(tree, node => node.props?.accessibilityLabel === label);
      const text = find(button, node => node.type === 'Text');
      assert.deepEqual(text.props.children, [label]);
      assert.equal(text.props.numberOfLines, 1);
      assert.equal(flatten(text.props.style).fontSize, 14);
      assert.equal(flatten(text.props.style).flexShrink, 0);
      assert.equal(flatten(button.props.style).flexShrink, 0);
      assert.equal(flatten(button.props.style).flex, undefined, 'tabs use intrinsic widths, not equal narrow columns');
      button.props.onPress();
      assert.equal(activeTab, key);
      tree = render();
      assert.equal(find(tree, node => node.props?.accessibilityLabel === label).props.accessibilityState.selected, true);
    }
    assert.equal(Boolean(find(tree, node => node.type === 'Ionicons')), dimensions.width === 768);
  }
});

test('takeover authorization is keyboard accessible, preserves password input and displays a guarded busy state', () => {
  const runtime = harness(); let authorizations = 0, closed = 0, entered;
  const Dialog = runtime.load('components/TakeoverAuthorizationModal.js', {
    'react-native': { ...native, ActivityIndicator: 'ActivityIndicator', Platform: { OS: 'android' } },
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' }
  }).default;
  const props = { visible: true, fieldId: 'FLD-77B8B43482A7F1950213', memberName: 'Test Member', password: ' pass word ', busy: false,
    onAuthorize: () => authorizations++, onClose: () => closed++, onPasswordChange: value => { entered = value; } };
  let tree = runtime.render(Dialog, props);
  assert.ok(find(tree, node => node.type === 'SafeAreaView'));
  assert.equal(find(tree, node => node.type === 'KeyboardAvoidingView').props.behavior, 'height');
  const input = find(tree, node => node.type === 'TextInput');
  assert.equal(input.props.value, props.password); assert.equal(input.props.autoCapitalize, 'none');
  assert.equal(input.props.autoCorrect, false); assert.equal(input.props.secureTextEntry, true);
  assert.equal(input.props.autoComplete, 'current-password');
  input.props.onChangeText(' new password '); assert.equal(entered, ' new password ');
  input.props.onSubmitEditing(); assert.equal(authorizations, 1);
  const scroll = find(tree, node => node.type === 'ScrollView'); let position;
  scroll.props.ref.current = { scrollTo: options => { position = options.y; } };
  find(tree, node => typeof node.props.onLayout === 'function' && node.type === 'View').props.onLayout({ nativeEvent: { layout: { y: 280 } } });
  input.props.onFocus(); assert.equal(position, 268, 'the focused password is brought above the keyboard');
  find(tree, node => node.props.accessibilityLabel === 'Show password').props.onPress();
  tree = runtime.render(Dialog, props); assert.equal(find(tree, node => node.type === 'TextInput').props.secureTextEntry, false);
  tree = runtime.render(Dialog, { ...props, busy: true });
  const submit = find(tree, node => node.props.accessibilityLabel === 'Authorizing Manager Takeover');
  assert.equal(submit.props.disabled, true); assert.equal(submit.props.accessibilityState.busy, true);
  assert.ok(find(submit, node => node.type === 'ActivityIndicator')); assert.equal(find(tree, node => node.type === 'TextInput').props.editable, false);
  tree.props.onRequestClose(); assert.equal(closed, 0, 'Android Back cannot hide an in-flight request');
  tree = runtime.render(Dialog, { ...props, fieldId: 'FLD-OTHER' });
  assert.equal(find(tree, node => node.type === 'TextInput').props.secureTextEntry, true, 'visibility resets for another field');
});

test('Mobile recovery reads coalesce, honor server cooldowns, retain data, and never open a background alert', async () => {
  const runtime = harness(); const pending = [], alerts = []; let invalidated;
  const Queue = runtime.load('components/RecoveryReviewQueue.js', {
    'react-native': { ...native, ActivityIndicator: 'ActivityIndicator', Alert: { alert: (...args) => alerts.push(args) } },
    '../services/networkService': { getNetworkStatus: () => true },
    '../services/authService': { fetchPasswordRecoveryReviews: () => new Promise((resolve, reject) => pending.push({ resolve, reject })) },
    '../data/dataStore': { subscribeToCloudChanges: callback => { invalidated = callback; return () => {}; } }
  }).default;
  let tree = runtime.render(Queue, {});
  assert.equal(pending.length, 1);
  pending[0].resolve({ data: [{ id: 'REVIEW-CACHED', userId: 'LOCAL-USER', displayName: 'Test Account' }] });
  await new Promise(resolve => setImmediate(resolve)); tree = runtime.render(Queue, {});
  assert.ok(JSON.stringify(tree).includes('Test Account'));
  invalidated({ resources: ['recovery-reviews'] }); invalidated({ resources: ['recovery-reviews'] });
  assert.equal(pending.length, 2, 'only one read is allowed while the refresh is unresolved');
  pending[1].reject(Object.assign(new Error('Cooldown'), { status: 429, retryAfterMs: 18000 }));
  await new Promise(resolve => setImmediate(resolve)); tree = runtime.render(Queue, {});
  assert.equal(alerts.length, 0); assert.ok(JSON.stringify(tree).includes('Your other work can continue'));
  assert.ok(JSON.stringify(tree).includes('Test Account'), 'the last successful list stays visible');
  assert.ok(!JSON.stringify(tree).includes('No password recovery reviews are waiting'));
  invalidated({ reset: true }); assert.equal(pending.length, 2, 'invalidation cannot bypass Retry-After');
  runtime.unmount();
  assert.equal(alerts.length, 0);
});

test('Web takeover submits a password unchanged once, shows progress and ignores authorization for an old field', async () => {
  const runtime = harness(); let submitted, resolve, calls = 0, closed = 0; const authorized = [];
  const Dialog = runtime.load('../../web/react-app/src/components/operations/TakeOverAuthModal.jsx', {
    '../ui': { Modal: 'Modal', FormField: 'FormField', PasswordInput: 'PasswordInput', Button: 'Button' },
    'lucide-react': { ShieldAlert: 'ShieldAlert', Lock: 'Lock' },
    '../../services/operationsService': { verifySupervisorAuth: payload => { calls++; submitted = payload; return new Promise(done => { resolve = done; }); } }
  }).default;
  const props = { isOpen: true, field: { id: 'FIELD-A' }, user: { employeeId: 'FM-1' }, onClose: () => closed++, onAuthorized: (...args) => authorized.push(args) };
  let tree = runtime.render(Dialog, props);
  find(tree, node => node.type === 'PasswordInput').props.onChange({ target: { value: ' actual password ' } }); tree = runtime.render(Dialog, props);
  const submit = find(tree.props.footer, node => node.type === 'Button' && node.props.loadingText);
  const pending = submit.props.onClick({ preventDefault() {} }); await submit.props.onClick({ preventDefault() {} });
  assert.equal(calls, 1); assert.equal(submitted.password, ' actual password ');
  tree = runtime.render(Dialog, props);
  assert.equal(find(tree.props.footer, node => node.type === 'Button' && node.props.loadingText).props.isLoading, true);
  assert.equal(find(tree, node => node.type === 'PasswordInput').props.disabled, true);
  tree.props.onClose(); assert.equal(closed, 0);
  runtime.render(Dialog, { ...props, field: { id: 'FIELD-B' } });
  resolve({ takeoverGrant: 'OLD-GRANT' }); await pending;
  assert.equal(authorized.length, 0, 'an obsolete field cannot be authorized by a late response');
  runtime.unmount();
});

test('Web recovery reviews defer invalidations during cooldown and preserve their last good list', async () => {
  const runtime = harness(); const pending = []; let invalidated;
  const Queue = runtime.load('../../web/react-app/src/components/users/RecoveryReviewQueue.jsx', {
    '../../context/AuthContext': { useAuth: () => ({ user: { employeeId: 'REVIEWER' } }) },
    'lucide-react': { AlertCircle: 'AlertCircle', CheckCircle2: 'CheckCircle2', Clock3: 'Clock3', RefreshCw: 'RefreshCw', ShieldCheck: 'ShieldCheck', XCircle: 'XCircle' },
    '../../services/recoveryReviewService': { fetchRecoveryReviews: () => new Promise((resolve, reject) => pending.push({ resolve, reject })) },
    '../../services/apiClient': { subscribeToResourceInvalidation: (_resources, callback) => { invalidated = callback; return () => {}; } }
  }).default;
  runtime.render(Queue, {});
  pending[0].resolve({ data: [{ id: 'REQ-1', displayName: 'Test Account' }] }); await new Promise(resolve => setImmediate(resolve));
  runtime.render(Queue, {}); invalidated(); invalidated(); assert.equal(pending.length, 2);
  pending[1].reject(Object.assign(new Error('Cooldown'), { status: 429, retryAfterMs: 18000 })); await new Promise(resolve => setImmediate(resolve));
  const tree = runtime.render(Queue, {});
  assert.ok(JSON.stringify(tree).includes('Your other work can continue')); assert.ok(JSON.stringify(tree).includes('Test Account'));
  invalidated(); assert.equal(pending.length, 2, 'the Web controller also respects server cooldown'); runtime.unmount();
});

test('Web notification actions preserve read/clear state, guard duplicate taps, and reconcile older pages', async t => {
  const runtime = harness(); t.after(() => runtime.unmount());
  let loader, options, release; const calls = [], navigated = [];
  const rows = [{ id: 'NEW', title: 'New price', type: 'price' }, { id: 'READ', title: 'Read price' }, { id: 'HIDDEN', title: 'Cleared price' }];
  const Bell = runtime.load('../../web/react-app/src/components/layout/NotificationBell.jsx', {
    'lucide-react': Object.fromEntries(['Bell', 'CheckCheck', 'Loader2', 'Trash2', 'X'].map(name => [name, name])),
    'react-router-dom': { useNavigate: () => path => navigated.push(path) },
    '../../context/AuthContext': { useAuth: () => ({ user: { employeeId: 'A' } }) },
    '../../services/apiClient': { subscribeToAuthenticatedLoader: (load, callbacks) => { loader = load; options = callbacks; return () => {}; },
      authenticatedRead: async () => ({ data: rows, page: { nextCursor: 'older' } }),
      authenticatedRequest: async () => ({ data: [{ id: 'OLDER-HIDDEN', title: 'Older cleared' }, { id: 'OLDER-READ', title: 'Older read' }], page: {} }) },
    '../../services/notificationService': { fetchNotificationState: async (_owner, ids) => ({ data: ids.map(id => ({ id, read: id !== 'NEW', dismissed: id.includes('HIDDEN') })) }),
      updateNotificationState: (owner, ids, action) => { calls.push({ owner, ids, action }); return new Promise(resolve => { release = resolve; }); } }
  }).default;
  const render = () => runtime.render(Bell, {});
  render(); options.onData(await loader({ force: true })); let tree = render();
  find(tree, node => node.props['aria-label'] === 'Notifications, 1 unread').props.onClick(); tree = render();
  assert.equal(JSON.stringify(tree).includes('Cleared price'), false);
  const mark = find(tree, node => node.props['aria-label'] === 'Mark as read: New price');
  const pending = mark.props.onClick(); mark.props.onClick(); assert.equal(calls.length, 1);
  tree = render(); assert.equal(find(tree, node => node.props['aria-label'] === 'Mark as read: New price').props.disabled, true);
  assert.ok(find(tree, node => node.type === 'Loader2'));
  release({ data: [{ id: 'NEW', read: true }] }); await pending; tree = render();
  assert.ok(find(tree, node => node.props['aria-label'] === 'Notifications, 0 unread')); assert.deepEqual(navigated, []);
  options.onData(await loader({ force: true })); tree = render();
  assert.ok(find(tree, node => node.props['aria-label'] === 'Notifications, 0 unread'), 'a delayed old read projection cannot restore unread state');
  const clearing = find(tree, node => node.props['aria-label'] === 'Clear notification: New price').props.onClick();
  release({ data: [{ id: 'NEW', read: true, dismissed: true }] }); await clearing;
  options.onData(await loader({ force: true })); tree = render(); assert.equal(JSON.stringify(tree).includes('New price'), false);
  await find(tree, node => node.type === 'button' && node.props.children.includes('Load older notifications')).props.onClick(); tree = render();
  assert.equal(JSON.stringify(tree).includes('Older cleared'), false); assert.ok(JSON.stringify(tree).includes('Older read'));
  assert.ok(find(tree, node => node.props['aria-label'] === 'Notifications, 0 unread'));
});

test('Web notification bulk controls confirm clearing and ignore late results after an account change', async t => {
  const runtime = harness(); t.after(() => runtime.unmount());
  let owner = 'A', options, release, activeCalls = 0;
  const Bell = runtime.load('../../web/react-app/src/components/layout/NotificationBell.jsx', {
    'lucide-react': Object.fromEntries(['Bell', 'CheckCheck', 'Loader2', 'Trash2', 'X'].map(name => [name, name])),
    'react-router-dom': { useNavigate: () => () => {} }, '../../context/AuthContext': { useAuth: () => ({ user: { employeeId: owner } }) },
    '../../services/apiClient': { subscribeToAuthenticatedLoader: (_load, callbacks) => { options = callbacks; return () => {}; } },
    '../../services/notificationService': { updateAllNotificationState: async (_owner, _action, { isCurrent }) => {
      activeCalls++; return new Promise(resolve => { release = () => { assert.equal(isCurrent(), false); resolve({ data: [{ id: 'B', read: true, dismissed: true }] }); }; });
    } }
  }).default;
  const render = () => runtime.render(Bell, {});
  render(); options.onData({ data: [{ id: 'A', title: 'Account A' }], notificationState: [] }); let tree = render();
  find(tree, node => node.props['aria-label'] === 'Notifications, 1 unread').props.onClick(); tree = render();
  const clear = find(tree, node => node.type === 'button' && node.props.children.includes('Clear all'));
  const canceled = clear.props.onClick(); tree = render(); assert.equal(activeCalls, 0);
  find(tree, node => node.type === 'ConfirmDialog').props.onCancel(); await canceled;
  assert.equal(activeCalls, 0, 'Cancel keeps notification records untouched');
  const pending = clear.props.onClick(); tree = render();
  find(tree, node => node.type === 'ConfirmDialog').props.onConfirm(); await Promise.resolve();
  await clear.props.onClick(); assert.equal(activeCalls, 1);
  owner = 'B'; render(); options.onData({ data: [{ id: 'B', title: 'Account B' }], notificationState: [] }); tree = render();
  release(); await pending; tree = render();
  assert.ok(find(tree, node => node.props['aria-label'] === 'Notifications, 1 unread'), 'old account clear cannot remove the new account inbox');
});

test('Web and Mobile selected-date compilation controls send the same scope and clear an outdated saved selection', async t => {
  for (const mobile of [false, true]) {
    const runtime = harness(); t.after(() => runtime.unmount());
    const previews = [], saves = [];
    const summary = scope => ({ ...scope, sourceReportCount: 1, monthCount: 1, blockFarmCount: 1, operationCount: 2, fieldCount: 1, memberCount: 1, hectaresAudited: 2, totalCost: 50, monthlySummaries: [], farmSummaries: [], sourceReports: [] });
    const service = {
      fetchCropYearOptions: async () => ({ data: { cropYearCycles: ['2026-2027'], blockFarms: [] } }),
      previewCropYear: async scope => { previews.push({ ...scope }); return { data: summary(scope) }; },
      fetchCropYearCompilations: async () => ({ data: [] }),
      compileCropYear: async scope => { saves.push({ ...scope }); return { data: { ...summary(scope), id: 'SAVED-SELECTED-DATES', compiledAt: '2026-11-15T00:00:00Z', compiledByName: 'SRA Admin' } }; },
    };
    const Screen = runtime.load(mobile ? 'components/CropYearCompilationScreen.js' : '../../web/react-app/src/components/audit/CropYearCompilationModal.jsx', mobile ? {
      'react-native': { ...native, ActivityIndicator: 'ActivityIndicator', BackHandler: { addEventListener: () => ({ remove() {} }) } },
      'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' }, './ui': { SearchableSelect: 'SearchableSelect', ScreenHeader: 'ScreenHeader' },
      '../services/networkService': { getNetworkStatus: () => true, subscribeToNetwork: () => () => {} },
      '../data/dataStore': { subscribeToCloudChanges: () => () => {} }, '../services/cropYearCompilationService': service,
    } : {
      'lucide-react': { CalendarRange: 'CalendarRange', Download: 'Download', Printer: 'Printer' },
      '../ui/Modal': { __esModule: true, default: 'Modal' }, '../ui/Button': { __esModule: true, default: 'Button' }, '../ui/Select': { __esModule: true, default: 'Select' },
      '../../services/cropYearCompilationService': service, '../../services/apiClient': { subscribeToResourceInvalidation: () => () => {} },
    }).default;
    const render = () => runtime.render(Screen, { onClose() {} });
    render(); await new Promise(resolve => setImmediate(resolve)); render(); await new Promise(resolve => setImmediate(resolve)); let tree = render();
    const selector = mobile ? find(tree, node => node.type === 'SearchableSelect' && node.props.label === 'Compilation coverage')
      : find(tree, node => node.type === 'Select' && node.props.options?.some(option => option.value === 'DATE_RANGE'));
    if (mobile) selector.props.onSelect({ id: 'DATE_RANGE' }); else selector.props.onChange({ target: { value: 'DATE_RANGE' } });
    tree = render(); const before = previews.length;
    const setDate = (label, value) => {
      const node = mobile ? find(tree, item => item.props.accessibilityLabel === `Compilation ${label.toLowerCase()}`)
        : find(find(tree, item => item.type === 'label' && item.props.children.includes(label)), item => item.type === 'input');
      if (mobile) node.props.onChangeText(value); else node.props.onChange({ target: { value } });
      tree = render();
    };
    setDate('Start date', '2026-09-10'); setDate('End date', '2026-09-01');
    await new Promise(resolve => setImmediate(resolve)); assert.equal(previews.length, before, 'incomplete/reversed dates do not issue previews');
    setDate('End date', '2026-09-20'); await new Promise(resolve => setImmediate(resolve)); tree = render();
    assert.deepEqual(previews.at(-1), { cropYearCycle: '2026-2027', blockFarmId: '', coverageMode: 'DATE_RANGE', startDate: '2026-09-10', endDate: '2026-09-20' });
    const compile = mobile ? find(tree, node => node.type === 'TouchableOpacity' && find(node, child => child.type === 'Text' && child.props.children.includes('Compile Selected Dates')))
      : find(tree, node => node.type === 'Button' && node.props.children.includes('Compile Selected Dates'));
    assert.equal(compile.props.disabled, false);
    await (mobile ? compile.props.onPress() : compile.props.onClick()); tree = render();
    assert.deepEqual(saves[0], previews.at(-1)); assert.ok(JSON.stringify(tree).includes('SAVED-SELECTED-DATES'));
    setDate('End date', '2026-09-25'); assert.equal(JSON.stringify(tree).includes('SAVED-SELECTED-DATES'), false, 'exports cannot use the prior date-range snapshot');
    runtime.unmount();
  }
});

test('Member Home shows the field farm instead of a stale session name and retains affiliation without a plot', () => {
  const runtime = harness();
  const assignments = runtime.load('domain/assignmentPresentation.js');
  const Home = runtime.load('screens/member/MemberHomeView.js', {
    '../../domain/assignmentPresentation': assignments,
    '../../constants/cropStages': { SUGARCANE_STAGES: [] },
    '../../utils/dataHelpers': { formatCropYearDisplay: value => value },
    '../../domain/presentationContract': { STAGE_DISPLAY_LABELS: {} },
  }).default;
  const props = { session: { employeeId: 'MEM-1', blockFarmId: 'BF-A', farm: 'Stale Session Farm' },
    blockFarms: [{ id: 'BF-A', name: 'NACAYAO' }, { id: 'BF-B', name: 'Other Farm' }],
    myFields: [{ id: 'FLD-1', blockFarmId: 'BF-B', ha: 1, stageNumber: 1 }], navigation: { navigate() {} } };
  let tree = runtime.render(Home, props);
  assert.ok(find(tree, node => node.type === 'Text' && node.props.children.includes('Other Farm')));
  assert.equal(JSON.stringify(tree).includes('Stale Session Farm'), false);
  tree = runtime.render(Home, { ...props, myFields: [] });
  assert.ok(find(tree, node => node.type === 'Text' && node.props.children.includes('NACAYAO')));
});

test('Web pending review shows the actual affiliated farm for an existing account awaiting phone verification', () => {
  const runtime = harness();
  const Queue = runtime.load('../../web/react-app/src/components/users/PendingApprovalsQueue.jsx', {
    'lucide-react': Object.fromEntries(['UserCheck', 'CheckCircle2', 'Clock', 'Phone', 'MapPin', 'AlertCircle', 'Check', 'ChevronLeft', 'ChevronRight'].map(name => [name, name])),
    '../ui/Button': { __esModule: true, default: 'Button' },
    '../../domain/assignmentPresentation': runtime.load('domain/assignmentPresentation.js'),
    '../../domain/phoneVerification': { DEFAULT_PHONE_VERIFICATION_REASON: 'OTHER', PHONE_VERIFICATION_REASONS: [], isOtherPhoneVerificationReason: () => true },
  }).default;
  const tree = runtime.render(Queue, {
    pendingUsers: [{ id: 'MEM-1', status: 'ACTIVE', name: 'Member', canonicalRole: 'MEMBER_FARMER', affiliatedBlockFarmId: 'BF-A', phoneVerified: false }],
    blockFarms: [{ id: 'BF-A', name: 'NACAYAO' }], currentUser: { canonicalRole: 'SRA_ADMIN' },
  });
  assert.ok(JSON.stringify(tree).includes('NACAYAO'));
  assert.equal(JSON.stringify(tree).includes('Unassigned Farm'), false);
});

test('Web pending approval offers deferred assignment and reveals field inputs only for immediate assignment', async () => {
  const runtime = harness();
  const submissions = [];
  const Queue = runtime.load('../../web/react-app/src/components/users/PendingApprovalsQueue.jsx', {
    'lucide-react': Object.fromEntries(['UserCheck', 'CheckCircle2', 'Clock', 'Phone', 'MapPin', 'AlertCircle', 'Check', 'ChevronLeft', 'ChevronRight'].map(name => [name, name])),
    '../ui/Button': { __esModule: true, default: 'Button' },
    '../../domain/assignmentPresentation': { accountBlockFarmId: account => account.requestedBlockFarmId },
    '../../domain/phoneVerification': { DEFAULT_PHONE_VERIFICATION_REASON: 'CHECKED', PHONE_VERIFICATION_REASONS: [], isOtherPhoneVerificationReason: () => false },
  }).default;
  const props = {
    pendingUsers: [{ id: '04000077', status: 'PENDING', name: 'Member', canonicalRole: 'MEMBER_FARMER', requestedBlockFarmId: 'BF-A', phoneVerified: true }],
    blockFarms: [{ id: 'BF-A', name: 'Farm' }], currentUser: { canonicalRole: 'FARM_MANAGER' },
    onApproveUser: async (...args) => { submissions.push(args); return { success: true }; }
  };
  let tree = runtime.render(Queue, props);
  assert.equal(find(tree, node => node.type === 'input'), null);
  await find(tree, node => node.type === 'Button').props.onClick();
  assert.equal(submissions[0][2].fieldAssignmentMode, 'LATER');
  tree = runtime.render(Queue, props);
  find(tree, node => node.type === 'button' && node.props.children.includes('Approve and assign field')).props.onClick();
  tree = runtime.render(Queue, props);
  const input = find(tree, node => node.type === 'input');
  assert.ok(input);
  assert.equal(find(tree, node => node.type === 'Button').props.disabled, true);
  input.props.onChange({ target: { value: '1.50' } });
  tree = runtime.render(Queue, props);
  assert.equal(find(tree, node => node.type === 'Button').props.disabled, false);
  await find(tree, node => node.type === 'Button').props.onClick();
  assert.equal(submissions[1][2].fieldAssignmentMode, 'NOW');
  assert.equal(submissions[1][2].fieldAreaHa, 1.5);
});

test('Web audit dossier labels use the canonical report month rather than blank or stale legacy aliases', () => {
  const runtime = harness();
  const Dossier = runtime.load('../../web/react-app/src/components/audit/AuditDossierCard.jsx', {
    'lucide-react': Object.fromEntries(['FileText', 'Printer', 'ShieldCheck', 'Calendar', 'Building', 'User', 'Hash', 'CheckCircle2', 'Clock', 'QrCode'].map(name => [name, name])),
    '../ui/Badge': { __esModule: true, default: 'Badge' },
    '../ui/Button': { __esModule: true, default: 'Button' },
    '../ui/ConfirmDialog': { __esModule: true, default: 'ConfirmDialog' },
    '../ui/Textarea': { __esModule: true, default: 'Textarea' },
    '../ui/Table': { PaginationFooter: 'PaginationFooter' },
    '../../domain/auditWorkflow': { AUDIT_STATUS: { COMPILED: 'COMPILED', PENDING_SUBMISSION: 'PENDING_SUBMISSION', PENDING_REVIEW: 'PENDING_REVIEW', CERTIFIED: 'CERTIFIED' }, canonicalAuditStatus: value => value, auditStatusLabel: value => value },
  }).default;
  const tree = runtime.render(Dossier, { report: { id: 'REPORT-1', blockFarmId: 'BF-A', periodKey: '2026-09', period: 'STALE MONTH', status: 'COMPILED', totalCost: 1000,
    operationSnapshots: [{ fieldId: 'FLD-1', operationName: 'Weeding', performedOn: '2026-09-01', quantity: { value: 1, unit: 'ha' }, totalCost: 1000, laborEntries: [], lineItems: [] }] }, blockFarms: [{ id: 'BF-A', name: 'NACAYAO' }] });
  for (const label of ['SRA Monthly Operations Schedule', 'Total Verified Cost']) {
    const node = find(tree, item => item.props?.children?.some(child => typeof child === 'string' && child.includes(label)));
    assert.ok(node, label);
    assert.ok(node.props.children.includes('2026-09'), label);
    assert.equal(node.props.children.includes('STALE MONTH'), false, label);
  }
});

test('Sync Monitor returns from popup-only entry to Home and does not alert after leaving an in-flight sync', async t => {
  const runtime = harness(); let hardwareBack, removed = 0, focused = true, index = 0, releases, uploads = 0;
  t.after(() => runtime.unmount());
  const navigated = [], alerts = [];
  const navigation = { canGoBack: () => true, goBack: () => navigated.push('BACK'),
    getState: () => ({ index, routeNames: ['HomeMain', 'SyncMonitor'] }),
    navigate: name => { navigated.push(name); focused = false; }, isFocused: () => focused, addListener: () => () => {} };
  const Screen = runtime.load('screens/SyncMonitorScreen.js', {
    'react-native': { ...native, ActivityIndicator: 'ActivityIndicator', Alert: { alert: (...args) => alerts.push(args) },
      BackHandler: { addEventListener: (_event, handler) => { hardwareBack = handler; return { remove: () => removed++ }; } } },
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
    '../data/dataStore': { getCurrentSession: () => ({ employeeId: 'A', role: 'Farm Member', name: 'Member' }),
      getNetworkStatus: () => true, subscribe: () => () => {}, subscribeToCloudChanges: () => () => {},
      performMobileSync: async () => { uploads++; return new Promise(resolve => { releases = resolve; }); } },
    '../services/syncEngine': { getOutboxDiagnostics: () => [], getOutboxPressure: () => ({ level: 'normal' }), getOutboxStorageState: () => ({ ready: true }) },
    '../services/telemetryService': { fetchAgriculturalSyncMonitor: async () => ({ subjects: [] }) },
  }).default;
  runtime.render(Screen, { navigation }); await new Promise(resolve => setImmediate(resolve));
  let tree = runtime.render(Screen, { navigation });
  const back = find(tree, node => node.props.accessibilityLabel === 'Back');
  assert.ok(back.props.style.minHeight >= 48); back.props.onPress();
  assert.deepEqual(navigated, ['HomeMain'], 'parent tab history must not strand a rootless monitor');
  focused = true; assert.equal(hardwareBack(), true); assert.equal(navigated.at(-1), 'HomeMain');
  focused = true; index = 1; back.props.onPress(); assert.equal(navigated.at(-1), 'BACK');
  assert.equal(hardwareBack(), false, 'a normal stack back remains handled by the navigator');
  const sync = find(tree, node => node.type === 'TouchableOpacity' && find(node, child => child.type === 'Ionicons' && child.props.name === 'sync'));
  assert.ok(sync);
  const pending = sync.props.onPress(); sync.props.onPress(); assert.equal(uploads, 1);
  focused = false; releases({ success: false, remainingCount: 3, reason: 'SERVER_UNAVAILABLE' }); await pending;
  assert.equal(alerts.length, 0); runtime.unmount(); assert.equal(removed, 1);
});

test('the Mobile price browser reaches older pages and ignores responses after closing', async () => {
  const runtime = harness();
  let account = { employeeId: 'MEM-1' }, release;
  const calls = [];
  const first = Array.from({ length: 50 }, (_, index) => ({ id: `PRICE-${index}`, effectiveDate: '2026-09-27', sugarPricePerLkg: index + 1000, sugarPriceChange: -350, molassesPriceChange: -1600 }));
  const pagination = runtime.load('components/ui/Pagination.js');
  const Sheet = runtime.load('components/PriceHistorySheet.js', {
    './AnimatedBottomSheet': 'Sheet', './ui/Pagination': { __esModule: true, default: 'Pagination', usePagination: pagination.usePagination },
    '../data/dataStore': { getCurrentSession: () => account },
    '../utils/pricePresentation': runtime.load('utils/pricePresentation.js'),
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
  const sugarMovement = find(tree, node => node.type === 'Text' && node.props.children.includes('Sugar change: '));
  assert.ok(sugarMovement.props.children.some(child => typeof child === 'string' && child.includes('350.00')));
  assert.ok(sugarMovement.props.children.includes(' vs previous dated publication'));
  const more = find(tree, node => node.type === 'TouchableOpacity' && node.props.children.some(child => child?.props?.children.includes('Load older price records')));
  const pending = more.props.onPress();
  assert.match(calls[1], /cursor=older/);
  props = { ...props, visible: false }; runtime.render(Sheet, props);
  release(); await pending;
  tree = runtime.render(Sheet, props);
  assert.equal(find(tree, node => node.type === 'Pagination').props.total, 0);
  account = { employeeId: 'OTHER' };
});

test('Web takeover authorization remains field-scoped while browsing, expires, exits individually and resets on account change', t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const runtime = harness();
  let user = { employeeId: 'MGR-1', role: 'Farm Manager' };
  const field = { id: 'FLD-1', areaHa: 1, currentCycleId: 'CYC-1', stageNumber: 1 };
  const fields = [field, { ...field, id: 'FLD-2' }];
  const View = runtime.load('../../web/react-app/src/views/operations/TakeOverView.jsx', {
    '../../context/AuthContext': { useAuth: () => ({ user, roleKey: 'FARM_MANAGER' }) },
    '../../utils/authRouting': { ROLE_KEYS: { FARM_MANAGER: 'FARM_MANAGER' } },
    '../../services/fieldsService': { subscribeToFieldsData: ({ onUpdate }) => { onUpdate({ fields, isLoading: false }); return () => {}; } },
    '../../services/operationsService': { createOperation: async () => ({ success: true }) },
    '../../constants/cropStages': { CROP_STAGE_MAX: 6, SUGARCANE_STAGES: [{ stageNumber: 1, name: 'Land Preparation' }] },
    '../../domain/operationCatalogue': { getOperationsForStage: () => [], getOperationDefinition: () => null },
    '../../domain/operationUnits': { canonicalOperationUnit: unit => unit === 'ha' ? 'HA' : unit,
      operationUnitOptions: () => [{ value: 'HA', label: 'HA' }] },
    '../../domain/sugarcaneVarieties': { SUGARCANE_VARIETIES: [] },
    '../../services/apiClient': {}, '../../utils/secureId': { createClientRecordId: () => 'LOG-TEST' },
    '../../domain/operationSubmission': runtime.load('../../web/react-app/src/domain/operationSubmission.js'),
    '../../domain/operationAuthorization': runtime.load('../../web/react-app/src/domain/operationAuthorization.js'),
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
  find(render(), node => node.type === 'Button' && node.props.children.includes('Exit Field Takeover')).props.onClick();
  assert.equal(hasActiveBanner(render()), true, 'opening exit confirmation retains authorization');
  let exitDialog = find(render(), node => node.type === 'ConfirmDialog' && node.props.title === 'Exit Field Takeover?');
  assert.equal(exitDialog.props.isOpen, true);
  assert.match(exitDialog.props.message, /FLD-2/);
  exitDialog.props.onCancel();
  assert.equal(hasActiveBanner(render()), true, 'canceling leaves authorization intact');
  find(render(), node => node.type === 'Button' && node.props.children.includes('Exit Field Takeover')).props.onClick();
  exitDialog = find(render(), node => node.type === 'ConfirmDialog' && node.props.title === 'Exit Field Takeover?');
  exitDialog.props.onConfirm();
  assert.equal(hasActiveBanner(render()), false);
  find(render(), node => node.type === 'Select' && node.props.id === 'takeover-field-selector').props.onChange({ target: { value: 'FLD-1' } });
  assert.equal(hasActiveBanner(render()), true, 'returning to field 1 retains its earlier authorization after exiting field 2');
  find(render(), node => node.type === 'Select' && node.props.id === 'takeover-field-selector').props.onChange({ target: { value: 'FLD-2' } });
  assert.equal(hasActiveBanner(render()), false, 'exited field 2 needs its own new authorization');
  find(render(), node => node.type === 'AuthModal').props.onAuthorized(fields[1], 'grant-2-new', Date.now() + 1000);
  assert.equal(hasActiveBanner(render()), true);
  user = { employeeId: 'MGR-2', role: 'Farm Manager' };
  assert.equal(hasActiveBanner(render()), false);
});

test('Web print preview groups direct and milling operations into flat rows across rates and shows full expenditure totals', () => {
  const runtime = harness();
  const report = { reportId: 'PRINT-GROUPING-TEST', cropYearCycle: '2026-2027', periodKey: '2026-03', qrHash: 'TEST-HASH',
    operationSnapshots: [
      { fieldId: 'A', cropYearCycle: '2026-2027', stageNumber: 3, performedOn: '2026-02-01', operationName: 'Basal Application', areaHa: 1, quantity: { value: 1, unit: 'bag' }, unitCost: 100, totalCost: 100 },
      { fieldId: 'B', cropYearCycle: '2026-2027', stageNumber: 3, performedOn: '2026-03-01', operationName: 'Basal Application', areaHa: 2, quantity: { value: 1, unit: 'bag' }, unitCost: 100, totalCost: 100 },
      { fieldId: 'A', cropYearCycle: '2026-2027', stageNumber: 6, performedOn: '2026-03-02', operationName: 'Cane Cutting', areaHa: 1, quantity: { value: 1, unit: 'ton' }, unitCost: 100, totalCost: 100 },
      { fieldId: 'B', cropYearCycle: '2026-2027', stageNumber: 6, performedOn: '2026-03-03', operationName: 'Cane Cutting', areaHa: 2, quantity: { value: 1, unit: 'ton' }, unitCost: 200, totalCost: 200 }
    ] };
  const before = structuredClone(report);
  const View = runtime.load('../../web/react-app/src/components/audit/PrintableAuditReport.jsx', {
    'lucide-react': {}, '../ui/Button': 'Button', './QRCodeView': 'QRCode',
    '../../utils/auditReportLayout': runtime.load('../../web/react-app/src/utils/auditReportLayout.js'),
    '../../domain/auditWorkflow': runtime.load('../../web/react-app/src/domain/auditWorkflow.js', { pako: mobileRequire('pako') }),
    '../../utils/formatters': { formatCropYearDisplay: value => value }
  }).default;
  const tree = runtime.render(View, { report, isOpenModal: false });
  const content = node => typeof node === 'object' && node ? (node.props?.children || []).flat(Infinity).map(content).join('') : String(node ?? '');
  const rows = [];
  const collect = node => {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'tr') rows.push(node);
    (node.props?.children || []).flat(Infinity).forEach(collect);
  };
  collect(find(tree, node => node.type === 'tbody'));
  const numbered = rows.filter(row => /^\d+$/.test(content(row.props.children.flat(Infinity)[0])));
  assert.equal(numbered.length, 2, 'one numbered heading per operation');
  assert.ok(rows.some(row => content(row).includes('TOTAL DIRECT COST (PHP)200.00')));
  assert.ok(rows.some(row => content(row).includes('TOTAL MILLING EXPENSES (PHP)300.00')));
  assert.ok(rows.some(row => content(row).includes('TOTAL COST OF PRODUCTION (PHP)500.00')));
  const cuttingDetails = rows.filter(row => content(row).includes('Cane Cutting') && !numbered.includes(row));
  assert.equal(cuttingDetails.length, 0, 'price differences cannot create child rows');
  assert.ok(content(numbered.find(row => content(row).includes('Cane Cutting'))).includes('150.00 (avg)'));
  assert.equal(content(numbered.find(row => content(row).includes('Basal Application')).props.children.flat(Infinity).at(-1)), '200.00');
  assert.equal(content(numbered.find(row => content(row).includes('Cane Cutting')).props.children.flat(Infinity).at(-1)), '300.00');
  assert.deepEqual(report, before);
});

test('Web and Mobile audit reviews explain missing quantity records and disable compilation', () => {
  const data = { periodKey: '2026-09', canCompile: false, memberFollowUps: [], missingQuantityCount: 1,
    missingQuantityOperations: [{ operationLogId: 'LOG-1', fieldId: 'FLD-1', operationName: 'Planting Operations' }] };
  const web = harness();
  const WebReview = web.load('../../web/react-app/src/components/audit/AuditMemberReview.jsx', {
    'lucide-react': {}, '../ui': { TablePagination: 'TablePagination' }
  }).default;
  const webTree = web.render(WebReview, { data });
  assert.ok(find(webTree, node => node.props?.role === 'alert'));
  assert.ok(JSON.stringify(webTree).includes('Planting Operations'));
  assert.equal(JSON.stringify(webTree).includes('an empty report cannot'), false);
  const mobile = harness();
  const Review = mobile.load('components/AuditMemberReviewSheet.js').default;
  const tree = mobile.render(Review, { data, onClose() {}, onContinue() {}, onCall() {} });
  const list = find(tree, node => node.type === 'FlatList');
  assert.ok(JSON.stringify(list.props.ListHeaderComponent).includes('Planting Operations'));
  assert.ok(find(tree, node => node.type === 'TouchableOpacity' && node.props.disabled === true));
});

test('Mobile switching to Direct Input preserves entered values without inventing quantity one or a 1000 price', () => {
  const source = fs.readFileSync(path.join(root, 'mobile/src/screens/FieldOpsScreen.js'), 'utf8');
  const ast = babel.parseSync(source, { filename: 'FieldOpsScreen.js', configFile: false, babelrc: false, parserOpts: { plugins: ['jsx'] } });
  let callback;
  const visit = node => {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'JSXElement' && node.openingElement.name?.name === 'TouchableOpacity'
      && source.slice(node.start, node.end).includes("t('mode_direct_input'")) {
      callback = node.openingElement.attributes.find(attribute => attribute.name?.name === 'onPress').value.expression;
    }
    Object.values(node).forEach(value => { if (Array.isArray(value)) value.forEach(visit); else if (value && typeof value === 'object') visit(value); });
  };
  visit(ast.program);
  assert.ok(callback);
  for (const initial of [{ isGroup: true, hectares: '99', subItems: [] },
    { isGroup: true, inputQty: '4', inputUnit: 'bag', directRate: '875', hectares: '99' }]) {
    let form = { ...initial };
    const handler = new Function('logForm', 'setLogForm', `return (${source.slice(callback.start, callback.end)});`)(form, update => { form = update(form); });
    handler();
    assert.equal(form.inputQty, initial.inputQty || '');
    assert.equal(form.directRate, initial.directRate || '');
    assert.notEqual(form.directRate, '1000');
  }
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
    '../services/systemNotificationService': { getSystemNotifications: () => [{
      id: 'PRICE-1', type: 'price', title: 'SRA price updated', body: 'An eligible publication.', createdAt: '2026-09-27T12:00:00.000Z'
    }] },
    '../services/notificationStateService': {
      createAccountNotificationState: (userId, isCurrent, onChange) => service.createNotificationStateClient({ userId, isCurrent, onChange,
        readCache: async () => null, writeCache: async () => true,
        request: async (_url, body) => ({ success: true, data: body.ids.map(id => ({ id, read: false, dismissed: false })) }),
      }),
    },
    '../data/dataStore': {
      getCurrentSession: () => account, getIsSynced: () => true,
      subscribeToCloudChanges: () => () => {},
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

test('Mobile activity paging reaches custom activities beyond the old eight-item limit and preserves full-set shares', () => {
  const runtime = harness();
  const pagination = runtime.load('components/ui/Pagination.js');
  const { ActivityFrequencyList } = runtime.load('components/analytics/AnalyticsComponents.js', {
    '../AnimatedBottomSheet': 'Sheet', '../ui': {},
    '../ui/SearchableSelect': { SearchableSelectContent: 'Picker' }, '../PriceReferenceCard': 'PriceReferenceCard',
    '../../services/analyticsSelectors': {},
  });
  const ranking = Array.from({ length: 13 }, (_, index) => ({
    name: `${index < 8 ? 'Standard' : 'Custom'} activity ${index + 1}`, count: 1, totalCost: 100, avgCost: 100
  }));
  const original = structuredClone(ranking);
  const text = node => Array.isArray(node) ? node.map(text).join(' ')
    : node && typeof node === 'object' ? text(node.props?.children) : String(node ?? '');
  const cards = tree => tree.props.children.flat(Infinity).filter(node => node?.type === 'View');
  const render = (items = ranking, resetKey = 'BF-1:2026-2027:ALL') => runtime.render(ActivityFrequencyList, { ranking: items, resetKey });
  let tree = render();
  const visited = [];
  for (let page = 1; page <= 3; page++) {
    const pager = find(tree, node => node.type === 'Pagination');
    assert.equal(pager.props.page, page);
    assert.ok(cards(tree).length <= 5);
    assert.equal(pager.props.total, 13);
    cards(tree).forEach(card => {
      const name = ranking.find(item => text(card).includes(item.name)).name;
      visited.push(name);
      assert.match(text(card), /8%/, 'share uses all 13 activities, including those on other pages');
    });
    const controls = pagination.default(pager.props);
    const next = find(controls, node => node.props?.accessibilityLabel === 'Next page of activities');
    assert.equal(next.props.disabled, page === 3);
    if (page < 3) { next.props.onPress(); tree = render(); }
  }
  assert.deepEqual(visited, ranking.map(item => item.name));
  const rank = find(cards(tree)[0], node => node.type === 'Text' && typeof node.props.children[0] === 'number');
  assert.equal(rank.props.children[0], 11, 'rank numbers continue on later pages');
  tree = render(ranking.slice(0, 2));
  assert.equal(find(tree, node => node.type === 'Pagination').props.page, 1);
  tree = render(ranking, 'BF-2:2026-2027:2026-10');
  assert.equal(find(tree, node => node.type === 'Pagination').props.page, 1);
  tree = render([], 'BF-2:2026-2027:2026-10');
  assert.equal(find(tree, node => node.type === 'Pagination'), null);
  assert.deepEqual(ranking, original, 'paging never changes analytics records or totals');
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
  assert.equal(flatten(list.props.style).flexShrink, 1, 'long lists shrink within the sheet');
});

test('searchable select paginates long lists and supports nested scrolling', () => {
  const runtime = harness();
  const { SearchableSelectContent } = runtime.load('components/ui/SearchableSelect.js', { '../AnimatedBottomSheet': 'Sheet' });
  const options = Array.from({ length: 7 }, (_, i) => ({ id: `FLD-${i + 1}`, label: `Plot ${i + 1}` }));
  let tree = runtime.render(SearchableSelectContent, { options, resetKey: true, onSelect: () => {}, onClose: () => {} });
  let list = find(tree, node => node.type === 'FlatList');
  assert.equal(list.props.nestedScrollEnabled, true, 'nested scrolling enabled for sheet compatibility');
  assert.equal(list.props.data.length, 5, 'page size limits long lists to 5 items on page 1');
  assert.ok(list.props.ListFooterComponent, 'pagination footer rendered for long lists');

  let expandedTree = runtime.render(SearchableSelectContent, { options, resetKey: true, onSelect: () => {}, onClose: () => {}, isExpanded: true });
  let expandedList = find(expandedTree, node => node.type === 'FlatList');
  assert.equal(expandedList.props.data.length, 7, 'page size expands to 10 when expanded, displaying all 7 items');
  assert.equal(expandedList.props.ListFooterComponent, null, 'no pagination footer needed when all items fit on expanded page');
  assert.equal(flatten(expandedList.props.style).maxHeight, undefined, 'maxHeight constraint removed when expanded');
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
