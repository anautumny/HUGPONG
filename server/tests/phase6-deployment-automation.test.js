'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  REQUIRED_KEYS,
  collectDeploymentEnvironment,
  buildDeploymentReadinessReport,
  assertDeploymentReady
} = require('../services/deploymentReadinessService');

const root = path.resolve(__dirname, '..', '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

function completeEnvironment(overrides = {}) {
  return {
    NODE_ENV: 'production',
    FIREBASE_PROJECT_ID: 'hugpong-production',
    VITE_FIREBASE_API_KEY: 'web-key',
    VITE_FIREBASE_AUTH_DOMAIN: 'hugpong-production.firebaseapp.com',
    VITE_FIREBASE_PROJECT_ID: 'hugpong-production',
    VITE_FIREBASE_STORAGE_BUCKET: 'hugpong-production.firebasestorage.app',
    VITE_FIREBASE_MESSAGING_SENDER_ID: '100000000001',
    VITE_FIREBASE_APP_ID: '1:100000000001:web:web-app',
    EXPO_PUBLIC_API_BASE_URL: 'https://api.hugpong.example',
    EXPO_PUBLIC_FIREBASE_API_KEY: 'mobile-key',
    EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN: 'hugpong-production.firebaseapp.com',
    EXPO_PUBLIC_FIREBASE_PROJECT_ID: 'hugpong-production',
    EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET: 'hugpong-production.firebasestorage.app',
    EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: '100000000001',
    EXPO_PUBLIC_FIREBASE_APP_ID: '1:100000000001:web:mobile-app',
    ...overrides
  };
}

test('deployment report accepts aligned server, Web, and Mobile configuration without exposing values', () => {
  const environment = completeEnvironment();
  const report = buildDeploymentReadinessReport(environment);
  assert.equal(report.configurationReady, true);
  assert.equal(report.firebaseProjectsAligned, true);
  assert.equal(report.configuredVariableCount, REQUIRED_KEYS.length);
  assert.doesNotThrow(() => assertDeploymentReady(report));
  const serialized = JSON.stringify(report);
  assert.doesNotMatch(serialized, /web-key|mobile-key|hugpong-production|api\.hugpong\.example/);
});

test('deployment report blocks missing, mismatched, placeholder, and insecure production configuration', () => {
  const report = buildDeploymentReadinessReport(completeEnvironment({
    VITE_FIREBASE_API_KEY: '',
    EXPO_PUBLIC_FIREBASE_PROJECT_ID: 'another-project',
    EXPO_PUBLIC_API_BASE_URL: 'http://localhost:3000',
    VITE_FIREBASE_AUTH_DOMAIN: 'replace-with-project.firebaseapp.com'
  }));
  const codes = new Set(report.violations.map(item => item.code));
  assert.equal(report.configurationReady, false);
  assert.ok(codes.has('MISSING_CONFIGURATION'));
  assert.ok(codes.has('FIREBASE_PROJECT_MISMATCH'));
  assert.ok(codes.has('PRODUCTION_API_REQUIRES_HTTPS'));
  assert.ok(codes.has('PRODUCTION_API_REQUIRES_PUBLIC_HOST'));
  assert.ok(codes.has('PRODUCTION_PLACEHOLDER_CONFIGURATION'));
  assert.throws(() => assertDeploymentReady(report), /configuration audit failed/);
});

test('explicit deployment variables override ignored local environment files', () => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'hugpong-phase6-env-'));
  try {
    for (const directory of ['server', 'web/react-app', 'mobile']) {
      fs.mkdirSync(path.join(fixture, directory), { recursive: true });
    }
    fs.writeFileSync(path.join(fixture, 'server', '.env'), 'FIREBASE_PROJECT_ID=local-project\n');
    fs.writeFileSync(path.join(fixture, 'web', 'react-app', '.env'), 'VITE_FIREBASE_PROJECT_ID=local-project\n');
    fs.writeFileSync(path.join(fixture, 'mobile', '.env'), 'EXPO_PUBLIC_FIREBASE_PROJECT_ID=local-project\n');
    const collected = collectDeploymentEnvironment(fixture, { FIREBASE_PROJECT_ID: 'deployment-project' });
    assert.equal(collected.FIREBASE_PROJECT_ID, 'deployment-project');
    assert.equal(collected.VITE_FIREBASE_PROJECT_ID, 'local-project');
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true });
  }
});

test('CI installs all three applications and runs the same release gate used locally', () => {
  const workflow = read('.github/workflows/verify.yml');
  const verifier = read('server/scripts/verifyRelease.js');
  const rootPackage = JSON.parse(read('package.json'));
  assert.match(workflow, /runs-on: windows-latest/);
  assert.match(workflow, /npm ci --prefix server/);
  assert.match(workflow, /npm ci --prefix web\/react-app/);
  assert.match(workflow, /npm ci --prefix mobile/);
  assert.match(workflow, /npm run verify:release/);
  assert.match(verifier, /Deployment configuration parity/);
  assert.equal(rootPackage.scripts['audit:deployment-config'], 'npm --prefix server run audit:deployment-config');
});
