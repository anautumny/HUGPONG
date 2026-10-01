'use strict';

function timestampMillis(value) {
  if (!value) return 0;
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (typeof value === 'object' && Number.isFinite(Number(value.seconds ?? value._seconds))) {
    return Number(value.seconds ?? value._seconds) * 1000;
  }
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

function uniqueRecordsById(records) {
  const byId = new Map();
  for (const record of Array.isArray(records) ? records : []) {
    const id = String(record?.id || '').trim();
    if (!id) continue;
    const identity = id.toUpperCase();
    const existing = byId.get(identity);
    if (!existing) {
      byId.set(identity, record);
      continue;
    }
    const existingTime = timestampMillis(existing.updatedAt || existing.createdAt);
    const recordTime = timestampMillis(record.updatedAt || record.createdAt);
    if (recordTime >= existingTime) byId.set(identity, record);
  }
  return Array.from(byId.values());
}

module.exports = { uniqueRecordsById };
