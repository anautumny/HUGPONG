'use strict';

const {
  createReferenceId,
  moduleForRequest,
  recordDiagnostic,
  logPrivateDiagnostic
} = require('./diagnosticService');

const AGGREGATION_WINDOW_MS = 30 * 1000;
const MAX_BUCKETS = 100;
const buckets = new Map();

function endpointGroup(req) {
  const path = String(req?.originalUrl || req?.url || '/').split(/[?#]/, 1)[0].toLowerCase();
  if (path.startsWith('/auth/')) return `/auth/${path.split('/')[2] || '*'}`;
  if (path.startsWith('/api/')) return `/api/${path.split('/')[2] || '*'}/*`;
  if (path.startsWith('/assets/')) return '/assets/*';
  if (path === '/health') return '/health';
  return '/unknown';
}

function requestSnapshot(req, groupedEndpoint) {
  return {
    originalUrl: groupedEndpoint,
    method: req?.method,
    headers: {
      'x-client-platform': req?.headers?.['x-client-platform'],
      'x-app-version': req?.headers?.['x-app-version'],
      'x-device-model': req?.headers?.['x-device-model'],
      'x-device-os': req?.headers?.['x-device-os']
    },
    authUser: req?.authUser ? { canonicalRole: req.authUser.canonicalRole } : undefined,
    session: req?.session?.user ? { user: { canonicalRole: req.session.user.canonicalRole } } : undefined
  };
}

function flushBucket(key) {
  const bucket = buckets.get(key);
  if (!bucket) return;
  buckets.delete(key);
  const technicalError = `Blocked or rejected ${bucket.count} similar requests during a ${Math.round(AGGREGATION_WINDOW_MS / 1000)}-second aggregation window.`;
  const details = {
    req: bucket.req,
    level: 'WARN',
    module: bucket.module,
    referenceId: bucket.referenceId,
    technicalError,
    statusCode: bucket.statusCode,
    errorCode: bucket.errorCode,
    source: 'SERVER',
    operation: `${bucket.req.method || 'UNKNOWN'} ${bucket.endpoint}`,
    retry: { aggregatedCount: bucket.count, firstSeenAt: bucket.firstSeenAt, lastSeenAt: bucket.lastSeenAt }
  };
  logPrivateDiagnostic(details);
  void recordDiagnostic(bucket.db, details);
}

function queueAggregatedDiagnostic(db, details) {
  const endpoint = endpointGroup(details.req);
  const module = details.module || moduleForRequest(details.req);
  const errorCode = String(details.errorCode || 'REQUEST_REJECTED').toUpperCase().slice(0, 80);
  let key = `${module}:${details.statusCode}:${errorCode}:${details.req?.method || 'UNKNOWN'}:${endpoint}`;
  if (!buckets.has(key) && buckets.size >= MAX_BUCKETS) key = 'SECURITY:429:AGGREGATION_OVERFLOW:UNKNOWN:/unknown';

  const now = new Date().toISOString();
  let bucket = buckets.get(key);
  if (!bucket) {
    const referenceId = createReferenceId(module);
    const req = requestSnapshot(details.req, endpoint);
    const timer = setTimeout(() => flushBucket(key), AGGREGATION_WINDOW_MS);
    timer.unref?.();
    bucket = {
      db,
      req,
      endpoint,
      module,
      referenceId,
      errorCode,
      statusCode: details.statusCode,
      count: 0,
      firstSeenAt: now,
      lastSeenAt: now,
      timer
    };
    buckets.set(key, bucket);
  }
  bucket.count += 1;
  bucket.lastSeenAt = now;
  return bucket.referenceId;
}

function shouldAggregateDiagnostic(statusCode, errorCode, forced = false) {
  if (forced) return true;
  const code = String(errorCode || '').toUpperCase();
  return [401, 404, 413, 429].includes(Number(statusCode))
    || ['ORIGIN_FORBIDDEN', 'CLIENT_PLATFORM_REQUIRED', 'API_PERMISSION_POLICY_MISSING'].includes(code);
}

module.exports = {
  queueAggregatedDiagnostic,
  shouldAggregateDiagnostic,
  _test: { endpointGroup, requestSnapshot, flushBucket, buckets, AGGREGATION_WINDOW_MS, MAX_BUCKETS }
};
