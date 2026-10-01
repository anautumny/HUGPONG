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

test('Web and Mobile local draft paths stay local and Planner does not create drafts', () => {
  const webDrafts = read('../../web/react-app/src/services/localOperationDrafts.js');
  const mobileStore = read('../../mobile/src/data/dataStore.js');
  const planner = read('../../mobile/src/screens/PlannerScreen.js');
  const mobileDraftStart = mobileStore.indexOf('export const saveLocalOperationDraft');
  const mobileDraftEnd = mobileStore.indexOf('export const claimLocalDraftSubmission', mobileDraftStart);
  const mobileDraftSource = mobileStore.slice(mobileDraftStart, mobileDraftEnd);
  assert.doesNotMatch(webDrafts, /authenticatedRequest|createOperation|enqueue|Firestore/);
  assert.doesNotMatch(mobileDraftSource, /commitExplicitMutation|enqueueOutboxItem|authenticatedRequest/);
  assert.match(mobileDraftSource, /localOnly: true/);
  assert.doesNotMatch(planner, /saveLocalOperationDraft|draftLogs/);
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

test('Mobile draft submission rejects empty operation drafts before network work', () => {
  const mobileStore = read('../../mobile/src/data/dataStore.js');
  const mobileFieldOps = read('../../mobile/src/screens/FieldOpsScreen.js');
  const submitDraftStart = mobileFieldOps.indexOf('const submitDraft = async');
  const submitDraftEnd = mobileFieldOps.indexOf('const editDraft =', submitDraftStart);
  const submitDraftSource = mobileFieldOps.slice(submitDraftStart, submitDraftEnd);
  const batchStart = mobileFieldOps.indexOf('const submitSelectedDrafts = async');
  const batchEnd = mobileFieldOps.indexOf('const handleClearOrDeleteSelected', batchStart);
  const batchSource = mobileFieldOps.slice(batchStart, batchEnd);

  assert.match(mobileStore, /validateLocalDraftContentForSubmission/);
  assert.match(mobileStore, /This draft has no operation details/);
  assert.match(submitDraftSource, /validateLocalDraftContentForSubmission\(log\)/);
  assert.match(submitDraftSource, /let isNetOnline = getNetworkStatus\(\)/);
  assert.match(batchSource, /validateLocalDraftContentForSubmission\(draft\)/);
  assert.match(batchSource, /const isNetOnline = getNetworkStatus\(\)/);
});

test('Planner lists and mutates only the signed-in field owner plots', () => {
  const planner = read('../../mobile/src/screens/PlannerScreen.js');
  const mobileStore = read('../../mobile/src/data/dataStore.js');
  const fieldRoutes = read('../routes/fields.js');

  assert.match(planner, /allFields\.filter\(field => getOperationCapabilities\(session, field\)\.canPlan\)/);
  assert.match(planner, /fields\.map\(item =>/);
  assert.doesNotMatch(planner, /All Plots/);
  assert.match(mobileStore, /getOperationCapabilities\(CURRENT_SESSION, field\)\.canPlan/);
  assert.match(fieldRoutes, /operationAuthorization\(req\.session\.user, \{ id: fieldId, \.\.\.latest \}\)\.canPlan/);
  assert.match(fieldRoutes, /Farm schedules can only be changed for your own assigned field/);
});

test('the Mobile-only Planner selects current-stage work and opens actual operation inputs without creating a draft', () => {
  const mobilePlanner = read('../../mobile/src/screens/PlannerScreen.js');
  const mobileFieldOps = read('../../mobile/src/screens/FieldOpsScreen.js');
  const mobileSchedule = read('../../mobile/src/domain/operationSchedule.js');
  const webApp = read('../../web/react-app/src/App.jsx');
  const webSidebar = read('../../web/react-app/src/components/layout/Sidebar.jsx');
  assert.match(mobileSchedule, /operationDefinitionId: 'CUSTOM'/);
  assert.match(mobileSchedule, /operationName: 'Custom Operation'/);
  assert.doesNotMatch(mobileSchedule, /SRA_OPERATIONS_CATALOGUE/);
  assert.match(mobilePlanner, /t\('planner_planned_activity'\)/);
  assert.match(mobilePlanner, /getOperationsForStage\(currentStageNumber\)/);
  assert.match(mobilePlanner, /operationDefinitionId: 'CUSTOM'/);
  assert.match(mobilePlanner, /t\('planner_todo_label'\)/);
  assert.match(mobilePlanner, /plannedOperation:/);
  assert.match(mobilePlanner, /planner_open_operation_inputs/);
  assert.match(mobileFieldOps, /options\.plannedOperation/);
  assert.match(mobileFieldOps, /plannedOperationId: plannedOperation\?\.id \|\| null/);
  assert.doesNotMatch(mobilePlanner, /saveLocalOperationDraft|addToDraft|planner_add_draft|planner_boundary_title/);
  assert.ok(
    mobilePlanner.indexOf("t('planner_planned_activity')") < mobilePlanner.indexOf("t('planner_planned_date')"),
    'Planner must ask what work is planned before presenting the calendar-selected date'
  );
  assert.doesNotMatch(webApp, /PlannerView|path="\/planner"/);
  assert.doesNotMatch(webSidebar, /Farm Planner|to: '\/planner'/);
});

test('Mobile Planner keeps the calendar-selected date read-only in the work editor', () => {
  const planner = read('../../mobile/src/screens/PlannerScreen.js');
  const dateEditorStart = planner.indexOf("t('planner_planned_date')");
  const estimateEditorStart = planner.indexOf("t('planner_estimated_cost_optional')", dateEditorStart);
  const dateEditor = planner.slice(dateEditorStart, estimateEditorStart);

  assert.match(planner, /setForm\(emptyForm\(selectedDate\)\)/);
  assert.match(dateEditor, /displayDate\(form\.plannedDate, true, locale\)/);
  assert.match(dateEditor, /lock-closed-outline/);
  assert.doesNotMatch(dateEditor, /TextInput|onChangeText/);
});
