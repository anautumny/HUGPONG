'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repositoryRoot = path.resolve(__dirname, '..', '..');
const webRoot = path.join(repositoryRoot, 'web');
const obsolete = [
  'index.html', 'login.html', 'privacy-policy.html', 'terms-and-conditions.html', 'cookie-policy.html', 'admin.css',
  'roles/super-admin/dashboard.html', 'roles/super-admin/super-admin.js', 'roles/sra-admin/dashboard.html', 'roles/sra-admin/sra-admin.js',
  'roles/farm-manager/dashboard.html', 'roles/farm-manager/farm-manager.js', 'shared/core.js', 'shared/core-platform.js',
  'shared/core-dashboard.js', 'shared/core-operations.js', 'shared/firebase-config.js', 'shared/firebase-init.js',
  'shared/webDataStore.js', 'shared/firestore-schema.js', 'shared/auth-routing.js', 'shared/qrcode.min.js', 'shared/consent-banner.js'
];

test('page-specific legacy HTML, CSS, and JavaScript are removed', () => {
  for (const relativePath of obsolete) assert.equal(fs.existsSync(path.join(webRoot, relativePath)), false, `${relativePath} must stay removed`);
  assert.equal(fs.existsSync(path.join(webRoot, 'react-app/index.html')), true);
});

test('React source has no navigation or bootstrap dependency on legacy assets', () => {
  const source = [];
  const visit = directory => fs.readdirSync(directory, { withFileTypes: true }).forEach(entry => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) visit(target);
    else if (/\.(js|jsx)$/.test(entry.name)) source.push(fs.readFileSync(target, 'utf8'));
  });
  visit(path.join(webRoot, 'react-app/src'));
  const combined = source.join('\n');
  assert.doesNotMatch(combined, /(?:login|dashboard|privacy-policy|terms-and-conditions|cookie-policy)\.html/);
  assert.doesNotMatch(combined, /\/roles\//);
  assert.doesNotMatch(combined, /legacyPlatformBootstrap|HugpongAuthRouting|DASHBOARD_PATHS/);
});
