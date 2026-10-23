'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
require('../services/runtimeVersionPolicy').assertSupportedNodeVersion();

const root = path.resolve(__dirname, '..', '..');
const { collectDeploymentEnvironment, buildDeploymentReadinessReport, assertDeploymentReady } = require('../services/deploymentReadinessService');
const { assertReleaseEnvironment } = require('../../mobile/scripts/validateReleaseEnvironment.cjs');
const eas = JSON.parse(fs.readFileSync(path.join(root, 'mobile/eas.json'), 'utf8'));
const mobileReleaseEnvironment = { ...eas.build.preview.env, ...process.env };
const releaseEnvironment = { ...collectDeploymentEnvironment(root), ...mobileReleaseEnvironment, NODE_ENV: 'production' };
assertReleaseEnvironment(releaseEnvironment);
assertDeploymentReady(buildDeploymentReadinessReport(releaseEnvironment));
const npmCli = process.platform === 'win32'
  ? path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js')
  : null;
const npxCli = process.platform === 'win32'
  ? path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npx-cli.js')
  : null;

function packageCommand(kind, args) {
  if (process.platform === 'win32') {
    return { command: process.execPath, args: [kind === 'npm' ? npmCli : npxCli, ...args] };
  }
  return { command: kind, args };
}

function run(label, command, args, cwd = root, environment = process.env) {
  process.stdout.write(`\n[Release] ${label}\n`);
  const result = spawnSync(command, args, {
    cwd,
    env: environment,
    stdio: 'inherit'
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}

run('Deployment configuration parity', process.execPath, ['server/scripts/auditDeploymentConfig.js'], root, releaseEnvironment);
run('Tracked secret exposure audit', process.execPath, ['server/scripts/auditSecretExposure.js']);
run('Runtime authority audit', process.execPath, ['server/scripts/auditRuntimeAuthority.js']);
run('Client unresolved identifier audit', process.execPath, ['server/scripts/auditClientBindings.js']);
run('Mobile dependency verification mitigation', process.execPath, ['mobile/scripts/patchForgeVerification.cjs', '--check']);
const serverTests = packageCommand('npm', ['test']);
run('Server contract and integration tests', serverTests.command, serverTests.args, path.join(root, 'server'));
const webTests = packageCommand('npm', ['test']);
run('Web contract tests', webTests.command, webTests.args, path.join(root, 'web', 'react-app'));
const webBuild = packageCommand('npm', ['run', 'build']);
run('Web production build', webBuild.command, webBuild.args, path.join(root, 'web', 'react-app'));

const mobileOutput = fs.mkdtempSync(path.join(os.tmpdir(), 'hugpong-release-mobile-'));
try {
  const androidExport = packageCommand('npx', ['expo', 'export', '--platform', 'android', '--output-dir', mobileOutput]);
  run(
    'Android Expo production export',
    androidExport.command,
    androidExport.args,
    path.join(root, 'mobile'),
    { ...process.env, ...Object.fromEntries(Object.entries(releaseEnvironment).filter(([key]) => key.startsWith('EXPO_PUBLIC_'))), NODE_ENV: 'production' }
  );
} finally {
  fs.rmSync(mobileOutput, { recursive: true, force: true });
}

process.stdout.write('\n[Release] Verification passed.\n');
