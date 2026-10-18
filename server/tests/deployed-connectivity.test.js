'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const vm = require('node:vm');

const root = path.join(__dirname, '..', '..');
const source = fs.readFileSync(path.join(root, 'mobile/src/services/authService.js'), 'utf8');

// Exercise the actual readiness functions without initializing native storage,
// Firebase, or React Native in the server's Node test process.
function mobileProbe(fetchFromApi) {
  const start = source.indexOf('let serverProbePromise = null;');
  const end = source.indexOf('\nasync function parseResponse', start);
  const factory = new Function('fetchFromApi', 'getMobileClientInstanceId', 'mobileHeaders', 'API_STARTUP_TIMEOUT_MS',
    source.slice(start, end).replace('export function ', 'function ') + '\nreturn probeServerConnectivity;');
  return factory(fetchFromApi, async () => 'test-installation', () => ({ 'x-client-platform': 'mobile' }), 75000);
}

test('both clients allow a host to start while normal mobile requests retain their shorter deadline', async () => {
  const mobileConfigSource = fs.readFileSync(path.join(root, 'mobile/src/config/apiConfig.js'), 'utf8');
  const mobile = await import(`data:text/javascript;base64,${Buffer.from(mobileConfigSource).toString('base64')}`);
  const web = await import(pathToFileURL(path.join(root, 'web/react-app/src/services/connectivityPolicy.js')).href);
  assert.equal(mobile.API_STARTUP_TIMEOUT_MS, 75000);
  assert.equal(web.API_STARTUP_TIMEOUT_MS, mobile.API_STARTUP_TIMEOUT_MS);
  assert.equal(mobile.API_REQUEST_TIMEOUT_MS, 10000);
  assert.equal(web.API_RECOVERY_RETRY_MS, 15000);
});

test('simultaneous mobile login and network checks share the same delayed readiness request', async () => {
  let finish;
  const calls = [];
  const probe = mobileProbe((...args) => {
    calls.push(args);
    return new Promise(resolve => { finish = resolve; });
  });
  const first = probe();
  const second = probe();
  assert.equal(first, second);
  await Promise.resolve();
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], '/health/ready');
  assert.equal(calls[0][2], 75000);
  finish({ ok: true, json: async () => ({ success: true, status: 'ready' }) });
  assert.equal(await first, true);
  assert.equal(await second, true);
});

test('a provider loading page, draining API, or failed request cannot enable synchronization', async () => {
  const responses = [
    { ok: true, json: async () => { throw new SyntaxError('HTML loading page'); } },
    { ok: false, json: async () => ({ success: false, status: 'not_ready' }) },
    { ok: true, json: async () => ({ success: true, status: 'alive' }) },
    new Error('Connection failed'),
    { ok: true, json: async () => ({ success: true, status: 'ready' }) }
  ];
  const probe = mobileProbe(async () => {
    const response = responses.shift();
    if (response instanceof Error) throw response;
    return response;
  });
  for (let i = 0; i < 4; i++) assert.equal(await probe(), false);
  assert.equal(await probe(), true);
  assert.equal(responses.length, 0);
});

function mobileNetworkMonitor(probe) {
  let networkListener;
  const pendingTimers = new Map();
  let nextTimer = 0;
  const nativeNetwork = {
    fetch: async () => ({ isConnected: true, isInternetReachable: true }),
    addEventListener: callback => { networkListener = callback; return () => {}; }
  };
  const networkSource = fs.readFileSync(path.join(root, 'mobile/src/services/networkService.js'), 'utf8')
    .replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '');
  const context = vm.createContext({
    probeServerConnectivity: probe,
    logApiDiagnostic: () => {},
    require: () => nativeNetwork,
    setTimeout: callback => { const id = ++nextTimer; pendingTimers.set(id, callback); return id; },
    clearTimeout: id => pendingTimers.delete(id)
  });
  const api = vm.runInContext(networkSource + '\n({ checkConnectivity, getNetworkStatus, startNetworkMonitor, stopNetworkMonitor })', context);
  return { api, pendingTimers, emitNetwork: () => networkListener({ isConnected: true, isInternetReachable: true }) };
}

test('login waits for the latest network check when a native network event overlaps it', async () => {
  let finish;
  const readiness = new Promise(resolve => { finish = resolve; });
  const monitor = mobileNetworkMonitor(() => readiness);
  monitor.api.startNetworkMonitor();
  const loginCheck = monitor.api.checkConnectivity();
  await new Promise(resolve => setImmediate(resolve));
  monitor.emitNetwork();
  finish(true);
  assert.equal(await loginCheck, true);
  assert.equal(monitor.api.getNetworkStatus(), true);
  monitor.api.stopNetworkMonitor();
});

test('mobile recovery timers do not start new checks while readiness is still pending', async () => {
  let finish;
  const monitor = mobileNetworkMonitor(() => new Promise(resolve => { finish = resolve; }));
  monitor.api.startNetworkMonitor();
  const check = monitor.api.checkConnectivity();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(monitor.pendingTimers.size, 0);
  finish(false);
  assert.equal(await check, false);
  assert.equal(monitor.pendingTimers.size, 1);
  monitor.api.stopNetworkMonitor();
});
