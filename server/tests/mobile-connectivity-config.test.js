'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.join(__dirname, '..', '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

function sourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(target);
    return /\.(js|jsx|ts|tsx|json)$/.test(entry.name) ? [target] : [];
  });
}

test('mobile runtime source contains no loopback, emulator, or private-LAN API fallback', () => {
  const source = sourceFiles(path.join(root, 'mobile', 'src'))
    .map(file => fs.readFileSync(file, 'utf8'))
    .join('\n');

  assert.doesNotMatch(source, /https?:\/\/(?:localhost|127\.0\.0\.1|10\.0\.2\.2)(?::\d+)?/i);
  assert.doesNotMatch(source, /https?:\/\/(?:10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/i);
  assert.doesNotMatch(source, /NativeModules\?\.SourceCode|resolveMetroApiUrl|API_URL_CANDIDATES/);
});

test('one centralized mobile origin is required and production is HTTPS-only', () => {
  const config = read('mobile/src/config/apiConfig.js');
  const auth = read('mobile/src/services/authService.js');

  assert.match(config, /PUBLIC_API_ENV_NAME = 'EXPO_PUBLIC_API_BASE_URL'/);
  assert.match(config, /parsed\.protocol !== 'https:'/);
  assert.match(config, /isPrivateOrLocalHostname\(parsed\.hostname\)/);
  assert.match(config, /must contain only the API origin/);
  assert.match(auth, /const origin = getApiBaseUrl\(\)/);
  assert.match(auth, /fetch\(`\$\{origin\}\$\{path\}`/);
  assert.doesNotMatch(auth, /fallback|candidates|for \(const origin/i);
});

test('connectivity classification gates reconnect sync on API health', () => {
  const network = read('mobile/src/services/networkService.js');
  assert.match(network, /NO_INTERNET: 'NO_INTERNET'/);
  assert.match(network, /SERVER_UNAVAILABLE: 'SERVER_UNAVAILABLE'/);
  assert.match(network, /const serverReachable = await probeServerConnectivity\(\)/);
  assert.match(network, /if \(online && \(!wasOnline \|\| forceReconnect\)/);
  assert.match(network, /checkConnectivity\(\{ force: true \}\)/);
});

test('login reports connectivity failures without treating them as bad credentials', () => {
  const login = read('mobile/src/screens/auth/LoginScreen.js');
  const failureBranch = login.slice(login.indexOf('if (!res.success)'), login.indexOf('// Successful authentication'));
  assert.match(login, /CONNECTIVITY_STATUS\.NO_INTERNET/);
  assert.match(login, /API_UNAVAILABLE_MESSAGE/);
  assert.match(failureBranch, /if \(res\.isNetworkError\)[\s\S]*return;/);
  assert.match(failureBranch, /const nextAttempts = failedAttempts \+ 1/);
});

test('production server config requires exact CORS origins and accepts cloud host/port', () => {
  const baseEnv = {
    ...process.env,
    NODE_ENV: 'production',
    SESSION_SECRET: 'test-only-production-session-secret-123456789',
    SMS_PROVIDER: 'semaphore',
    SEMAPHORE_API_KEY: 'test-only',
    HOST: '0.0.0.0',
    PORT: '8080'
  };
  const missingCors = spawnSync(process.execPath, ['-e', "require('./server/config')"], {
    cwd: root,
    env: { ...baseEnv, CORS_ORIGINS: '' },
    encoding: 'utf8'
  });
  assert.notEqual(missingCors.status, 0);
  assert.match(`${missingCors.stderr}${missingCors.stdout}`, /CORS_ORIGINS must list the exact public web origin/);

  const configured = spawnSync(process.execPath, ['-e', "const c=require('./server/config'); console.log(c.host,c.port,c.corsOrigins[0])"], {
    cwd: root,
    env: { ...baseEnv, CORS_ORIGINS: 'https://app.example.test' },
    encoding: 'utf8'
  });
  assert.equal(configured.status, 0, configured.stderr);
  assert.match(configured.stdout, /0\.0\.0\.0 8080 https:\/\/app\.example\.test/);
});

test('public health and production errors disclose no session or infrastructure details', () => {
  const server = read('server/server.js');
  const health = server.slice(server.indexOf("app.get('/health'"), server.indexOf('// Legacy client status route'));
  assert.match(health, /Cache-Control', 'no-store'/);
  assert.match(health, /success: true/);
  assert.match(health, /status: 'healthy'/);
  assert.doesNotMatch(health, /firebaseAdmin|authenticated|session|user|uptime/);
  assert.match(server, /isProduction \? 'Internal Server Error'/);
  assert.match(server, /app\.listen\(port, host/);
});
