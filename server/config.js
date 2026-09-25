'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Load environment variables from .env if present
const envFiles = [
  path.join(__dirname, '.env'),
  path.join(__dirname, '..', '.env')
];

for (const envFile of envFiles) {
  if (fs.existsSync(envFile)) {
    if (typeof process.loadEnvFile === 'function') {
      try {
        process.loadEnvFile(envFile);
        break;
      } catch (_) {
        // Fall back to manual parsing if process.loadEnvFile errors
      }
    }
    try {
      const raw = fs.readFileSync(envFile, 'utf8');
      raw.split(/\r?\n/).forEach(line => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx > 0) {
          const key = trimmed.slice(0, eqIdx).trim();
          let val = trimmed.slice(eqIdx + 1).trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
          }
          if (process.env[key] === undefined) {
            process.env[key] = val;
          }
        }
      });
      break;
    } catch (_) {}
  }
}

let sessionSecret = process.env.SESSION_SECRET;
const isProduction = process.env.NODE_ENV === 'production';
const smsProvider = String(process.env.SMS_PROVIDER || 'semaphore').trim().toLowerCase();
const host = String(process.env.HOST || '0.0.0.0').trim();
const port = Number(process.env.PORT || '3000');
const configuredCorsOrigins = String(process.env.CORS_ORIGINS || '').trim();

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535.');
}
if (!host) {
  throw new Error('HOST must not be empty.');
}
if (isProduction && ['localhost', '127.0.0.1', '::1'].includes(host.toLowerCase())) {
  throw new Error('HOST must bind to an externally reachable interface in production.');
}
if (isProduction && !configuredCorsOrigins) {
  throw new Error('CORS_ORIGINS must list the exact public web origin(s) in production.');
}

const corsOrigins = String(configuredCorsOrigins || 'http://localhost:3000,http://127.0.0.1:3000')
  .split(',')
  .map(value => value.trim())
  .filter(Boolean)
  .map(value => {
    let parsed;
    try {
      parsed = new URL(value);
    } catch (_) {
      throw new Error(`CORS_ORIGINS contains an invalid origin: ${value}`);
    }
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== value) {
      throw new Error(`CORS_ORIGINS must contain exact HTTP(S) origins without paths: ${value}`);
    }
    if (isProduction && parsed.protocol !== 'https:') {
      throw new Error(`CORS_ORIGINS must use HTTPS in production: ${value}`);
    }
    return parsed.origin;
  });

if (!['console', 'semaphore'].includes(smsProvider)) {
  throw new Error('SMS_PROVIDER must be either "console" or "semaphore".');
}
if (isProduction && smsProvider !== 'semaphore') {
  throw new Error('SMS_PROVIDER=console is forbidden in production. Use SMS_PROVIDER=semaphore.');
}

if (!sessionSecret || sessionSecret.length < 32) {
  if (isProduction) {
    throw new Error('SESSION_SECRET must be set to a random value of at least 32 characters in production.');
  }

  // In non-production/development, automatically generate a persistent random secret
  sessionSecret = crypto.randomBytes(32).toString('hex');
  process.env.SESSION_SECRET = sessionSecret;

  const targetEnv = path.join(__dirname, '.env');
  try {
    if (fs.existsSync(targetEnv)) {
      fs.appendFileSync(targetEnv, `\nSESSION_SECRET=${sessionSecret}\n`);
    } else {
      fs.writeFileSync(
        targetEnv,
        `# Auto-generated development environment file\nSESSION_SECRET=${sessionSecret}\nPORT=3000\nCORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000\n`
      );
    }
    console.warn('[HUGPONG Server] SESSION_SECRET was missing. Generated a 64-char development secret and saved to server/.env');
  } catch (err) {
    console.warn('[HUGPONG Server] SESSION_SECRET was missing. Generated an ephemeral in-memory development secret.');
  }
}

module.exports = {
  sessionSecret,
  smsProvider,
  semaphoreApiKey: process.env.SEMAPHORE_API_KEY || '',
  semaphoreSenderName: process.env.SEMAPHORE_SENDER_NAME || 'SEMAPHORE',
  corsOrigins,
  isProduction,
  host,
  port
};
