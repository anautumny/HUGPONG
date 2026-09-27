'use strict';

const { getOperationDefinition } = require('./operationCatalogue');

const WEEDING_CHILDREN = Object.freeze(Object.fromEntries([1, 2, 3].map(round => {
  const definition = getOperationDefinition(`SRA-08-${round}`);
  return [`SI-08-${round}`, definition?.name || 'Manual Weeding'];
})));

function invalid(message, status = 400) {
  throw Object.assign(new Error(message), { status });
}

function requiredText(value, label, max = 160) {
  const normalized = String(value || '').trim();
  if (!normalized || normalized.length > max) invalid(`${label} is required and must not exceed ${max} characters.`);
  return normalized;
}

function optionalText(value, max = 500) {
  const normalized = String(value || '').trim();
  if (normalized.length > max) invalid(`Planner notes must not exceed ${max} characters.`);
  return normalized;
}

function calendarDate(value, label = 'plannedDate') {
  const normalized = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) invalid(`${label} must use YYYY-MM-DD.`);
  const parsed = new Date(`${normalized}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== normalized) invalid(`${label} is not a valid date.`);
  return normalized;
}

function estimate(value, label) {
  if (value == null || value === '') return 0;
  const normalized = Number(value);
  if (!Number.isFinite(normalized) || normalized < 0 || normalized > 100000000) invalid(`${label} must be a non-negative number.`);
  return Math.round(normalized * 100) / 100;
}

function canonicalChildId(value) {
  return String(value || '').trim().toUpperCase()
    .replace(/^SRA-08-([123])$/, 'SI-08-$1')
    .replace(/^SI-SRA-08-([123])$/, 'SI-08-$1');
}

function normalizeOperationSchedule(value, context = {}) {
  if (!Array.isArray(value)) invalid('operationSchedule must be an array.');
  if (value.length > 250) invalid('A field schedule may contain at most 250 planned operations.');

  const cycleId = requiredText(context.cycleId, 'cycleId', 120).toUpperCase();
  const actorId = requiredText(context.actorId, 'actorUserId', 80);
  const now = context.now || new Date().toISOString();
  const existingById = new Map((context.existing || []).map(entry => [String(entry.id || ''), entry]));
  const ids = new Set();

  const normalized = value.map((entry, index) => {
    const label = `operationSchedule[${index}]`;
    const id = requiredText(entry?.id, `${label}.id`, 120);
    if (ids.has(id)) invalid(`${label}.id is duplicated.`);
    ids.add(id);
    const prior = existingById.get(id);
    const priorCycleId = String(prior?.cycleId || '').toUpperCase();
    const isHistorical = Boolean(prior && priorCycleId && priorCycleId !== cycleId);
    if (prior && (isHistorical || prior.completedOperationLogId)) {
      if (JSON.stringify(entry) !== JSON.stringify(prior)) {
        invalid(isHistorical
          ? 'A planned operation from a past Crop Year Cycle cannot be changed.'
          : 'A completed planned operation cannot be changed.', 409);
      }
      return prior;
    }

    const operationDefinitionId = requiredText(entry.operationDefinitionId, `${label}.operationDefinitionId`, 120).toUpperCase();
    const isCustom = operationDefinitionId === 'CUSTOM';
    const definition = isCustom ? null : getOperationDefinition(operationDefinitionId);
    if (!isCustom && (!definition || definition.parentOperationDefinitionId)) invalid(`${label}.operationDefinitionId must reference a selectable operation.`);
    const customStageNumber = entry.stageNumber == null || entry.stageNumber === '' ? null : Number(entry.stageNumber);
    if (isCustom && customStageNumber != null && (!Number.isInteger(customStageNumber) || customStageNumber < 1 || customStageNumber > 6)) invalid(`${label}.stageNumber must be empty or a Crop Year Cycle stage from 1 to 6.`);
    const operationName = isCustom
      ? requiredText(entry.operationName, `${label}.operationName`, 300)
      : definition.name;

    const childOperationDefinitionId = canonicalChildId(entry.childOperationDefinitionId) || null;
    if (definition?.id === 'SRA-08') {
      if (!WEEDING_CHILDREN[childOperationDefinitionId]) invalid(`${label}.childOperationDefinitionId must select a Manual Weeding round.`);
    } else if (childOperationDefinitionId) {
      invalid(`${label}.childOperationDefinitionId is not valid for ${operationDefinitionId}.`);
    }

    const estimatedLabor = estimate(entry.estimatedLabor, `${label}.estimatedLabor`);
    const estimatedMaterials = estimate(entry.estimatedMaterials, `${label}.estimatedMaterials`);
    const estimatedOther = estimate(entry.estimatedOther, `${label}.estimatedOther`);
    const normalizedEntry = {
      id,
      cycleId,
      operationDefinitionId: isCustom ? 'CUSTOM' : definition.id,
      operationName,
      childOperationDefinitionId,
      childOperationName: childOperationDefinitionId ? WEEDING_CHILDREN[childOperationDefinitionId] : '',
      stageNumber: isCustom ? customStageNumber : definition.stageNumber,
      plannedDate: calendarDate(entry.plannedDate, `${label}.plannedDate`),
      estimatedLabor,
      estimatedMaterials,
      estimatedOther,
      estimatedTotal: estimatedLabor + estimatedMaterials + estimatedOther,
      notes: optionalText(entry.notes),
      createdByUserId: prior?.createdByUserId || actorId,
      createdAt: prior?.createdAt || now,
      updatedAt: now,
      completedOperationLogId: prior?.completedOperationLogId || null,
      completedAt: prior?.completedAt || null
    };
    const unchanged = prior && Object.entries(normalizedEntry)
      .every(([key, normalizedValue]) => key === 'updatedAt'
        || JSON.stringify(prior[key]) === JSON.stringify(normalizedValue));
    if (unchanged) normalizedEntry.updatedAt = prior.updatedAt || now;
    return normalizedEntry;
  });

  for (const prior of existingById.values()) {
    const priorCycleId = String(prior?.cycleId || '').toUpperCase();
    if ((prior.completedOperationLogId || (priorCycleId && priorCycleId !== cycleId)) && !ids.has(prior.id)) normalized.push(prior);
  }
  return normalized.sort((left, right) => left.plannedDate.localeCompare(right.plannedDate) || left.id.localeCompare(right.id));
}

function completeMatchingScheduleEntry(schedule, operation, operationLogId, completedAt) {
  if (!Array.isArray(schedule) || !schedule.length) return { changed: false, schedule: schedule || [] };
  const childId = canonicalChildId(operation.childOperationDefinitionId) || null;
  const candidates = schedule
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => !entry.completedOperationLogId
      && String(entry.cycleId || '').toUpperCase() === String(operation.cycleId || '').toUpperCase()
      && String(entry.operationDefinitionId || '').toUpperCase() === String(operation.operationDefinitionId || '').toUpperCase()
      && (String(entry.operationDefinitionId || '').toUpperCase() !== 'CUSTOM'
        || String(entry.operationName || '').trim().toLowerCase() === String(operation.operationName || '').trim().toLowerCase())
      && (canonicalChildId(entry.childOperationDefinitionId) || null) === childId)
    .sort((left, right) => {
      const performed = Date.parse(`${operation.performedOn}T00:00:00.000Z`);
      const leftDistance = Math.abs(Date.parse(`${left.entry.plannedDate}T00:00:00.000Z`) - performed);
      const rightDistance = Math.abs(Date.parse(`${right.entry.plannedDate}T00:00:00.000Z`) - performed);
      return leftDistance - rightDistance || left.entry.plannedDate.localeCompare(right.entry.plannedDate);
    });
  if (!candidates.length) return { changed: false, schedule };
  const targetIndex = candidates[0].index;
  return {
    changed: true,
    schedule: schedule.map((entry, index) => index === targetIndex ? {
      ...entry,
      completedOperationLogId: operationLogId,
      completedAt,
      updatedAt: completedAt
    } : entry)
  };
}

module.exports = {
  WEEDING_CHILDREN,
  canonicalChildId,
  normalizeOperationSchedule,
  completeMatchingScheduleEntry
};
