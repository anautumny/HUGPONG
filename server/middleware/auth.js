// ══════════════════════════════════════════════════════════════
// HUGPONG — Authentication Guard Middleware
// Ensures the request has a verified active session
// ══════════════════════════════════════════════════════════════

const { verifyToken } = require('../security/token');
const { db } = require('../firebase-admin');
const { COLLECTIONS, canonicalRole, publicRoleLabel, isRoleAllowedOnPlatform } = require('../schema/firestoreSchema');
const { authVersionOf } = require('../security/accountSecurity');
const { resolveAccountAssignments } = require('../services/accountAuthorization');

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
    const snapshot = await db.collection(COLLECTIONS.USERS).doc(userId).get();
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
    const assignments = await resolveAccountAssignments(db, userId, currentRole);

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
  requireAuth,
  bearerToken
};
