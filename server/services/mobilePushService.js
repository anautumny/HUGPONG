'use strict';

const { expoPushAccessToken } = require('../config');
const { COLLECTIONS } = require('../schema/firestoreSchema');

const EXPO_PUSH_ENDPOINT = 'https://exp.host/--/api/v2/push/send';
const PUSH_REQUEST_TIMEOUT_MS = 8_000;
const EXPO_PUSH_TOKEN_PATTERN = /^(?:Exponent|Expo)PushToken\[[A-Za-z0-9_-]{6,200}\]$/;

function normalizeExpoPushToken(value) {
  const token = String(value || '').trim();
  return EXPO_PUSH_TOKEN_PATTERN.test(token) ? token : null;
}

async function sendExpoPushNotification(expoPushToken, message, {
  fetchImpl = globalThis.fetch,
  accessToken = expoPushAccessToken,
  timeoutMs = PUSH_REQUEST_TIMEOUT_MS
} = {}) {
  const token = normalizeExpoPushToken(expoPushToken);
  if (!token) return { success: false, skipped: true, code: 'PUSH_TOKEN_INVALID' };
  if (typeof fetchImpl !== 'function') return { success: false, skipped: true, code: 'PUSH_TRANSPORT_UNAVAILABLE' };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  if (typeof timer.unref === 'function') timer.unref();
  try {
    const headers = {
      Accept: 'application/json',
      'Content-Type': 'application/json'
    };
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
    const response = await fetchImpl(EXPO_PUSH_ENDPOINT, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        to: token,
        title: String(message?.title || '').slice(0, 100),
        body: String(message?.body || '').slice(0, 300),
        data: message?.data && typeof message.data === 'object' ? message.data : {},
        sound: 'default',
        priority: 'high',
        channelId: 'account-recovery'
      }),
      signal: controller.signal
    });
    const payload = await response.json().catch(() => ({}));
    const ticket = Array.isArray(payload?.data) ? payload.data[0] : payload?.data;
    if (!response.ok || ticket?.status === 'error') {
      return {
        success: false,
        code: String(ticket?.details?.error || ticket?.message || `PUSH_HTTP_${response.status}`).slice(0, 100)
      };
    }
    return { success: true, ticketId: String(ticket?.id || '') || null };
  } catch (error) {
    return {
      success: false,
      code: error?.name === 'AbortError' ? 'PUSH_PROVIDER_TIMEOUT' : 'PUSH_PROVIDER_UNAVAILABLE'
    };
  } finally {
    clearTimeout(timer);
  }
}

function recoveryDecisionMessage(reviewId, status) {
  const approved = status === 'APPROVED';
  return {
    title: approved ? 'Password recovery approved' : 'Password recovery request updated',
    body: approved
      ? 'Open HUGPONG now. You have 15 minutes to create your new password.'
      : 'Your password recovery request was not approved. Contact your authorized reviewer.',
    data: {
      hugpongType: 'password-recovery-review',
      reviewId: String(reviewId || ''),
      status: approved ? 'APPROVED' : 'REJECTED'
    }
  };
}

async function deliverRecoveryDecisionNotification(database, { reviewId, expoPushToken, status }) {
  const token = normalizeExpoPushToken(expoPushToken);
  if (!database || !reviewId || !token) return { success: false, skipped: true };
  const result = await sendExpoPushNotification(token, recoveryDecisionMessage(reviewId, status));
  await database.collection(COLLECTIONS.PASSWORD_RECOVERY_REVIEWS).doc(String(reviewId)).set({
    mobilePushToken: null,
    notificationStatus: result.success ? 'SENT' : 'FAILED',
    notificationAttemptedAt: new Date().toISOString(),
    notificationTicketId: result.success ? result.ticketId : null,
    notificationErrorCode: result.success ? null : String(result.code || 'PUSH_DELIVERY_FAILED').slice(0, 100)
  }, { merge: true });
  return result;
}

module.exports = {
  EXPO_PUSH_ENDPOINT,
  normalizeExpoPushToken,
  sendExpoPushNotification,
  recoveryDecisionMessage,
  deliverRecoveryDecisionNotification
};
