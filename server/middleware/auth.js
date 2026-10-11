// ══════════════════════════════════════════════════════════════
// HUGPONG — Authentication Guard Middleware
// Ensures the request has a verified active session
// ══════════════════════════════════════════════════════════════

const { verifyToken } = require('../security/token');
const { db } = require('../firebase-admin');
const { COLLECTIONS, canonicalRole, publicRoleLabel, isRoleAllowedOnPlatform } = require('../schema/firestoreSchema');
const { authVersionOf } = require('../security/accountSecurity');
const { resolveAccountAssignments } = require('../services/accountAuthorization');

// Dashboard/mobile refreshes intentionally fan out across scoped endpoints.
// A very short server-side cache prevents each endpoint in the same navigation
// burst from billing another Firestore read. All requests are still checked by
// this middleware, account mutations clear the cache immediately, and the TTL
// bounds staleness if an account is changed outside this server process.
const ACCOUNT_AUTH_CACHE_TTL_MS = 15 * 1000;
const ACCOUNT_AUTH_CACHE_MAX_ENTRIES = 1000;
const inFlightAccountReads = new Map();
const accountReadCache = new Map();
let accountCacheGeneration = 0;

function pruneAccountReadCache(now = Date.now()) {
  for (const [userId, entry] of accountReadCache) {
    if (entry.expiresAt <= now) accountReadCache.delete(userId);
  }
  while (accountReadCache.size >= ACCOUNT_AUTH_CACHE_MAX_ENTRIES) {
    accountReadCache.delete(accountReadCache.keys().next().value);
  }
}

function readAccount(userId) {
  const now = Date.now();
  const cached = accountReadCache.get(userId);
  if (cached && cached.expiresAt > now) return Promise.resolve(cached.snapshot);
  if (cached) accountReadCache.delete(userId);
  if (inFlightAccountReads.has(userId)) return inFlightAccountReads.get(userId);
  pruneAccountReadCache(now);
  const requestGeneration = accountCacheGeneration;
  const request = db.collection(COLLECTIONS.USERS).doc(userId).get()
    .then(snapshot => {
      if (requestGeneration === accountCacheGeneration) {
        accountReadCache.set(userId, {
          snapshot,
          expiresAt: Date.now() + ACCOUNT_AUTH_CACHE_TTL_MS
        });
      }
      return snapshot;
    })
    .finally(() => inFlightAccountReads.delete(userId));
  inFlightAccountReads.set(userId, request);
  return request;
}

function invalidateAuthenticatedAccounts() {
  accountCacheGeneration += 1;
  accountReadCache.clear();
}

function bearerToken(req) {
  const header = String(req.headers?.authorization || '');
  return header.startsWith('Bearer ') ? header.slice(7).trim() : '';
}

function rejectAuthentication(req, res, error, code = 'UNAUTHENTICATED') {
  if (req.session?.destroy) req.session.destroy(() => {});
  res.clearCookie?.('hugpong.sid');
  return res.status(401).json({ success: false, error, code });
}

async function requireAuth(req, res, next) {
  if (req.authorizationVerified === true && req.authUser) return next();
  const presented = req.session?.user || verifyToken(bearerToken(req));
  if (!presented) {
    return rejectAuthentication(req, res,
      'Authentication Required: Please sign in to access this resource.');
  }
  if (!db) {
    return res.status(503).json({
      success: false,
      error: 'Account authorization is temporarily unavailable.',
      code: 'AUTHORIZATION_UNAVAILABLE'
    });
  }

  const userId = String(presented.employeeId || presented.uid || '').trim();
  try {
    const snapshot = await readAccount(userId);
    if (!snapshot.exists || snapshot.data().status !== 'ACTIVE') {
      return rejectAuthentication(req, res, 'The account is no longer authorized.', 'ACCOUNT_INACTIVE');
    }
    const account = snapshot.data();
    const currentVersion = authVersionOf(account);
    const presentedVersion = Number(presented.authVersion || 1);
    const currentRole = canonicalRole(account.role);
    if (presentedVersion !== currentVersion || canonicalRole(presented.role || presented.roleKey) !== currentRole) {
      return rejectAuthentication(req, res, 'Your session was revoked. Please sign in again.', 'SESSION_REVOKED');
    }
    const requestPlatform = String(req.headers?.['x-client-platform'] || '').trim().toLowerCase();
    const sessionPlatform = String(presented.platform || '').trim().toLowerCase();
    if (!['web', 'mobile'].includes(requestPlatform)) {
      return res.status(403).json({ success: false, error: 'A recognized client platform is required.', code: 'CLIENT_PLATFORM_REQUIRED' });
    }
    if ((sessionPlatform && sessionPlatform !== requestPlatform) || !isRoleAllowedOnPlatform(currentRole, requestPlatform)) {
      return res.status(403).json({ success: false, error: 'This account is not authorized for the requested platform.', code: 'PLATFORM_FORBIDDEN' });
    }
    const assignments = await resolveAccountAssignments(db, userId, currentRole, account);

    const user = {
      employeeId: userId,
      contact: account.phone || '',
      mobile: account.phone || '',
      name: account.displayName || presented.name || 'HUGPONG User',
      role: publicRoleLabel(currentRole),
      canonicalRole: currentRole,
      roleKey: presented.roleKey || currentRole,
      blockFarmId: assignments.blockFarmId,
      fieldId: assignments.fieldId,
      phoneVerified: Boolean(account.phoneVerifiedAt),
      pendingFirstLoginVerification: !account.phoneVerifiedAt,
      phoneVerificationStatus: account.phoneVerificationStatus
        || (account.phoneVerifiedAt ? 'VERIFIED' : (account.phoneVerificationRequestedAt ? 'PENDING_VERIFICATION' : 'AWAITING_SELECTION')),
      phoneVerificationRequestedAt: account.phoneVerificationRequestedAt || null,
      phoneVerificationReviewRequestedByUser: account.phoneVerificationReviewRequestedByUser === true,
      requiresPasswordChange: account.requiresPasswordChange === true,
      passwordChanged: Boolean(account.passwordChangedAt) || account.requiresPasswordChange !== true,
      authVersion: currentVersion,
      platform: requestPlatform,
      authenticatedAt: presented.authenticatedAt || new Date().toISOString()
    };
    req.authUser = user;
    req.authorizationVerified = true;
    if (req.session) req.session.user = user;
    return next();
  } catch (error) {
    res.locals.diagnosticError = error;
    return res.status(503).json({
      success: false,
      error: 'Account authorization is temporarily unavailable.',
      code: 'AUTHORIZATION_UNAVAILABLE'
    });
  }
}

module.exports = {
  ACCOUNT_AUTH_CACHE_TTL_MS,
  requireAuth,
  bearerToken,
  invalidateAuthenticatedAccounts
};
