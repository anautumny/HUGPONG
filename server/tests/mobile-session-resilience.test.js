'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.resolve(__dirname, '../routes/auth.js'), 'utf8');
const prefix = "router.post('/mobile-session', mobileSessionRateLimit, ";
const at = source.indexOf(prefix) + prefix.length;
assert.ok(at >= prefix.length);
const body = '(' + source.slice(at, source.indexOf('\n});', at)) + '})';
async function request({ tokenError, databaseError, signingError, status = 'ACTIVE' } = {}) {
  const handler = vm.runInNewContext(body, {
    COLLECTIONS: { USERS: 'users' },
    db: { collection: () => ({ doc: () => ({ get: async () => {
      if (databaseError) throw databaseError;
      return { exists: true, id: 'LOCAL-USER', data: () => ({ status, authVersion: 1 }) };
    } }) }) },
    auth: { verifyIdToken: async () => { if (tokenError) throw tokenError; return { uid: 'LOCAL-USER', authVersion: 1 }; } },
    authVersionOf: account => account.authVersion,
    buildSessionUser: async () => ({ employeeId: 'LOCAL-USER', canonicalRole: 'MEMBER_FARMER' }),
    isRoleAllowedOnPlatform: () => true,
    issueCredentials: async () => { if (signingError) throw signingError; return { token: 'local-test-token' }; }
  });
  const response = { locals: {}, statusCode: 200, status(value) { this.statusCode = value; return this; }, json(value) { this.body = value; return this; } };
  await handler({ headers: { 'x-client-platform': 'mobile', authorization: 'Bearer local-test-token' } }, response);
  return response;
}

test('temporary database, Firebase transport and server-signing failures return retryable 503', async () => {
  for (const options of [
    { databaseError: Object.assign(new Error('Temporary database failure'), { code: 'UNAVAILABLE' }) },
    { tokenError: Object.assign(new Error('Temporary transport failure'), { code: 'app/network-error' }) },
    { tokenError: Object.assign(new Error('Temporary Firebase failure'), { code: 'auth/internal-error' }) },
    { signingError: Object.assign(new Error('Server credential configuration'), { code: 'auth/invalid-credential' }) },
    { signingError: Object.assign(new Error('Server token construction failure'), { code: 'auth/invalid-argument' }) }
  ]) {
    const result = await request(options);
    assert.equal(result.statusCode, 503);
    assert.equal(result.body.code, 'AUTHORIZATION_UNAVAILABLE');
    assert.ok(result.locals.diagnosticError);
    assert.equal(result.locals.diagnosticError, Object.values(options)[0]);
  }
});

test('expired, revoked and invalid Firebase tokens still receive 401; inactive accounts receive 403', async () => {
  for (const code of ['auth/id-token-expired', 'auth/id-token-revoked', 'auth/invalid-id-token', 'auth/user-disabled']) {
    assert.equal((await request({ tokenError: Object.assign(new Error('Rejected token'), { code }) })).statusCode, 401);
  }
  assert.equal((await request({ status: 'DISABLED' })).statusCode, 403);
  assert.equal((await request()).statusCode, 200);
});
