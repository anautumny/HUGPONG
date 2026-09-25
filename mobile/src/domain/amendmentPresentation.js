const FIELD_LABELS = Object.freeze({
  activity: 'Operation', operationName: 'Operation', cost: 'Total Cost', totalCost: 'Total Cost',
  hectares: 'Area', areaHa: 'Area', people: 'Workers', peopleCount: 'Workers',
  inputQty: 'Quantity', quantity: 'Quantity', inputUnit: 'Unit', inputName: 'Material',
  variety: 'Sugarcane Variety', date: 'Operation Date', performedOn: 'Operation Date',
  subItems: 'Materials', lineItems: 'Materials'
});

const moneyFields = new Set(['cost', 'totalCost', 'unitCost', 'subtotal', 'subTotal']);
const dateFields = new Set(['date', 'performedOn']);
const itemFields = new Set(['subItems', 'lineItems']);

function canonicalScalar(value, field) {
  if (value == null || value === '') return null;
  if (field === 'quantity' && typeof value === 'object') {
    return JSON.stringify({ value: Number(value.value || 0), unit: String(value.unit || '').trim(), inputName: String(value.inputName || '').trim() });
  }
  if (moneyFields.has(field) || ['hectares', 'areaHa', 'people', 'peopleCount', 'inputQty'].includes(field)) {
    const number = Number(value);
    return Number.isFinite(number) ? number : String(value).trim();
  }
  if (dateFields.has(field)) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value).trim() : date.toISOString().slice(0, 10);
  }
  return String(value).trim();
}

function canonicalItem(item = {}, index = 0) {
  const quantity = Number(item.quantity ?? item.qty ?? 0);
  const unitCost = Number(item.unitCost || 0);
  return {
    key: String(item.lineItemId || item.id || item.description || index).trim().toLowerCase(),
    description: String(item.description || item.inputName || `Item ${index + 1}`).trim(),
    quantity: Number.isFinite(quantity) ? quantity : 0,
    unit: String(item.unit || '').trim(),
    unitCost: Number.isFinite(unitCost) ? unitCost : 0,
    total: Number(item.subtotal ?? item.subTotal ?? (quantity * unitCost)) || 0
  };
}

function formatMoney(value) {
  return `₱${Number(value || 0).toLocaleString('en-PH', { maximumFractionDigits: 2 })}`;
}

function formatDate(value, withTime = false) {
  if (!value) return 'Not specified';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('en-PH', withTime
    ? { month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }
    : { month: 'long', day: 'numeric', year: 'numeric' });
}

function formatValue(value, field) {
  if (value == null || value === '') return 'Not specified';
  if (field === 'quantity' && typeof value === 'object') return `${Number(value.value || 0)} ${value.unit || 'unit'}${value.inputName ? ` · ${value.inputName}` : ''}`;
  if (moneyFields.has(field)) return formatMoney(value);
  if (dateFields.has(field)) return formatDate(value);
  if (field === 'hectares' || field === 'areaHa') return `${Number(value)} Ha`;
  return String(value);
}

function itemSummary(item) {
  return `${item.quantity} ${item.unit || 'unit'} × ${formatMoney(item.unitCost)} = ${formatMoney(item.total)}`;
}

function diffItems(before = [], after = []) {
  const beforeItems = (Array.isArray(before) ? before : []).map(canonicalItem);
  const afterItems = (Array.isArray(after) ? after : []).map(canonicalItem);
  const beforeMap = new Map(beforeItems.map(item => [item.key, item]));
  const afterMap = new Map(afterItems.map(item => [item.key, item]));
  const changes = [];
  for (const key of new Set([...beforeMap.keys(), ...afterMap.keys()])) {
    const previous = beforeMap.get(key);
    const current = afterMap.get(key);
    if (!previous) changes.push({ kind: 'item', label: current.description, action: 'Added', after: itemSummary(current) });
    else if (!current) changes.push({ kind: 'item', label: previous.description, action: 'Removed', before: itemSummary(previous) });
    else {
      const details = [];
      if (previous.quantity !== current.quantity) details.push({ label: 'Quantity', before: `${previous.quantity} ${previous.unit || 'unit'}`, after: `${current.quantity} ${current.unit || 'unit'}` });
      else if (previous.unit !== current.unit) details.push({ label: 'Unit', before: previous.unit || 'Not specified', after: current.unit || 'Not specified' });
      if (previous.unitCost !== current.unitCost) details.push({ label: 'Unit Cost', before: formatMoney(previous.unitCost), after: formatMoney(current.unitCost) });
      if (previous.total !== current.total) details.push({ label: 'Total', before: formatMoney(previous.total), after: formatMoney(current.total) });
      if (details.length) changes.push({ kind: 'item', label: current.description, before: itemSummary(previous), after: itemSummary(current), details });
    }
  }
  return changes;
}

export function formatAmendmentChanges(changes = {}) {
  const rows = [];
  Object.entries(changes && typeof changes === 'object' ? changes : {}).forEach(([field, change]) => {
    const before = change?.before ?? change?.from;
    const after = change?.after ?? change?.to;
    if (itemFields.has(field)) {
      const itemChanges = diffItems(before, after);
      if (itemChanges.length) rows.push({ kind: 'group', label: FIELD_LABELS[field], items: itemChanges });
      return;
    }
    const normalizedBefore = canonicalScalar(before, field);
    const normalizedAfter = canonicalScalar(after, field);
    if (normalizedBefore === normalizedAfter) return;
    rows.push({ kind: 'field', field, label: FIELD_LABELS[field] || field.replace(/([A-Z])/g, ' $1').replace(/^./, value => value.toUpperCase()), before: formatValue(before, field), after: formatValue(after, field) });
  });
  return rows;
}

export function meaningfulAmendmentChanges(changes = {}) {
  return Object.fromEntries(Object.entries(changes).filter(([field, change]) =>
    formatAmendmentChanges({ [field]: change }).length > 0
  ));
}

export function amendmentEditor(amendment = {}, users = []) {
  const id = String(amendment.amendedByUserId || '').trim();
  const user = users.find(item => String(item.id || item.employeeId || '').trim() === id);
  return {
    id,
    name: user?.name || user?.displayName || amendment.amendedByName || 'Former or unavailable user',
    role: user?.role || amendment.amendedByRole || 'Role unavailable'
  };
}

export function amendmentSummary(amendments = [], users = []) {
  const list = Array.isArray(amendments) ? amendments : [];
  const latest = list[list.length - 1] || null;
  return latest ? { count: list.length, latest, editor: amendmentEditor(latest, users), editedAt: formatDate(latest.amendedAt, true) } : { count: 0, latest: null, editor: null, editedAt: '' };
}

export { FIELD_LABELS, formatDate, formatMoney };
