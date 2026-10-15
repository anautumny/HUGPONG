'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildDisplayName, normalizeStructuredName } = require('../domain/personName');

const root = path.resolve(__dirname, '..', '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

test('structured person names produce one canonical display name', () => {
  assert.equal(buildDisplayName({
    firstName: 'Juan',
    middleName: 'Mendoza',
    lastName: 'Dela Cruz',
    suffix: 'Jr.'
  }), 'Juan Mendoza Dela Cruz Jr.');
  assert.deepEqual(normalizeStructuredName({
    firstName: '  Juan  ',
    middleName: '',
    lastName: ' Dela   Cruz ',
    suffix: ''
  }), {
    firstName: 'Juan',
    middleName: null,
    lastName: 'Dela Cruz',
    suffix: null,
    displayName: 'Juan Dela Cruz'
  });
  assert.throws(() => normalizeStructuredName({ firstName: 'Juan' }), /lastName is required/);
});

test('member registration is optional-farm while approval requires an SRA-confirmed affiliation', () => {
  const authRoute = read('server/routes/auth.js');
  const usersRoute = read('server/routes/users.js');
  const registerScreen = read('mobile/src/screens/auth/RegisterScreen.js');
  const pendingQueue = read('web/react-app/src/components/users/PendingApprovalsQueue.jsx');

  assert.match(authRoute, /requestedBlockFarmId: blockFarmId \|\| null/);
  assert.match(authRoute, /router\.get\('\/registration-block-farms', registrationCatalogRateLimit/);
  assert.match(authRoute, /String\(farm\.status \|\| 'ACTIVE'\)\.toUpperCase\(\) === 'ACTIVE'/);
  assert.match(authRoute, /router\.post\('\/registration-phone-verification\/request', registrationReviewRequestRateLimit/);
  assert.doesNotMatch(registerScreen, /if \(!form\.blockFarmId\) e\.blockFarm/);
  assert.match(registerScreen, /t\('reg_not_assigned'\)/);
  assert.match(registerScreen, /fetchRegistrationBlockFarms/);
  assert.match(registerScreen, /requestRegistrationPhoneVerification/);
  assert.match(registerScreen, /onComplete=\{handleVerifyCode\}/);
  assert.doesNotMatch(registerScreen, /getAvailableBlockFarms/);
  assert.match(usersRoute, /Assign a Block Farm before approving this Farm Member/);
  assert.match(usersRoute, /affiliatedBlockFarmId/);
  assert.match(pendingQueue, /Assign Block Farm/);
  assert.match(pendingQueue, /onApproveUser\(user, selectedFarmId\)/);
});

test('approved affiliation is visible on Web and Mobile before a field is allocated', () => {
  const authorization = read('server/services/accountAuthorization.js');
  const blockFarmRoute = read('server/routes/blockFarms.js');
  const directory = read('server/services/userDirectoryService.js');
  const webDirectory = read('web/react-app/src/components/users/UserTable.jsx');
  const mobileProfile = read('mobile/src/screens/ProfileScreen.js');

  assert.match(authorization, /activeAffiliatedBlockFarmId/);
  assert.match(blockFarmRoute, /req\.session\.user\.blockFarmId/);
  assert.match(directory, /MEMBER_AFFILIATION/);
  assert.match(directory, /Awaiting plot allocation/);
  assert.match(webDirectory, /assignment\?\.displayLabel/);
  assert.match(mobileProfile, /session\?\.blockFarmId \|\| session\?\.affiliatedBlockFarmId/);
  assert.match(mobileProfile, /memberFarm \|\| sessionFarm/);
});

test('web and mobile onboarding both submit structured names', () => {
  const webForm = read('web/react-app/src/components/users/UserFormModal.jsx');
  const mobileStore = read('mobile/src/data/dataStore.js');
  for (const field of ['firstName', 'middleName', 'lastName', 'suffix']) {
    assert.match(webForm, new RegExp(`${field}:`));
    assert.match(mobileStore, new RegExp(`${field}:`));
  }
});

test('provisioned users choose phone verification before entering the manual-review queue', () => {
  const usersRoute = read('server/routes/users.js');
  const authRoute = read('server/routes/auth.js');
  const webUsersService = read('web/react-app/src/services/usersService.js');
  const webVerification = read('web/react-app/src/components/auth/FirstLoginVerifyModal.jsx');
  const mobileLogin = read('mobile/src/screens/auth/LoginScreen.js');
  const mobileStore = read('mobile/src/data/dataStore.js');

  assert.match(usersRoute, /phoneVerificationStatus: phoneVerificationMode === 'VERIFIED' \? 'VERIFIED' : 'AWAITING_SELECTION'/);
  assert.match(usersRoute, /phoneVerificationRequestedAt: null/);
  assert.match(authRoute, /router\.post\('\/request-phone-verification-review'/);
  assert.match(authRoute, /phoneVerificationStatus: 'SMS_OTP_SENT'/);
  assert.match(authRoute, /eventType: 'USER_PHONE_VERIFICATION_REVIEW_REQUESTED'/);
  const userProjection = read('server/security/userProjection.js');
  assert.match(userProjection, /const reviewQueueEligible = status === 'PENDING'/);
  assert.match(userProjection, /if \(reviewQueueEligible\) safe\.reviewQueueEligible = true/);
  assert.match(userProjection, /phoneVerificationStatus \|\| ''\)\.toUpperCase\(\) === 'PENDING_VERIFICATION'/);
  assert.match(userProjection, /Boolean\(user\?\.phoneVerificationRequestedAt\)/);
  assert.match(userProjection, /phoneVerificationReviewRequestedByUser === true/);
  assert.match(webUsersService, /record\.reviewQueueEligible === true/);
  assert.match(mobileStore, /user\.reviewQueueEligible === true/);
  assert.match(webVerification, /Smart or TNT SIM\?/);
  assert.match(webVerification, /Request authorized verification review/);
  assert.match(webVerification, /onComplete=\{handleVerifyCode\}/);
  assert.doesNotMatch(webVerification, /Verify & Continue/);
  assert.match(mobileLogin, /first_smart_tnt_help/);
  assert.match(mobileLogin, /handleRequestPhoneVerificationReview/);
  assert.match(mobileLogin, /onComplete=\{handleVerifyPhone\}/);
});
