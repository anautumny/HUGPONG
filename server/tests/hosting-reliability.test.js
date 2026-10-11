'use strict';

process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-only-session-secret-that-is-longer-than-32-characters';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const {
  createRuntimeLifecycle,
  configureHttpServer,
  installGracefulShutdown
} = require('../services/runtimeLifecycle');
const {
  loadTestConfiguration,
  measureHostingCapacity,
  percentile
} = require('../scripts/measureHostingCapacity');

const root = path.resolve(__dirname, '..', '..');
const source = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('runtime readiness is disabled before startup and throughout graceful drain', () => {
  const lifecycle = createRuntimeLifecycle();
  assert.equal(lifecycle.isReady(), false);
  assert.equal(lifecycle.isDraining(), false);

  lifecycle.markReady();
  assert.equal(lifecycle.isReady(), true);

  lifecycle.beginDrain();
  lifecycle.markReady();
  assert.equal(lifecycle.isReady(), false);
  assert.equal(lifecycle.isDraining(), true);
});

test('HTTP reliability limits are bounded for a managed hosting instance', () => {
  const server = {};
  configureHttpServer(server, { requestTimeoutMs: 25_000 });
  assert.equal(server.requestTimeout, 25_000);
  assert.equal(server.headersTimeout, 30_000);
  assert.equal(server.keepAliveTimeout, 5_000);
  assert.equal(server.maxRequestsPerSocket, 100);
  assert.throws(() => configureHttpServer({}, { requestTimeoutMs: 1_000 }), /between 5000 and 120000/);
});

test('graceful shutdown marks the instance unready, stops background work, and closes idle connections', () => {
  const lifecycle = createRuntimeLifecycle();
  lifecycle.markReady();
  const processTarget = new EventEmitter();
  processTarget.exitCode = 0;
  let stopped = 0;
  let closed = 0;
  let idleClosed = 0;
  const server = {
    close(callback) { closed += 1; callback(); },
    closeIdleConnections() { idleClosed += 1; }
  };
  const control = installGracefulShutdown({
    server,
    lifecycle,
    cleanup: { stop() { stopped += 1; } },
    gracePeriodMs: 5_000,
    processTarget,
    logger: { info() {}, error() {} }
  });

  processTarget.emit('SIGTERM');
  processTarget.emit('SIGINT');
  assert.equal(lifecycle.isReady(), false);
  assert.equal(stopped, 1);
  assert.equal(closed, 1);
  assert.equal(idleClosed, 1);
  control.remove();
});

test('hosting measurement is bounded, read-free, and reports repeatable latency percentiles', async () => {
  const configuration = loadTestConfiguration({
    LOAD_TEST_CONFIRM: 'MEASURE_HUGPONG_HOSTING',
    LOAD_TEST_BASE_URL: 'https://hugpong.example.test',
    LOAD_TEST_REQUESTS: '25',
    LOAD_TEST_CONCURRENCY: '4',
    LOAD_TEST_TIMEOUT_MS: '2000',
    LOAD_TEST_MAX_P95_MS: '1500'
  });
  let active = 0;
  let maximumActive = 0;
  const fakeFetch = async () => {
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    await new Promise(resolve => setTimeout(resolve, 1));
    active -= 1;
    return { ok: true, status: 200, json: async () => ({ success: true }) };
  };
  const report = await measureHostingCapacity(configuration, fakeFetch);

  assert.equal(configuration.url, 'https://hugpong.example.test/health/ready');
  assert.equal(report.successful, 25);
  assert.equal(report.failed, 0);
  assert.equal(report.passed, true);
  assert.ok(maximumActive <= 4);
  assert.match(report.scope, /no Firestore documents are read or written/);
  assert.equal(percentile([1, 2, 3, 4], 0.95), 4);
  assert.throws(
    () => loadTestConfiguration({ LOAD_TEST_CONFIRM: 'MEASURE_HUGPONG_HOSTING', LOAD_TEST_BASE_URL: 'http://hugpong.example.test' }),
    /must use HTTPS/
  );
  assert.throws(
    () => loadTestConfiguration({ LOAD_TEST_CONFIRM: 'MEASURE_HUGPONG_HOSTING', LOAD_TEST_BASE_URL: 'https://hugpong.example.test', LOAD_TEST_CONCURRENCY: '51' }),
    /between 1 and 50/
  );
  assert.throws(
    () => loadTestConfiguration({ LOAD_TEST_BASE_URL: 'https://hugpong.example.test' }),
    /LOAD_TEST_CONFIRM/
  );
});

test('server, Web, and Mobile share drain-aware readiness without database probe traffic', () => {
  const server = source('server/server.js');
  const web = source('web/react-app/src/context/SyncContext.jsx');
  const mobile = source('mobile/src/services/authService.js');
  const runbook = source('docs/HOSTING_RELIABILITY_AND_CAPACITY.md');

  assert.match(server, /app\.get\('\/health\/live'/);
  assert.match(server, /app\.get\('\/health\/ready'/);
  assert.match(server, /runtimeLifecycle\.markReady\(\)/);
  assert.match(server, /installGracefulShutdown/);
  assert.match(web, /fetch\('\/health\/ready'/);
  assert.match(mobile, /fetchFromApi\('\/health\/ready'/);
  assert.match(runbook, /do not read or write Firestore/);
  assert.match(runbook, /gateway-only result/);
});
