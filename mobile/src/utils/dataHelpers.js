// Pure data helpers shared by the mobile store and screens.
// Keep these functions free of React Native, Firebase, and storage side effects.
export function formatDisplayDate(dateStr) {
  if (!dateStr) return '';
  const str = String(dateStr).trim();
  if (/^[A-Za-z]+ \d{1,2}, \d{4}$/.test(str)) {
    return str;
  }
  const m = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) {
    const y = parseInt(m[1], 10);
    const monthIdx = parseInt(m[2], 10) - 1;
    const d = parseInt(m[3], 10);
    const months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    if (monthIdx >= 0 && monthIdx < 12) {
      return `${months[monthIdx]} ${d}, ${y}`;
    }
  }
  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  }
  return str;
}

export function normalizeCalendarDate(dateValue) {
  if (!dateValue) return '';
  if (dateValue instanceof Date) {
    if (Number.isNaN(dateValue.getTime())) return '';
    return `${dateValue.getFullYear()}-${String(dateValue.getMonth() + 1).padStart(2, '0')}-${String(dateValue.getDate()).padStart(2, '0')}`;
  }
  const str = String(dateValue).trim();
  const isoMatch = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:T.*)?$/);
  if (isoMatch) {
    const year = Number(isoMatch[1]);
    const month = Number(isoMatch[2]);
    const day = Number(isoMatch[3]);
    const candidate = new Date(year, month - 1, day, 12);
    if (candidate.getFullYear() !== year || candidate.getMonth() !== month - 1 || candidate.getDate() !== day) return '';
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  const namedMatch = str.match(/^([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})$/);
  if (namedMatch) {
    const monthNames = [
      ['january', 'jan'], ['february', 'feb'], ['march', 'mar'], ['april', 'apr'],
      ['may', 'may'], ['june', 'jun'], ['july', 'jul'], ['august', 'aug'],
      ['september', 'sep'], ['october', 'oct'], ['november', 'nov'], ['december', 'dec']
    ];
    const token = namedMatch[1].toLowerCase();
    const monthIndex = monthNames.findIndex(names => names.includes(token));
    const year = Number(namedMatch[3]);
    const day = Number(namedMatch[2]);
    if (monthIndex < 0) return '';
    const candidate = new Date(year, monthIndex, day, 12);
    if (candidate.getFullYear() !== year || candidate.getMonth() !== monthIndex || candidate.getDate() !== day) return '';
    return `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  return '';
}

export function toISODateString(dateStr) {
  return normalizeCalendarDate(dateStr) || normalizeCalendarDate(new Date());
}

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

export function cropYearCycleForDate(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const startYear = date.getFullYear();
  return `${startYear}-${startYear + 1}`;
}

export function formatCropYearDisplay(value, fallback = '—') {
  const match = String(value || '').match(/(\d{4})\s*[-–—/]\s*(\d{2,4})/);
  if (!match) return fallback;
  const startYear = Number(match[1]);
  const endYear = Number(match[2]) < 100
    ? Math.floor(startYear / 100) * 100 + Number(match[2])
    : Number(match[2]);
  return `${startYear}–${endYear}`;
}

export function canonicalStoredCropYear(value) {
  const match = String(value || '').trim().match(/^(\d{4})\s*[-–—/]\s*(\d{4})$/);
  if (!match || Number(match[2]) !== Number(match[1]) + 1) return '';
  return `${match[1]}-${match[2]}`;
}

export function nextCropYearCycle(value) {
  const current = canonicalStoredCropYear(value);
  if (!current) return '';
  const nextStart = Number(current.slice(5));
  return `${nextStart}-${nextStart + 1}`;
}

export function uniqueCropYears(records = [], selector = record => record?.cropYear) {
  const years = new Set();
  records.forEach(record => {
    const cropYear = canonicalStoredCropYear(selector(record));
    if (cropYear) years.add(cropYear);
  });
  return Array.from(years).sort((left, right) => Number(right.slice(0, 4)) - Number(left.slice(0, 4)));
}

export function cleanupDuplicateLogs(logs) {
  if (!Array.isArray(logs)) return [];
  const byId = new Map();
  for (const log of logs) {
    if (!log) continue;
    const logId = log.id || `LOG-${log.fieldId}-${log.stageNumber || 1}-${log.activity || 'op'}-${log.date || Date.now()}`;
    if (!byId.has(logId)) {
      byId.set(logId, log);
    } else {
      const existing = byId.get(logId);
      const timeExisting = new Date(existing.updatedAt || existing.createdAt || existing.date || 0).getTime();
      const timeCurrent = new Date(log.updatedAt || log.createdAt || log.date || 0).getTime();
      if (timeCurrent >= timeExisting) {
        byId.set(logId, log);
      }
    }
  }
  return Array.from(byId.values());
}

export function uniqueRecordsById(records) {
  if (!Array.isArray(records)) return [];
  const byId = new Map();
  for (const record of records) {
    const id = String(record?.id || '').trim();
    if (!id) continue;
    const identity = id.toUpperCase();
    const existing = byId.get(identity);
    if (!existing) {
      byId.set(identity, record);
      continue;
    }
    const existingTime = Date.parse(existing.updatedAt || existing.createdAt || '') || 0;
    const recordTime = Date.parse(record.updatedAt || record.createdAt || '') || 0;
    if (recordTime >= existingTime) byId.set(identity, record);
  }
  return Array.from(byId.values());
}

export const cleanDataForFirestore = (obj) => {
  if (obj === null || obj === undefined) return null;
  if (typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(cleanDataForFirestore);
  const clean = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      clean[key] = cleanDataForFirestore(value);
    }
  }
  return clean;
};
