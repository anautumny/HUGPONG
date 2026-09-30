import os from 'node:os';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const METRO_PORT = '8081';
const API_PORT = '3000';

function fail(message) {
  console.error(`\n[HUGPONG Hotspot] ${message}\n`);
  process.exit(1);
}

function isPrivateIpv4(address) {
  const parts = String(address || '').split('.').map(Number);
  if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  return parts[0] === 10
    || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
    || (parts[0] === 192 && parts[1] === 168);
}

function hotspotCandidates() {
  return Object.entries(os.networkInterfaces())
    .flatMap(([name, records]) => (records || []).map(record => ({ name, ...record })))
    .filter(record => record.family === 'IPv4' && !record.internal && isPrivateIpv4(record.address))
    .sort((left, right) => {
      const score = item => {
        const name = item.name.toLowerCase();
        if (/mobile hotspot|wi-?fi direct|local area connection/.test(name)) return 30;
        if (/wi-?fi|wireless/.test(name)) return 20;
        if (/ethernet/.test(name)) return 10;
        return 0;
      };
      return score(right) - score(left) || left.name.localeCompare(right.name);
    });
}

function portIsAvailable(port) {
  return new Promise(resolve => {
    const probe = net.createServer();
    probe.once('error', () => resolve(false));
    probe.once('listening', () => probe.close(() => resolve(true)));
    probe.listen(Number(port), '127.0.0.1');
  });
}

const requestedAddress = String(process.env.HUGPONG_PRESENTATION_IP || '').trim();
const candidates = hotspotCandidates();
const selected = requestedAddress
  ? candidates.find(candidate => candidate.address === requestedAddress)
  : candidates[0];

if (!selected) {
  const available = candidates.map(candidate => `${candidate.name}: ${candidate.address}`).join(', ');
  fail(requestedAddress
    ? `HUGPONG_PRESENTATION_IP=${requestedAddress} is not active. Available private addresses: ${available || 'none'}.`
    : 'No active private IPv4 hotspot connection was found. Connect the laptop and phone to the hotspot first.');
}

const apiOrigin = `http://${selected.address}:${API_PORT}`;

if (!(await portIsAvailable(METRO_PORT))) {
  fail(`Port ${METRO_PORT} is already in use. Stop the old Expo process, then run this command again so the current hotspot address is bundled.`);
}

try {
  const response = await fetch(`${apiOrigin}/health`, { signal: AbortSignal.timeout(3000) });
  if (!response.ok) fail(`The HUGPONG server returned HTTP ${response.status} through ${apiOrigin}.`);
  const body = await response.json();
  if (body?.status !== 'healthy') fail('The HUGPONG server health response is invalid.');
} catch {
  fail(`The server is not reachable through ${apiOrigin}. Start it with "cd server" then "npm start".`);
}

console.log(`\n[HUGPONG Hotspot] Using ${selected.name}: ${selected.address}`);
console.log(`[HUGPONG Hotspot] On the phone, verify ${apiOrigin}/health in a browser.`);
console.log('[HUGPONG Hotspot] Starting Expo in LAN mode with the matching API address.\n');

if (candidates.length > 1 && !requestedAddress) {
  console.log('[HUGPONG Hotspot] Other private interfaces detected:');
  candidates.slice(1).forEach(candidate => console.log(`  ${candidate.name}: ${candidate.address}`));
  console.log('[HUGPONG Hotspot] If the selected address is wrong, set HUGPONG_PRESENTATION_IP to the correct address.\n');
}

const expoCli = fileURLToPath(new URL('../node_modules/expo/bin/cli', import.meta.url));
const expo = spawn(process.execPath, [expoCli, 'start', '--lan', '--port', METRO_PORT, '--clear', '--go'], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    EXPO_PUBLIC_API_BASE_URL: apiOrigin
  },
  stdio: 'inherit',
  shell: false
});

expo.on('error', error => fail(`Expo could not start: ${error.message}`));
expo.on('exit', code => process.exit(code ?? 0));

