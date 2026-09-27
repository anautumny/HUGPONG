'use strict';

const path = require('node:path');
const { auditRuntimeAuthority, assertRuntimeAuthority } = require('../services/runtimeAuthorityAudit');

const root = path.resolve(__dirname, '..', '..');
const report = auditRuntimeAuthority(root);
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
assertRuntimeAuthority(report);
