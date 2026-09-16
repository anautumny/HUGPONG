'use strict';

const https = require('https');
const { semaphoreApiKey, semaphoreSenderName } = require('../config');

function normalizePhone(number) {
  const digits = String(number || '').replace(/\D/g, '');
  return digits.startsWith('63') ? `0${digits.slice(2)}` : digits;
}

function sendSemaphoreSms(number, message) {
  return new Promise((resolve, reject) => {
    if (!semaphoreApiKey) {
      const error = new Error('SMS gateway is not configured.');
      error.code = 'SMS_NOT_CONFIGURED';
      reject(error);
      return;
    }

    const payload = JSON.stringify({
      apikey: semaphoreApiKey,
      number: normalizePhone(number),
      message,
      sendername: semaphoreSenderName
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

module.exports = { normalizePhone, sendSemaphoreSms };
