'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { memoryFirestore } = require('./helpers/memoryFirestore');
const schema = require('../schema/firestoreSchema');
const { createAuthenticatedApiRateLimit } = require('../middleware/abuseProtection');
const { createSafeErrorEnvelope } = require('../services/diagnosticService');
const read = file => fs.readFileSync(path.resolve(__dirname, '../..', file), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));
function response() { return { locals: {}, headers: {}, statusCode: 200, set(key, value) { this.headers[key] = value; return this; },
  status(value) { this.statusCode = value; return this; }, json(value) { this.body = value; return this; } }; }

function mobileAuthorization(password = ' actual password ') {
  const source = read('mobile/src/screens/FieldOpsScreen.js');
  const start = source.indexOf('  const handleConfirmTakeOverAuth =');
  const end = source.indexOf('  const checkTakeOverRequired =', start);
  let resolve, reject; const calls = [], state = { busy: false, error: '' };
  const domain = vm.runInNewContext(read('mobile/src/domain/operationAuthorization.js').replace(/export /g, '')
    + '\n({ rememberFieldTakeover, pruneFieldTakeovers, fieldTakeoverSession })');
  const context = { getNetworkStatus: () => true, takeoverRequestRef: { current: { busy: false, version: 0, scope: 'SCOPE-A' } }, takeoverScopeKey: 'SCOPE-A',
    ...domain, session: { employeeId: 'FM-1', role: 'Farm Manager' },
    takeOverAuthPassword: password, selectedField: { id: 'FIELD-1' }, safeField: {}, pendingTakeOverAction: null,
    setAuthorizingTakeOver: value => { state.busy = value; }, setTakeOverAuthError: value => { state.error = value; },
    setShowTakeOverAuthModal: value => { state.visible = value; }, setTakeOverAuthPassword: value => { state.password = value; },
    setTakeoverSessions: update => { state.sessions = update(state.sessions || {}); const active = domain.fieldTakeoverSession(state.sessions, context.session, 'FIELD-1'); state.active = Boolean(active); state.grant = active?.grant; },
    verifyCurrentPassword: (...args) => { calls.push(args); return new Promise((done, fail) => { resolve = done; reject = fail; }); }
  };
  vm.createContext(context); vm.runInContext(source.slice(start, end).replace('const handleConfirmTakeOverAuth', 'var handleConfirmTakeOverAuth'), context);
  return { context, state, calls, resolve: value => resolve(value), reject: error => reject(error) };
}

test('Mobile takeover preserves password bytes, submits once, exposes pending state and rejects obsolete results', async () => {
  const first = mobileAuthorization();
  const pending = first.context.handleConfirmTakeOverAuth();
  await first.context.handleConfirmTakeOverAuth();
  assert.equal(first.calls.length, 1); assert.equal(first.calls[0][0], ' actual password '); assert.equal(first.calls[0][2].throwOnError, true);
  assert.equal(first.state.busy, true);
  first.resolve({ takeoverGrant: 'LOCAL-GRANT', takeoverGrantExpiresAt: Date.now() + 60000 }); await pending;
  assert.equal(first.state.busy, false); assert.equal(first.state.grant, 'LOCAL-GRANT'); assert.equal(first.state.password, '');
  const changed = mobileAuthorization(), old = changed.context.handleConfirmTakeOverAuth();
  changed.context.takeoverRequestRef.current.scope = 'ANOTHER-ACCOUNT-OR-FIELD';
  changed.context.takeoverRequestRef.current.version++;
  changed.resolve({ takeoverGrant: 'OBSOLETE' }); await old;
  assert.equal(changed.state.grant, undefined); assert.equal(changed.state.active, undefined);
});

