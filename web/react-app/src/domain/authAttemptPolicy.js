export const MAX_LOGIN_FAILURES = 5;
export const LOGIN_LOCKOUT_MS = 60_000;

export const emptyLoginAttemptState = Object.freeze({ failures: 0, lockedUntil: 0 });

export function recordLoginFailure(state, now = Date.now()) {
  const failures = Number(state?.failures || 0) + 1;
  if (failures < MAX_LOGIN_FAILURES) return { failures, lockedUntil: 0 };
  return { failures: 0, lockedUntil: now + LOGIN_LOCKOUT_MS };
}

export function loginLockRemaining(state, now = Date.now()) {
  return Math.max(0, Number(state?.lockedUntil || 0) - now);
}

