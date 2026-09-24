'use strict';

function timestampMillis(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date) {
    const time = value.getTime();
    return Number.isFinite(time) ? time : null;
  }
  if (typeof value?.toMillis === 'function') {
    const time = value.toMillis();
    return Number.isFinite(time) ? time : null;
  }
  if (typeof value === 'object') {
    const seconds = value.seconds ?? value._seconds;
    const nanoseconds = value.nanoseconds ?? value._nanoseconds ?? 0;
    if (Number.isFinite(Number(seconds))) {
      return (Number(seconds) * 1000) + Math.floor(Number(nanoseconds) / 1e6);
    }
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    return Math.abs(value) < 1e12 ? value * 1000 : value;
  }
  const parsed = Date.parse(String(value).trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function cropYearMillis(value) {
  const match = String(value || '').match(/(\d{4})/);
  return match ? Date.UTC(Number(match[1]), 0, 1) : null;
}

function recordId(record) {
  return String(record?.id || record?.reportId || record?.deviceId || record?.employeeId || '');
}

function readSelector(record, selector) {
  return typeof selector === 'function' ? selector(record) : record?.[selector];
}

function firstTimestamp(record, selectors) {
  for (const selector of selectors) {
    const time = timestampMillis(readSelector(record, selector));
    if (time != null) return time;
  }
  return 0;
}

function compareNewestFirst(left, right, selectors = ['createdAt'], tieSelectors = []) {
  const primaryDifference = firstTimestamp(right, selectors) - firstTimestamp(left, selectors);
  if (primaryDifference) return primaryDifference;
  const tieDifference = firstTimestamp(right, tieSelectors) - firstTimestamp(left, tieSelectors);
  if (tieDifference) return tieDifference;
  return recordId(left).localeCompare(recordId(right));
}

function sortNewestFirst(records, selectors = ['createdAt'], tieSelectors = []) {
  return [...(records || [])].sort((left, right) => compareNewestFirst(left, right, selectors, tieSelectors));
}

function sortOperationsNewestFirst(records) {
  return sortNewestFirst(
    records,
    ['performedOn', 'isoDate', 'date', 'createdAt', 'clientCreatedAt', 'localCreatedAt'],
    ['createdAt', 'clientCreatedAt', 'localCreatedAt', 'timestamp']
  );
}

function sortCropYearsNewestFirst(records) {
  return sortNewestFirst(records, [record => cropYearMillis(record?.cropYear), 'startedAt', 'createdAt'], ['startedAt', 'createdAt']);
}

module.exports = {
  timestampMillis,
  cropYearMillis,
  compareNewestFirst,
  sortNewestFirst,
  sortOperationsNewestFirst,
  sortCropYearsNewestFirst
};
