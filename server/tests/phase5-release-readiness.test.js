'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { auditRuntimeAuthority, assertRuntimeAuthority } = require('../services/runtimeAuthorityAudit');

const root = path.resolve(__dirname, '..', '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('active runtime passes the centralized authority and fabricated-data audit', () => {
  const report = auditRuntimeAuthority(root);
  assert.equal(report.releaseReady, true, JSON.stringify(report.findings, null, 2));
  assert.equal(report.findingCount, 0);
  assert.doesNotThrow(() => assertRuntimeAuthority(report));
});

test('runtime audit reports unsafe client behavior with file and line evidence', () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hugpong-phase5-audit-'));
  try {
    const webRoot = path.join(fixtureRoot, 'web', 'react-app', 'src', 'services');
    const mobileRoot = path.join(fixtureRoot, 'mobile', 'src', 'screens');
    const mobileConfigRoot = path.join(fixtureRoot, 'mobile', 'src', 'firebase');
    const serverRoot = path.join(fixtureRoot, 'server');
    fs.mkdirSync(webRoot, { recursive: true });
    fs.mkdirSync(mobileRoot, { recursive: true });
    fs.mkdirSync(mobileConfigRoot, { recursive: true });
    fs.mkdirSync(serverRoot, { recursive: true });
    fs.writeFileSync(path.join(webRoot, 'firebaseClient.js'), "const config = { apiKey: 'AIzaUnsafeEmbeddedConfiguration12345' };\nsetDoc(ref, data);\n");
    fs.writeFileSync(path.join(mobileRoot, 'BadScreen.js'), "import { SafeAreaView } from 'react-native';\nconst farm = 'Development Test Block Farm';\n");
    fs.writeFileSync(path.join(mobileConfigRoot, 'config.js'), "import { getFirestore } from 'firebase/firestore';\n");
    fs.writeFileSync(path.join(serverRoot, 'firebase-admin.js'), "const projectId = 'hugpong-ff';\n");

    const report = auditRuntimeAuthority(fixtureRoot);
    const rules = new Set(report.findings.map(finding => finding.rule));
    assert.equal(report.releaseReady, false);
    assert.ok(rules.has('CLIENT_DIRECT_FIRESTORE_MUTATION'));
    assert.ok(rules.has('CLIENT_FIRESTORE_IMPORT'));
    assert.ok(rules.has('DEPRECATED_NATIVE_SAFE_AREA'));
    assert.ok(rules.has('FABRICATED_RUNTIME_RECORD'));
    assert.ok(rules.has('EMBEDDED_FIREBASE_CLIENT_CONFIG'));
    assert.ok(rules.has('EMBEDDED_FIREBASE_PROJECT_FALLBACK'));
    assert.ok(report.findings.every(finding => finding.file && finding.line >= 1));
    assert.throws(() => assertRuntimeAuthority(report), /audit failed/);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('server, web, and mobile Firebase identities are deployment configuration', () => {
  const server = read('server/firebase-admin.js');
  const web = read('web/react-app/src/services/firebaseClient.js');
  const mobile = read('mobile/src/firebase/config.js');

  assert.match(server, /process\.env\.FIREBASE_PROJECT_ID/);
  assert.doesNotMatch(server, /projectId:\s*['"]hugpong-ff['"]/);
  assert.match(web, /VITE_FIREBASE_PROJECT_ID/);
  assert.match(mobile, /EXPO_PUBLIC_FIREBASE_PROJECT_ID/);
  assert.doesNotMatch(`${web}\n${mobile}`, /AIza[0-9A-Za-z_-]{20,}/);
  assert.doesNotMatch(mobile, /firebase\/firestore|\bdb\b/);
});

test('repository hygiene excludes generated mobile exports and client-side admin bootstrap scripts', () => {
  const forbiddenPaths = [
    'mobile/.expo-verification-output',
    'mobile/.tmp-expo-field-fixes',
    'mobile/cleanAndInitAdmin.js'
  ];

  for (const relativePath of forbiddenPaths) {
    assert.equal(
      fs.existsSync(path.join(root, relativePath)),
      false,
      `${relativePath} must not be committed or used as a privileged runtime entry point.`
    );
  }
  assert.equal(fs.existsSync(path.join(root, 'server/scripts/bootstrapProductionSuperAdmin.js')), true);
});

test('one release command covers authority, server, web, and Android verification', () => {
  const rootPackage = JSON.parse(read('package.json'));
  const serverPackage = JSON.parse(read('server/package.json'));
  const verifier = read('server/scripts/verifyRelease.js');

  assert.equal(rootPackage.scripts['verify:release'], 'node server/scripts/verifyRelease.js');
  assert.equal(serverPackage.scripts['audit:runtime-authority'], 'node scripts/auditRuntimeAuthority.js');
  assert.match(verifier, /Server contract and integration tests/);
  assert.match(verifier, /Web production build/);
  assert.match(verifier, /Android Expo production export/);
  assert.match(verifier, /mkdtempSync/);
  assert.match(verifier, /rmSync/);
});
