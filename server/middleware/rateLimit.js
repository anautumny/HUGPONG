'use strict';

const crypto = require('crypto');
const { db } = require('../firebase-admin');
const { COLLECTIONS } = require('../schema/firestoreSchema');

function clientAddress(req) {
  return String(req.ip || req.socket?.remoteAddress || 'unknown').trim().slice(0, 120);
}

function identifier(req) {
  return String(
    req.body?.contactNumber
    || req.body?.identifier
    || req.body?.phone
    || req.session?.user?.employeeId
    || ''
  ).trim().toLowerCase().slice(0, 160);
}

function createRateLimit({ name, max, windowMs, key = req => `${clientAddress(req)}:${identifier(req)}` }) {
  if (!name || !Number.isInteger(max) || max < 1 || !Number.isFinite(windowMs) || windowMs < 1000) {
    throw new Error('A valid persistent rate-limit configuration is required.');
  }

  return async function persistentRateLimit(req, res, next) {
    if (!db) {
      return res.status(503).json({ success: false, error: 'Security controls are temporarily unavailable.', code: 'RATE_LIMIT_UNAVAILABLE' });
    }
    const digest = crypto.createHash('sha256').update(`${name}:${key(req)}`).digest('hex');
    const ref = db.collection(COLLECTIONS.SECURITY_RATE_LIMITS).doc(`${name}-${digest}`);
    const now = Date.now();
    try {
      const state = await db.runTransaction(async transaction => {
        const snapshot = await transaction.get(ref);
        const current = snapshot.exists ? snapshot.data() : {};
        const activeWindow = Number(current.windowEndsAtMs || 0) > now;
        const count = activeWindow ? Number(current.count || 0) + 1 : 1;
        const windowEndsAtMs = activeWindow ? Number(current.windowEndsAtMs) : now + windowMs;
        transaction.set(ref, {
          limiter: name,
          count,
          windowEndsAtMs,
          updatedAt: new Date(now).toISOString()
        });
        return { count, windowEndsAtMs };
      });
      res.set('RateLimit-Limit', String(max));
      res.set('RateLimit-Remaining', String(Math.max(0, max - state.count)));
      res.set('RateLimit-Reset', String(Math.ceil(state.windowEndsAtMs / 1000)));
      if (state.count > max) {
        res.set('Retry-After', String(Math.max(1, Math.ceil((state.windowEndsAtMs - now) / 1000))));
        return res.status(429).json({
          success: false,
          error: 'Too many attempts. Please wait before trying again.',
          code: 'RATE_LIMITED'
        });
      }
      return next();
    } catch (error) {
      console.error(`[HUGPONG Rate Limit] ${name} failed:`, error);
      return res.status(503).json({ success: false, error: 'Security controls are temporarily unavailable.', code: 'RATE_LIMIT_UNAVAILABLE' });
    }
  };
}

module.exports = { createRateLimit, clientAddress, identifier };
