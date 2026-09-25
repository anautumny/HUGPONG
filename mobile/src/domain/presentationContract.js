export const ROLE_DISPLAY_LABELS = Object.freeze({
  MEMBER_FARMER: 'Farm Member',
  FARM_MANAGER: 'Farm Manager',
  SRA_ADMIN: 'SRA Admin',
  SUPER_ADMIN: 'Super Admin'
});

export const STAGE_DISPLAY_LABELS = Object.freeze({
  1: 'Land Preparation',
  2: 'Planting',
  3: 'Basal',
  4: 'Weeding',
  5: 'Top-Dress',
  6: 'Harvest'
});

export const LIFECYCLE_DISPLAY_LABELS = Object.freeze({ ACTIVE: 'Active', ARCHIVED: 'Archived' });
export const SYNC_DISPLAY_LABELS = Object.freeze({
  SYNCED: 'Synced', UNSYNCED: 'Unsynced', RETRYING: 'Retrying', FAILED: 'Failed', CONFLICT: 'Conflict'
});

export function buildOperationPresentation(record = {}) {
  const status = String(record.status || 'ACTIVE').trim().toUpperCase();
  const submissionSource = String(record.submissionSource || '').trim().toUpperCase();
  const isSupplemental = record.isSupplemental === true;
  const isManagerTakeover = submissionSource === 'MANAGER_TAKEOVER';
  const isFieldOwner = submissionSource === 'FIELD_OWNER';
  const isAmended = Array.isArray(record.amendments) && record.amendments.length > 0;
  const badges = [];
  if (isSupplemental) badges.push({ key: 'supplemental', dimension: 'classification', label: 'Supplemental' });
  if (isManagerTakeover) badges.push({ key: 'manager_takeover', dimension: 'provenance', label: 'Manager Takeover' });
  if (isFieldOwner) badges.push({ key: 'field_owner', dimension: 'provenance', label: 'Field Owner Entry' });
  if (isAmended) badges.push({ key: 'amended', dimension: 'history', label: 'Amended' });
  if (status === 'ARCHIVED') badges.push({ key: 'archived', dimension: 'lifecycle', label: 'Archived' });
  return {
    submissionSource,
    hasExplicitSubmissionSource: ['MEMBER', 'FIELD_OWNER', 'MANAGER_TAKEOVER'].includes(submissionSource),
    isSupplemental,
    isManagerTakeover,
    isFieldOwner,
    isAmended,
    lifecycle: ['ACTIVE', 'ARCHIVED'].includes(status) ? status : null,
    lifecycleLabel: LIFECYCLE_DISPLAY_LABELS[status] || '',
    stageLabel: STAGE_DISPLAY_LABELS[Number(record.stageNumberAtRecord || record.stageNumber)] || '',
    badges
  };
}

export function operationPresentation(record = {}) {
  const local = buildOperationPresentation(record);
  const server = record.presentation;
  if (!server || typeof server !== 'object') return local;
  return { ...local, ...server, badges: Array.isArray(server.badges) ? server.badges : local.badges };
}

export function friendlyErrorMessage(code, fallback = 'Request was rejected by the server.') {
  const normalized = String(code || '').trim().toUpperCase().replace(/[-\s]+/g, '_');
  const messages = {
    FAILED_PRECONDITION: 'System configuration is still being prepared. Please try again later.',
    CYCLE_CLOSED_CONFLICT: 'This Crop Year Cycle is closed. Refresh the field before recording another operation.',
    TAKEOVER_AUTHORIZATION_REQUIRED: 'Manager Takeover authorization expired. Verify your password again.',
    CONFLICT: 'This record changed on another device. Refresh before trying again.',
    OFFLINE: 'The server is unavailable. Check your connection and try again.'
  };
  return messages[normalized] || fallback;
}
