// ══════════════════════════════════════════════════════════════
// HUGPONG — Role-Based Access Control Middleware
// Ensures the user has the required clearance level
// ══════════════════════════════════════════════════════════════

const { canonicalRole } = require('../schema/firestoreSchema');

function requireRole(allowedRoles = []) {
  return (req, res, next) => {
    if (!req.session || !req.session.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication Required: Session not established.',
        code: 'UNAUTHENTICATED'
      });
    }

    const userRole = canonicalRole(req.session.user.role || req.session.user.roleKey);
    const normalizedAllowed = allowedRoles.map(canonicalRole).filter(Boolean);
    const hasPermission = Boolean(userRole && normalizedAllowed.includes(userRole));

    if (hasPermission) {
      return next();
    }

    return res.status(403).json({
      success: false,
      error: `Access Denied: Required clearance [${normalizedAllowed.join(', ')}]. Current role: ${userRole || 'UNKNOWN'}`,
      code: 'FORBIDDEN'
    });
  };
}

module.exports = {
  requireRole
};
