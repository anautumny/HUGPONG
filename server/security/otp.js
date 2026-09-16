'use strict';

const crypto = require('crypto');
const { sessionSecret } = require('../config');

const OTP_TTL_MS = 5 * 60 * 1000;
const RESEND_DELAY_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;
const challenges = new Map();

function challengeKey(purpose, subject) {
  return `${purpose}:${String(subject || '').trim()}`;
}

function digest(code, purpose, subject) {
  return crypto
    .createHmac('sha256', sessionSecret)
    .update(`${purpose}:${subject}:${code}`)
    .digest('hex');
}

function issueOtp(purpose, subject, phone, now = Date.now()) {
  const key = challengeKey(purpose, subject);
  const previous = challenges.get(key);
  if (previous && now - previous.issuedAt < RESEND_DELAY_MS) {
    const error = new Error('Please wait before requesting another verification code.');
    error.code = 'OTP_RATE_LIMITED';
    throw error;
  }

  const code = String(crypto.randomInt(100000, 1000000));
  challenges.set(key, {
    phone,
    codeHash: digest(code, purpose, subject),
    issuedAt: now,
    expiresAt: now + OTP_TTL_MS,
    attempts: 0,
    verified: false
  });
  return { code, expiresAt: now + OTP_TTL_MS };
}

function verifyOtp(purpose, subject, phone, code, now = Date.now()) {
  const key = challengeKey(purpose, subject);
  const challenge = challenges.get(key);
  if (!challenge || challenge.phone !== phone) return { success: false, error: 'No matching verification request was found.' };
  if (now >= challenge.expiresAt) {
    challenges.delete(key);
    return { success: false, error: 'The verification code has expired.' };
  }
  if (challenge.attempts >= MAX_ATTEMPTS) {
    challenges.delete(key);
    return { success: false, error: 'Too many incorrect verification attempts.' };
  }

  challenge.attempts += 1;
  const expected = Buffer.from(challenge.codeHash, 'hex');
  const supplied = Buffer.from(digest(String(code || '').trim(), purpose, subject), 'hex');
  if (expected.length !== supplied.length || !crypto.timingSafeEqual(expected, supplied)) {
    return { success: false, error: 'The verification code is incorrect.' };
  }
  challenge.verified = true;
  return { success: true };
}

function consumeVerifiedOtp(purpose, subject, phone, now = Date.now()) {
  const key = challengeKey(purpose, subject);
  const challenge = challenges.get(key);
  if (!challenge || challenge.phone !== phone || !challenge.verified || now >= challenge.expiresAt) return false;
  challenges.delete(key);
  return true;
}

function verifyAndConsumeOtp(purpose, subject, phone, code, now = Date.now()) {
  const result = verifyOtp(purpose, subject, phone, code, now);
  if (!result.success) return result;
  challenges.delete(challengeKey(purpose, subject));
  return { success: true };
}

function discardOtp(purpose, subject) {
  challenges.delete(challengeKey(purpose, subject));
}

module.exports = {
  OTP_TTL_MS,
  issueOtp,
  verifyOtp,
  consumeVerifiedOtp,
  verifyAndConsumeOtp,
  discardOtp,
  _test: { challenges }
};
