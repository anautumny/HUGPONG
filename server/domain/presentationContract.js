'use strict';

const ROLE_DISPLAY_LABELS = Object.freeze({
  MEMBER_FARMER: 'Farm Member',
  FARM_MANAGER: 'Farm Manager',
  SRA_ADMIN: 'SRA Admin',
  SUPER_ADMIN: 'Super Admin'
});

const STAGE_DISPLAY_LABELS = Object.freeze({
  1: 'Land Preparation',
  2: 'Planting',
  3: 'Basal',
  4: 'Weeding',
  5: 'Top-Dress',
  6: 'Harvest'
});

const LIFECYCLE_DISPLAY_LABELS = Object.freeze({
  ACTIVE: 'Active',
  ARCHIVED: 'Archived'
});

const SYNC_DISPLAY_LABELS = Object.freeze({
  SYNCED: 'Synced',
  UNSYNCED: 'Unsynced',
  RETRYING: 'Retrying',
  FAILED: 'Failed',
  CONFLICT: 'Conflict'
});

function buildOperationPresentation(record = {}) {
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

function presentOperationRecord(record = {}) {
  return { ...record, presentation: buildOperationPresentation(record) };
}

module.exports = {
  ROLE_DISPLAY_LABELS,
  STAGE_DISPLAY_LABELS,
  LIFECYCLE_DISPLAY_LABELS,
  SYNC_DISPLAY_LABELS,
  buildOperationPresentation,
  presentOperationRecord
};
