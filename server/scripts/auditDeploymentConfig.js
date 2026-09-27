'use strict';

const path = require('node:path');
const {
  collectDeploymentEnvironment,
  buildDeploymentReadinessReport,
  assertDeploymentReady
} = require('../services/deploymentReadinessService');

const root = path.resolve(__dirname, '..', '..');
const environment = collectDeploymentEnvironment(root, process.env);
const report = buildDeploymentReadinessReport(environment);
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
assertDeploymentReady(report);
