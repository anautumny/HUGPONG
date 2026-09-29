'use strict';

const crypto = require('crypto');
const { sessionSecret } = require('../config');

const STAFF_VERIFICATION_TOKEN_TTL_MS = 60 * 60 * 1000;

function encode(value) {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function signatureFor(payload) {
  return crypto.createHmac('sha256', sessionSecret).update(payload).digest('base64url');
}

function createStaffVerificationToken(phone, now = Date.now()) {
  const normalizedPhone = String(phone || '').replace(/\D/g, '');
  if (!/^09\d{9}$/.test(normalizedPhone)) throw new Error('A valid Philippine mobile number is required.');
  const expiresAt = now + STAFF_VERIFICATION_TOKEN_TTL_MS;
  const payload = encode({
    version: 1,
    purpose: 'registration-staff-verification',
    phone: normalizedPhone,
    issuedAt: now,
    expiresAt,
    nonce: crypto.randomBytes(16).toString('hex')
  });
  return {
    token: `${payload}.${signatureFor(payload)}`,
    expiresAt: new Date(expiresAt).toISOString()
  };
}

function verifyStaffVerificationToken(token, phone, now = Date.now()) {
  const normalizedPhone = String(phone || '').replace(/\D/g, '');
  const [payload, suppliedSignature, ...extra] = String(token || '').split('.');
  if (!payload || !suppliedSignature || extra.length) return false;
  const expectedSignature = signatureFor(payload);
  const supplied = Buffer.from(suppliedSignature);
  const expected = Buffer.from(expectedSignature);
  if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) return false;
  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return decoded.version === 1
      && decoded.purpose === 'registration-staff-verification'
      && decoded.phone === normalizedPhone
      && Number.isFinite(decoded.expiresAt)
      && decoded.expiresAt >= now;
  } catch (_) {
    return false;
  }
}

module.exports = {
  STAFF_VERIFICATION_TOKEN_TTL_MS,
  createStaffVerificationToken,
  verifyStaffVerificationToken
};
