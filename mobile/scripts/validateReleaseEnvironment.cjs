'use strict';
const { isIP } = require('node:net');
const FIREBASE_KEYS = ['API_KEY', 'AUTH_DOMAIN', 'PROJECT_ID', 'STORAGE_BUCKET', 'MESSAGING_SENDER_ID', 'APP_ID'];

function assertReleaseEnvironment(environment) {
  const origin = String(environment.EXPO_PUBLIC_API_BASE_URL || '').trim().replace(/\/+$/, '');
  let parsed;
  try { parsed = new URL(origin); } catch { throw new Error('Release builds require EXPO_PUBLIC_API_BASE_URL with a public HTTPS origin.'); }
  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  const octets = host.split('.').map(Number);
  const privateHost = host === 'localhost' || /\.(localhost|local|invalid|example)$/.test(host)
    || (isIP(host) === 6 && (host === '::1' || /^(fc|fd|fe[89ab])/i.test(host)))
    || (isIP(host) === 4 && (octets[0] === 0 || octets[0] === 10 || octets[0] === 127 || (octets[0] === 169 && octets[1] === 254)
      || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) || (octets[0] === 192 && octets[1] === 168)));
  if (parsed.protocol !== 'https:' || parsed.origin !== origin || privateHost || /replace-with|your-hugpong-domain/i.test(origin)) {
    throw new Error('Release builds require a public HTTPS API origin without credentials, paths, or placeholders.');
  }
  const missing = FIREBASE_KEYS.map(key => `EXPO_PUBLIC_FIREBASE_${key}`).filter(key => !String(environment[key] || '').trim() || /replace-with/i.test(environment[key]));
  if (missing.length) throw new Error(`Release Firebase configuration is missing: ${missing.join(', ')}.`);
  return origin;
}
if (require.main === module) {
  assertReleaseEnvironment(process.env);
  process.stdout.write('Mobile release configuration verified.\n');
}
module.exports = { assertReleaseEnvironment };
