'use strict';

const https = require('https');
const {
  smsProvider,
  isProduction,
  semaphoreApiKey,
  semaphoreSenderName,
  iprogSmsApiToken
} = require('../config');

const IPROG_SMS_ENDPOINT = 'https://iprogsms.com/api/v1/sms_messages';
const SMS_REQUEST_TIMEOUT_MS = 10_000;

function normalizePhone(number) {
  const digits = String(number || '').replace(/\D/g, '');
  return digits.startsWith('63') ? `0${digits.slice(2)}` : digits;
}

function maskPhone(number) {
  const normalized = normalizePhone(number);
  if (normalized.length <= 4) return '*'.repeat(normalized.length);
  return `${normalized.slice(0, 2)}${'*'.repeat(Math.max(0, normalized.length - 4))}${normalized.slice(-2)}`;
}

function normalizeIprogPhone(number) {
  const digits = String(number || '').replace(/\D/g, '');
  if (/^09\d{9}$/.test(digits)) return `63${digits.slice(1)}`;
  if (/^639\d{9}$/.test(digits)) return digits;
  const error = new Error('SMS destination must be a valid Philippine mobile number.');
  error.code = 'SMS_INVALID_DESTINATION';
  throw error;
}

function iprogMessageContent(message) {
  // The approved IPROG template already prepends HUGPONG to every message.
  return String(message || '').replace(/^\[HUGPONG\]\s*/i, '');
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

async function sendIprogSms(number, message, {
  apiToken = iprogSmsApiToken,
  fetchImpl = globalThis.fetch,
  timeoutMs = SMS_REQUEST_TIMEOUT_MS
} = {}) {
  if (!apiToken) {
    const error = new Error('SMS gateway is not configured.');
    error.code = 'SMS_NOT_CONFIGURED';
    throw error;
  }
  if (typeof fetchImpl !== 'function') {
    const error = new Error('SMS provider transport is unavailable.');
    error.code = 'SMS_PROVIDER_UNAVAILABLE';
    throw error;
  }

  const phoneNumber = normalizeIprogPhone(number);
  const content = iprogMessageContent(message);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  if (typeof timer.unref === 'function') timer.unref();

  try {
    const response = await fetchImpl(IPROG_SMS_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_token: apiToken,
        phone_number: phoneNumber,
        message: content
      }),
      signal: controller.signal
    });
    const responseText = await response.text();
    let data = null;
    try {
      data = responseText ? JSON.parse(responseText) : null;
    } catch (_) {
      // Provider response details are intentionally not returned to callers.
    }
    const providerStatus = Number(data?.status);
    if (response.ok && providerStatus === 200) {
      return {
        success: true,
        provider: 'iprog',
        messageId: String(data?.message_id || ''),
        smsRate: Number.isFinite(Number(data?.sms_rate)) ? Number(data.sms_rate) : null
      };
    }
    return {
      success: false,
      provider: 'iprog',
      status: response.status,
      providerStatus: Number.isFinite(providerStatus) ? providerStatus : null,
      error: 'SMS provider rejected the request.'
    };
  } catch (error) {
    const wrapped = new Error(error?.name === 'AbortError'
      ? 'SMS provider request timed out.'
      : 'SMS provider is unavailable.');
    wrapped.code = error?.name === 'AbortError' ? 'SMS_PROVIDER_TIMEOUT' : 'SMS_PROVIDER_UNAVAILABLE';
    throw wrapped;
  } finally {
    clearTimeout(timer);
  }
}

function createSmsGateway({ provider, production, apiKey, senderName, iprogApiToken, fetchImpl, logger = console } = {}) {
  const selectedProvider = String(provider || 'semaphore').trim().toLowerCase();
  if (!['console', 'semaphore', 'iprog'].includes(selectedProvider)) {
    throw new Error('SMS provider must be "console", "semaphore", or "iprog".');
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
      if (selectedProvider === 'iprog') {
        return sendIprogSms(number, message, { apiToken: iprogApiToken, fetchImpl });
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
  senderName: semaphoreSenderName,
  iprogApiToken: iprogSmsApiToken
});

function sendSms(number, message, metadata = {}) {
  return gateway.send(number, message, metadata);
}

module.exports = {
  normalizePhone,
  normalizeIprogPhone,
  maskPhone,
  createSmsGateway,
  sendSms,
  sendIprogSms,
  // Kept for server-only callers that explicitly need Semaphore. OTP routes use sendSms.
  sendSemaphoreSms
};
