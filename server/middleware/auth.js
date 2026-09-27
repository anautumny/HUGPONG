// ══════════════════════════════════════════════════════════════
// HUGPONG — Authentication Guard Middleware
// Ensures the request has a verified active session
// ══════════════════════════════════════════════════════════════

const { verifyToken } = require('../security/token');
const { db } = require('../firebase-admin');
const { COLLECTIONS, canonicalRole, publicRoleLabel } = require('../schema/firestoreSchema');
const { authVersionOf } = require('../security/accountSecurity');

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

    const user = {
      employeeId: userId,
      contact: account.phone || '',
      mobile: account.phone || '',
      name: account.displayName || presented.name || 'HUGPONG User',
      role: publicRoleLabel(currentRole),
      canonicalRole: currentRole,
      roleKey: presented.roleKey || currentRole,
      blockFarmId: presented.blockFarmId || '',
      fieldId: presented.fieldId || '',
      phoneVerified: Boolean(account.phoneVerifiedAt),
      pendingFirstLoginVerification: !account.phoneVerifiedAt,
      requiresPasswordChange: account.requiresPasswordChange === true,
      passwordChanged: Boolean(account.passwordChangedAt) || account.requiresPasswordChange !== true,
      authVersion: currentVersion,
      authenticatedAt: presented.authenticatedAt || new Date().toISOString()
    };
    req.authUser = user;
    if (req.session) req.session.user = user;
    return next();
  } catch (error) {
    console.error('[HUGPONG Auth] Authorization lookup failed:', error);
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
