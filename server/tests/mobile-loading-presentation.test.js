'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const root = path.resolve(__dirname, '../..');
const mobileRequire = createRequire(path.join(root, 'mobile/package.json'));
const context = {};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(root, 'mobile/src/domain/initialDataPresentation.js'), 'utf8').replace('export function', 'function'), context);
const present = (state, online = true) => context.initialDataPresentation({ employeeId: 'A' }, state, online);

test('initial loading, failed loading and unavailable offline data are distinct from confirmed empty records', () => {
  assert.equal(present({ ownerUserId: 'A', phase: 'LOADING', hasSnapshot: false }).mode, 'loading');
  assert.equal(present({ ownerUserId: 'A', phase: 'ERROR', hasSnapshot: false }).mode, 'error');
  assert.equal(present({ ownerUserId: 'A', phase: 'LOADING', hasSnapshot: false }, false).mode, 'offline');
  assert.equal(present({ ownerUserId: 'A', phase: 'READY', hasSnapshot: true }).showContent, true);
  assert.equal(present({ ownerUserId: 'B', phase: 'READY', hasSnapshot: true }).showContent, false);
});

test('background refresh and errors retain cached content; offline snapshots do not show a blocking spinner', () => {
  for (const [phase, notice] of [['LOADING', 'updating'], ['ERROR', 'error'], ['READY', null]]) {
    const state = present({ ownerUserId: 'A', phase, hasSnapshot: true });
    assert.equal(state.showContent, true);
    assert.equal(state.notice, notice);
  }
  assert.equal(present({ ownerUserId: 'A', phase: 'READY', hasSnapshot: true }, false).notice, 'offline');
  assert.equal(present({ ownerUserId: 'A', phase: 'IDLE', hasSnapshot: false, hasSavedData: true }, false).showContent, true,
    'older account-owned drafts and cached fields remain accessible offline');
  assert.equal(present({ ownerUserId: 'A', phase: 'LOADING', hasSnapshot: false, hasSavedData: true }).mode, 'loading',
    'partial legacy data must not look like a confirmed fresh snapshot online');
});

function component() {
  const filename = path.join(root, 'mobile/src/components/InitialDataLoading.js');
  const compiled = mobileRequire('@babel/core').transformSync(fs.readFileSync(filename, 'utf8'), { filename, babelrc: false, configFile: false,
    plugins: [mobileRequire.resolve('@babel/plugin-transform-react-jsx'), mobileRequire.resolve('@babel/plugin-transform-modules-commonjs')] }).code;
  const module = { exports: {} };
  const dependencies = {
    react: { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }) },
    'react-native': { View: 'View', ScrollView: 'ScrollView', ActivityIndicator: 'ActivityIndicator', TouchableOpacity: 'TouchableOpacity', StyleSheet: { create: value => value } },
    '../theme': { COLORS: {} }, './Typography': { AppText: 'Text' }, '../services/i18n': { useTranslation: () => ({ t: key => key }) }
  };
  new Function('require', 'module', 'exports', compiled)(name => {
    assert.ok(dependencies[name], `Unexpected dependency ${name}`); return dependencies[name];
  }, module, module.exports);
  return module.exports.default;
}
function nodes(tree, type) {
  if (Array.isArray(tree)) return tree.flatMap(item => nodes(item, type));
  if (!tree || typeof tree !== 'object') return [];
  return [...(tree.type === type ? [tree] : []), ...nodes(tree.props?.children, type)];
}

test('actual Native loading view shows progress and error/offline views expose the retry action', () => {
  const Loading = component();
  assert.equal(nodes(Loading({ mode: 'loading' }), 'ActivityIndicator').length, 1);
  assert.equal(nodes(Loading({ mode: 'loading' }), 'TouchableOpacity').length, 0);
  for (const mode of ['error', 'offline']) {
    let retries = 0;
    const buttons = nodes(Loading({ mode, onRetry: () => retries++ }), 'TouchableOpacity');
    assert.equal(buttons.length, 1);
    buttons[0].props.onPress();
    assert.equal(retries, 1);
    assert.equal(nodes(Loading({ mode }), 'ActivityIndicator').length, 0, 'errors never leave an indefinite spinner');
  }
});

test('loading feedback never starts a cloud listener without matching Firebase and server account credentials', async () => {
  const source = fs.readFileSync(path.join(root, 'mobile/src/data/dataStore.js'), 'utf8');
  const restart = source.slice(source.indexOf('export const restartCloudSyncIfReady'), source.indexOf('export const retryCloudDataLoad')).replace('export const', 'var');
  for (const reject of ['token', 'identity', 'verification', 'password', null]) {
    let listeners = 0;
    const state = {
      cloudSyncGeneration: 0, activeCloudSyncStop: null,
      CURRENT_SESSION: { employeeId: 'A', role: 'MEMBER_FARMER', phoneVerified: reject !== 'verification', requiresPasswordChange: reject === 'password' },
      auth: { currentUser: { uid: reject === 'identity' ? 'B' : 'A' } },
      ROLES: { SRA_ADMIN: 'SRA_ADMIN' }, canonicalRole: value => value,
      getItem: async () => reject === 'token' ? null : 'existing-token', STORAGE_KEYS: { AUTH_TOKEN: 'token' },
      setCloudDataStatus: () => {}, stopActiveCloudSync: () => { state.cloudSyncGeneration++; },
      listenToCloudSync: () => { listeners++; return () => {}; }
    };
    vm.createContext(state); vm.runInContext(restart, state);
    assert.equal(await state.restartCloudSyncIfReady(), reject === null);
    assert.equal(listeners, reject === null ? 1 : 0);
  }
});
