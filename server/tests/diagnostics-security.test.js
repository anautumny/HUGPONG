'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  cleanText,
  sanitizeValue,
  createSafeErrorEnvelope,
  listDiagnostics
} = require('../services/diagnosticService');
const { allowedRolesForRequest } = require('../middleware/requestPermissions');
const { ROLES } = require('../schema/firestoreSchema');

const root = path.resolve(__dirname, '..', '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

test('diagnostic sanitization removes secrets and unnecessary personal data', () => {
  const cleaned = cleanText('Bearer header.payload.signature user@example.test 09171234567 10.1.2.3');
  assert.doesNotMatch(cleaned, /header\.payload|user@example|09171234567|10\.1\.2\.3/);
  assert.match(cleaned, /REDACTED/);

  const value = sanitizeValue({
    password: 'hidden-value',
    accessToken: 'hidden-value',
    nested: { privateKey: 'hidden-value', status: 'FAILED' }
  });
  assert.equal(value.password, '[REDACTED]');
  assert.equal(value.accessToken, '[REDACTED]');
  assert.equal(value.nested.privateKey, '[REDACTED]');
  assert.equal(value.nested.status, 'FAILED');
});

test('safe error envelopes hide technical failures and include recovery guidance', () => {
  const envelope = createSafeErrorEnvelope({
    status: 500,
    payload: { success: false, error: 'Firestore permission-denied at internal collection query' },
    req: { originalUrl: '/api/fields/03000001', method: 'GET', headers: {} },
    referenceId: 'OPER-20260928-ABC12345'
  });
  assert.equal(envelope.success, false);
  assert.doesNotMatch(envelope.error, /Firestore|collection|permission/i);
  assert.match(envelope.nextAction, /Try again/i);
  assert.equal(envelope.referenceId, 'OPER-20260928-ABC12345');
});

test('diagnostic list filters bounded sanitized records without using the Audit Ledger', async () => {
  const records = [
    { id: 'one', data: () => ({ referenceId: 'SYNC-20260928-AAAAAA', timestamp: '2026-09-28T01:42:18.000Z', level: 'ERROR', module: 'SYNC', technicalError: 'Timeout - retry queued' }) },
    { id: 'two', data: () => ({ referenceId: 'QR-20260927-BBBBBB', timestamp: '2026-09-27T01:42:22.000Z', level: 'WARN', module: 'QR', technicalError: 'Verification delayed' }) }
  ];
  let requestedCollection = '';
  const db = {
    collection(name) {
      requestedCollection = name;
      return {
        where() { return this; },
        orderBy() { return this; },
        limit() { return this; },
        async get() { return { docs: records }; }
      };
    }
  };
  const result = await listDiagnostics(db, { level: 'ERROR', module: 'SYNC', date: '2026-09-28', search: 'retry' });
  assert.equal(requestedCollection, 'diagnostic_events');
  assert.equal(result.length, 1);
  assert.equal(result[0].referenceId, 'SYNC-20260928-AAAAAA');
  assert.notEqual(requestedCollection, 'audit_logs');
});

test('only Super Admin can read diagnostics while authenticated roles can submit client failures', () => {
  assert.deepEqual(allowedRolesForRequest('GET', '/api/diagnostics'), [ROLES.SUPER_ADMIN]);
  assert.deepEqual(new Set(allowedRolesForRequest('POST', '/api/diagnostics/client')), new Set(Object.values(ROLES)));
  assert.equal(allowedRolesForRequest('GET', '/api/diagnostics/client'), null);
});

test('web console is role-gated, terminal styled, filterable, and separate from Audit Ledger', () => {
  const app = read('web/react-app/src/App.jsx');
  const sidebar = read('web/react-app/src/components/layout/Sidebar.jsx');
  const view = read('web/react-app/src/views/diagnostics/DiagnosticsConsoleView.jsx');
  const rules = read('firestore.rules');
  assert.match(app, /path="\/diagnostics"[\s\S]*allowed=\{GOVERNANCE_ROLES\}/);
  assert.match(sidebar, /Diagnostics Console[\s\S]*\/diagnostics/);
  assert.match(view, /font-mono/);
  for (const filter of ['level', 'module', 'date', 'referenceId', 'search']) {
    assert.match(view, new RegExp(`name="${filter}"`));
  }
  assert.match(view, /separate Audit Ledger/);
  assert.match(rules, /match \/diagnostic_events\/\{documentId\}[\s\S]*allow read, write: if false/);
});

test('web and mobile display reference IDs and report render failures without raw console errors', () => {
  const webApi = read('web/react-app/src/services/apiClient.js');
  const mobileApi = read('mobile/src/services/authService.js');
  const webApp = read('web/react-app/src/App.jsx');
  const mobileApp = read('mobile/App.js');
  assert.match(webApi, /Reference ID:/);
  assert.match(mobileApi, /Reference ID:/);
  assert.match(webApp, /reportClientDiagnostic/);
  assert.match(mobileApp, /reportMobileDiagnostic/);
  assert.doesNotMatch(webApp, /console\.error/);
});
