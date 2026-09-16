'use strict';

const https = require('https');
const { smsProvider, isProduction, semaphoreApiKey, semaphoreSenderName } = require('../config');

function normalizePhone(number) {
  const digits = String(number || '').replace(/\D/g, '');
  return digits.startsWith('63') ? `0${digits.slice(2)}` : digits;
}

function maskPhone(number) {
  const normalized = normalizePhone(number);
  if (normalized.length <= 4) return '*'.repeat(normalized.length);
  return `${normalized.slice(0, 2)}${'*'.repeat(Math.max(0, normalized.length - 4))}${normalized.slice(-2)}`;
}

function sendSemaphoreSms(number, message, { apiKey = semaphoreApiKey, senderName = semaphoreSenderName } = {}) {
  return new Promise((resolve, reject) => {
    if (!apiKey) {
      const error = new Error('SMS gateway is not configured.');
      error.code = 'SMS_NOT_CONFIGURED';
      reject(error);
      return;
    }

    const payload = JSON.stringify({
      apikey: apiKey,
      number: normalizePhone(number),
      message,
      sendername: senderName
    });

    const request = https.request({
      hostname: 'api.semaphore.co',
      path: '/api/v4/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    }, response => {
      let responseBody = '';
      response.on('data', chunk => { responseBody += chunk; });
      response.on('end', () => {
        let parsed = responseBody;
        try { parsed = JSON.parse(responseBody); } catch (error) { /* Keep provider text. */ }
        if (response.statusCode >= 200 && response.statusCode < 300) {
          resolve({ success: true, data: parsed });
          return;
        }
        resolve({
          success: false,
          status: response.statusCode,
          error: parsed?.message || responseBody
        });
      });
    });

    request.on('error', reject);
    request.write(payload);
    request.end();
  });
}

function createSmsGateway({ provider, production, apiKey, senderName, logger = console } = {}) {
  const selectedProvider = String(provider || 'semaphore').trim().toLowerCase();
  if (!['console', 'semaphore'].includes(selectedProvider)) {
    throw new Error('SMS provider must be either "console" or "semaphore".');
  }
  if (production && selectedProvider === 'console') {
    const error = new Error('Console SMS delivery is forbidden in production.');
    error.code = 'SMS_CONSOLE_FORBIDDEN';
    throw error;
  }

  return {
    provider: selectedProvider,
    async send(number, message, metadata = {}) {
      if (selectedProvider === 'semaphore') {
        return sendSemaphoreSms(number, message, { apiKey, senderName });
      }

      const otpSuffix = metadata.otpCode
        ? ` otp=${String(metadata.otpCode)} purpose=${String(metadata.purpose || 'verification')}`
        : '';
      logger.log(`[HUGPONG DEV SMS] provider=console destination=${maskPhone(number)}${otpSuffix}`);
      return { success: true, provider: 'console' };
    }
  };
}

const gateway = createSmsGateway({
  provider: smsProvider,
  production: isProduction,
  apiKey: semaphoreApiKey,
  senderName: semaphoreSenderName
});

function sendSms(number, message, metadata = {}) {
  return gateway.send(number, message, metadata);
}

module.exports = {
  normalizePhone,
  maskPhone,
  createSmsGateway,
  sendSms,
  // Kept for server-only callers that explicitly need Semaphore. OTP routes use sendSms.
  sendSemaphoreSms
};
