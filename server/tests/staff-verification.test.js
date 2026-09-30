'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  PHONE_VERIFICATION_REQUEST_TOKEN_TTL_MS,
  createPhoneVerificationRequestToken,
  verifyPhoneVerificationRequestToken
} = require('../security/phoneVerificationRequestToken');

test('phone-verification review tokens are phone-bound, signed, and expire', () => {
  const now = Date.parse('2026-09-29T00:00:00.000Z');
  const issued = createPhoneVerificationRequestToken('09181234567', now);

  assert.equal(verifyPhoneVerificationRequestToken(issued.token, '09181234567', now + 1), true);
  assert.equal(verifyPhoneVerificationRequestToken(issued.token, '09181234568', now + 1), false);
  assert.equal(verifyPhoneVerificationRequestToken(`${issued.token}tampered`, '09181234567', now + 1), false);
  assert.equal(verifyPhoneVerificationRequestToken(issued.token, '09181234567', now + PHONE_VERIFICATION_REQUEST_TOKEN_TTL_MS + 1), false);
});

test('authorized phone verification is represented in server, Web, and Mobile flows', () => {
  const root = path.resolve(__dirname, '..', '..');
  const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
  const authRoute = read('server/routes/auth.js');
  const usersRoute = read('server/routes/users.js');
  const webQueue = read('web/react-app/src/components/users/PendingApprovalsQueue.jsx');
  const mobileRegistration = read('mobile/src/screens/auth/RegisterScreen.js');
  const mobileApproval = read('mobile/src/screens/FieldOpsScreen.js');

  assert.match(authRoute, /verifyPhoneVerificationRequestToken/);
  assert.match(authRoute, /phoneVerificationStatus: smsVerified \? 'VERIFIED' : 'PENDING_VERIFICATION'/);
  assert.match(usersRoute, /assertPhoneVerificationAuthority/);
  assert.match(usersRoute, /USER_PHONE_VERIFIED_BY_AUTHORITY/);
  assert.match(webQueue, /Verify & Approve/);
  assert.match(webQueue, /Pending Users/);
  assert.match(webQueue, /Verify number only—accept later/);
  assert.match(mobileRegistration, /Request Phone Verification Review/);
  assert.match(mobileApproval, /Awaiting Authorized Review/);
  assert.match(mobileApproval, /Verify Phone Only/);
});
