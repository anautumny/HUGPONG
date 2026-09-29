'use strict';

const DAY_MS = 24 * 60 * 60 * 1000;
const RETENTION_MS = Object.freeze({
  PASSWORD_RECOVERY: DAY_MS,
  RATE_LIMIT: DAY_MS,
  DIAGNOSTIC_EVENT: 14 * DAY_MS,
  TERMINAL_DIAGNOSTIC: 14 * DAY_MS
});

function deleteAfter(dateLike, retentionMs) {
  const base = typeof dateLike === 'number' ? dateLike : new Date(dateLike).getTime();
  if (!Number.isFinite(base) || !Number.isFinite(retentionMs) || retentionMs < 0) {
    throw new Error('A valid retention timestamp and duration are required.');
  }
  return new Date(base + retentionMs);
}

module.exports = { DAY_MS, RETENTION_MS, deleteAfter };
