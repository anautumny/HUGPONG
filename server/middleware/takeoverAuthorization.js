'use strict';

const { ROLES, canonicalRole } = require('../schema/firestoreSchema');
const { verifyTakeoverGrant } = require('../security/takeoverGrant');

function attachTakeoverAuthorization(req, res, next) {
  const user = req.session?.user;
  if (canonicalRole(user?.role || user?.roleKey) !== ROLES.FARM_MANAGER) return next();
  const rawGrant = req.headers['x-hugpong-takeover-grant'];
  // A manager's own assigned field does not require takeover. The service layer
  // resolves field ownership and requires a grant only for another member's field.
  if (!rawGrant) return next();
  const grant = verifyTakeoverGrant(rawGrant, { actorId: user.employeeId || user.userId });
  if (!grant) {
    return res.status(403).json({
      success: false,
      code: 'TAKEOVER_AUTHORIZATION_REQUIRED',
      error: 'A recent manager password verification is required for takeover changes.'
    });
  }
  req.session.user.takeoverGrant = grant;
  return next();
}

module.exports = { attachTakeoverAuthorization };
