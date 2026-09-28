'use strict';

const {
  createReferenceId,
  createSafeErrorEnvelope,
  moduleForRequest,
  recordDiagnostic,
  logPrivateDiagnostic
} = require('../services/diagnosticService');
const { queueAggregatedDiagnostic, shouldAggregateDiagnostic } = require('../services/abuseEventAggregator');

function safeErrorResponses(db) {
  return (req, res, next) => {
    const sendJson = res.json.bind(res);
    res.json = payload => {
      if (res.statusCode < 400 || !payload || typeof payload !== 'object') return sendJson(payload);

      const module = String(payload.module || '').toUpperCase() === 'SECURITY'
        ? 'SECURITY'
        : moduleForRequest(req);
      const aggregate = shouldAggregateDiagnostic(
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

      if (!aggregate) {
        logPrivateDiagnostic(details);
        void recordDiagnostic(db, details);
      }
      return sendJson(createSafeErrorEnvelope({ status: res.statusCode, payload, req, referenceId }));
    };
    next();
  };
}

module.exports = { safeErrorResponses };
