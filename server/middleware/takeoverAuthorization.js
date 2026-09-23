'use strict';

const { ROLES, canonicalRole } = require('../schema/firestoreSchema');
const { verifyTakeoverGrant } = require('../security/takeoverGrant');

function attachTakeoverAuthorization(req, res, next) {
  const user = req.session?.user;
  if (canonicalRole(user?.role || user?.roleKey) !== ROLES.FARM_MANAGER) return next();
  const rawGrant = req.headers['x-hugpong-takeover-grant'];
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
