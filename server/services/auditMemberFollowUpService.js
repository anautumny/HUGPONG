'use strict';

const { COLLECTIONS, ROLES, canonicalRole } = require('../schema/firestoreSchema');
const { readAccountActivities } = require('./telemetryService');

// The caller first authorizes the Block Farm. Every directory/telemetry read is
// limited to that farm's affiliation records and current active-field owners.
async function auditMemberFollowUps(db, { blockFarmId, activeFields, operationSnapshots }, now = Date.now()) {
  activeFields = activeFields.filter(field => String(field.status || 'ACTIVE').toUpperCase() === 'ACTIVE' && (!field.blockFarmId || field.blockFarmId === blockFarmId));
  const ownerIds = [...new Set(activeFields.map(field => field.memberUserId).filter(Boolean))];
  const [affiliated, owners] = await Promise.all([
    db.collection(COLLECTIONS.USERS).where('affiliatedBlockFarmId', '==', blockFarmId).get(),
    ownerIds.length ? (typeof db.getAll === 'function'
      ? db.getAll(...ownerIds.map(id => db.collection(COLLECTIONS.USERS).doc(id)))
      : Promise.all(ownerIds.map(id => db.collection(COLLECTIONS.USERS).doc(id).get()))) : [],
  ]);
  const members = new Map(affiliated.docs
    .filter(document => canonicalRole(document.data().role) === ROLES.MEMBER_FARMER
      && String(document.data().status || 'ACTIVE').toUpperCase() === 'ACTIVE')
    .map(document => [document.id, { ...document.data(), id: document.id }]));
  owners.forEach(document => {
    if (document.exists) members.set(document.id, { ...document.data(), id: document.id });
  });
  ownerIds.forEach(id => {
    if (!members.has(id)) members.set(id, { id, displayName: 'Member name unavailable' });
  });
  let activities = new Map();
  let activityAvailable = true;
  try {
    activities = await readAccountActivities(db, [...members.values()], now);
  } catch {
    activityAvailable = false;
  }
  const submittedFieldIds = new Set(operationSnapshots.map(operation => operation.fieldId));
  const followUps = [...members.values()].map(member => {
    const memberFields = activeFields.filter(field => field.memberUserId === member.id);
    const hasMonthlyOperations = memberFields.some(field => submittedFieldIds.has(field.id));
    const activity = activities.get(member.id) || null;
    const activityWarning = activity && ['NEEDS_ATTENTION', 'CRITICAL'].includes(activity.attentionStatus);
    return {
      memberId: member.id,
      memberName: member.displayName || member.name || member.id,
      contactNumber: String(member.phone || member.contact || member.contactNumber || '').trim() || null,
      fieldIds: memberFields.map(field => field.id).sort(),
      hasMonthlyOperations,
      activity,
      activityNote: !activity ? 'Account activity is temporarily unavailable.'
        : activity.inactiveDays == null ? 'No account activity date has been reported.'
          : activity.basedOn === 'ACCOUNT_CREATED'
            ? `No account activity reported since registration (${activity.inactiveDays} days).`
            : `${activity.inactiveDays} days since the last recorded account activity.`,
      reasonCodes: [!hasMonthlyOperations && 'NO_MONTHLY_OPERATIONS', activityWarning
        && (activity.inactiveDays == null ? 'ACCOUNT_ACTIVITY_NOT_REPORTED' : 'ACCOUNT_INACTIVITY')].filter(Boolean),
    };
  }).filter(member => member.reasonCodes.length > 0).sort((left, right) => {
    const priority = { CRITICAL: 0, NEEDS_ATTENTION: 1 };
    return (priority[left.activity?.attentionStatus] ?? 2) - (priority[right.activity?.attentionStatus] ?? 2)
      || Number(left.hasMonthlyOperations) - Number(right.hasMonthlyOperations)
      || left.memberName.localeCompare(right.memberName);
  });
  return { memberFollowUps: followUps, activityAvailable };
}

module.exports = { auditMemberFollowUps };
