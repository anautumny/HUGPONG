'use strict';

const crypto = require('crypto');
const { COLLECTIONS, canonicalRole } = require('../schema/firestoreSchema');

const LEVELS = Object.freeze(['ERROR', 'WARN', 'INFO']);
const MODULES = Object.freeze([
  'AUTH', 'SYNC', 'QR', 'AUDIT', 'DATABASE', 'OPERATIONS', 'USERS',
  'PRICES', 'SUPPORT', 'SECURITY', 'SYSTEM', 'WEB', 'MOBILE', 'BACKUP'
]);
const SECRET_KEY = /(?:password|passphrase|secret|authorization|cookie|api[_-]?key|private[_-]?key|token|credential|session|(?:^|[_-])key(?:$|[_-])|takeover[_-]?grant|otp)/i;
const TECHNICAL_TEXT = /(?:firestore|firebase|database|collection|document|query|index|econn|etimedout|typeerror|referenceerror|syntaxerror|exception|stack|node_modules|permission[_ -]?denied|internal server|grpc|errno|enoent|cannot read|\bundefined\b|\bnull\b|[\\/]server[\\/])/i;

function cleanText(value, max = 1000) {
  return String(value == null ? '' : value)
    .replace(/-----BEGIN[\s\S]*?PRIVATE KEY-----[\s\S]*?-----END[\s\S]*?PRIVATE KEY-----/gi, '[REDACTED PRIVATE KEY]')
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]')
    .replace(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, '[REDACTED TOKEN]')
    .replace(/\bAIza[A-Za-z0-9_-]{20,}\b/g, '[REDACTED API KEY]')
    .replace(/\b[A-Fa-f0-9]{32,}\b/g, '[REDACTED SECRET]')
    .replace(/\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/g, '[REDACTED EMAIL]')
    .replace(/(?:\+?63|0)9\d{9}\b/g, '[REDACTED PHONE]')
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '[REDACTED IP]')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, max);
}

