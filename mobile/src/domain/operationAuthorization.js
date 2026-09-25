export function normalizeActorId(user) {
  return String(user?.employeeId || user?.userId || user?.id || '').trim();
}

export function normalizeRole(user) {
  const role = String(user?.canonicalRole || user?.role || user?.roleKey || '').trim().toUpperCase().replace(/[ -]+/g, '_');
  if (role === 'MANAGER') return 'FARM_MANAGER';
  if (role === 'MEMBER' || role === 'FARMER' || role === 'FARM_MEMBER') return 'MEMBER_FARMER';
  return role;
}

export function isFieldOwner(user, field) {
  return Boolean(normalizeActorId(user)) && String(field?.memberUserId || '').trim() === normalizeActorId(user);
}

export function isValidTakeoverSession(session, user, fieldId, now = Date.now()) {
  return Boolean(
    session && session.grant &&
    session.managerId === normalizeActorId(user) &&
    String(session.fieldId || '').trim().toUpperCase() === String(fieldId || '').trim().toUpperCase() &&
    Number.isFinite(session.expiresAt) && session.expiresAt > now
  );
}

export function getOperationCapabilities(user, field, takeoverSession = null, now = Date.now()) {
  const role = normalizeRole(user);
  const ownField = isFieldOwner(user, field);
  const manager = role === 'FARM_MANAGER';
  const member = role === 'MEMBER_FARMER';
  const takeover = manager && !ownField && isValidTakeoverSession(takeoverSession, user, field?.id, now);
  const directOwner = ownField && (manager || member);
  return {
    ownField,
    takeover,
    canView: directOwner || manager,
    canCreate: directOwner || takeover,
    canEdit: directOwner || takeover,
    canSubmit: directOwner || takeover,
    canDraft: directOwner,
    requiresTakeover: manager && !ownField && !takeover,
    submissionSource: manager ? (ownField ? 'FIELD_OWNER' : (takeover ? 'MANAGER_TAKEOVER' : '')) : (directOwner ? 'MEMBER' : '')
  };
}
