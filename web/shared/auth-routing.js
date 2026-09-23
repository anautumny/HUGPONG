(function attachHugpongAuthRouting(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.HugpongAuthRouting = api;
})(typeof window !== 'undefined' ? window : globalThis, function createHugpongAuthRouting() {
  'use strict';

  const ROLE_KEYS = Object.freeze({
    SUPER_ADMIN: 'superadmin',
    SRA_ADMIN: 'admin',
    FARM_MANAGER: 'manager',
    MEMBER_FARMER: 'member'
  });

  const ROLE_ALIASES = Object.freeze({
    SUPERADMIN: ROLE_KEYS.SUPER_ADMIN,
    SUPER_ADMIN: ROLE_KEYS.SUPER_ADMIN,
    SRAADMIN: ROLE_KEYS.SRA_ADMIN,
    SRA_ADMIN: ROLE_KEYS.SRA_ADMIN,
    ADMIN: ROLE_KEYS.SRA_ADMIN,
    FARMMANAGER: ROLE_KEYS.FARM_MANAGER,
    FARM_MANAGER: ROLE_KEYS.FARM_MANAGER,
    MANAGER: ROLE_KEYS.FARM_MANAGER,
    MEMBERFARMER: ROLE_KEYS.MEMBER_FARMER,
    MEMBER_FARMER: ROLE_KEYS.MEMBER_FARMER,
    MEMBER: ROLE_KEYS.MEMBER_FARMER
  });

  const DASHBOARD_PATHS = Object.freeze({
    [ROLE_KEYS.SUPER_ADMIN]: '/dashboard',
    [ROLE_KEYS.SRA_ADMIN]: '/dashboard',
    [ROLE_KEYS.FARM_MANAGER]: '/dashboard',
    // Member Farmer is mobile-only in the approved workflow.
    [ROLE_KEYS.MEMBER_FARMER]: null
  });

  function normalizeRole(value) {
    const alias = String(value || '')
      .trim()
      .toUpperCase()
      .replace(/[\s-]+/g, '_');
    return ROLE_ALIASES[alias] || '';
  }

  function roleKeyFromUser(user, fallback = '') {
    return normalizeRole(user?.canonicalRole)
      || normalizeRole(user?.roleKey)
      || normalizeRole(user?.role)
      || normalizeRole(fallback);
  }

  function dashboardPath(value) {
    const roleKey = normalizeRole(value);
    return Object.prototype.hasOwnProperty.call(DASHBOARD_PATHS, roleKey)
      ? DASHBOARD_PATHS[roleKey]
      : null;
  }

  return Object.freeze({ ROLE_KEYS, DASHBOARD_PATHS, normalizeRole, roleKeyFromUser, dashboardPath });
});
