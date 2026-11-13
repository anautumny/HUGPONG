// Login identifiers are numeric account IDs or Philippine mobile numbers.
// Allow familiar phone formatting, but never turn letters into a valid account.
export function normalizeLoginIdentifier(value) {
  if (typeof value !== 'string') return '';
  const raw = value.trim().replace(/[\s()-]/g, '');
  if (/^0[1-4]\d{6}$/.test(raw) || /^09\d{9}$/.test(raw)) return raw;
  if (/^\+?639\d{9}$/.test(raw)) return `0${raw.replace(/^\+/, '').slice(2)}`;
  return '';
}

export function loginIdentifierInput(value, previous = '') {
  const raw = String(value || '');
  if (!/^\+?[\d\s()-]*$/.test(raw)) return previous;
  const digits = raw.replace(/\D/g, '');
  return digits.length <= 12 ? digits : previous;
}
