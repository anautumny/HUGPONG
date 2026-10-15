'use strict';

process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-only-session-secret-that-is-longer-than-32-characters';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  EXPO_PUSH_ENDPOINT,
  normalizeExpoPushToken,
  sendExpoPushNotification,
  recoveryDecisionMessage,
  deliverRecoveryDecisionNotification
} = require('../services/mobilePushService');

test('recovery pushes accept only Expo tokens and contain no recovery secret', async () => {
  const token = 'ExpoPushToken[test_device_token_123]';
  assert.equal(normalizeExpoPushToken(token), token);
  assert.equal(normalizeExpoPushToken('firebase-token'), null);
  assert.equal(normalizeExpoPushToken('ExpoPushToken[bad token]'), null);

  let request = null;
  const result = await sendExpoPushNotification(token, recoveryDecisionMessage('PRR-AAAAAAAAAAAAAAAAAAAA', 'APPROVED'), {
    accessToken: 'server-only-access-token',
    fetchImpl: async (url, options) => {
      request = { url, options };
      return {
        ok: true,
        status: 200,
        async json() { return { data: { status: 'ok', id: 'ticket-1' } }; }
      };
    }
  });
  const body = JSON.parse(request.options.body);
  assert.equal(request.url, EXPO_PUSH_ENDPOINT);
  assert.equal(request.options.headers.Authorization, 'Bearer server-only-access-token');
  assert.equal(body.to, token);
  assert.equal(body.channelId, 'account-recovery');
  assert.equal(body.data.status, 'APPROVED');
  assert.equal(JSON.stringify(body).includes('claimToken'), false);
  assert.deepEqual(result, { success: true, ticketId: 'ticket-1' });
});

test('push failure never changes the recovery decision and records a safe delivery state', async () => {
  const writes = [];
  const database = {
    collection(name) {
      return {
        doc(id) {
          return {
            async set(value, options) { writes.push({ name, id, value, options }); }
          };
        }
      };
    }
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    async json() { return { data: { status: 'error', message: 'DeviceNotRegistered' } }; }
  });
  try {
    const result = await deliverRecoveryDecisionNotification(database, {
      reviewId: 'PRR-BBBBBBBBBBBBBBBBBBBB',
      expoPushToken: 'ExponentPushToken[test_device_token_456]',
      status: 'REJECTED'
    });
    assert.equal(result.success, false);
    assert.equal(writes.length, 1);
    assert.equal(writes[0].value.notificationStatus, 'FAILED');
    assert.equal(writes[0].value.notificationTicketId, null);
    assert.equal(writes[0].options.merge, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Mobile push and Web automatic refresh preserve recovery parity', () => {
  const root = path.resolve(__dirname, '..', '..');
  const mobileService = fs.readFileSync(path.join(root, 'mobile/src/services/recoveryNotificationService.js'), 'utf8');
  const mobileScreen = fs.readFileSync(path.join(root, 'mobile/src/screens/auth/ForgotPasswordScreen.js'), 'utf8');
  const mobileApp = fs.readFileSync(path.join(root, 'mobile/App.js'), 'utf8');
  const web = fs.readFileSync(path.join(root, 'web/react-app/src/components/auth/AccountRecoveryModal.jsx'), 'utf8');
  const reviewRoute = fs.readFileSync(path.join(root, 'server/routes/recoveryReviews.js'), 'utf8');

  assert.match(mobileService, /getExpoPushTokenAsync\(\{ projectId \}\)/);
  assert.match(mobileApp, /requestApplicationNotificationPermission\(\)/);
  assert.match(mobileScreen, /getRecoveryPushToken\(\)/);
  assert.doesNotMatch(mobileScreen, /getRecoveryPushToken\(\{ requestPermission: true \}\)/);
  assert.match(mobileApp, /navigate\('ForgotPassword', \{ checkRecoveryReview: true \}\)/);
  assert.match(reviewRoute, /deliverRecoveryDecisionNotification/);
  assert.match(web, /setInterval\(refreshReview, 30_000\)/);
});
