'use strict';

const { performance } = require('node:perf_hooks');

const DEFAULT_REQUESTS = 75;
const DEFAULT_CONCURRENCY = 10;
const DEFAULT_TIMEOUT_MS = 8_000;
const MAX_REQUESTS = 90;
const MAX_CONCURRENCY = 50;

function boundedInteger(value, fallback, minimum, maximum, name) {
  const parsed = value == null || value === '' ? fallback : Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}.`);
  }
  return parsed;
}

function loadTestConfiguration(environment = process.env) {
  if (environment.LOAD_TEST_CONFIRM !== 'MEASURE_HUGPONG_HOSTING') {
    throw new Error('Set LOAD_TEST_CONFIRM=MEASURE_HUGPONG_HOSTING to confirm this controlled hosting test.');
  }
  const baseValue = String(environment.LOAD_TEST_BASE_URL || '').trim().replace(/\/+$/, '');
  if (!baseValue) throw new Error('LOAD_TEST_BASE_URL is required.');

  let baseUrl;
  try {
    baseUrl = new URL(baseValue);
  } catch (_) {
    throw new Error('LOAD_TEST_BASE_URL must be an absolute HTTP(S) origin.');
  }
  if (!['http:', 'https:'].includes(baseUrl.protocol) || baseUrl.origin !== baseValue) {
    throw new Error('LOAD_TEST_BASE_URL must contain only an HTTP(S) origin.');
  }
  const local = ['localhost', '127.0.0.1', '::1'].includes(baseUrl.hostname);
  if (baseUrl.protocol !== 'https:' && !(local && environment.ALLOW_LOCAL_LOAD_TEST === 'true')) {
    throw new Error('LOAD_TEST_BASE_URL must use HTTPS. Set ALLOW_LOCAL_LOAD_TEST=true only for a local server.');
  }

  return Object.freeze({
    url: new URL('/health/ready', baseUrl).toString(),
    requests: boundedInteger(environment.LOAD_TEST_REQUESTS, DEFAULT_REQUESTS, 10, MAX_REQUESTS, 'LOAD_TEST_REQUESTS'),
    concurrency: boundedInteger(environment.LOAD_TEST_CONCURRENCY, DEFAULT_CONCURRENCY, 1, MAX_CONCURRENCY, 'LOAD_TEST_CONCURRENCY'),
    timeoutMs: boundedInteger(environment.LOAD_TEST_TIMEOUT_MS, DEFAULT_TIMEOUT_MS, 1_000, 30_000, 'LOAD_TEST_TIMEOUT_MS'),
    minimumSuccessRate: 0.99,
    maximumP95Ms: boundedInteger(environment.LOAD_TEST_MAX_P95_MS, 1_500, 100, 30_000, 'LOAD_TEST_MAX_P95_MS')
  });
}

function percentile(sortedValues, ratio) {
  if (!sortedValues.length) return null;
  const index = Math.min(sortedValues.length - 1, Math.max(0, Math.ceil(sortedValues.length * ratio) - 1));
  return Math.round(sortedValues[index] * 100) / 100;
}

async function sendProbe(url, timeoutMs, fetchImplementation) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = performance.now();
  try {
    const response = await fetchImplementation(url, {
      method: 'GET',
      cache: 'no-store',
      headers: { accept: 'application/json', 'user-agent': 'HUGPONG-capacity-smoke/1.0' },
      signal: controller.signal
    });
    const body = await response.json().catch(() => ({}));
    return {
      ok: response.ok && body.success === true,
      status: response.status,
      durationMs: performance.now() - startedAt
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      durationMs: performance.now() - startedAt,
      reason: error?.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK_ERROR'
    };
  } finally {
    clearTimeout(timer);
  }
}

async function measureHostingCapacity(configuration, fetchImplementation = fetch) {
  const results = new Array(configuration.requests);
  let nextIndex = 0;
  const startedAt = performance.now();

  async function worker() {
    while (nextIndex < configuration.requests) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await sendProbe(configuration.url, configuration.timeoutMs, fetchImplementation);
    }
  }

  await Promise.all(Array.from(
    { length: Math.min(configuration.concurrency, configuration.requests) },
    () => worker()
  ));

  const elapsedMs = performance.now() - startedAt;
  const durations = results.map(result => result.durationMs).sort((left, right) => left - right);
  const successful = results.filter(result => result.ok).length;
  const statusCounts = results.reduce((counts, result) => {
    const key = result.status ? String(result.status) : result.reason || 'NETWORK_ERROR';
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
  const successRate = successful / configuration.requests;
  const p95Ms = percentile(durations, 0.95);
  const passed = successRate >= configuration.minimumSuccessRate && p95Ms <= configuration.maximumP95Ms;

  return Object.freeze({
    target: new URL(configuration.url).origin,
    endpoint: '/health/ready',
    requests: configuration.requests,
    concurrency: configuration.concurrency,
    successful,
    failed: configuration.requests - successful,
    successRatePercent: Math.round(successRate * 10_000) / 100,
    requestsPerSecond: Math.round((configuration.requests / (elapsedMs / 1000)) * 100) / 100,
    latencyMs: {
      p50: percentile(durations, 0.5),
      p95: p95Ms,
      p99: percentile(durations, 0.99),
      maximum: percentile(durations, 1)
    },
    statusCounts,
    thresholds: {
      minimumSuccessRatePercent: configuration.minimumSuccessRate * 100,
      maximumP95Ms: configuration.maximumP95Ms
    },
    passed,
    scope: 'Hosting gateway readiness only; no Firestore documents are read or written.'
  });
}

async function main() {
  try {
    const report = await measureHostingCapacity(loadTestConfiguration());
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    if (!report.passed) process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`[Capacity] ${error.message}\n`);
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = {
  DEFAULT_REQUESTS,
  DEFAULT_CONCURRENCY,
  MAX_REQUESTS,
  MAX_CONCURRENCY,
  loadTestConfiguration,
  percentile,
  measureHostingCapacity
};
