'use strict';

const crypto = require('node:crypto');
const { performance } = require('node:perf_hooks');
const { percentile } = require('./measureHostingCapacity');

const STAGING_CONFIRMATION = 'MEASURE_HUGPONG_STAGING_APPLICATION';
const WRITE_CONFIRMATION = 'CREATE_AND_ARCHIVE_STAGING_OPERATION';
const DEFAULT_READ_REQUESTS = 40;
const DEFAULT_CONCURRENCY = 6;
const DEFAULT_DUPLICATE_WRITES = 8;
const READ_PATHS = Object.freeze([
  '/api/fields',
  '/api/crop-cycles',
  '/api/logs?status=ACTIVE&limit=25',
  '/api/prices?limit=2'
]);

function integerOption(value, fallback, minimum, maximum, name) {
  const parsed = value == null || value === '' ? fallback : Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}.`);
  }
  return parsed;
}

function applicationLoadConfiguration(environment = process.env) {
  if (environment.APPLICATION_LOAD_CONFIRM !== STAGING_CONFIRMATION) {
    throw new Error(`Set APPLICATION_LOAD_CONFIRM=${STAGING_CONFIRMATION} to continue.`);
  }
  if (String(environment.APPLICATION_LOAD_ENVIRONMENT || '').toLowerCase() !== 'staging') {
    throw new Error('APPLICATION_LOAD_ENVIRONMENT must be staging. Production load testing is refused.');
  }

  const baseValue = String(environment.APPLICATION_LOAD_BASE_URL || '').trim().replace(/\/+$/, '');
  let baseUrl;
  try {
    baseUrl = new URL(baseValue);
  } catch (_) {
    throw new Error('APPLICATION_LOAD_BASE_URL must be an absolute HTTPS staging origin.');
  }
  if (baseUrl.protocol !== 'https:' || baseUrl.origin !== baseValue) {
    throw new Error('APPLICATION_LOAD_BASE_URL must contain only an HTTPS origin.');
  }
  if (!/(?:staging|stage|test|dev|preview|beta)/i.test(baseUrl.hostname)) {
    throw new Error('The load-test hostname must visibly identify a staging, test, preview, or beta deployment.');
  }

  const identifier = String(environment.APPLICATION_LOAD_IDENTIFIER || '').trim();
  const password = String(environment.APPLICATION_LOAD_PASSWORD || '');
  if (!identifier || !password) {
    throw new Error('APPLICATION_LOAD_IDENTIFIER and APPLICATION_LOAD_PASSWORD are required for a dedicated staging account.');
  }
  const profile = String(environment.APPLICATION_LOAD_PROFILE || 'both').trim().toLowerCase();
  if (!['web', 'mobile', 'both'].includes(profile)) {
    throw new Error('APPLICATION_LOAD_PROFILE must be web, mobile, or both.');
  }
  const writeConfirmation = String(environment.APPLICATION_LOAD_WRITE_CONFIRM || '');
  if (writeConfirmation && writeConfirmation !== WRITE_CONFIRMATION) {
    throw new Error(`APPLICATION_LOAD_WRITE_CONFIRM must equal ${WRITE_CONFIRMATION} or remain unset.`);
  }
  const writeEnabled = writeConfirmation === WRITE_CONFIRMATION;
  if (writeEnabled && profile === 'web') {
    throw new Error('The duplicate-write scenario requires the Mobile profile and a dedicated Farm Member or own-field Farm Manager account.');
  }

  return Object.freeze({
    origin: baseUrl.origin,
    identifier,
    password,
    platforms: profile === 'both' ? Object.freeze(['web', 'mobile']) : Object.freeze([profile]),
    readRequests: integerOption(environment.APPLICATION_LOAD_READ_REQUESTS, DEFAULT_READ_REQUESTS, 10, 60, 'APPLICATION_LOAD_READ_REQUESTS'),
    concurrency: integerOption(environment.APPLICATION_LOAD_CONCURRENCY, DEFAULT_CONCURRENCY, 1, 15, 'APPLICATION_LOAD_CONCURRENCY'),
    duplicateWrites: integerOption(environment.APPLICATION_LOAD_DUPLICATE_WRITES, DEFAULT_DUPLICATE_WRITES, 2, 15, 'APPLICATION_LOAD_DUPLICATE_WRITES'),
    timeoutMs: integerOption(environment.APPLICATION_LOAD_TIMEOUT_MS, 15_000, 2_000, 30_000, 'APPLICATION_LOAD_TIMEOUT_MS'),
    maximumP95Ms: integerOption(environment.APPLICATION_LOAD_MAX_P95_MS, 2_500, 100, 30_000, 'APPLICATION_LOAD_MAX_P95_MS'),
    writeEnabled
  });
}

function clientHeaders(platform, token = '', hasBody = false) {
  return {
    accept: 'application/json',
    'x-client-platform': platform,
    'x-client-instance-id': `phase4-${platform}`,
    'x-app-version': 'Beta',
    'x-device-model': platform === 'web' ? 'capacity-browser' : 'capacity-android',
    'x-device-os': platform === 'web' ? 'staging-web' : 'staging-android',
    ...(hasBody ? { 'content-type': 'application/json' } : {}),
    ...(token ? { authorization: `Bearer ${token}` } : {})
  };
}

async function requestJson(configuration, fetchImplementation, path, {
  platform,
  token = '',
  method = 'GET',
  body
}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), configuration.timeoutMs);
  const startedAt = performance.now();
  try {
    const hasBody = body !== undefined;
    const response = await fetchImplementation(`${configuration.origin}${path}`, {
      method,
      headers: clientHeaders(platform, token, hasBody),
      body: hasBody ? JSON.stringify(body) : undefined,
      signal: controller.signal
    });
    const payload = await response.json().catch(() => ({}));
    return {
      ok: response.ok && payload.success === true,
      status: response.status,
      durationMs: performance.now() - startedAt,
      payload
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      durationMs: performance.now() - startedAt,
      reason: error?.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK_ERROR',
      payload: {}
    };
  } finally {
    clearTimeout(timer);
  }
}

async function authenticateProfile(configuration, fetchImplementation, platform) {
  const result = await requestJson(configuration, fetchImplementation, '/auth/login', {
    platform,
    method: 'POST',
    body: {
      identifier: configuration.identifier,
      password: configuration.password,
      clientPlatform: platform,
      clientInstanceId: `phase4-${platform}`
    }
  });
  const token = String(result.payload?.token || '');
  if (!result.ok || !token) {
    throw new Error(`The dedicated staging account could not start the ${platform} profile (HTTP ${result.status || 0}).`);
  }
  return Object.freeze({
    platform,
    token,
    role: String(result.payload?.user?.canonicalRole || result.payload?.user?.roleKey || ''),
    userId: String(result.payload?.user?.employeeId || '')
  });
}

async function runBounded(count, concurrency, task) {
  const results = new Array(count);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < count) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await task(index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(count, concurrency) }, () => worker()));
  return results;
}

function resultSummary(results, maximumP95Ms) {
  const durations = results.map(result => result.durationMs).sort((left, right) => left - right);
  const successful = results.filter(result => result.ok).length;
  const statusCounts = results.reduce((counts, result) => {
    const key = result.status ? String(result.status) : result.reason || 'NETWORK_ERROR';
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
  const successRate = results.length ? successful / results.length : 0;
  const p95 = percentile(durations, 0.95);
  return Object.freeze({
    requests: results.length,
    successful,
    failed: results.length - successful,
    successRatePercent: Math.round(successRate * 10_000) / 100,
    latencyMs: {
      p50: percentile(durations, 0.5),
      p95,
      p99: percentile(durations, 0.99),
      maximum: percentile(durations, 1)
    },
    statusCounts,
    passed: successRate >= 0.99 && p95 <= maximumP95Ms
  });
}

async function runReadScenario(configuration, fetchImplementation, profiles) {
  const startedAt = performance.now();
  const results = await runBounded(configuration.readRequests, configuration.concurrency, index => {
    const profile = profiles[index % profiles.length];
    const path = READ_PATHS[index % READ_PATHS.length];
    return requestJson(configuration, fetchImplementation, path, profile);
  });
  const elapsedMs = performance.now() - startedAt;
  return Object.freeze({
    ...resultSummary(results, configuration.maximumP95Ms),
    concurrency: configuration.concurrency,
    requestsPerSecond: Math.round((results.length / (elapsedMs / 1000)) * 100) / 100,
    paths: [...READ_PATHS],
    platforms: profiles.map(profile => profile.platform)
  });
}

function stableMutation(id, entityKey) {
  const mutationId = `MUT-PHASE4-${id}`;
  return { mutationId, idempotencyKey: mutationId, entityKey, baseVersion: null };
}

function selectWritableScope(fields, cycles, userId) {
  const field = fields.find(item => item.status === 'ACTIVE'
    && String(item.memberUserId || '').trim() === userId
    && item.currentCycleId);
  if (!field) throw new Error('The staging account needs one ACTIVE own field with an ACTIVE Crop Year Cycle.');
  const cycle = cycles.find(item => item.id === field.currentCycleId
    && item.fieldId === field.id
    && item.status === 'ACTIVE');
  if (!cycle) throw new Error('The staging field does not have a matching ACTIVE Crop Year Cycle.');
  return { field, cycle };
}

function operationPayload(field, cycle, operationId) {
  const area = Number(field.areaHa ?? field.ha);
  if (!Number.isFinite(area) || area < 0.01) {
    throw new Error('The staging field must have a valid registered area of at least 0.01 hectare.');
  }
  return {
    id: operationId,
    fieldId: field.id,
    cycleId: cycle.id,
    blockFarmId: field.blockFarmId,
    cropYearCycle: cycle.cropYear,
    stageNumberAtRecord: 1,
    operationDefinitionId: 'CUSTOM',
    operationName: 'Phase 4 staging concurrency check',
    category: 'General Care',
    stageNumber: 1,
    performedOn: new Date().toISOString().slice(0, 10),
    areaHa: Math.min(area, 0.01),
    peopleCount: 1,
    quantity: { value: 1, unit: 'unit', inputName: 'Concurrency check' },
    baseCost: 0,
    totalCost: 0,
    lineItems: [],
    laborEntries: [],
    isSupplemental: Number(cycle.currentStageNumber || 1) > 1,
    _mutation: stableMutation(operationId, `logs:${operationId}`)
  };
}

async function runDuplicateWriteScenario(configuration, fetchImplementation, mobileProfile) {
  const [fieldResult, cycleResult] = await Promise.all([
    requestJson(configuration, fetchImplementation, '/api/fields', mobileProfile),
    requestJson(configuration, fetchImplementation, '/api/crop-cycles', mobileProfile)
  ]);
  if (!fieldResult.ok || !cycleResult.ok) {
    throw new Error('The staging write scope could not be loaded through the canonical API.');
  }
  const { field, cycle } = selectWritableScope(
    Array.isArray(fieldResult.payload?.data) ? fieldResult.payload.data : [],
    Array.isArray(cycleResult.payload?.data) ? cycleResult.payload.data : [],
    mobileProfile.userId
  );
  const suffix = `${Date.now()}-${crypto.randomBytes(5).toString('hex')}`.toUpperCase();
  const operationId = `LOAD-${suffix}`;
  const body = operationPayload(field, cycle, operationId);
  const results = await runBounded(
    configuration.duplicateWrites,
    configuration.duplicateWrites,
    () => requestJson(configuration, fetchImplementation, '/api/logs', {
      ...mobileProfile,
      method: 'POST',
      body
    })
  );
  const created = results.filter(result => result.ok && result.payload?.replayed === false).length;
  const replayed = results.filter(result => result.ok && result.payload?.replayed === true).length;
  const identityMatches = results.every(result => !result.ok || result.payload?.data?.id === operationId);

  const archive = await requestJson(configuration, fetchImplementation, '/api/logs/archive', {
    ...mobileProfile,
    method: 'POST',
    body: {
      ids: [operationId],
      _mutation: stableMutation(`${operationId}-ARCHIVE`, `logs:${operationId}:archive`)
    }
  });
  const summary = resultSummary(results, configuration.maximumP95Ms);
  return Object.freeze({
    attempts: results.length,
    created,
    replayed,
    failed: summary.failed,
    latencyMs: summary.latencyMs,
    oneCanonicalRecord: created === 1 && replayed === results.length - 1 && identityMatches,
    archivedAfterTest: archive.ok,
    passed: summary.failed === 0
      && created === 1
      && replayed === results.length - 1
      && identityMatches
      && archive.ok
  });
}

async function measureApplicationCapacity(configuration, fetchImplementation = fetch) {
  const profiles = [];
  for (const platform of configuration.platforms) {
    profiles.push(await authenticateProfile(configuration, fetchImplementation, platform));
  }
  const reads = await runReadScenario(configuration, fetchImplementation, profiles);
  let duplicateWrite = null;
  if (configuration.writeEnabled) {
    const mobileProfile = profiles.find(profile => profile.platform === 'mobile');
    duplicateWrite = await runDuplicateWriteScenario(configuration, fetchImplementation, mobileProfile);
  }
  return Object.freeze({
    target: configuration.origin,
    environment: 'staging',
    profiles: profiles.map(profile => ({ platform: profile.platform, role: profile.role })),
    reads,
    duplicateWrite,
    passed: reads.passed && (!duplicateWrite || duplicateWrite.passed),
    scope: 'Authenticated HUGPONG API staging measurement; never run against production.'
  });
}

async function main() {
  try {
    const report = await measureApplicationCapacity(applicationLoadConfiguration());
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    if (!report.passed) process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`[Application Capacity] ${error.message}\n`);
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = {
  STAGING_CONFIRMATION,
  WRITE_CONFIRMATION,
  READ_PATHS,
  applicationLoadConfiguration,
  clientHeaders,
  resultSummary,
  selectWritableScope,
  operationPayload,
  measureApplicationCapacity
};
