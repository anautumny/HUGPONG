import { spawn, spawnSync } from 'node:child_process';
import net from 'node:net';
import { fileURLToPath } from 'node:url';

const API_ORIGIN = 'http://127.0.0.1:3000';
const METRO_PORT = '8081';

function fail(message) {
  console.error(`\n[HUGPONG Presentation] ${message}\n`);
  process.exit(1);
}

function runAdb(args) {
  const result = spawnSync('adb', args, { encoding: 'utf8', shell: false });
  if (result.error) fail('Android Debug Bridge (adb) is unavailable. Install Android platform tools first.');
  if (result.status !== 0) fail(result.stderr.trim() || `adb ${args.join(' ')} failed.`);
  return result.stdout;
}

function portIsAvailable(port) {
  return new Promise(resolve => {
    const probe = net.createServer();
    probe.once('error', () => resolve(false));
    probe.once('listening', () => probe.close(() => resolve(true)));
    probe.listen(Number(port), '127.0.0.1');
  });
}

const deviceLines = runAdb(['devices'])
  .split(/\r?\n/)
  .slice(1)
  .map(line => line.trim())
  .filter(Boolean);
const authorizedDevices = deviceLines.filter(line => /\tdevice$/.test(line));
const unauthorizedDevices = deviceLines.filter(line => /\tunauthorized$/.test(line));

if (unauthorizedDevices.length > 0) {
  fail('Unlock the Android phone and accept the USB debugging authorization prompt, then run this command again.');
}
if (authorizedDevices.length !== 1) {
  fail(`Connect exactly one authorized Android phone by USB. Found ${authorizedDevices.length}.`);
}

if (!(await portIsAvailable(METRO_PORT))) {
  fail(`Port ${METRO_PORT} is already in use. Stop the old Expo process, then run this command again.`);
}

try {
  const response = await fetch(`${API_ORIGIN}/health`, { signal: AbortSignal.timeout(3000) });
  if (!response.ok) fail(`The local HUGPONG server returned HTTP ${response.status}.`);
  const body = await response.json();
  if (body?.status !== 'healthy') fail('The local HUGPONG server health response is invalid.');
} catch {
  fail('The HUGPONG server is not running. Start it in another terminal with: cd server && npm start');
}

runAdb(['reverse', 'tcp:3000', 'tcp:3000']);
runAdb(['reverse', `tcp:${METRO_PORT}`, `tcp:${METRO_PORT}`]);

console.log('\n[HUGPONG Presentation] USB connection ready.');
console.log('[HUGPONG Presentation] API: phone localhost:3000 -> laptop localhost:3000');
console.log(`[HUGPONG Presentation] Expo: phone localhost:${METRO_PORT} -> laptop localhost:${METRO_PORT}`);
console.log('[HUGPONG Presentation] Keep the USB cable connected. Press A after Expo starts to open the app.\n');

const expoCli = fileURLToPath(new URL('../node_modules/expo/bin/cli', import.meta.url));
const expo = spawn(process.execPath, [expoCli, 'start', '--localhost', '--port', METRO_PORT, '--clear', '--go'], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    EXPO_PUBLIC_API_BASE_URL: API_ORIGIN
  },
  stdio: 'inherit',
  shell: false
});

expo.on('error', error => fail(`Expo could not start: ${error.message}`));
expo.on('exit', code => process.exit(code ?? 0));

