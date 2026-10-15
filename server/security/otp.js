'use strict';

const crypto = require('crypto');
const { sessionSecret } = require('../config');

const OTP_TTL_MS = 5 * 60 * 1000;
const RESEND_DELAY_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;
const { COLLECTIONS } = require('../schema/firestoreSchema');

function createOtpService(database) {
  function reference(purpose, subject) {
    if (!database) throw Object.assign(new Error('Verification storage is temporarily unavailable.'), { status: 503, code: 'OTP_STORAGE_UNAVAILABLE' });
    const key = crypto.createHash('sha256').update(JSON.stringify([String(purpose), String(subject).trim()])).digest('hex');
    return database.collection(COLLECTIONS.OTP_CHALLENGES).doc(key);
  }
  const digest = (code, purpose, subject, challengeId) => crypto.createHmac('sha256', sessionSecret)
    .update(JSON.stringify([purpose, String(subject).trim(), challengeId, String(code).trim()])).digest('hex');

  async function issueOtp(purpose, subject, phone, now = Date.now()) {
    const ref = reference(purpose, subject);
    const code = String(crypto.randomInt(100000, 1000000));
    const challengeId = crypto.randomBytes(16).toString('hex');
    await database.runTransaction(async transaction => {
      const snapshot = await transaction.get(ref);
      if (snapshot.exists && now - Number(snapshot.data().issuedAt) < RESEND_DELAY_MS) {
        throw Object.assign(new Error('Please wait before requesting another verification code.'), { status: 429, code: 'OTP_RATE_LIMITED' });
      }
      transaction.set(ref, { phone, purpose, challengeId, codeHash: digest(code, purpose, subject, challengeId),
        issuedAt: now, expiresAt: now + OTP_TTL_MS, attempts: 0, status: 'PENDING',
        deleteAfter: new Date(now + OTP_TTL_MS + 24 * 60 * 60 * 1000) });
    });
    return { code, challengeId, expiresAt: now + OTP_TTL_MS };
  }

  async function verify(purpose, subject, phone, code, now, consume) {
    const ref = reference(purpose, subject);
    return database.runTransaction(async transaction => {
      const snapshot = await transaction.get(ref);
      const challenge = snapshot.exists ? snapshot.data() : null;
      if (!challenge || challenge.phone !== phone || ['USED', 'REVOKED'].includes(challenge.status)) return { success: false, error: 'No matching verification request was found.' };
      if (now >= challenge.expiresAt) {
        transaction.update(ref, { status: 'EXPIRED', codeHash: null });
        return { success: false, error: 'The verification code has expired.' };
      }
      if (challenge.attempts >= MAX_ATTEMPTS || challenge.status === 'LOCKED') return { success: false, error: 'Too many incorrect verification attempts.' };
      const expected = Buffer.from(String(challenge.codeHash || ''), 'hex');
      const supplied = Buffer.from(digest(code, purpose, subject, challenge.challengeId), 'hex');
      if (expected.length !== supplied.length || !crypto.timingSafeEqual(expected, supplied)) {
        const attempts = challenge.attempts + 1;
        transaction.update(ref, { attempts, ...(attempts >= MAX_ATTEMPTS ? { status: 'LOCKED', codeHash: null } : {}) });
        return { success: false, error: 'The verification code is incorrect.' };
      }
      transaction.update(ref, { status: consume ? 'USED' : 'VERIFIED', ...(consume ? { codeHash: null } : {}) });
      return { success: true };
    });
  }

  async function consumeVerifiedOtp(purpose, subject, phone, now = Date.now()) {
    const ref = reference(purpose, subject);
    return database.runTransaction(async transaction => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists) return false;
      const challenge = snapshot.data();
      if (challenge.phone !== phone || challenge.status !== 'VERIFIED' || now >= challenge.expiresAt) return false;
      transaction.update(ref, { status: 'USED', codeHash: null });
      return true;
    });
  }

  async function discardOtp(purpose, subject, challengeId = null) {
    const ref = reference(purpose, subject);
    await database.runTransaction(async transaction => {
      const snapshot = await transaction.get(ref);
      if (snapshot.exists && (!challengeId || snapshot.data().challengeId === challengeId)) transaction.update(ref, { status: 'REVOKED', codeHash: null });
    });
  }
  return { issueOtp, verifyOtp: (purpose, subject, phone, code, now = Date.now()) => verify(purpose, subject, phone, code, now, false),
    verifyAndConsumeOtp: (purpose, subject, phone, code, now = Date.now()) => verify(purpose, subject, phone, code, now, true), consumeVerifiedOtp, discardOtp };
}

const methods = Object.fromEntries(['issueOtp', 'verifyOtp', 'verifyAndConsumeOtp', 'consumeVerifiedOtp', 'discardOtp']
  .map(name => [name, (...args) => createOtpService(require('../firebase-admin').db)[name](...args)]));
module.exports = { OTP_TTL_MS, createOtpService, ...methods };
