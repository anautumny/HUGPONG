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

function evaluateRateLimitState(current, { now, max, windowMs, minIntervalMs = 0 }) {
  const activeWindow = Number(current?.windowEndsAtMs || 0) > now;
  const count = activeWindow ? Math.max(0, Number(current?.count || 0)) : 0;
  const windowEndsAtMs = activeWindow ? Number(current.windowEndsAtMs) : now + windowMs;
  const lastAcceptedAtMs = activeWindow ? Math.max(0, Number(current?.lastAcceptedAtMs || 0)) : 0;

  if (count >= max) {
    return {
      accepted: false,
      reason: 'WINDOW_LIMIT',
      count,
      remaining: 0,
      windowEndsAtMs,
      lastAcceptedAtMs,
      retryAfterSeconds: Math.max(1, Math.ceil((windowEndsAtMs - now) / 1000))
    };
  }

  const cooldownEndsAtMs = lastAcceptedAtMs + minIntervalMs;
  if (minIntervalMs > 0 && lastAcceptedAtMs > 0 && cooldownEndsAtMs > now) {
    return {
      accepted: false,
      reason: 'COOLDOWN',
      count,
      remaining: Math.max(0, max - count),
      windowEndsAtMs,
      lastAcceptedAtMs,
      retryAfterSeconds: Math.max(1, Math.ceil((cooldownEndsAtMs - now) / 1000))
    };
  }

  const nextCount = count + 1;
  const remaining = Math.max(0, max - nextCount);
  const acceptedWindowEndsAtMs = remaining === 0 ? now + windowMs : windowEndsAtMs;
  const nextAllowedAtMs = remaining === 0
    ? acceptedWindowEndsAtMs
    : (minIntervalMs > 0 ? now + minIntervalMs : now);
  return {
    accepted: true,
    reason: '',
    count: nextCount,
    remaining,
    windowEndsAtMs: acceptedWindowEndsAtMs,
    lastAcceptedAtMs: now,
    retryAfterSeconds: Math.max(0, Math.ceil((nextAllowedAtMs - now) / 1000))
  };
}

function publicRateLimitState(state, max) {
  return {
    limit: max,
    remaining: state.remaining,
    retryAfterSeconds: state.retryAfterSeconds,
    resendAvailableAt: new Date(Date.now() + (state.retryAfterSeconds * 1000)).toISOString(),
    windowResetsAt: new Date(state.windowEndsAtMs).toISOString()
  };
}

function rateLimitState(req, name) {
  return req.rateLimitStates?.[name] || null;
}

function createRateLimit({
  name,
  max,
  windowMs,
  minIntervalMs = 0,
  key = req => `${clientAddress(req)}:${identifier(req)}`
}) {
  if (
    !name
    || !Number.isInteger(max)
    || max < 1
    || !Number.isFinite(windowMs)
    || windowMs < 1000
    || !Number.isFinite(minIntervalMs)
    || minIntervalMs < 0
    || minIntervalMs >= windowMs
  ) {
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
        const evaluated = evaluateRateLimitState(current, { now, max, windowMs, minIntervalMs });
        if (!evaluated.accepted) return evaluated;
        transaction.set(ref, {
          limiter: name,
          count: evaluated.count,
          windowEndsAtMs: evaluated.windowEndsAtMs,
          lastAcceptedAtMs: evaluated.lastAcceptedAtMs,
          updatedAt: new Date(now).toISOString()
        });
        return evaluated;
      });
      const publicState = publicRateLimitState(state, max);
      res.set('RateLimit-Limit', String(max));
      res.set('RateLimit-Remaining', String(state.remaining));
      res.set('RateLimit-Reset', String(Math.ceil(state.windowEndsAtMs / 1000)));
      if (!state.accepted) {
        res.set('Retry-After', String(state.retryAfterSeconds));
        return res.status(429).json({
          success: false,
          error: state.reason === 'COOLDOWN'
            ? `Please wait ${state.retryAfterSeconds} seconds before requesting another verification code.`
            : `The ${max}-code hourly limit has been reached. Please wait before requesting another verification code.`,
          code: state.reason === 'COOLDOWN' ? 'RESEND_COOLDOWN' : 'HOURLY_CODE_LIMIT',
          data: publicState
        });
      }
      req.rateLimitStates = { ...(req.rateLimitStates || {}), [name]: publicState };
      return next();
    } catch (error) {
      console.error(`[HUGPONG Rate Limit] ${name} failed:`, error);
      return res.status(503).json({ success: false, error: 'Security controls are temporarily unavailable.', code: 'RATE_LIMIT_UNAVAILABLE' });
    }
  };
}

module.exports = {
  createRateLimit,
  clientAddress,
  identifier,
  rateLimitState,
  _test: { evaluateRateLimitState }
};
