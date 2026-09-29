'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  STAFF_VERIFICATION_TOKEN_TTL_MS,
  createStaffVerificationToken,
  verifyStaffVerificationToken
} = require('../security/staffVerificationToken');

test('staff-verification fallback tokens are phone-bound, signed, and expire', () => {
  const now = Date.parse('2026-09-29T00:00:00.000Z');
  const issued = createStaffVerificationToken('09181234567', now);

  assert.equal(verifyStaffVerificationToken(issued.token, '09181234567', now + 1), true);
  assert.equal(verifyStaffVerificationToken(issued.token, '09181234568', now + 1), false);
  assert.equal(verifyStaffVerificationToken(`${issued.token}tampered`, '09181234567', now + 1), false);
  assert.equal(verifyStaffVerificationToken(issued.token, '09181234567', now + STAFF_VERIFICATION_TOKEN_TTL_MS + 1), false);
});

test('staff-assisted verification is represented in server, Web, and Mobile flows', () => {
  const root = path.resolve(__dirname, '..', '..');
  const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
  const authRoute = read('server/routes/auth.js');
  const usersRoute = read('server/routes/users.js');
  const webQueue = read('web/react-app/src/components/users/PendingApprovalsQueue.jsx');
  const mobileRegistration = read('mobile/src/screens/auth/RegisterScreen.js');
  const mobileApproval = read('mobile/src/screens/FieldOpsScreen.js');

  assert.match(authRoute, /verifyStaffVerificationToken/);
  assert.match(authRoute, /phoneVerificationStatus: smsVerified \? 'VERIFIED' : 'PENDING_STAFF'/);
  assert.match(usersRoute, /\[ROLES\.SRA_ADMIN, ROLES\.SUPER_ADMIN\]\.includes\(actorRole\)/);
  assert.match(usersRoute, /USER_PHONE_STAFF_VERIFIED/);
  assert.match(webQueue, /Verify & Approve/);
  assert.match(webQueue, /Awaiting verification by an SRA Admin or Super Admin/);
  assert.match(mobileRegistration, /Request Staff Verification/);
  assert.match(mobileApproval, /Awaiting SRA Verification/);
});
