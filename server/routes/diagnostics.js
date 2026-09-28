'use strict';

const express = require('express');
const router = express.Router();
const { db } = require('../firebase-admin');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/roleGuard');
const { ROLES } = require('../schema/firestoreSchema');
const {
  LEVELS,
  MODULES,
  createReferenceId,
  listDiagnostics,
  recordDiagnostic,
  cleanText
} = require('../services/diagnosticService');

function invalidInput(message, code) {
  return Object.assign(new Error(message), { status: 400, code });
}

function validatedFilters(query = {}) {
  const level = String(query.level || '').trim().toUpperCase();
  const module = String(query.module || '').trim().toUpperCase();
  const date = String(query.date || '').trim();
  const referenceId = String(query.referenceId || '').trim().toUpperCase();
  const search = String(query.search || '').trim();
  const limit = query.limit == null || query.limit === '' ? 100 : Number(query.limit);
  if (level && !LEVELS.includes(level)) throw invalidInput('Diagnostic level filter is invalid.', 'INVALID_DIAGNOSTIC_FILTER');
  if (module && !MODULES.includes(module)) throw invalidInput('Diagnostic module filter is invalid.', 'INVALID_DIAGNOSTIC_FILTER');
  if (date) {
    const parsed = /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T00:00:00.000Z`) : null;
    if (!parsed || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
      throw invalidInput('Diagnostic date filter is invalid.', 'INVALID_DIAGNOSTIC_FILTER');
    }
  }
  if (referenceId && !/^[A-Z0-9-]{1,50}$/.test(referenceId)) throw invalidInput('Diagnostic reference filter is invalid.', 'INVALID_DIAGNOSTIC_FILTER');
  if (search.length > 120) throw invalidInput('Diagnostic search is too long.', 'INVALID_DIAGNOSTIC_FILTER');
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) throw invalidInput('Diagnostic result limit is invalid.', 'INVALID_DIAGNOSTIC_FILTER');
  return { level, module, date, referenceId, search, limit };
}

router.get('/', requireAuth, requireRole([ROLES.SUPER_ADMIN]), async (req, res) => {
  try {
    if (!db) return res.status(503).json({ success: false, error: 'Database is unavailable.', code: 'DATABASE_UNAVAILABLE' });
    const data = await listDiagnostics(db, validatedFilters(req.query));
    return res.json({ success: true, count: data.length, data, levels: LEVELS, modules: MODULES });
  } catch (error) {
    res.locals.diagnosticError = error;
    return res.status(error.status || 500).json({ success: false, error: error.message, code: error.code || 'DIAGNOSTICS_READ_FAILED' });
  }
});

// Authenticated clients can submit a narrowly scoped, sanitized report for
// failures that occur before the API receives the original operation.
router.post('/client', requireAuth, async (req, res) => {
  try {
    if (!db) return res.status(503).json({ success: false, error: 'Database is unavailable.', code: 'DATABASE_UNAVAILABLE' });
    const level = String(req.body?.level || 'ERROR').trim().toUpperCase();
    const module = String(req.body?.module || req.headers['x-client-platform'] || 'SYSTEM').trim().toUpperCase();
    if (!['ERROR', 'WARN'].includes(level)) {
      return res.status(400).json({ success: false, error: 'Diagnostic level must be ERROR or WARN.', code: 'INVALID_DIAGNOSTIC_LEVEL' });
    }
    if (!MODULES.includes(module)) {
      return res.status(400).json({ success: false, error: 'Diagnostic module is invalid.', code: 'INVALID_DIAGNOSTIC_MODULE' });
    }
    if (typeof req.body?.message !== 'string' || req.body.message.length > 1000) {
      return res.status(400).json({ success: false, error: 'Diagnostic message must be a string of 1000 characters or fewer.', code: 'INVALID_DIAGNOSTIC_MESSAGE' });
    }
    if (req.body?.errorCode != null && !/^[A-Za-z0-9_-]{1,80}$/.test(String(req.body.errorCode))) {
      return res.status(400).json({ success: false, error: 'Diagnostic error code is invalid.', code: 'INVALID_DIAGNOSTIC_CODE' });
    }
    if (req.body?.syncStatus != null && !/^[A-Za-z0-9_ -]{1,40}$/.test(String(req.body.syncStatus))) {
      return res.status(400).json({ success: false, error: 'Diagnostic sync status is invalid.', code: 'INVALID_DIAGNOSTIC_SYNC_STATUS' });
    }
    const message = cleanText(req.body.message, 1000);
    if (!message) return res.status(400).json({ success: false, error: 'Diagnostic message is required.', code: 'INVALID_DIAGNOSTIC_MESSAGE' });
    const suppliedReference = String(req.body?.referenceId || '').trim().toUpperCase();
    if (suppliedReference && !/^[A-Z]{2,8}-\d{8}-[A-Z0-9]{6,24}$/.test(suppliedReference)) {
      return res.status(400).json({ success: false, error: 'Diagnostic reference ID is invalid.', code: 'INVALID_DIAGNOSTIC_REFERENCE' });
    }
    const referenceId = suppliedReference || createReferenceId(module);
    await recordDiagnostic(db, {
      req,
      level,
      module,
      referenceId,
      technicalError: message,
      statusCode: 0,
      errorCode: cleanText(req.body?.errorCode || 'CLIENT_FAILURE', 80),
      syncStatus: cleanText(req.body?.syncStatus || 'NOT_APPLICABLE', 40),
      source: 'CLIENT'
    });
    return res.status(201).json({ success: true, referenceId });
  } catch (error) {
    res.locals.diagnosticError = error;
    return res.status(500).json({ success: false, error: error.message, code: 'DIAGNOSTIC_WRITE_FAILED' });
  }
});

module.exports = router;
