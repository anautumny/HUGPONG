'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const TEXT_FILE_EXTENSION = /\.(?:cjs|css|env|html|js|jsx|json|md|mjs|properties|sh|ts|tsx|txt|xml|yaml|yml)$/i;
const CLIENT_SOURCE_PREFIXES = ['mobile/src/', 'web/react-app/src/'];

function normalizePath(file) {
  return String(file).replaceAll('\\', '/').replace(/^\.\//, '');
}

function trackedFiles(root) {
  const result = spawnSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error('Unable to enumerate tracked files for the secret exposure audit.');
  }
  return result.stdout.split('\0').filter(Boolean).map(normalizePath);
}

function lineNumber(source, index) {
  return source.slice(0, index).split(/\r?\n/).length;
}

function isForbiddenCredentialFile(file) {
  const normalized = normalizePath(file);
  const basename = path.posix.basename(normalized);
  if (/^\.env(?:\..+)?$/i.test(basename) && !/\.(?:example|template)$/i.test(basename)) return true;
  if (/serviceaccount(?:key)?[^/]*\.json$/i.test(basename)) return true;
  return /\.(?:jks|key|keystore|p12|p8|pem)$/i.test(basename);
}

function isTextFile(file) {
  const basename = path.posix.basename(file);
  return TEXT_FILE_EXTENSION.test(basename) || basename === '.env.example' || basename === '.env.template';
}

function addMatches(findings, source, file, rule, pattern) {
  const matcher = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`);
  for (const match of source.matchAll(matcher)) {
    findings.push({ rule, file, line: lineNumber(source, match.index) });
  }
}

function auditFiles(root, files) {
  const findings = [];
  const normalizedFiles = files.map(normalizePath);

  for (const file of normalizedFiles) {
    if (isForbiddenCredentialFile(file)) {
      findings.push({ rule: 'TRACKED_CREDENTIAL_FILE', file, line: 1 });
      continue;
    }
    if (!isTextFile(file)) continue;

    const absolutePath = path.resolve(root, ...file.split('/'));
    if (!fs.existsSync(absolutePath)) continue;
    const source = fs.readFileSync(absolutePath, 'utf8');

    addMatches(findings, source, file, 'PRIVATE_KEY_MATERIAL', /-----BEGIN (?:ENCRYPTED |RSA |EC |OPENSSH )?PRIVATE KEY-----/i);
    addMatches(findings, source, file, 'KNOWN_SECRET_TOKEN', /\b(?:AKIA[0-9A-Z]{16}|ghp_[0-9A-Za-z]{30,}|github_pat_[0-9A-Za-z_]{40,}|sk_live_[0-9A-Za-z]{20,})\b/);

    if (CLIENT_SOURCE_PREFIXES.some(prefix => file.startsWith(prefix))) {
      addMatches(findings, source, file, 'CLIENT_SMS_PROVIDER_CREDENTIAL', /\b(?:SEMAPHORE_API_KEY|semaphoreApiKey)\b/);
      addMatches(findings, source, file, 'CLIENT_SMS_PROVIDER_ENDPOINT', /\bapi\.semaphore\.co\b/i);
      addMatches(
        findings,
        source,
        file,
        'CLIENT_HARDCODED_SECRET',
        /\b(?:API_KEY|SECRET|PRIVATE_KEY|ACCESS_TOKEN)\s*[:=]\s*['"][0-9A-Za-z_\-./+=]{20,}['"]/i
      );
      addMatches(
        findings,
        source,
        file,
        'PUBLIC_ENV_SECRET',
        /\b(?:EXPO_PUBLIC|VITE)_[A-Z0-9_]*(?:SECRET|PRIVATE_KEY|ACCESS_TOKEN|SEMAPHORE)[A-Z0-9_]*\b/
      );
    }
  }

  return {
    checkedAt: new Date().toISOString(),
    scannedFiles: normalizedFiles.length,
    findingCount: findings.length,
    releaseReady: findings.length === 0,
    findings
  };
}

function auditSecretExposure(root) {
  return auditFiles(root, trackedFiles(root));
}

function assertNoSecretExposure(report) {
  if (!report?.releaseReady) {
    const error = new Error(`Secret exposure audit failed with ${report?.findingCount || 0} finding(s).`);
    error.findings = report?.findings || [];
    throw error;
  }
  return report;
}

module.exports = {
  auditFiles,
  auditSecretExposure,
  assertNoSecretExposure,
  isForbiddenCredentialFile
};
