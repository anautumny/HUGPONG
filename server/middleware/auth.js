// ══════════════════════════════════════════════════════════════
// HUGPONG — Authentication Guard Middleware
// Ensures the request has a verified active session
// ══════════════════════════════════════════════════════════════

const { verifyToken } = require('../security/token');

function bearerToken(req) {
  const header = String(req.headers?.authorization || '');
  return header.startsWith('Bearer ') ? header.slice(7).trim() : '';
}

function requireAuth(req, res, next) {
  if (req.session && req.session.user) {
    return next();
  }
  const verified = verifyToken(bearerToken(req));
  if (verified) {
    const user = {
      employeeId: verified.employeeId || verified.uid,
      contact: verified.contact || '',
      name: verified.name || 'HUGPONG User',
      role: verified.role,
      roleKey: verified.roleKey || verified.role,
      blockFarmId: verified.blockFarmId || '',
      fieldId: verified.fieldId || '',
      phoneVerified: verified.phoneVerified === true,
      pendingFirstLoginVerification: verified.pendingFirstLoginVerification === true,
      requiresPasswordChange: verified.requiresPasswordChange === true,
      passwordChanged: verified.passwordChanged === true
    };
    req.authUser = user;
    if (req.session) req.session.user = user;
    else req.session = { user };
    return next();
  }
  return res.status(401).json({
    success: false,
    error: 'Authentication Required: Please sign in to access this resource.',
    code: 'UNAUTHENTICATED'
  });
}

module.exports = {
  requireAuth,
  bearerToken
};
