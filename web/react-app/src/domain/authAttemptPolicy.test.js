import { describe, expect, it } from 'vitest';
import { emptyLoginAttemptState, LOGIN_LOCKOUT_MS, loginLockRemaining, recordLoginFailure } from './authAttemptPolicy';

describe('login attempt policy', () => {
  it('preserves the current five-failure, sixty-second UI lockout', () => {
    const now = 1_000;
    let state = emptyLoginAttemptState;
    for (let attempt = 0; attempt < 5; attempt += 1) state = recordLoginFailure(state, now);
    expect(loginLockRemaining(state, now)).toBe(LOGIN_LOCKOUT_MS);
    expect(loginLockRemaining(state, now + LOGIN_LOCKOUT_MS)).toBe(0);
  });
});

