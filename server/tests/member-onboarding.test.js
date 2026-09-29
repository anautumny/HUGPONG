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
  assert.doesNotMatch(registerScreen, /if \(!form\.blockFarmId\) e\.blockFarm/);
  assert.match(registerScreen, /t\('reg_not_assigned'\)/);
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