test('Mobile takeover shows genuine transport errors and always releases its submitting state', async () => {
  const runtime = mobileAuthorization(), pending = runtime.context.handleConfirmTakeOverAuth();
  runtime.reject(Object.assign(new Error('The server is temporarily unavailable.'), { status: 503 })); await pending;
  assert.equal(runtime.state.busy, false); assert.equal(runtime.state.error, 'The server is temporarily unavailable.'); assert.equal(runtime.state.active, undefined);
  const empty = mobileAuthorization('   '); await empty.context.handleConfirmTakeOverAuth(); assert.equal(empty.calls.length, 0);
  const offline = mobileAuthorization(); offline.context.getNetworkStatus = () => false;
  await offline.context.handleConfirmTakeOverAuth(); assert.equal(offline.calls.length, 0); assert.match(offline.state.error, /Connect to HUGPONG/);
  const source = read('mobile/src/data/dataStore.js');
  const context = { verifyPasswordWithServer: async () => { throw Object.assign(new Error('Cooldown'), { status: 429 }); } };
  vm.createContext(context); vm.runInContext(source.slice(source.indexOf('export const verifyCurrentPassword'), source.indexOf('let sessionRestorePromise')).replace('export const', 'var'), context);
  assert.equal(await context.verifyCurrentPassword('password', 'FIELD-1'), false, 'legacy callers retain their existing return contract');
  await assert.rejects(context.verifyCurrentPassword('password', 'FIELD-1', { throwOnError: true }), { status: 429 });
});

test('routed takeover can open for another field while account changes invalidate and close authorization', () => {
  const source = read('mobile/src/screens/FieldOpsScreen.js');
  const start = source.indexOf('  useEffect(() => {', source.indexOf('const [pendingTakeOverAction'));
  const effect = source.slice(start, source.indexOf('  const closeTakeOverAuthorization', start));
  for (const changedActor of [false, true]) {
    const closed = [], pendingActions = [];
    const context = { useEffect: callback => callback(), takeoverScopeKey: 'NEW-FIELD', takeoverActorKey: 'CURRENT-ACTOR',
      takeoverModalActorRef: { current: changedActor ? 'OLD-ACTOR' : 'CURRENT-ACTOR' },
      takeoverRequestRef: { current: { version: 1, busy: true } }, setAuthorizingTakeOver() {},
      setShowTakeOverAuthModal: value => closed.push(value), setPendingTakeOverAction: value => pendingActions.push(value), setTakeOverAuthPassword() {}, setTakeOverAuthError() {} };
    vm.runInNewContext(effect, context);
    assert.deepEqual(closed, changedActor ? [false] : [], 'selecting a routed field must not immediately hide its newly opened dialog');
    assert.equal(context.takeoverRequestRef.current.busy, false); assert.equal(context.takeoverRequestRef.current.version, 2);
    assert.deepEqual(pendingActions, [null], 'an action requested for an old field cannot run after authorizing the new field');
  }
});

test('Mobile recovery requests share one in-flight read and account changes cannot share that request', async () => {
  const source = read('mobile/src/services/authService.js'); let requests = 0; const pending = [];
  const context = { authenticationGeneration: 1, auth: { currentUser: { uid: 'A' } },
    authenticatedRequest: () => { requests++; return new Promise(resolve => pending.push(resolve)); } };
  vm.createContext(context); vm.runInContext(source.slice(source.indexOf('const pendingRecoveryReads'), source.indexOf('export async function decidePasswordRecoveryReview')).replace('export function', 'function'), context);
  const first = context.fetchPasswordRecoveryReviews(), duplicate = context.fetchPasswordRecoveryReviews();
  assert.equal(first, duplicate); assert.equal(requests, 1);
  context.authenticationGeneration++; context.auth.currentUser.uid = 'B';
  const next = context.fetchPasswordRecoveryReviews(); assert.equal(requests, 2); assert.notEqual(next, first);
  pending[0]({ data: ['A'] }); pending[1]({ data: ['B'] }); await first;
  assert.deepEqual(await next, { data: ['B'] });
});

