'use strict';

const MAX_URL_LENGTH = 4096;
const MAX_QUERY_KEYS = 30;
const MAX_QUERY_VALUE_LENGTH = 5000;
const MAX_BODY_DEPTH = 12;
const MAX_BODY_ENTRIES = 10000;
const MAX_ARRAY_LENGTH = 1000;
const MAX_STRING_LENGTH = 850000;
const MAX_BACKUP_ARCHIVE_BASE64_LENGTH = 11200000;
const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

function invalidRequest(message, code = 'INVALID_REQUEST') {
  return Object.assign(new Error(message), { status: 400, code });
}

function bodyWasSent(req) {
  const contentLength = Number(req.headers?.['content-length'] || 0);
  return Boolean(req.headers?.['transfer-encoding']) || (Number.isFinite(contentLength) && contentLength > 0);
}

function assertSafeKey(key, location) {
  if (FORBIDDEN_KEYS.has(String(key).toLowerCase())) {
    throw invalidRequest(`${location} contains a forbidden property name.`);
  }
}

function validateBodyValue(value, state, location = 'body', depth = 0) {
  if (depth > MAX_BODY_DEPTH) throw invalidRequest(`Request body nesting exceeds ${MAX_BODY_DEPTH} levels.`);
  state.entries += 1;
  if (state.entries > MAX_BODY_ENTRIES) throw invalidRequest('Request body contains too many values.');

  if (value === null || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw invalidRequest(`${location} must contain only finite numbers.`);
    return;
  }
  if (typeof value === 'string') {
    const maximum = state.allowBackupArchive && location === 'body.archiveBase64'
      ? MAX_BACKUP_ARCHIVE_BASE64_LENGTH
      : MAX_STRING_LENGTH;
    if (value.length > maximum) throw invalidRequest(`${location} exceeds the maximum string length.`);
    if (value.includes('\0')) throw invalidRequest(`${location} must not contain null characters.`);
    return;
  }
  if (Array.isArray(value)) {
    if (value.length > MAX_ARRAY_LENGTH) throw invalidRequest(`${location} contains too many items.`);
    value.forEach((entry, index) => validateBodyValue(entry, state, `${location}[${index}]`, depth + 1));
    return;
  }
  if (typeof value !== 'object') throw invalidRequest(`${location} contains an unsupported value type.`);

  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw invalidRequest(`${location} must be a plain object.`);
  for (const [key, child] of Object.entries(value)) {
    assertSafeKey(key, location);
    validateBodyValue(child, state, `${location}.${key}`, depth + 1);
  }
}

function validateQuery(query = {}) {
  const entries = Object.entries(query);
  if (entries.length > MAX_QUERY_KEYS) throw invalidRequest(`Request query may contain at most ${MAX_QUERY_KEYS} keys.`);
  for (const [key, value] of entries) {
    assertSafeKey(key, 'query');
    const values = Array.isArray(value) ? value : [value];
    if (values.length > 20) throw invalidRequest(`Query parameter ${key} has too many values.`);
    for (const item of values) {
      if (typeof item !== 'string' || item.length > MAX_QUERY_VALUE_LENGTH || item.includes('\0')) {
        throw invalidRequest(`Query parameter ${key} is invalid.`);
      }
    }
  }
}

function validateHeaders(req) {
  const platform = req.headers?.['x-client-platform'];
  if (platform != null && !['web', 'mobile'].includes(String(platform).trim().toLowerCase())) {
    throw invalidRequest('x-client-platform must be web or mobile.', 'INVALID_CLIENT_PLATFORM');
  }
  const instanceId = req.headers?.['x-client-instance-id'];
  if (instanceId != null && !/^[A-Za-z0-9._:-]{1,160}$/.test(String(instanceId))) {
    throw invalidRequest('x-client-instance-id is invalid.', 'INVALID_CLIENT_INSTANCE');
  }
  for (const [name, max] of [['x-app-version', 60], ['x-device-model', 80], ['x-device-os', 80]]) {
    const value = req.headers?.[name];
    if (value != null && (String(value).length > max || /[\u0000-\u001F\u007F]/.test(String(value)))) {
      throw invalidRequest(`${name} is invalid.`, 'INVALID_CLIENT_METADATA');
    }
  }
  const authorization = req.headers?.authorization;
  if (authorization != null && (String(authorization).length > 8192 || !/^Bearer\s+\S+$/i.test(String(authorization)))) {
    throw invalidRequest('Authorization header is malformed.', 'INVALID_AUTHORIZATION_HEADER');
  }
  const takeoverGrant = req.headers?.['x-hugpong-takeover-grant'];
  if (takeoverGrant != null && (String(takeoverGrant).length > 4096 || !/^[A-Za-z0-9._-]+$/.test(String(takeoverGrant)))) {
    throw invalidRequest('Takeover authorization header is malformed.', 'INVALID_TAKEOVER_HEADER');
  }
}

function validatePath(value) {
  const rawPath = String(value || '').split(/[?#]/, 1)[0];
  let decoded;
  try {
    decoded = decodeURIComponent(rawPath);
  } catch (_) {
    throw invalidRequest('Request path contains invalid percent encoding.');
  }
  if (decoded.includes('\0') || /[\u0001-\u001F\u007F]/.test(decoded)) {
    throw invalidRequest('Request path contains invalid control characters.');
  }
  if (decoded.split('/').some(segment => segment.length > 500)) {
    throw invalidRequest('Request path contains an oversized segment.');
  }
}

function validateRequestInput(req, res, next) {
  try {
    if (String(req.originalUrl || req.url || '').length > MAX_URL_LENGTH) {
      throw invalidRequest(`Request URL exceeds ${MAX_URL_LENGTH} characters.`);
    }
    validatePath(req.originalUrl || req.url);
    validateHeaders(req);
    validateQuery(req.query);

    const method = String(req.method || 'GET').toUpperCase();
    // express.json() can initialize req.body to an empty object even when the
    // request had no payload. Only transport evidence means that a body was
    // actually sent; otherwise valid GET/HEAD requests would be rejected.
    const hasBody = bodyWasSent(req);
    if (['GET', 'HEAD'].includes(method) && hasBody) {
      throw invalidRequest(`${method} requests must not include a body.`);
    }
    if (hasBody && !req.is('application/json')) {
      throw invalidRequest('Request bodies must use Content-Type: application/json.', 'UNSUPPORTED_CONTENT_TYPE');
    }
    if (hasBody) {
      if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
        throw invalidRequest('Request body must be a JSON object.');
      }
      const path = String(req.originalUrl || req.url || '').split(/[?#]/, 1)[0];
      const allowBackupArchive = /^\/api\/backups\/(?:validate|restore-missing)$/.test(path);
      validateBodyValue(req.body, { entries: 0, allowBackupArchive });
    }
    req.inputValidated = true;
    return next();
  } catch (error) {
    return res.status(error.status || 400).json({
      success: false,
      error: error.message || 'Request validation failed.',
      code: error.code || 'INVALID_REQUEST'
    });
  }
}

function malformedJsonHandler(error, req, res, next) {
  if (error?.type !== 'entity.parse.failed') return next(error);
  return res.status(400).json({
    success: false,
    error: 'Request body contains malformed JSON.',
    code: 'MALFORMED_JSON'
  });
}

module.exports = {
  validateRequestInput,
  malformedJsonHandler,
  validateBodyValue,
  validateQuery
};
