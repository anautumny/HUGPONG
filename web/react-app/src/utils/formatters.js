/**
 * ══════════════════════════════════════════════════════════════
 * HUGPONG — Centralized Data Formatters
 * ══════════════════════════════════════════════════════════════
 */

export function formatCurrency(amount, fallback = '—') {
  if (amount == null || amount === '') return fallback;
  const num = typeof amount === 'number' ? amount : Number(amount);
  if (!Number.isFinite(num)) return fallback;
  return `₱${num.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

export function formatHectares(ha, fallback = '0.00 ha') {
  if (ha == null || ha === '') return fallback;
  const num = typeof ha === 'number' ? ha : Number(ha);
  if (!Number.isFinite(num)) return fallback;
  return `${num.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })} ha`;
}

export function formatDate(val, fallback = '—') {
  if (!val) return fallback;
  try {
    const d = new Date(val);
    if (isNaN(d.getTime())) return String(val);
    return d.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  } catch {
    return String(val);
  }
}

export function formatNumber(val, fallback = '0') {
  if (val == null || val === '') return fallback;
  const num = typeof val === 'number' ? val : Number(val);
  if (!Number.isFinite(num)) return fallback;
  return num.toLocaleString('en-PH');
}

export function formatCropYear(val, fallback = '—') {
  if (!val) return fallback;
  const str = String(val).trim();
  const rangeMatch = str.match(/(\d{4})\s*[-–—/]\s*(\d{2,4})/);
  if (rangeMatch) {
    const startYear = parseInt(rangeMatch[1], 10);
    let endYear = parseInt(rangeMatch[2], 10);
    if (endYear < 100) endYear = Math.floor(startYear / 100) * 100 + endYear;
    return `${startYear}-${endYear}`;
  }
  const singleMatch = str.match(/(\d{4})/);
  if (singleMatch) {
    const year = parseInt(singleMatch[1], 10);
    return `${year}-${year + 1}`;
  }
  return str;
}

export function formatCropYearDisplay(val, fallback = '—') {
  const normalized = formatCropYear(val, fallback);
  return normalized === fallback ? fallback : normalized.replace('-', '–');
}

export function canonicalStoredCropYear(val) {
  const match = String(val || '').trim().match(/^(\d{4})\s*[-–—/]\s*(\d{4})$/);
  if (!match || Number(match[2]) !== Number(match[1]) + 1) return '';
  return `${match[1]}-${match[2]}`;
}

export function nextCropYearCycle(val) {
  const current = canonicalStoredCropYear(val);
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

export function formatPeriodDisplay(val, fallback = '—') {
  if (!val) return fallback;
  const str = String(val).trim();
  const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  // Match YYYY-MM, YYYY/MM, YYYY-M, or dates like YYYY-MM-DD
  let match = str.match(/^(\d{4})[-/_](0?[1-9]|1[0-2])(?:\D.*)?$/);
  if (match) {
    const year = match[1];
    const monthIndex = parseInt(match[2], 10) - 1;
    return `${MONTH_NAMES[monthIndex]} ${year}`;
  }
  // Match MM-YYYY, MM/YYYY
  match = str.match(/^(0?[1-9]|1[0-2])[-/_](\d{4})(?:\D.*)?$/);
  if (match) {
    const monthIndex = parseInt(match[1], 10) - 1;
    const year = match[2];
    return `${MONTH_NAMES[monthIndex]} ${year}`;
  }
  return str;
}
