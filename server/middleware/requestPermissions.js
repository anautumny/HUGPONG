'use strict';

const { ROLES, canonicalRole } = require('../schema/firestoreSchema');

const ALL_ROLES = Object.freeze(Object.values(ROLES));
const AGRICULTURAL_ROLES = Object.freeze([ROLES.MEMBER_FARMER, ROLES.FARM_MANAGER]);
const OPERATIONAL_READ_ROLES = Object.freeze([...AGRICULTURAL_ROLES, ROLES.SRA_ADMIN]);

const API_PERMISSION_POLICIES = Object.freeze([
  { methods: ['GET'], path: /^\/api\/data$/, roles: ALL_ROLES },
  { methods: ['GET'], path: /^\/api\/prices$/, roles: OPERATIONAL_READ_ROLES },
  { methods: ['POST'], path: /^\/api\/prices$/, roles: [ROLES.SRA_ADMIN] },
  { methods: ['GET'], path: /^\/api\/users$/, roles: [ROLES.FARM_MANAGER, ROLES.SRA_ADMIN, ROLES.SUPER_ADMIN] },
  { methods: ['POST'], path: /^\/api\/users\/approve$/, roles: [ROLES.FARM_MANAGER, ROLES.SRA_ADMIN, ROLES.SUPER_ADMIN] },
  { methods: ['PATCH'], path: /^\/api\/users\/[^/]+$/, roles: [ROLES.FARM_MANAGER, ROLES.SRA_ADMIN, ROLES.SUPER_ADMIN] },
  { methods: ['GET'], path: /^\/api\/block-farms$/, roles: OPERATIONAL_READ_ROLES },
  { methods: ['POST'], path: /^\/api\/block-farms$/, roles: [ROLES.SRA_ADMIN] },
  { methods: ['PUT'], path: /^\/api\/block-farms\/[^/]+$/, roles: [ROLES.SRA_ADMIN] },
  { methods: ['GET'], path: /^\/api\/fields$/, roles: OPERATIONAL_READ_ROLES },
  { methods: ['POST'], path: /^\/api\/fields$/, roles: [ROLES.FARM_MANAGER] },
  { methods: ['PATCH'], path: /^\/api\/fields\/[^/]+$/, roles: [ROLES.FARM_MANAGER] },
  { methods: ['POST'], path: /^\/api\/fields\/[^/]+\/archive$/, roles: [ROLES.FARM_MANAGER] },
  { methods: ['PUT'], path: /^\/api\/fields\/[^/]+\/(?:custom-operations|operation-schedule)$/, roles: AGRICULTURAL_ROLES },
  { methods: ['PUT'], path: /^\/api\/fields\/[^/]+\/custom-stages$/, roles: [ROLES.FARM_MANAGER] },
  { methods: ['GET'], path: /^\/api\/logs(?:\/archive)?$/, roles: OPERATIONAL_READ_ROLES },
  { methods: ['POST'], path: /^\/api\/logs$/, roles: AGRICULTURAL_ROLES },
  { methods: ['PATCH'], path: /^\/api\/logs\/[^/]+$/, roles: AGRICULTURAL_ROLES },
  { methods: ['POST'], path: /^\/api\/logs\/archive$/, roles: AGRICULTURAL_ROLES },
  { methods: ['GET'], path: /^\/api\/crop-cycles$/, roles: OPERATIONAL_READ_ROLES },
  { methods: ['PATCH'], path: /^\/api\/crop-cycles\/[^/]+\/stage$/, roles: AGRICULTURAL_ROLES },
  { methods: ['POST'], path: /^\/api\/crop-cycles\/[^/]+\/(?:start|rollover)$/, roles: AGRICULTURAL_ROLES },
  { methods: ['GET'], path: /^\/api\/audit-reports$/, roles: [ROLES.FARM_MANAGER, ROLES.SRA_ADMIN] },
  { methods: ['GET'], path: /^\/api\/audit-reports\/next-period$/, roles: [ROLES.FARM_MANAGER] },
  { methods: ['GET'], path: /^\/api\/audit-reports\/[^/]+$/, roles: [ROLES.FARM_MANAGER, ROLES.SRA_ADMIN] },
  { methods: ['POST'], path: /^\/api\/audit-reports$/, roles: [ROLES.FARM_MANAGER] },
  { methods: ['POST'], path: /^\/api\/audit-reports\/qr\/(?:verify|import)$/, roles: [ROLES.SRA_ADMIN] },
  { methods: ['POST'], path: /^\/api\/audit-reports\/[^/]+\/submit$/, roles: [ROLES.FARM_MANAGER] },
  { methods: ['POST'], path: /^\/api\/audit-reports\/[^/]+\/(?:return|certify)$/, roles: [ROLES.SRA_ADMIN] },
  { methods: ['GET'], path: /^\/api\/tickets(?:\/[^/]+)?$/, roles: ALL_ROLES },
  { methods: ['POST'], path: /^\/api\/tickets$/, roles: OPERATIONAL_READ_ROLES },
  { methods: ['POST'], path: /^\/api\/tickets\/[^/]+\/messages$/, roles: ALL_ROLES },
  { methods: ['PATCH'], path: /^\/api\/tickets\/[^/]+$/, roles: [ROLES.SUPER_ADMIN] },
  { methods: ['POST'], path: /^\/api\/sms\/send-alert$/, roles: [ROLES.SUPER_ADMIN] },
  { methods: ['GET'], path: /^\/api\/sms\/status$/, roles: [ROLES.SUPER_ADMIN] },
  { methods: ['GET'], path: /^\/api\/audit-events$/, roles: [ROLES.FARM_MANAGER, ROLES.SRA_ADMIN, ROLES.SUPER_ADMIN] },
  { methods: ['POST'], path: /^\/api\/audit-events$/, roles: ALL_ROLES },
  { methods: ['GET'], path: /^\/api\/terminal-diagnostics$/, roles: [ROLES.MEMBER_FARMER, ROLES.FARM_MANAGER, ROLES.SUPER_ADMIN] },
  { methods: ['POST'], path: /^\/api\/terminal-diagnostics\/activity$/, roles: ALL_ROLES },
  { methods: ['POST'], path: /^\/api\/terminal-diagnostics\/sync$/, roles: AGRICULTURAL_ROLES },
  { methods: ['PUT'], path: /^\/api\/terminal-diagnostics\/[^/]+$/, roles: AGRICULTURAL_ROLES },
  { methods: ['GET'], path: /^\/api\/system-diagnostics$/, roles: [ROLES.SUPER_ADMIN] },
  { methods: ['GET'], path: /^\/api\/diagnostics$/, roles: [ROLES.SUPER_ADMIN] },
  { methods: ['POST'], path: /^\/api\/diagnostics\/client$/, roles: ALL_ROLES },
  { methods: ['GET'], path: /^\/api\/backups$/, roles: [ROLES.SUPER_ADMIN] },
  { methods: ['POST'], path: /^\/api\/backups\/(?:export|validate|restore-missing)$/, roles: [ROLES.SUPER_ADMIN] }
]);

