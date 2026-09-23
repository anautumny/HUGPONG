'use strict';

const crypto = require('crypto');
const { sessionSecret } = require('../config');

const TAKEOVER_GRANT_TTL_MS = 5 * 60 * 1000;
const TAKEOVER_GRANT_PURPOSE = 'MANAGER_TAKEOVER';

function sign(encodedPayload) {
  return crypto.createHmac('sha256', sessionSecret)
    .update(`takeover:${encodedPayload}`)
    .digest('hex');
}

function issueTakeoverGrant({ actorId, fieldId }, now = Date.now()) {
  const payload = {
    actorId: String(actorId || '').trim(),
    fieldId: String(fieldId || '').trim().toUpperCase(),
    purpose: TAKEOVER_GRANT_PURPOSE,
    issuedAt: now,
    expiresAt: now + TAKEOVER_GRANT_TTL_MS
  };
  if (!payload.actorId || !payload.fieldId) throw new Error('A manager and field are required for takeover authorization.');
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `HUGPONG_TAKEOVER.${encoded}.${sign(encoded)}`;
}

function verifyTakeoverGrant(rawGrant, { actorId, fieldId, now = Date.now() } = {}) {
  if (typeof rawGrant !== 'string') return null;
  const parts = rawGrant.split('.');
  if (parts.length !== 3 || parts[0] !== 'HUGPONG_TAKEOVER') return null;
  const expected = Buffer.from(sign(parts[1]), 'hex');
  const supplied = Buffer.from(parts[2], 'hex');
  if (expected.length !== supplied.length || !crypto.timingSafeEqual(expected, supplied)) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    if (
      payload.purpose !== TAKEOVER_GRANT_PURPOSE ||
      !payload.actorId || !payload.fieldId ||
      !Number.isFinite(payload.issuedAt) || !Number.isFinite(payload.expiresAt) ||
      payload.expiresAt <= now || payload.issuedAt > now ||
      payload.expiresAt - payload.issuedAt !== TAKEOVER_GRANT_TTL_MS
    ) return null;
    if (actorId && payload.actorId !== String(actorId).trim()) return null;
    if (fieldId && payload.fieldId !== String(fieldId).trim().toUpperCase()) return null;
    return payload;
  } catch (error) {
    return null;
  }
}

module.exports = {
  TAKEOVER_GRANT_TTL_MS,
  TAKEOVER_GRANT_PURPOSE,
  issueTakeoverGrant,
  verifyTakeoverGrant
};
