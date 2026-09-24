export function timestampMillis(value) {
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
    if (Number.isFinite(Number(seconds))) return (Number(seconds) * 1000) + Math.floor(Number(nanoseconds) / 1e6);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    return Math.abs(value) < 1e12 ? value * 1000 : value;
  }
  const parsed = Date.parse(String(value).trim());
  return Number.isFinite(parsed) ? parsed : null;
}

const valueFor = (record, selector) => typeof selector === 'function' ? selector(record) : record?.[selector];

function firstTimestamp(record, selectors) {
  for (const selector of selectors) {
    const time = timestampMillis(valueFor(record, selector));
    if (time != null) return time;
  }
  return 0;
}

const stableId = record => String(record?.id || record?.reportId || record?.deviceId || record?.employeeId || '');

export function compareNewestFirst(left, right, selectors = ['createdAt'], tieSelectors = []) {
  const primaryDifference = firstTimestamp(right, selectors) - firstTimestamp(left, selectors);
  if (primaryDifference) return primaryDifference;
  const tieDifference = firstTimestamp(right, tieSelectors) - firstTimestamp(left, tieSelectors);
  if (tieDifference) return tieDifference;
  return stableId(left).localeCompare(stableId(right));
}

export function sortNewestFirst(records, selectors = ['createdAt'], tieSelectors = []) {
  return [...(records || [])].sort((left, right) => compareNewestFirst(left, right, selectors, tieSelectors));
}

export function sortOperationsNewestFirst(records) {
  return sortNewestFirst(
    records,
    ['performedOn', 'isoDate', 'date', 'createdAt', 'clientCreatedAt', 'localCreatedAt'],
    ['createdAt', 'clientCreatedAt', 'localCreatedAt', 'timestamp']
  );
}

export function sortCropYearsNewestFirst(records) {
  const cropYearTime = record => {
    const year = String(record?.cropYear || '').match(/\d{4}/)?.[0];
    return year ? `${year}-01-01` : null;
  };
  return sortNewestFirst(records, [cropYearTime, 'startedAt', 'createdAt'], ['startedAt', 'createdAt']);
}
