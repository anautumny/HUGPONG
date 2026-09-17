export const ROLE_KEYS = Object.freeze({
  SUPER_ADMIN: 'superadmin',
  SRA_ADMIN: 'admin',
  FARM_MANAGER: 'manager',
  MEMBER_FARMER: 'member'
});

const ROLE_ALIASES = Object.freeze({
  SUPERADMIN: ROLE_KEYS.SUPER_ADMIN, SUPER_ADMIN: ROLE_KEYS.SUPER_ADMIN,
  SRAADMIN: ROLE_KEYS.SRA_ADMIN, SRA_ADMIN: ROLE_KEYS.SRA_ADMIN, ADMIN: ROLE_KEYS.SRA_ADMIN,
  FARMMANAGER: ROLE_KEYS.FARM_MANAGER, FARM_MANAGER: ROLE_KEYS.FARM_MANAGER, MANAGER: ROLE_KEYS.FARM_MANAGER,
  MEMBERFARMER: ROLE_KEYS.MEMBER_FARMER, MEMBER_FARMER: ROLE_KEYS.MEMBER_FARMER, MEMBER: ROLE_KEYS.MEMBER_FARMER
});

const WORKSPACE_SLUGS = Object.freeze({
  [ROLE_KEYS.SUPER_ADMIN]: 'super-admin', [ROLE_KEYS.SRA_ADMIN]: 'sra-admin',
  [ROLE_KEYS.FARM_MANAGER]: 'farm-manager', [ROLE_KEYS.MEMBER_FARMER]: 'member'
});

const ROLE_LABELS = Object.freeze({
  [ROLE_KEYS.SUPER_ADMIN]: 'Super Admin', [ROLE_KEYS.SRA_ADMIN]: 'SRA Admin',
  [ROLE_KEYS.FARM_MANAGER]: 'Farm Manager', [ROLE_KEYS.MEMBER_FARMER]: 'Member Farmer'
});

export function normalizeRole(value) {
  return ROLE_ALIASES[String(value || '').trim().toUpperCase().replace(/[\s-]+/g, '_')] || '';
}

export function roleKeyFromUser(user, fallback = '') {
  return normalizeRole(user?.canonicalRole) || normalizeRole(user?.roleKey) || normalizeRole(user?.role) || normalizeRole(fallback);
}

export function workspaceSlug(role) {
  return WORKSPACE_SLUGS[normalizeRole(role)] || null;
}

export function workspacePath(role, section = '') {
  const slug = workspaceSlug(role);
  return slug ? `/workspace/${slug}${section ? `/${section}` : ''}` : null;
}

export function workspaceGuardDestination(role, requestedSlug) {
  return requestedSlug === workspaceSlug(role) ? null : workspacePath(role);
}

export function roleLabel(role) {
  return ROLE_LABELS[normalizeRole(role)] || 'Unknown role';
}

