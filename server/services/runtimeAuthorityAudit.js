'use strict';

const fs = require('node:fs');
const path = require('node:path');

const SOURCE_EXTENSION = /\.(?:js|jsx|ts|tsx|json)$/i;

function sourceFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(target);
    return SOURCE_EXTENSION.test(entry.name) ? [target] : [];
  });
}

function lineNumber(source, index) {
  return source.slice(0, index).split(/\r?\n/).length;
}

function collectMatches(files, rule, pattern, root) {
  const findings = [];
  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');
    const matcher = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`);
    for (const match of source.matchAll(matcher)) {
      findings.push({
        rule,
        file: path.relative(root, file).replaceAll('\\', '/'),
        line: lineNumber(source, match.index)
      });
    }
  }
  return findings;
}

function auditRuntimeAuthority(root) {
  const webFiles = sourceFiles(path.join(root, 'web', 'react-app', 'src'));
  const mobileFiles = sourceFiles(path.join(root, 'mobile', 'src'));
  const clientFiles = [...webFiles, ...mobileFiles];
  const firebaseConfigFiles = [
    path.join(root, 'web', 'react-app', 'src', 'services', 'firebaseClient.js'),
    path.join(root, 'mobile', 'src', 'firebase', 'config.js')
  ].filter(fs.existsSync);
  const adminConfigFiles = [
    path.join(root, 'server', 'firebase-admin.js'),
    path.join(root, 'server', 'server.js')
  ].filter(fs.existsSync);

  const findings = [
    ...collectMatches(
      clientFiles,
      'CLIENT_DIRECT_FIRESTORE_MUTATION',
      /\b(?:setDoc|addDoc|updateDoc|deleteDoc|writeBatch|runTransaction)\s*\(/,
      root
    ),
    ...collectMatches(clientFiles, 'CLIENT_FIRESTORE_IMPORT', /from\s+['"]firebase\/firestore['"]/, root),
    ...collectMatches(
      mobileFiles,
      'DEPRECATED_NATIVE_SAFE_AREA',
      /import\s*\{[^}]*\bSafeAreaView\b[^}]*\}\s*from\s*['"]react-native['"]/s,
      root
    ),
    ...collectMatches(
      clientFiles,
      'FABRICATED_RUNTIME_RECORD',
      /\b(?:Ramon Lacson|HPCo(?:\s+Silay)?|Haw-Phil|Pending Appointment|Silay Mill District|Development Test Block Farm)\b/i,
      root
    ),
    ...collectMatches(
      firebaseConfigFiles,
      'EMBEDDED_FIREBASE_CLIENT_CONFIG',
      /(?:AIza[0-9A-Za-z_-]{20,}|\bauthDomain\s*:\s*['"][^'"]+\.firebaseapp\.com['"]|\bstorageBucket\s*:\s*['"][^'"]+\.firebasestorage\.app['"]|\bmessagingSenderId\s*:\s*['"]\d{6,}['"]|\bappId\s*:\s*['"]\d+:[^'"]+['"])/,
      root
    ),
    ...collectMatches(adminConfigFiles, 'EMBEDDED_FIREBASE_PROJECT_FALLBACK', /['"]hugpong-ff['"]/, root)
  ];

  return {
    checkedAt: new Date().toISOString(),
    scannedFiles: clientFiles.length + adminConfigFiles.length,
    findingCount: findings.length,
    releaseReady: findings.length === 0,
    findings
  };
}

function assertRuntimeAuthority(report) {
  if (!report?.releaseReady) {
    const error = new Error(`Runtime authority audit failed with ${report?.findingCount || 0} finding(s).`);
    error.findings = report?.findings || [];
    throw error;
  }
  return report;
}

module.exports = { auditRuntimeAuthority, assertRuntimeAuthority };
