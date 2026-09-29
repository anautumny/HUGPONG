'use strict';

const {
  createReferenceId,
  createSafeErrorEnvelope,
  moduleForRequest,
  recordDiagnostic,
  logPrivateDiagnostic
} = require('../services/diagnosticService');
const { queueAggregatedDiagnostic, shouldAggregateDiagnostic } = require('../services/abuseEventAggregator');

function isRoutineGuestSessionProbe(req, statusCode, payload = {}) {
  const endpoint = String(req?.originalUrl || req?.url || '').split(/[?#]/, 1)[0];
  return String(req?.method || '').toUpperCase() === 'GET'
    && endpoint === '/auth/session'
    && Number(statusCode) === 401
    && String(payload.code || '').toUpperCase() === 'UNAUTHENTICATED'
    && !req?.authUser;
}

function shouldPersistErrorDiagnostic(statusCode, errorCode) {
  const status = Number(statusCode);
  const code = String(errorCode || '').trim().toUpperCase();
  return status >= 500
    || status === 429
    || ['ORIGIN_FORBIDDEN', 'CLIENT_PLATFORM_REQUIRED', 'PLATFORM_FORBIDDEN', 'API_PERMISSION_POLICY_MISSING'].includes(code);
}

function safeErrorResponses(db) {
  return (req, res, next) => {
    const sendJson = res.json.bind(res);
    res.json = payload => {
      if (res.statusCode < 400 || !payload || typeof payload !== 'object') return sendJson(payload);

      const module = String(payload.module || '').toUpperCase() === 'SECURITY'
        ? 'SECURITY'
        : moduleForRequest(req);
      // GET /auth/session is also the browser's authoritative signed-in-state
      // probe. A guest 401 there is normal control flow, not an operational
      // warning. Revoked, inactive, forbidden, and failed sessions still log.
      const routineGuestProbe = isRoutineGuestSessionProbe(req, res.statusCode, payload);
      const aggregate = !routineGuestProbe && shouldAggregateDiagnostic(
        res.statusCode,
        payload.code,
        res.locals.aggregateDiagnostic === true
      );
      const aggregatedReferenceId = aggregate
        ? queueAggregatedDiagnostic(db, {
          req,
          module,
          statusCode: res.statusCode,
          errorCode: payload.code
        })
        : '';
      const referenceId = payload.referenceId || aggregatedReferenceId || createReferenceId(module);
      const technicalError = res.locals.diagnosticError?.message || payload.error || payload.message || 'Request failed.';
      const details = {
        req,
        level: res.statusCode >= 500 ? 'ERROR' : 'WARN',
        module,
        referenceId,
        technicalError,
        statusCode: res.statusCode,
        errorCode: payload.code,
        syncStatus: payload.syncStatus,
        error: res.locals.diagnosticError,
        operation: `${req.method} ${String(req.originalUrl || '').split(/[?#]/, 1)[0]}`
      };

      const persist = !routineGuestProbe && shouldPersistErrorDiagnostic(res.statusCode, payload.code);
      if (!aggregate && persist) {
        logPrivateDiagnostic(details);
        void recordDiagnostic(db, details);
      }
      return sendJson(createSafeErrorEnvelope({ status: res.statusCode, payload, req, referenceId }));
    };
    next();
  };
}

module.exports = { safeErrorResponses, isRoutineGuestSessionProbe, shouldPersistErrorDiagnostic };