function sanitizeValue(value, depth = 0) {
  if (depth > 8) return '[TRUNCATED]';
  if (value == null || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') return cleanText(value, 2000);
  if (Array.isArray(value)) return value.slice(0, 100).map(item => sanitizeValue(item, depth + 1));
  if (typeof value !== 'object') return cleanText(value, 500);
  const result = {};
  for (const [key, child] of Object.entries(value).slice(0, 200)) {
    result[key] = SECRET_KEY.test(key) ? '[REDACTED]' : sanitizeValue(child, depth + 1);
  }
  return result;
}

function moduleForRequest(req) {
  const path = String(req?.originalUrl || req?.url || '').split(/[?#]/, 1)[0].toLowerCase();
  if (path.startsWith('/auth')) return 'AUTH';
  if (path.includes('/qr/')) return 'QR';
  if (path.includes('terminal-diagnostics') || path.includes('/sync')) return 'SYNC';
  if (path.includes('audit')) return 'AUDIT';
  if (path.includes('users')) return 'USERS';
  if (path.includes('prices')) return 'PRICES';
  if (path.includes('tickets') || path.includes('support')) return 'SUPPORT';
  if (path.includes('backup')) return 'BACKUP';
  if (path.includes('logs') || path.includes('fields') || path.includes('crop-cycles') || path.includes('block-farms')) return 'OPERATIONS';
  if (path.includes('diagnostic') || path.includes('maintenance')) return 'SYSTEM';
  return 'SYSTEM';
}

function normalizeModule(value, req) {
  const candidate = String(value || moduleForRequest(req)).trim().toUpperCase();
  return MODULES.includes(candidate) ? candidate : 'SYSTEM';
}

function createReferenceId(module = 'SYSTEM', date = new Date()) {
  const prefix = normalizeModule(module).slice(0, 4);
  const day = date.toISOString().slice(0, 10).replace(/-/g, '');
  const random = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `${prefix}-${day}-${random}`;
}

function requestEndpoint(req) {
  const path = String(req?.originalUrl || req?.url || '').split(/[?#]/, 1)[0]
    .replace(/\/(users|block-farms|fields|crop-cycles|logs|audit-reports|tickets)\/[^/]+/gi, '/$1/:id');
  const normalized = path.split('/').map(segment => {
    // Long lowercase route slugs such as terminal-diagnostics and
    // system-diagnostics are static names, not database identifiers. Dynamic
    // IDs are either digit-bearing or mixed-case high-entropy segments.
    const dynamicLongId = /^[A-Za-z0-9_-]{18,}$/.test(segment)
      && (/\d/.test(segment) || (/[a-z]/.test(segment) && /[A-Z]/.test(segment) && !segment.includes('-')));
    return dynamicLongId ? ':id' : segment;
  }).join('/');
  return cleanText(normalized, 240);
}

function clientContext(req) {
  return {
    platform: cleanText(req?.headers?.['x-client-platform'] || 'unknown', 20).toLowerCase(),
    appVersion: cleanText(req?.headers?.['x-app-version'] || 'unknown', 60),
    deviceModel: cleanText(req?.headers?.['x-device-model'] || 'unknown', 80),
    deviceOs: cleanText(req?.headers?.['x-device-os'] || 'unknown', 80)
  };
}

function safeUserCopy(status, code, rawMessage) {
  const normalizedCode = String(code || '').trim().toUpperCase();
  const coded = {
    UNAUTHENTICATED: ['Your session has expired or is no longer valid.', 'Sign in again, then retry the action.'],
    INVALID_CREDENTIALS: ['The sign-in details did not match an active account.', 'Check your User ID or mobile number and password, then try again.'],
    SESSION_REVOKED: ['Your session has ended.', 'Sign in again, then retry the action.'],
    INVALID_CURRENT_PASSWORD: ['The current password is incorrect.', 'Check the password and try again.'],
    CLIENT_PLATFORM_REQUIRED: ['HUGPONG could not verify this app.', 'Use the supported HUGPONG app and try again.'],
    PLATFORM_FORBIDDEN: ['This account cannot use this HUGPONG app.', 'Use the app assigned to your role or contact an administrator.'],
    FORBIDDEN: ['You do not have permission to complete this action.', 'Contact an administrator if you believe you need access.'],
    ACCOUNT_SETUP_REQUIRED: ['Your account setup is not complete.', 'Finish verification and password setup, then try again.'],
    API_PERMISSION_POLICY_MISSING: ['This action is not available.', 'Contact support with the reference ID.'],
    LOGIN_RATE_LIMITED: ['Too many sign-in attempts.', 'Try again later.'],
    RATE_LIMITED: ['Too many attempts.', 'Try again later.'],
    MALFORMED_JSON: ['We could not read the submitted information.', 'Check the information and try again.'],
    INVALID_REQUEST: ['We could not process the submitted information.', 'Check the information and try again.'],
    CONFLICT: ['This information changed before your request was completed.', 'Refresh the latest data and try again.'],
    OFFLINE: ['HUGPONG could not reach the server.', 'Check your connection and try again.']
  };
  if (coded[normalizedCode]) return { message: coded[normalizedCode][0], nextAction: coded[normalizedCode][1] };
  if (status === 401) return { message: 'Your session has expired or is no longer valid.', nextAction: 'Sign in again, then retry the action.' };
  if (status === 403) {
    const candidate = cleanText(rawMessage, 240);
    if (candidate && !TECHNICAL_TEXT.test(candidate)) {
      return { message: candidate, nextAction: 'Check your account access and try again, or contact an administrator.' };
    }
    return { message: 'You do not have permission to complete this action.', nextAction: 'Contact an administrator if you believe you need access.' };
  }
  if (status === 404) return { message: 'The requested information could not be found.', nextAction: 'Refresh the page or go back and try again.' };
  if (status === 409) return { message: 'This information changed before your request was completed.', nextAction: 'Refresh the latest data and try again.' };
  if (status === 413) return { message: 'The submitted information is too large.', nextAction: 'Use a smaller attachment or shorten the entry, then try again.' };
  if (status === 429) return { message: 'Too many attempts.', nextAction: 'Try again later.' };
  if (status >= 500) return { message: 'HUGPONG could not complete this request.', nextAction: 'Try again. If the problem continues, contact support with the reference ID.' };
  const candidate = cleanText(rawMessage, 240);
  if (candidate && !TECHNICAL_TEXT.test(candidate)) {
    return { message: candidate, nextAction: 'Check the information and try again.' };
  }
  return { message: 'We could not process this request.', nextAction: 'Check the information and try again.' };
}

function createSafeErrorEnvelope({ status = 500, payload = {}, req, referenceId }) {
  const module = normalizeModule(payload.module, req);
  const code = cleanText(payload.code || (status >= 500 ? 'SERVER_ERROR' : 'REQUEST_FAILED'), 80).toUpperCase();
  const copy = safeUserCopy(status, code, payload.error || payload.message);
  return {
    ...(sanitizeValue(payload.data) !== undefined ? { data: sanitizeValue(payload.data) } : {}),
    success: false,
    code,
    error: copy.message,
    message: copy.message,
    nextAction: copy.nextAction,
    referenceId: referenceId || createReferenceId(module)
  };
}

function diagnosticRecord({ req, level, module, referenceId, technicalError, statusCode, errorCode, syncStatus, source }) {
  const now = new Date();
  const context = clientContext(req);
  return {
    referenceId: cleanText(referenceId || createReferenceId(module, now), 50),
    timestamp: now.toISOString(),
    level: LEVELS.includes(String(level).toUpperCase()) ? String(level).toUpperCase() : 'ERROR',
    module: normalizeModule(module, req),
    userRole: canonicalRole(req?.authUser?.canonicalRole || req?.session?.user?.canonicalRole || req?.session?.user?.role) || 'GUEST',
    platform: context.platform,
    appVersion: context.appVersion,
    deviceModel: context.deviceModel,
    deviceOs: context.deviceOs,
    syncStatus: cleanText(syncStatus || 'NOT_APPLICABLE', 40).toUpperCase(),
    endpoint: requestEndpoint(req),
    method: cleanText(req?.method || 'UNKNOWN', 12).toUpperCase(),
    statusCode: Number(statusCode) || 0,
    errorCode: cleanText(errorCode || '', 80).toUpperCase(),
    source: cleanText(source || 'SERVER', 20).toUpperCase(),
    technicalError: cleanText(technicalError || 'Request failed without an error message.', 1000)
  };
}

async function recordDiagnostic(db, details) {
  const record = diagnosticRecord(details);
  if (db) {
    try {
      await db.collection(COLLECTIONS.DIAGNOSTIC_EVENTS).doc(record.referenceId).set(record, { merge: true });
    } catch (writeError) {
      console.error(JSON.stringify({
        level: 'ERROR', module: 'DATABASE', referenceId: record.referenceId,
        operation: 'WRITE_DIAGNOSTIC', error: cleanText(writeError?.stack || writeError?.message, 2000)
      }));
    }
  }
  return record;
}

function logPrivateDiagnostic(details = {}) {
  const req = details.req;
  const entry = diagnosticRecord(details);
  const stack = cleanText(details.error?.stack || details.stack || '', 4000);
  console.error(JSON.stringify({
    ...entry,
    operation: cleanText(details.operation || `${entry.method} ${entry.endpoint}`, 300),
    ...(stack ? { stack } : {}),
    retry: sanitizeValue(details.retry || null)
  }));
  return entry;
}

async function listDiagnostics(db, filters = {}) {
  const limit = Math.min(Math.max(Number(filters.limit) || 100, 1), 200);
  let query = db.collection(COLLECTIONS.DIAGNOSTIC_EVENTS);
  if (filters.date) {
    const start = new Date(`${filters.date}T00:00:00.000Z`);
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    query = query
      .where('timestamp', '>=', start.toISOString())
      .where('timestamp', '<', end.toISOString());
  }
  const level = String(filters.level || '').trim().toUpperCase();
  const module = String(filters.module || '').trim().toUpperCase();
  const date = String(filters.date || '').trim();
  const referenceId = String(filters.referenceId || '').trim().toUpperCase();
  const search = String(filters.search || '').trim().toLowerCase();
  const requiresInMemoryFiltering = Boolean(level || module || referenceId || search);
  const scanLimit = requiresInMemoryFiltering ? 500 : limit;
  const snapshot = await query.orderBy('timestamp', 'desc').limit(scanLimit).get();
  return snapshot.docs
    .map(doc => ({ id: doc.id, ...sanitizeValue(doc.data()) }))
    .filter(item => !level || item.level === level)
    .filter(item => !module || item.module === module)
    .filter(item => !date || String(item.timestamp || '').startsWith(date))
    .filter(item => !referenceId || String(item.referenceId || '').toUpperCase().includes(referenceId))
    .filter(item => !search || [item.referenceId, item.module, item.errorCode, item.technicalError, item.endpoint]
      .some(value => String(value || '').toLowerCase().includes(search)))
    .slice(0, limit);
}

module.exports = {
  LEVELS,
  MODULES,
  cleanText,
  sanitizeValue,
  requestEndpoint,
  moduleForRequest,
  createReferenceId,
  createSafeErrorEnvelope,
  recordDiagnostic,
  logPrivateDiagnostic,
  listDiagnostics
};
