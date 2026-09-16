'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createSmsGateway, maskPhone } = require('../services/smsGateway');

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

test('console SMS provider is rejected in production and Semaphore has no console fallback', async () => {
  assert.throws(
    () => createSmsGateway({ provider: 'console', production: true }),
    error => error.code === 'SMS_CONSOLE_FORBIDDEN'
  );
  const semaphore = createSmsGateway({ provider: 'semaphore', production: false, apiKey: '', senderName: 'HUGPONG' });
  await assert.rejects(
    () => semaphore.send('09171234567', 'OTP'),
    error => error.code === 'SMS_NOT_CONFIGURED'
  );
});