test('successful takeover authorizations do not consume the failed-password budget; bad attempts still throttle', async () => {
  const db = memoryFirestore(); let clock = Date.now();
  class Clock extends Date { static now() { return clock; } }
  const module = { exports: {} };
  const requireLocal = name => name === '../firebase-admin' ? { db } : name === '../schema/firestoreSchema' ? schema
    : name === '../services/retentionPolicy' ? require('../services/retentionPolicy') : require(name);
  vm.runInNewContext(`(function(require,module,exports){${read('server/middleware/rateLimit.js')}\n})`, { Date: Clock })(requireLocal, module, module.exports);
  const source = read('server/routes/auth.js');
  const context = { Date: Clock, createRateLimit: module.exports.createRateLimit, clientAddress: req => req.ip,
    db, canonicalRole: schema.canonicalRole, ROLES: schema.ROLES, TAKEOVER_GRANT_PURPOSE: 'MANAGER_TAKEOVER', TAKEOVER_GRANT_TTL_MS: 60000,
    verifyCurrentPassword: async (_id, password) => password === 'correct',
    assertManagerFieldAssignment: async (_db, _actor, field) => { if (field !== 'FIELD-1') throw Object.assign(new Error('Wrong field'), { status: 403 }); return { fieldId: field }; },
    issueTakeoverGrant: ({ actorId, fieldId }) => `LOCAL-${actorId}-${fieldId}` };
  vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf('const passwordRateLimit ='), source.indexOf('const passwordRecoveryIpRateLimit')).replace('const passwordRateLimit', 'var passwordRateLimit'), context);
  const marker = "router.post('/verify-password', requireAuth, passwordRateLimit, ";
  const start = source.indexOf(marker) + marker.length;
  context.handler = vm.runInContext('(' + source.slice(start, source.indexOf('\n});', start)) + '})', context);
  const req = { ip: 'LOCAL-NETWORK', authUser: { employeeId: 'FM-1' }, session: { user: { employeeId: 'FM-1', role: 'Farm Manager' } }, body: { purpose: 'MANAGER_TAKEOVER', fieldId: 'FIELD-1', password: 'correct' } };
  for (let index = 0; index < 20; index++) {
    const res = response(); await context.passwordRateLimit(req, res, () => context.handler(req, res));
    assert.equal(res.statusCode, 200); assert.ok(res.body.takeoverGrant);
  }
  req.body.password = 'wrong';
  for (let index = 0; index < 10; index++) {
    req.body.contactNumber = `spoof-${index}`;
    const res = response(); await context.passwordRateLimit(req, res, () => context.handler(req, res)); assert.equal(res.statusCode, 403);
  }
  const blocked = response(); await context.passwordRateLimit(req, blocked, () => assert.fail('The bad-password budget must still protect the endpoint'));
  assert.equal(blocked.statusCode, 429); assert.equal(blocked.body.code, 'PASSWORD_CHECK_RATE_LIMITED');
  clock += 15 * 60 * 1000 + 1; req.body.password = 'correct';
  const recovered = response(); await context.passwordRateLimit(req, recovered, () => context.handler(req, recovered)); assert.equal(recovered.statusCode, 200);
  req.session.user.role = 'Farm Member'; const forbidden = response(); await context.handler(req, forbidden); assert.equal(forbidden.statusCode, 403);
});

test('normal realtime read fanout does not build up a five-minute lockout, and errors distinguish reads from password failures', () => {
  let clock = 1000, accepted = 0;
  const limiter = createAuthenticatedApiRateLimit({ now: () => clock });
  const req = { method: 'GET', originalUrl: '/api/recovery-reviews', ip: 'LOCAL-NETWORK', authUser: { employeeId: 'FM-1' } };
  for (let minute = 0; minute < 5; minute++) {
    for (let index = 0; index < 100; index++) limiter(req, response(), () => accepted++);
    clock += 60000;
  }
  assert.equal(accepted, 500);
  const envelope = createSafeErrorEnvelope({ status: 429, payload: { code: 'USER_RATE_LIMITED' }, req });
  assert.ok(!envelope.message.includes('attempts'));
});
