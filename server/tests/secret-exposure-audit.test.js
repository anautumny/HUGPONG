'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  auditFiles,
  auditSecretExposure,
  assertNoSecretExposure,
  isForbiddenCredentialFile
} = require('../services/secretExposureAudit');

const root = path.resolve(__dirname, '..', '..');

test('tracked repository contains no current secret exposure', () => {
  assert.doesNotThrow(() => assertNoSecretExposure(auditSecretExposure(root)));
});

test('credential filenames are rejected while templates remain allowed', () => {
  assert.equal(isForbiddenCredentialFile('server/.env'), true);
  assert.equal(isForbiddenCredentialFile('server/.env.production'), true);
  assert.equal(isForbiddenCredentialFile('server/serviceAccountKey.json'), true);
  assert.equal(isForbiddenCredentialFile('mobile/release.keystore'), true);
  assert.equal(isForbiddenCredentialFile('server/.env.example'), false);
});

test('client secret findings do not disclose the matched value', () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hugpong-secret-audit-'));
  const relativeFile = 'mobile/src/exposed.js';
  const absoluteFile = path.join(temporaryRoot, ...relativeFile.split('/'));
  fs.mkdirSync(path.dirname(absoluteFile), { recursive: true });
  fs.writeFileSync(absoluteFile, "const SEMAPHORE_API_KEY = 'sensitive-test-value-123456789';\n");

  try {
    const report = auditFiles(temporaryRoot, [relativeFile]);
    assert.equal(report.releaseReady, false);
    assert.ok(report.findings.some(finding => finding.rule === 'CLIENT_SMS_PROVIDER_CREDENTIAL'));
    assert.doesNotMatch(JSON.stringify(report), /sensitive-test-value/);
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test('IPROG credentials and API endpoints are forbidden in client source', () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hugpong-iprog-audit-'));
  const credentialFile = 'web/react-app/src/exposed.js';
  const endpointFile = 'mobile/src/exposed.js';
  fs.mkdirSync(path.dirname(path.join(temporaryRoot, credentialFile)), { recursive: true });
  fs.mkdirSync(path.dirname(path.join(temporaryRoot, endpointFile)), { recursive: true });
  fs.writeFileSync(path.join(temporaryRoot, credentialFile), "const IPROG_SMS_API_TOKEN = 'sensitive-test-value-123456789';\n");
  fs.writeFileSync(path.join(temporaryRoot, endpointFile), "const endpoint = 'https://iprogsms.com/api/v1/sms_messages';\n");

  try {
    const report = auditFiles(temporaryRoot, [credentialFile, endpointFile]);
    assert.ok(report.findings.some(finding => finding.rule === 'CLIENT_SMS_PROVIDER_CREDENTIAL'));
    assert.ok(report.findings.some(finding => finding.rule === 'CLIENT_SMS_PROVIDER_ENDPOINT'));
    assert.doesNotMatch(JSON.stringify(report), /sensitive-test-value/);
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test('public Firebase client identifiers are not treated as server secrets', () => {
  const report = auditFiles(root, [
    'mobile/src/firebase/config.js',
    'web/react-app/src/services/firebaseClient.js'
  ]);
  assert.equal(report.releaseReady, true, JSON.stringify(report.findings));
});
