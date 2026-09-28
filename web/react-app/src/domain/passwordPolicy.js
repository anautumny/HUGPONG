const BLOCKED_PASSWORDS = new Set([
  'password',
  'password123',
  'hugpong',
  'hugpong123',
  'hugpong2026',
  'adminhugpong',
  '12345678'
]);

export function passwordPolicy(password) {
  const value = typeof password === 'string' ? password : '';
  const normalized = value.toLowerCase().replace(/[^a-z0-9]/g, '');
  const checks = {
    hasValidLength: value.length >= 8 && value.length <= 256,
    hasLowercase: /[a-z]/.test(value),
    hasUppercase: /[A-Z]/.test(value),
    hasNumber: /\d/.test(value),
    isUnpredictable: normalized.length > 0 && !BLOCKED_PASSWORDS.has(normalized)
  };
  return { ...checks, isValid: Object.values(checks).every(Boolean) };
}

export function passwordPolicyError(password) {
  const policy = passwordPolicy(password);
  if (!policy.hasValidLength) return 'Password must contain between 8 and 256 characters.';
  if (!policy.hasUppercase || !policy.hasLowercase || !policy.hasNumber) {
    return 'Password must contain at least one uppercase letter, one lowercase letter, and one number.';
  }
  if (!policy.isUnpredictable) return 'Choose a less predictable password.';
  return '';
}

export const PASSWORD_POLICY_HINT = '8–256 characters with uppercase, lowercase, and a number; common passwords are not allowed.';
