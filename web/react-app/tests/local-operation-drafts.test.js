import test from 'node:test';
import assert from 'node:assert/strict';
import {
  claimLocalDraftSubmission,
  completeLocalDraftSubmission,
  listLocalOperationDrafts,
  saveLocalOperationDraft,
  validateLocalDraftForSubmission
} from '../src/services/localOperationDrafts.js';

function storage() {
  const values = new Map();
  return {
    getItem: key => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, value)
  };
}

test('local drafts are account scoped, own-field only, stable, and removed only after completion', () => {
  const localStorage = storage();
  const manager = { employeeId: '03000001', role: 'FARM_MANAGER' };
  const other = { employeeId: '03000002', role: 'FARM_MANAGER' };
  const ownField = { id: 'FLD-1', memberUserId: '03000001' };
  const memberField = { id: 'FLD-2', memberUserId: '04000001' };

  const draft = saveLocalOperationDraft(manager, ownField, { activityName: 'Land prep' }, null, localStorage);
  assert.equal(listLocalOperationDrafts(manager, localStorage).length, 1);
  assert.equal(listLocalOperationDrafts(other, localStorage).length, 0);
  assert.equal(validateLocalDraftForSubmission(manager, ownField, draft).valid, true);
  assert.equal(validateLocalDraftForSubmission(manager, { ...ownField, memberUserId: '04000001' }, draft).valid, false);
  assert.throws(() => saveLocalOperationDraft(manager, memberField, {}, null, localStorage), /own currently assigned field/);

  const claimed = claimLocalDraftSubmission(manager, ownField, draft.id, localStorage);
  assert.equal(claimed.submittedOperationId, draft.submittedOperationId);
  assert.throws(() => claimLocalDraftSubmission(manager, ownField, draft.id, localStorage), /already in progress/);
  completeLocalDraftSubmission(manager, draft.id, localStorage);
  assert.equal(listLocalOperationDrafts(manager, localStorage).length, 0);
});
