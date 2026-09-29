'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createSmsGateway, maskPhone, normalizeIprogPhone } = require('../services/smsGateway');

test('console SMS provider logs OTPs only to the backend logger and masks the destination', async () => {
  const entries = [];
  const gateway = createSmsGateway({
    provider: 'console',
    production: false,
    logger: { log: entry => entries.push(entry) }
  });
  const result = await gateway.send('09171234567', 'Ignored client-visible content', { otpCode: '845721', purpose: 'first-login' });
  assert.deepEqual(result, { success: true, provider: 'console' });
  assert.equal(entries.length, 1);
  assert.match(entries[0], /provider=console/);
  assert.match(entries[0], /otp=845721/);
  assert.match(entries[0], /purpose=first-login/);
  assert.doesNotMatch(entries[0], /09171234567/);
  assert.match(entries[0], /09\*+67/);
  assert.equal(maskPhone('09171234567'), '09*******67');
});

test('console SMS provider is rejected in production and configured providers have no console fallback', async () => {
  assert.throws(
    () => createSmsGateway({ provider: 'console', production: true }),
    error => error.code === 'SMS_CONSOLE_FORBIDDEN'
  );
  const semaphore = createSmsGateway({ provider: 'semaphore', production: false, apiKey: '', senderName: 'HUGPONG' });
  await assert.rejects(
    () => semaphore.send('09171234567', 'OTP'),
    error => error.code === 'SMS_NOT_CONFIGURED'
  );
  const iprog = createSmsGateway({ provider: 'iprog', production: false, iprogApiToken: '' });
  await assert.rejects(
    () => iprog.send('09171234567', 'OTP'),
    error => error.code === 'SMS_NOT_CONFIGURED'
  );
});

test('IPROG delivery uses its server-only token, international phone format, and template-safe content', async () => {
  const requests = [];
  const gateway = createSmsGateway({
    provider: 'iprog',
    production: true,
    iprogApiToken: 'test-iprog-token',
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          status: 200,
          message: 'SMS successfully queued for delivery.',
          message_id: 'message-123',
          sms_rate: 1
        })
      };
    }
  });

  const result = await gateway.send(
    '0917 123 4567',
    '[HUGPONG] Your security verification code is 845721. Valid for 5 minutes.'
  );

  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, 'https://iprogsms.com/api/v1/sms_messages');
  assert.equal(requests[0].options.method, 'POST');
  const payload = JSON.parse(requests[0].options.body);
  assert.deepEqual(payload, {
    api_token: 'test-iprog-token',
    phone_number: '639171234567',
    message: 'Your security verification code is 845721. Valid for 5 minutes.'
  });
  assert.deepEqual(result, {
    success: true,
    provider: 'iprog',
    messageId: 'message-123',
    smsRate: 1
  });
  assert.doesNotMatch(JSON.stringify(result), /test-iprog-token|845721/);
});

test('IPROG delivery rejects invalid destinations before sending and sanitizes provider errors', async () => {
  let requestCount = 0;
  const gateway = createSmsGateway({
    provider: 'iprog',
    production: true,
    iprogApiToken: 'test-iprog-token',
    fetchImpl: async () => {
      requestCount += 1;
      return {
        ok: false,
        status: 500,
        text: async () => JSON.stringify({ status: 500, message: 'Invalid api token or no load balance' })
      };
    }
  });

  await assert.rejects(
    () => gateway.send('123', 'OTP'),
    error => error.code === 'SMS_INVALID_DESTINATION'
  );
  assert.equal(requestCount, 0);

  const result = await gateway.send('639171234567', 'OTP');
  assert.deepEqual(result, {
    success: false,
    provider: 'iprog',
    status: 500,
    providerStatus: 500,
    error: 'SMS provider rejected the request.'
  });
  assert.doesNotMatch(JSON.stringify(result), /api token|load balance|test-iprog-token/i);
  assert.equal(normalizeIprogPhone('09171234567'), '639171234567');
  assert.equal(normalizeIprogPhone('+63 917 123 4567'), '639171234567');
});
