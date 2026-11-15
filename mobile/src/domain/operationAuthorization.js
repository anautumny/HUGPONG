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


// Presentation-only memory for server-issued, field-scoped grants. Selecting
// another field never rewrites the original grant's actor, field or expiry.
export function fieldTakeoverSession(sessions, user, fieldId, now = Date.now()) {
  const key = String(fieldId || '').trim().toUpperCase();
  const session = sessions?.[key];
  return Boolean(normalizeActorId(user)) && normalizeRole(user) === 'FARM_MANAGER'
    && String(session?.authVersion ?? '') === String(user?.authVersion ?? '')
    && isValidTakeoverSession(session, user, key, now) ? session : null;
}

export function rememberFieldTakeover(sessions, user, fieldId, grant, expiresAt, now = Date.now()) {
  const key = String(fieldId || '').trim().toUpperCase();
  const session = { managerId: normalizeActorId(user), fieldId: key, grant, expiresAt: Number(expiresAt), authVersion: user?.authVersion ?? '' };
  if (!key || typeof grant !== 'string' || !grant.trim() || !fieldTakeoverSession({ [key]: session }, user, key, now)) {
    throw new Error('Manager Takeover authorization is invalid or expired. Please authorize this field again.');
  }
  return { ...pruneFieldTakeovers(sessions, user, now), [key]: session };
}

export function forgetFieldTakeover(sessions, fieldId) {
  const key = String(fieldId || '').trim().toUpperCase();
  if (!Object.prototype.hasOwnProperty.call(sessions, key)) return sessions;
  const next = { ...sessions };
  delete next[key];
  return next;
}

export function pruneFieldTakeovers(sessions, user, now = Date.now()) {
  const entries = Object.entries(sessions || {});
  const valid = entries.filter(([key]) => fieldTakeoverSession(sessions, user, key, now));
  return valid.length === entries.length ? sessions : Object.fromEntries(valid);
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
    canPlan: directOwner,
    requiresTakeover: manager && !ownField && !takeover,
    submissionSource: manager ? (ownField ? 'FIELD_OWNER' : (takeover ? 'MANAGER_TAKEOVER' : '')) : (directOwner ? 'MEMBER' : '')
  };
}
