/**
 * ══════════════════════════════════════════════════════════════
 * HUGPONG — Canonical Role Routing & Normalization Utilities
 * Preserves exact Stage 7 role mapping rules and aliases.
 * ══════════════════════════════════════════════════════════════
 */

export const ROLE_KEYS = Object.freeze({
  SUPER_ADMIN: 'superadmin',
  SRA_ADMIN: 'admin',
  FARM_MANAGER: 'manager',
  MEMBER_FARMER: 'member'
});

export const ROLE_ALIASES = Object.freeze({
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
  FARMMEMBER: ROLE_KEYS.MEMBER_FARMER,
  FARM_MEMBER: ROLE_KEYS.MEMBER_FARMER,
  MEMBER: ROLE_KEYS.MEMBER_FARMER
});

export const ROLE_LABELS = Object.freeze({
  [ROLE_KEYS.SUPER_ADMIN]: 'Super Admin',
  [ROLE_KEYS.SRA_ADMIN]: 'SRA Admin',
  [ROLE_KEYS.FARM_MANAGER]: 'Farm Manager',
  [ROLE_KEYS.MEMBER_FARMER]: 'Farm Member'
});

export const DASHBOARD_PATHS = Object.freeze({
  [ROLE_KEYS.SUPER_ADMIN]: '/dashboard',
  [ROLE_KEYS.SRA_ADMIN]: '/dashboard',
  [ROLE_KEYS.FARM_MANAGER]: '/dashboard',
  // Farm Member is mobile-only in the approved Stage 7 baseline.
  [ROLE_KEYS.MEMBER_FARMER]: null
});

export function normalizeRole(value) {
  const alias = String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');
  return ROLE_ALIASES[alias] || '';
}

export function roleKeyFromUser(user, fallback = '') {
  return normalizeRole(user?.canonicalRole)
    || normalizeRole(user?.roleKey)
    || normalizeRole(user?.role)
    || normalizeRole(fallback);
}

export function roleLabelFromKey(roleKey) {
  const normalized = normalizeRole(roleKey);
  return ROLE_LABELS[normalized] || 'User';
}

export function dashboardPath(value) {
  const roleKey = normalizeRole(value);
  return Object.prototype.hasOwnProperty.call(DASHBOARD_PATHS, roleKey)
    ? DASHBOARD_PATHS[roleKey]
    : null;
}
