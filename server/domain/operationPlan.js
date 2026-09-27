'use strict';

const { getOperationDefinition } = require('./operationCatalogue');
const { canonicalOperationUnit } = require('./operationUnits');

function invalid(message) {
  const error = new Error(message);
  error.status = 400;
  throw error;
}

function finite(value, label, minimum = 0) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < minimum) invalid(`${label} must be a number greater than or equal to ${minimum}.`);
  return number;
}

function text(value, label, max = 300) {
  const normalized = String(value || '').trim();
  if (!normalized || normalized.length > max) invalid(`${label} is required and must not exceed ${max} characters.`);
  return normalized;
}

function normalizePlanItem(item, label) {
  const quantity = finite(item.qty ?? item.quantity, `${label}.quantity`);
  const unitCost = finite(item.unitCost ?? item.rate, `${label}.unitCost`);
  const unit = canonicalOperationUnit(item.unit);
  if (!unit) invalid(`${label}.unit is not supported.`);
  return {
    id: text(item.id || item.lineItemId, `${label}.id`, 120),
    category: ['material', 'equipment', 'expense'].includes(String(item.category || '').toLowerCase())
      ? String(item.category).toLowerCase()
      : 'expense',
    description: text(item.description || item.name, `${label}.description`),
    qty: quantity,
    unit,
    unitCost,
    subTotal: quantity * unitCost
  };
}

function normalizeOperation(operation, stageNumber, index) {
  const label = `customOperations[${stageNumber}][${index}]`;
  const id = text(operation.id, `${label}.id`, 120);
  const selectedDefinition = getOperationDefinition(id);
  const definition = selectedDefinition?.parentOperationDefinitionId
    ? getOperationDefinition(selectedDefinition.parentOperationDefinitionId)
    : selectedDefinition;
  if (definition && definition.stageNumber !== stageNumber) invalid(`${id} does not belong to Stage ${stageNumber}.`);
  const isItemizedWeeding = definition?.id === 'SRA-08';
  const isGroup = isItemizedWeeding || operation.isGroup === true || operation.inputType === 'group';
  const unit = isGroup ? 'ha' : canonicalOperationUnit(operation.unit || 'ha');
  if (!unit) invalid(`${label}.unit is not supported.`);
  const suppliedSubItems = Array.isArray(operation.subItems) ? operation.subItems : [];
  const legacyChildSubItems = isItemizedWeeding
    ? [
        ...(selectedDefinition?.parentOperationDefinitionId ? [selectedDefinition] : []),
        ...(Array.isArray(operation.childOperations) ? operation.childOperations : [])
      ].map(child => {
        const childDefinition = getOperationDefinition(child.id) || child;
        return {
          id: String(childDefinition.id || child.id).replace(/^SRA-/, 'SI-'),
          description: childDefinition.name || child.name,
          qty: child.perHa ?? 1,
          unit: child.unit || 'ha',
          unitCost: child.rate ?? 0
        };
      })
    : [];
  const rawSubItems = suppliedSubItems.length ? suppliedSubItems : legacyChildSubItems;
  const subItems = rawSubItems.map((item, itemIndex) => normalizePlanItem(item, `${label}.subItems[${itemIndex}]`));
  const configuredChildren = Array.isArray(operation.childOperations) ? operation.childOperations : [];
  const childSource = isItemizedWeeding
    ? []
    : definition?.childOperations?.length
    ? [
        ...definition.childOperations,
        ...configuredChildren.filter(child => !definition.childOperations.some(canonicalChild => canonicalChild.id === child.id))
      ]
    : configuredChildren;
  const childOperations = childSource.map((child, childIndex) => {
    const childDefinition = getOperationDefinition(child.id);
    if (childDefinition && childDefinition.parentOperationDefinitionId !== definition?.id) {
      invalid(`${label}.childOperations[${childIndex}] does not belong under ${definition?.id || id}.`);
    }
    const childUnit = canonicalOperationUnit(child.unit || 'ha');
    if (!childUnit) invalid(`${label}.childOperations[${childIndex}].unit is not supported.`);
    const perHa = finite(child.perHa ?? 1, `${label}.childOperations[${childIndex}].perHa`);
    const rate = finite(child.rate ?? 0, `${label}.childOperations[${childIndex}].rate`);
    return {
      id: childDefinition?.id || text(child.id, `${label}.childOperations[${childIndex}].id`, 120),
      name: childDefinition?.name || text(child.name, `${label}.childOperations[${childIndex}].name`),
      inputType: 'direct',
      isGroup: false,
      perHa,
      unit: childUnit,
      rate,
      costPerHa: perHa * rate
    };
  });
  return {
    id: definition?.id || id,
    name: definition?.name || text(operation.name, `${label}.name`),
    stageNumber,
    stageName: String(operation.stageName || ''),
    category: definition?.category || String(operation.category || 'custom'),
    parentOperationDefinitionId: null,
    isCustom: !definition,
    isGroup: childOperations.length ? false : isGroup,
    inputType: childOperations.length ? 'children' : (isGroup ? 'group' : 'direct'),
    perHa: (isGroup || childOperations.length) ? 0 : finite(operation.perHa ?? 1, `${label}.perHa`),
    unit,
    rate: (isGroup || childOperations.length) ? 0 : finite(operation.rate ?? 0, `${label}.rate`),
    costPerHa: childOperations.length
      ? childOperations.reduce((sum, child) => sum + child.costPerHa, 0)
      : isGroup
      ? subItems.reduce((sum, item) => sum + item.subTotal, 0)
      : finite(operation.perHa ?? 1, `${label}.perHa`) * finite(operation.rate ?? 0, `${label}.rate`),
    subItems,
    childOperations
  };
}

function normalizeCustomOperationsPlan(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid('customOperations must be an object keyed by stage number.');
  const normalized = {};
  for (const [stageKey, operations] of Object.entries(value)) {
    const stageNumber = Number(stageKey);
    if (!Number.isInteger(stageNumber) || stageNumber < 1 || stageNumber > 6) invalid(`Unsupported operation plan stage: ${stageKey}.`);
    if (!Array.isArray(operations) || operations.length > 100) invalid(`customOperations[${stageKey}] must be an array with at most 100 operations.`);
    const byOperationId = new Map();
    operations.forEach((operation, index) => {
      const normalizedOperation = normalizeOperation(operation || {}, stageNumber, index);
      const existing = byOperationId.get(normalizedOperation.id);
      if (existing?.isGroup && normalizedOperation.isGroup) {
        const mergedItems = new Map(existing.subItems.map(item => [item.id, item]));
        normalizedOperation.subItems.forEach(item => mergedItems.set(item.id, item));
        const subItems = [...mergedItems.values()];
        byOperationId.set(normalizedOperation.id, {
          ...existing,
          ...normalizedOperation,
          subItems,
          costPerHa: subItems.reduce((sum, item) => sum + item.subTotal, 0)
        });
      } else {
        byOperationId.set(normalizedOperation.id, normalizedOperation);
      }
    });
    normalized[stageNumber] = [...byOperationId.values()];
  }
  return normalized;
}

module.exports = { normalizeCustomOperationsPlan };
