export const WEEDING_PARENT_ID = 'SRA-08';

export function canonicalScheduleChildId(value) {
  return String(value || '').trim().toUpperCase()
    .replace(/^SRA-08-([123])$/, 'SI-08-$1')
    .replace(/^SI-SRA-08-([123])$/, 'SI-08-$1');
}

export function getSchedulableOperationChoices() {
  return [{
    operationDefinitionId: 'CUSTOM',
    operationName: 'Custom Operation',
    childOperationDefinitionId: null,
    childOperationName: '',
    stageNumber: null,
    category: 'General Care',
    isCustom: true
  }];
}

export function estimatedScheduleTotal(entry) {
  return Number(entry?.estimatedLabor || 0) + Number(entry?.estimatedMaterials || 0) + Number(entry?.estimatedOther || 0);
}

export function scheduleEntryStatus(entry, today = new Date().toISOString().slice(0, 10)) {
  if (entry?.completedOperationLogId) return 'COMPLETED';
  if (String(entry?.plannedDate || '') < today) return 'OVERDUE';
  return 'UPCOMING';
}

export function scheduleEntryLabel(entry) {
  return entry?.childOperationName
    ? `${entry.operationName} — ${entry.childOperationName}`
    : entry?.operationName || 'Scheduled operation';
}
