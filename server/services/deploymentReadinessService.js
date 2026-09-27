'use strict';

const fs = require('node:fs');
const path = require('node:path');

const WEB_FIREBASE_KEYS = Object.freeze([
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID'
]);

const MOBILE_FIREBASE_KEYS = Object.freeze([
  'EXPO_PUBLIC_FIREBASE_API_KEY',
  'EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'EXPO_PUBLIC_FIREBASE_PROJECT_ID',
  'EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET',
  'EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
  'EXPO_PUBLIC_FIREBASE_APP_ID'
]);

const REQUIRED_KEYS = Object.freeze([
  'FIREBASE_PROJECT_ID',
  ...WEB_FIREBASE_KEYS,
  'EXPO_PUBLIC_API_BASE_URL',
  ...MOBILE_FIREBASE_KEYS
]);

function parseEnvFile(file) {
  if (!fs.existsSync(file)) return {};
  const values = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator <= 0) continue;
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

function collectDeploymentEnvironment(root, explicitEnvironment = process.env) {
  return {
    ...parseEnvFile(path.join(root, 'server', '.env')),
    ...parseEnvFile(path.join(root, 'web', 'react-app', '.env')),
    ...parseEnvFile(path.join(root, 'mobile', '.env')),
    ...explicitEnvironment
  };
}

function buildDeploymentReadinessReport(environment = {}) {
  const value = key => String(environment[key] || '').trim();
  const production = value('NODE_ENV').toLowerCase() === 'production';
  const missing = REQUIRED_KEYS.filter(key => !value(key));
  const violations = missing.map(key => ({ code: 'MISSING_CONFIGURATION', key }));
  const projectIds = [
    value('FIREBASE_PROJECT_ID'),
    value('VITE_FIREBASE_PROJECT_ID'),
    value('EXPO_PUBLIC_FIREBASE_PROJECT_ID')
  ].filter(Boolean);

  if (new Set(projectIds).size > 1) {
    violations.push({
      code: 'FIREBASE_PROJECT_MISMATCH',
      keys: ['FIREBASE_PROJECT_ID', 'VITE_FIREBASE_PROJECT_ID', 'EXPO_PUBLIC_FIREBASE_PROJECT_ID']
    });
  }

  const apiOrigin = value('EXPO_PUBLIC_API_BASE_URL');
  if (apiOrigin) {
    try {
      const parsed = new URL(apiOrigin);
      if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== apiOrigin) {
        violations.push({ code: 'INVALID_MOBILE_API_ORIGIN', key: 'EXPO_PUBLIC_API_BASE_URL' });
      }
      if (production && parsed.protocol !== 'https:') {
        violations.push({ code: 'PRODUCTION_API_REQUIRES_HTTPS', key: 'EXPO_PUBLIC_API_BASE_URL' });
      }
      if (production && ['localhost', '127.0.0.1', '::1'].includes(parsed.hostname.toLowerCase())) {
        violations.push({ code: 'PRODUCTION_API_REQUIRES_PUBLIC_HOST', key: 'EXPO_PUBLIC_API_BASE_URL' });
      }
    } catch (_) {
      violations.push({ code: 'INVALID_MOBILE_API_ORIGIN', key: 'EXPO_PUBLIC_API_BASE_URL' });
    }
  }

  if (production) {
    for (const key of REQUIRED_KEYS) {
      if (/replace-with|your-hugpong-domain/i.test(value(key))) {
        violations.push({ code: 'PRODUCTION_PLACEHOLDER_CONFIGURATION', key });
      }
    }
  }

  return {
    checkedAt: new Date().toISOString(),
    environment: production ? 'production' : 'non-production',
    requiredVariableCount: REQUIRED_KEYS.length,
    configuredVariableCount: REQUIRED_KEYS.length - missing.length,
    firebaseProjectsAligned: projectIds.length === 3 && new Set(projectIds).size === 1,
    mobileApiOriginValid: !violations.some(item => item.key === 'EXPO_PUBLIC_API_BASE_URL'),
    configurationReady: violations.length === 0,
    violations
  };
}

function assertDeploymentReady(report) {
  if (!report?.configurationReady) {
    const error = new Error(`Deployment configuration audit failed with ${report?.violations?.length || 0} violation(s).`);
    error.violations = report?.violations || [];
    throw error;
  }
  return report;
}

module.exports = {
  REQUIRED_KEYS,
  collectDeploymentEnvironment,
  buildDeploymentReadinessReport,
  assertDeploymentReady
};
