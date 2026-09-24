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

export function uniqueCropYears(records = [], selector = record => record?.cropYear) {
  const years = new Set();
  records.forEach(record => {
    const cropYear = canonicalStoredCropYear(selector(record));
    if (cropYear) years.add(cropYear);
  });
  return Array.from(years).sort((left, right) => Number(right.slice(0, 4)) - Number(left.slice(0, 4)));
}
