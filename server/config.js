'use strict';

const sessionSecret = process.env.SESSION_SECRET;

if (!sessionSecret || sessionSecret.length < 32) {
  throw new Error('SESSION_SECRET must be set to a random value of at least 32 characters.');
}

module.exports = {
  sessionSecret,
  semaphoreApiKey: process.env.SEMAPHORE_API_KEY || '',
  semaphoreSenderName: process.env.SEMAPHORE_SENDER_NAME || 'SEMAPHORE',
  corsOrigins: String(process.env.CORS_ORIGINS || 'http://localhost:3000,http://127.0.0.1:3000')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean),
  isProduction: process.env.NODE_ENV === 'production'
};
