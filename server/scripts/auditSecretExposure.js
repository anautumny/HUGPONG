'use strict';

const path = require('node:path');
const { auditSecretExposure, assertNoSecretExposure } = require('../services/secretExposureAudit');

const root = path.resolve(__dirname, '..', '..');
const report = auditSecretExposure(root);
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
assertNoSecretExposure(report);
