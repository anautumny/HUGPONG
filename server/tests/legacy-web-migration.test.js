'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  LEGACY_ROLE_DASHBOARD_REDIRECTS,
  LEGACY_LEGAL_PAGE_REDIRECTS
} = require('../domain/legacyWebRoutes');

test('every legacy role dashboard has a reversible React compatibility redirect', () => {
  assert.deepEqual(LEGACY_ROLE_DASHBOARD_REDIRECTS, {
    '/roles/farm-manager/dashboard.html': '/dashboard',
    '/roles/sra-admin/dashboard.html': '/dashboard',
    '/roles/super-admin/dashboard.html': '/dashboard'
  });
});

test('legacy legal-page bookmarks use the React legal surfaces', () => {
  assert.deepEqual(LEGACY_LEGAL_PAGE_REDIRECTS, {
    '/cookie-policy.html': '/cookies',
    '/privacy-policy.html': '/privacy',
    '/terms-and-conditions.html': '/terms'
  });
});

test('legacy dashboard redirects are registered before legacy static serving', () => {
  const serverSource = fs.readFileSync(path.resolve(__dirname, '../server.js'), 'utf8');
  const redirectIndex = serverSource.indexOf('app.get(Object.keys(LEGACY_ROLE_DASHBOARD_REDIRECTS)');
  const legalRedirectIndex = serverSource.indexOf('app.get(Object.keys(LEGACY_LEGAL_PAGE_REDIRECTS)');
  const staticIndex = serverSource.indexOf('app.use(express.static(legacyWebPath))');

  assert.ok(redirectIndex >= 0, 'legacy redirect handler must be registered');
  assert.ok(legalRedirectIndex >= 0, 'legacy legal redirect handler must be registered');
  assert.ok(staticIndex >= 0, 'legacy static fallback must remain available during migration');
  assert.ok(redirectIndex < staticIndex, 'redirect handler must run before legacy static serving');
  assert.ok(legalRedirectIndex < staticIndex, 'legal redirect handler must run before legacy static serving');
});
