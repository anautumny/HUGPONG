import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createSessionGuard } from '../src/services/sessionGuard.js';

// Exercise the actual provider callbacks with deferred network responses.
// React state setters are observable; no browser cookie or server is modified.
function provider() {
  const source = fs.readFileSync(new URL('../src/context/AuthContext.jsx', import.meta.url), 'utf8');
  const callbacks = source.slice(source.indexOf('  const clearSession ='), source.indexOf('  useEffect(() =>'));
  const state = { user: null, role: '', loading: true, unavailable: false };
  const pending = [];
  const deps = {
    useCallback: fn => fn, sessionRequests: { current: createSessionGuard() }, user: null,
    clearAuthenticatedReadState() {}, resetWebTelemetryState() {},
    setUser: value => { state.user = value; }, setRoleKey: value => { state.role = value; },
    setIsLoading: value => { state.loading = value; },
    setSessionUnavailable: value => { state.unavailable = value; }, setSessionExpiredNotice() {},
    localStorage: { removeItem() {} }, window: { setTimeout, clearTimeout },
    API_STARTUP_TIMEOUT_MS: 1000, assertWebOnline() {}, webClientHeaders: () => ({}),
    roleKeyFromUser: (_user, role) => role || 'manager',
    responseErrorFromPayload: () => new Error('Session expired'),
    fetch: (_url, options) => new Promise((resolve, reject) => { pending.push({ resolve, reject, options }); })
  };
  const api = new Function(...Object.keys(deps), `${callbacks}; return {clearSession,saveSession,refreshSession};`)(...Object.values(deps));
  const reply = (index, status, data) => pending[index].resolve({ ok: status < 400, status, json: async () => data });
  return { api, state, pending, reply };
}

test('an old unauthenticated session response cannot clear a newer successful login', async () => {
  const { api, state, pending, reply } = provider();
  const old = api.refreshSession();
  await Promise.resolve();
  api.saveSession({ employeeId: 'NEW-MANAGER' }, 'manager');
  assert.equal(pending[0].options.signal.aborted, true);
  reply(0, 401, { authenticated: false });
  assert.deepEqual(await old, { stale: true });
  assert.equal(state.user.employeeId, 'NEW-MANAGER');
  assert.equal(state.loading, false);
});

test('an old authenticated response cannot restore an account after logout', async () => {
  const { api, state, reply } = provider();
  const old = api.refreshSession();
  await Promise.resolve();
  api.clearSession();
  reply(0, 200, { authenticated: true, user: { employeeId: 'OLD-ACCOUNT' } });
  assert.deepEqual(await old, { stale: true });
  assert.equal(state.user, null);
});

test('reconnect checks share one request and current unauthenticated responses still clear the session', async () => {
  const { api, state, pending, reply } = provider();
  api.saveSession({ employeeId: 'MANAGER' }, 'manager');
  const first = api.refreshSession();
  assert.equal(api.refreshSession(), first);
  await Promise.resolve();
  assert.equal(pending.length, 1);
  reply(0, 403, { authenticated: false });
  assert.equal((await first).authenticated, false);
  assert.equal(state.user, null);
  assert.equal(state.loading, false);
});

test('a superseded request failure cannot mark the newer session unavailable or release its refresh', async () => {
  const { api, state, pending, reply } = provider();
  const old = api.refreshSession();
  await Promise.resolve();
  api.saveSession({ employeeId: 'NEW' }, 'manager');
  const current = api.refreshSession();
  await Promise.resolve();
  pending[0].reject(new Error('Late old request failure'));
  assert.deepEqual(await old, { stale: true });
  assert.equal(state.unavailable, false);
  assert.equal(api.refreshSession(), current);
  reply(1, 200, { authenticated: true, user: { employeeId: 'NEW' } });
  await current;
  assert.equal(state.user.employeeId, 'NEW');
});

test('login and logout invalidate session checks before their network requests', () => {
  const source = fs.readFileSync(new URL('../src/context/AuthContext.jsx', import.meta.url), 'utf8');
  assert.match(source, /const login = async[^]*?=> \{\s*sessionRequests.current.invalidate\(\)/);
  assert.match(source, /const logout = async[^]*?=> \{\s*sessionRequests.current.invalidate\(\)/);
});
