import test from 'node:test';
import assert from 'node:assert/strict';
import { createOperationSubmission } from '../src/domain/operationSubmission.js';

test('operation submissions share concurrent requests and retry a lost response with the same ID', async () => {
  const calls = [];
  let release, attempt = 0, ids = 0;
  const submission = createOperationSubmission(async (payload, grant) => {
    calls.push({ payload, grant });
    if (++attempt === 1) return new Promise((_, reject) => { release = () => reject(new Error('Response lost')); });
    return { success: true, data: payload };
  }, () => `LOG-${++ids}`);
  const payload = { fieldId: 'FLD-1', laborEntries: [{ laborEntryId: 'LAB-1', rate: 100 }] };
  const first = submission.submit(payload, 'grant-1');
  const doubleTap = submission.submit(payload, 'grant-1');
  assert.equal(first, doubleTap);
  await new Promise(resolve => setImmediate(resolve));
  release(); await assert.rejects(first, /Response lost/);
  await submission.submit({ ...payload, laborEntries: [{ laborEntryId: 'LAB-NEW', rate: 100 }] }, 'renewed-grant');
  assert.equal(calls.length, 2);
  assert.equal(calls[0].payload.id, calls[1].payload.id);
  assert.equal(calls[1].grant, 'renewed-grant');
  await submission.submit(payload, 'grant-2');
  assert.notEqual(calls[1].payload.id, calls[2].payload.id, 'an explicitly new record gets a new identity after confirmed success');
});

test('unconfirmed operations cannot silently change; a later expired grant does not discard their identity', async () => {
  let count = 0;
  const ids = [];
  const submission = createOperationSubmission(async payload => {
    ids.push(payload.id);
    count++;
    if (count === 1) throw Object.assign(new Error('Gateway failed'), { status: 503 });
    if (count === 2) throw Object.assign(new Error('Grant expired'), { status: 403 });
    return { success: true, data: payload };
  }, () => `LOG-${ids.length}`);
  await assert.rejects(submission.submit({ totalCost: 100 }), /Gateway/);
  await assert.rejects(submission.submit({ totalCost: 200 }), /not been confirmed/);
  assert.equal(ids.length, 1);
  await assert.rejects(submission.submit({ totalCost: 100 }), /expired/);
  await submission.submit({ totalCost: 100 });
  assert.equal(new Set(ids).size, 1);
});

test('a definite validation rejection allows correcting the form, and existing draft identities are preserved', async () => {
  const calls = [];
  const submission = createOperationSubmission(async payload => {
    calls.push(payload);
    if (calls.length === 1) throw Object.assign(new Error('Invalid input'), { status: 400 });
    return { success: true, data: payload };
  }, () => `LOG-${calls.length}`);
  await assert.rejects(submission.submit({ totalCost: -1 }), /Invalid/);
  await submission.submit({ totalCost: 100 });
  assert.notEqual(calls[0].id, calls[1].id);
  await submission.submit({ id: 'LOG-DRAFT-STABLE', totalCost: 100 });
  assert.equal(calls[2].id, 'LOG-DRAFT-STABLE');
});

test('uncertain writes survive a reload, use a renewed grant, and stay scoped to their account/plot', async () => {
  const saved = new Map();
  const storage = { getItem: key => saved.get(key), setItem: (key, value) => saved.set(key, value), removeItem: key => saved.delete(key) };
  let originalId, calls = 0;
  const first = createOperationSubmission(async payload => { originalId = payload.id; throw new Error('Response lost'); }, () => 'LOG-STABLE', { storageKey: 'A:FLD1', storage });
  await assert.rejects(first.submit({ fieldId: 'FLD1', totalCost: 123 }, 'secret-original-grant'), /Response lost/);
  assert.equal(JSON.stringify([...saved.values()]).includes('secret-original-grant'), false);
  const other = createOperationSubmission(async () => {}, () => 'LOG-OTHER', { storageKey: 'B:FLD1', storage });
  assert.equal(other.pending(), null);
  const restored = createOperationSubmission(async (payload, grant) => {
    calls++; assert.equal(payload.id, originalId); assert.equal(grant, 'renewed'); return { data: payload };
  }, () => { throw new Error('Must reuse identity'); }, { storageKey: 'A:FLD1', storage });
  assert.equal(restored.pending().totalCost, 123);
  await assert.rejects(restored.submit({ fieldId: 'FLD1', totalCost: 456 }), /not been confirmed/);
  await restored.retry('renewed');
  assert.equal(calls, 1); assert.equal(saved.size, 0); assert.equal(restored.pending(), null);
});

test('a browser storage failure prevents a write that would lose its retry identity', async () => {
  let calls = 0;
  const submission = createOperationSubmission(async () => { calls++; }, () => 'LOG-STABLE', {
    storageKey: 'A:FLD1', storage: { getItem: () => null, setItem: () => { throw new Error('Storage full'); } },
  });
  await assert.rejects(submission.submit({ fieldId: 'FLD1' }), /Storage full/);
  assert.equal(calls, 0);
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  try {
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('Storage blocked by browser'); } });
    const blocked = createOperationSubmission(async () => { calls++; }, () => 'LOG-BLOCKED', { storageKey: 'A:FLD1' });
    await assert.rejects(blocked.submit({ fieldId: 'FLD1' }), /could not be recovered/);
    assert.equal(calls, 0);
  } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else delete globalThis.localStorage;
  }
});

test('Web draft locks recover after a fresh process while an active claim still blocks double submission', async () => {
  const saved = new Map();
  const storage = { getItem: key => saved.get(key), setItem: (key, value) => saved.set(key, value) };
  const account = { employeeId: 'MEM-1', role: 'MEMBER_FARMER' }, field = { id: 'FLD-1', memberUserId: 'MEM-1' };
  const first = await import('../src/services/localOperationDrafts.js?first-process');
  const draft = first.saveLocalOperationDraft(account, field, { activityName: 'Weeding' }, null, storage);
  first.claimLocalDraftSubmission(account, field, draft.id, storage);
  assert.throws(() => first.claimLocalDraftSubmission(account, field, draft.id, storage), /already in progress/);
  const restarted = await import('../src/services/localOperationDrafts.js?restarted-process');
  const recovered = restarted.listLocalOperationDrafts(account, storage)[0];
  assert.equal(recovered.submitting, false);
  assert.equal(recovered.submittedOperationId, draft.submittedOperationId);
  assert.doesNotThrow(() => restarted.claimLocalDraftSubmission(account, field, draft.id, storage));
});
