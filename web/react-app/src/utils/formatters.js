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
