'use strict';

const { normalizeCustomOperationsPlan } = require('./operationPlan');

function invalid(message) {
  throw Object.assign(new Error(message), { status: 400 });
}

function optionalText(value, label, max) {
  const normalized = String(value || '').trim();
  if (normalized.length > max) invalid(`${label} must not exceed ${max} characters.`);
  return normalized;
}

function normalizeCustomStages(value) {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > 6) invalid('customStages must be an array with at most six stages.');
  const seen = new Set();
  return value.map((stage, index) => {
    if (!stage || typeof stage !== 'object' || Array.isArray(stage)) invalid(`customStages[${index}] must be an object.`);
    const stageNumber = Number(stage.stageNumber ?? stage.stageNum ?? index + 1);
    if (!Number.isInteger(stageNumber) || stageNumber < 1 || stageNumber > 6 || seen.has(stageNumber)) {
      invalid(`customStages[${index}].stageNumber must be a unique integer from 1 to 6.`);
    }
    seen.add(stageNumber);
    const name = optionalText(stage.name || stage.label, `customStages[${index}].name`, 300);
    if (!name) invalid(`customStages[${index}].name is required.`);
    const benchmarkCost = Number(stage.benchmarkCost || 0);
    if (!Number.isFinite(benchmarkCost) || benchmarkCost < 0 || benchmarkCost > 100000000) {
      invalid(`customStages[${index}].benchmarkCost must be between 0 and 100000000.`);
    }
    const color = optionalText(stage.color, `customStages[${index}].color`, 20);
    if (color && !/^#[0-9A-F]{6}$/i.test(color)) invalid(`customStages[${index}].color must be a six-digit hex color.`);
    const operations = normalizeCustomOperationsPlan({ [stageNumber]: Array.isArray(stage.operations) ? stage.operations : [] })[stageNumber];
    return {
      id: optionalText(stage.id || `stage-${stageNumber}`, `customStages[${index}].id`, 120),
      stageNumber,
      name,
      shortName: optionalText(stage.shortName, `customStages[${index}].shortName`, 120),
      monthRange: optionalText(stage.monthRange || stage.months, `customStages[${index}].monthRange`, 100),
      description: optionalText(stage.description, `customStages[${index}].description`, 1000),
      benchmarkCost,
      icon: optionalText(stage.icon, `customStages[${index}].icon`, 80),
      color,
      done: stage.done === true,
      active: stage.active === true,
      operations
    };
  }).sort((left, right) => left.stageNumber - right.stageNumber);
}

module.exports = { normalizeCustomStages };
