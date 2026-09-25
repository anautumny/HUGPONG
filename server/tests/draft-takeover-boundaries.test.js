'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = relativePath => fs.readFileSync(path.resolve(__dirname, relativePath), 'utf8');

test('Mobile amendment save reuses takeover authorization without a second password verification', () => {
  const store = read('../../mobile/src/data/dataStore.js');
  const fieldOps = read('../../mobile/src/screens/FieldOpsScreen.js');
  const amendmentStart = store.indexOf('export const updateOperationLogWithSecurity');
  const amendmentEnd = store.indexOf('export const archivePastLogsForField', amendmentStart);
  const amendmentSource = store.slice(amendmentStart, amendmentEnd);
  assert.doesNotMatch(amendmentSource, /verifyPasswordWithServer|passwordVerification/);
  assert.match(amendmentSource, /takeoverGrant: authorization\?\.takeoverGrant/);
  assert.equal((fieldOps.match(/verifyCurrentPassword\(/g) || []).length, 1);
  assert.doesNotMatch(fieldOps, /Account Password Input|Authorize & Edit/);
});

test('Web and Mobile local draft paths do not invoke cloud mutation or outbox services', () => {
  const webDrafts = read('../../web/react-app/src/services/localOperationDrafts.js');
  const mobileStore = read('../../mobile/src/data/dataStore.js');
  const planner = read('../../mobile/src/screens/PlannerScreen.js');
  const mobileDraftStart = mobileStore.indexOf('export const saveLocalOperationDraft');
  const mobileDraftEnd = mobileStore.indexOf('export const claimLocalDraftSubmission', mobileDraftStart);
  const mobileDraftSource = mobileStore.slice(mobileDraftStart, mobileDraftEnd);
  assert.doesNotMatch(webDrafts, /authenticatedRequest|createOperation|enqueue|Firestore/);
  assert.doesNotMatch(mobileDraftSource, /commitExplicitMutation|enqueueOutboxItem|authenticatedRequest/);
  assert.match(mobileDraftSource, /localOnly: true/);
  assert.match(planner, /saveLocalOperationDraft/);
  assert.doesNotMatch(planner, /DRAFT_LOGS\.unshift/);
});

test('draft submission uses ownership preflight and stable operation identity', () => {
  const mobileStore = read('../../mobile/src/data/dataStore.js');
  const mobileFieldOps = read('../../mobile/src/screens/FieldOpsScreen.js');
  const webDrafts = read('../../web/react-app/src/services/localOperationDrafts.js');
  const webAdd = read('../../web/react-app/src/components/operations/AddOperationModal.jsx');
  assert.match(mobileStore, /Your field assignment changed/);
  assert.match(mobileStore, /submittedOperationId/);
  assert.match(mobileFieldOps, /claimLocalDraftSubmission/);
  assert.match(webDrafts, /Your field assignment changed/);
  assert.match(webDrafts, /submittedOperationId/);
  assert.match(webAdd, /initialDraft\?\.submittedOperationId/);
  assert.match(webAdd, /submissionLockRef\.current/);
});
