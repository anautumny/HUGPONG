const pad = value => String(value).padStart(2, '0');

export function localDateKey(value = new Date()) {
  const date = value instanceof Date ? new Date(value) : new Date(`${value}T12:00:00`);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function addLocalDays(value, amount) {
  const date = value instanceof Date ? new Date(value) : new Date(`${value}T12:00:00`);
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + amount);
  return date;
}

export function getPlannerReminderGroups(entries = [], now = new Date()) {
  const todayKey = localDateKey(now);
  const tomorrowKey = localDateKey(addLocalDays(now, 1));
  const active = entries.filter(entry => (
    entry && /^\d{4}-\d{2}-\d{2}$/.test(String(entry.plannedDate || '')) && !entry.completedOperationLogId
  ));
  return {
    todayKey,
    tomorrowKey,
    today: active.filter(entry => entry.plannedDate === todayKey),
    tomorrow: active.filter(entry => entry.plannedDate === tomorrowKey),
    overdue: active.filter(entry => entry.plannedDate < todayKey),
    upcoming: active.filter(entry => entry.plannedDate > tomorrowKey)
  };
}

export function collectPlannerEntries(fields = []) {
  return fields.flatMap(field => (Array.isArray(field?.operationSchedule) ? field.operationSchedule : [])
    .filter(entry => !entry.cycleId || entry.cycleId === field.currentCycleId)
    .map(entry => ({ ...entry, fieldId: entry.fieldId || field.id })));
}

export function plannerReminderId(kind, entries = [], dateKey = '') {
  const planIds = entries.map(entry => entry.id || `${entry.fieldId}-${entry.plannedDate}-${entry.operationName || ''}`).sort().join('|');
  let hash = 0;
  for (let index = 0; index < planIds.length; index += 1) hash = ((hash << 5) - hash + planIds.charCodeAt(index)) | 0;
  return `notif-plan-${kind}-${dateKey}-${Math.abs(hash)}`;
}

export function plannerReminderMessage(entries = [], timing = 'today') {
  const count = entries.length;
  const fields = [...new Set(entries.map(entry => entry.fieldId).filter(Boolean))];
  const fieldText = fields.length === 1 ? ` for field ${fields[0]}` : fields.length > 1 ? ` across ${fields.length} fields` : '';
  if (timing === 'overdue') return `${count} planned activit${count === 1 ? 'y is' : 'ies are'} overdue${fieldText}. Review the schedule and update the plan.`;
  return `${count} farm activit${count === 1 ? 'y is' : 'ies are'} planned ${timing}${fieldText}. Open the Planner to review the schedule.`;
}