function canonicalRequestPath(value) {
  const pathname = String(value || '').split(/[?#]/, 1)[0].replace(/\/{2,}/g, '/');
  if (pathname.length > 1 && pathname.endsWith('/')) return pathname.slice(0, -1);
  return pathname;
}

function allowedRolesForRequest(method, requestPath) {
  const suppliedMethod = String(method || '').trim().toUpperCase();
  const normalizedMethod = suppliedMethod === 'HEAD' ? 'GET' : suppliedMethod;
  const normalizedPath = canonicalRequestPath(requestPath);
  const policy = API_PERMISSION_POLICIES.find(candidate => (
    candidate.methods.includes(normalizedMethod) && candidate.path.test(normalizedPath)
  ));
  return policy ? [...policy.roles] : null;
}

function requireAccountReady(req, res, next) {
  const user = req.authUser || req.session?.user;
  if (!user) {
    return res.status(401).json({ success: false, error: 'Authentication is required.', code: 'UNAUTHENTICATED' });
  }
  if (user.phoneVerified !== true || user.requiresPasswordChange === true) {
    return res.status(403).json({
      success: false,
      error: 'Complete account verification and password setup before accessing application data.',
      code: 'ACCOUNT_SETUP_REQUIRED'
    });
  }
  return next();
}

function requireApiPermission(req, res, next) {
  const requestPath = canonicalRequestPath(req.originalUrl || req.url || req.path);
  const roles = allowedRolesForRequest(req.method, requestPath);
  if (!roles) {
    return res.status(403).json({
      success: false,
      error: 'This API request has no approved permission policy.',
      code: 'API_PERMISSION_POLICY_MISSING'
    });
  }
  const role = canonicalRole(req.authUser?.canonicalRole || req.session?.user?.canonicalRole || req.session?.user?.role);
  if (!role || !roles.includes(role)) {
    return res.status(403).json({ success: false, error: 'You do not have permission to perform this request.', code: 'FORBIDDEN' });
  }
  req.permission = Object.freeze({ method: String(req.method).toUpperCase(), path: requestPath, role });
  return next();
}

module.exports = {
  API_PERMISSION_POLICIES,
  allowedRolesForRequest,
  requireAccountReady,
  requireApiPermission
};
