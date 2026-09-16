'use strict';

const crypto = require('crypto');
const { sessionSecret } = require('../config');

function signPayload(payloadB64) {
  return crypto.createHmac('sha256', sessionSecret).update(payloadB64).digest('hex');
}

function issueToken(user, roleKey) {
  const now = Date.now();
  const expiresAt = now + 7 * 24 * 60 * 60 * 1000;
  const payload = {
    uid: user.employeeId,
    role: roleKey,
    name: user.name,
    employeeId: user.employeeId,
    contact: user.contact || '',
    roleKey,
    blockFarmId: user.blockFarmId || '',
    fieldId: user.fieldId || '',
    phoneVerified: user.phoneVerified === true,
    pendingFirstLoginVerification: user.pendingFirstLoginVerification === true,
    requiresPasswordChange: user.requiresPasswordChange === true,
    passwordChanged: user.passwordChanged === true,
    issuedAt: now,
    expiresAt
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64');
  return `HUGPONG.${payloadB64}.${signPayload(payloadB64)}`;
}

function verifyToken(rawToken) {
  if (typeof rawToken !== 'string') return null;
  const parts = rawToken.split('.');
  if (parts.length !== 3 || parts[0] !== 'HUGPONG') return null;

  const expected = Buffer.from(signPayload(parts[1]), 'hex');
  const supplied = Buffer.from(parts[2], 'hex');
  if (expected.length !== supplied.length || !crypto.timingSafeEqual(expected, supplied)) return null;

  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
    if (!payload.uid || !payload.role || !payload.expiresAt || Date.now() >= payload.expiresAt) return null;
    return payload;
  } catch (error) {
    return null;
  }
}

module.exports = { issueToken, verifyToken };
