const FRIENDLY_SYNC_REASONS = Object.freeze({
  OFFLINE: 'No connection to the server.',
  SERVER_UNAVAILABLE: 'The HUGPONG server is temporarily unavailable.',
  AUTHENTICATION_REQUIRED: 'Please sign in again before synchronizing.',
  AUTHENTICATION_RECOVERY: 'Your session could not be refreshed. Please sign in again.',
  AUTHORIZATION_FAILURE: 'Your account no longer has permission for one or more changes.',
  authorization: 'Your account does not have permission for one or more changes.',
  authentication: 'Please sign in again before synchronizing.',
  validation: 'One or more changes need correction before they can sync.',
  conflict: 'A record changed on another device and needs review.',
  rejected: 'The server rejected one or more changes.',
  server_failure: 'The HUGPONG server is temporarily unavailable.',
  retryable: 'The connection was interrupted. A retry is scheduled.',
  dependency: 'A related change must synchronize first.'
});

export function syncResultReason(result = {}) {
  if (result.reason && FRIENDLY_SYNC_REASONS[result.reason]) return FRIENDLY_SYNC_REASONS[result.reason];
  const items = Array.isArray(result.remainingItems) ? result.remainingItems : [];
  if (items.some(item => item.status === 'authorization')) return FRIENDLY_SYNC_REASONS.authorization;
  if (items.some(item => item.status === 'authentication')) return FRIENDLY_SYNC_REASONS.authentication;
  if (items.some(item => item.status === 'validation' || item.status === 'rejected')) return FRIENDLY_SYNC_REASONS.validation;
  if (items.some(item => item.status === 'conflict')) return FRIENDLY_SYNC_REASONS.conflict;
  if (items.some(item => item.status === 'server_failure')) return FRIENDLY_SYNC_REASONS.server_failure;
  if (Number(result.dependencyBlockedCount || 0) > 0) return FRIENDLY_SYNC_REASONS.dependency;
  return FRIENDLY_SYNC_REASONS.retryable;
}

export function syncResultMessage(result = {}) {
  const remaining = Number(result.remainingCount || 0);
  if (remaining === 0) {
    return `${Number(result.processedCount || 0)} queued change(s) synchronized. No changes remain.`;
  }
  return `${remaining} change${remaining === 1 ? ' is' : 's are'} still waiting to sync.\n\nReason:\n${syncResultReason(result)}\n\nYour data is saved on this device and will be retried when the issue is resolved.`;
}

export function syncItemLabel(item = {}) {
  const labels = {
    operation_log: 'New operation',
    takeover_log: 'Manager Takeover operation',
    operation_amendment: 'Operation amendment',
    operation_archive: 'Operation archive',
    stage_update: 'Crop stage update',
    audit_log: 'Audit trail event',
    system_event: 'System audit event',
    audit_report: 'Monthly audit report',
    field_upsert: 'Field update',
    field_archive: 'Field archive'
  };
  return labels[item.type] || 'Saved change';
}

export { FRIENDLY_SYNC_REASONS };
