import { normalizeActorId } from '../domain/operationAuthorization.js';
import { createClientRecordId } from '../utils/secureId.js';

const PREFIX = 'hugpong_operation_drafts_v1:';
const activeClaims = new Set();

function storageFor(storage) {
  return storage || globalThis.localStorage;
}

export function draftStorageKey(user) {
  const actorId = normalizeActorId(user);
  if (!actorId) throw new Error('An authenticated account is required for local drafts.');
  return `${PREFIX}${actorId}`;
}

export function listLocalOperationDrafts(user, storage) {
  const actorId = normalizeActorId(user);
  if (!actorId) return [];
  try {
    const parsed = JSON.parse(storageFor(storage).getItem(draftStorageKey(user)) || '[]');
    const drafts = Array.isArray(parsed)
      ? parsed.filter(draft => draft?.createdByUserId === actorId && draft.status === 'DRAFT')
      : [];
    const recovered = drafts.map(draft => draft.submitting && !activeClaims.has(`${actorId}:${draft.id}`)
      ? { ...draft, submitting: false, submissionClaimedAt: null } : draft);
    if (recovered.some((draft, index) => draft !== drafts[index])) persist(user, recovered, storage);
    return recovered;
  } catch {
    return [];
  }
}

function persist(user, drafts, storage) {
  storageFor(storage).setItem(draftStorageKey(user), JSON.stringify(drafts));
  return drafts;
}

export function saveLocalOperationDraft(user, field, form, existingId = null, storage) {
  const actorId = normalizeActorId(user);
  if (!actorId || String(field?.memberUserId || '').trim() !== actorId) {
    throw new Error('Drafts can only be saved for your own currently assigned field.');
  }
  const now = new Date().toISOString();
  const drafts = listLocalOperationDrafts(user, storage);
  const previous = existingId ? drafts.find(draft => draft.id === existingId) : null;
  const id = previous?.id || createClientRecordId('DFT', field.id);
  const draft = {
    id,
    status: 'DRAFT',
    localOnly: true,
    createdByUserId: actorId,
    fieldId: String(field.id || '').trim().toUpperCase(),
    createdAt: previous?.createdAt || now,
    updatedAt: now,
    submittedOperationId: previous?.submittedOperationId || createClientRecordId('OP', field.id),
    form: { ...form }
  };
  persist(user, [draft, ...drafts.filter(item => item.id !== id)], storage);
  return draft;
}

export function deleteLocalOperationDraft(user, draftId, storage) {
  activeClaims.delete(`${normalizeActorId(user)}:${draftId}`);
  return persist(user, listLocalOperationDrafts(user, storage).filter(draft => draft.id !== draftId), storage);
}

export function validateLocalDraftForSubmission(user, field, draft) {
  const actorId = normalizeActorId(user);
  if (!draft || draft.status !== 'DRAFT' || draft.createdByUserId !== actorId) {
    return { valid: false, error: 'This draft does not belong to the signed-in account.' };
  }
  if (!field || String(field.id || '').trim().toUpperCase() !== draft.fieldId || String(field.memberUserId || '').trim() !== actorId) {
    return { valid: false, error: 'Your field assignment changed. This local draft was preserved but cannot be submitted.' };
  }
  return { valid: true };
}

export function claimLocalDraftSubmission(user, field, draftId, storage) {
  const drafts = listLocalOperationDrafts(user, storage);
  const draft = drafts.find(item => item.id === draftId);
  const validation = validateLocalDraftForSubmission(user, field, draft);
  if (!validation.valid) throw new Error(validation.error);
  if (draft.submitting) throw new Error('This draft submission is already in progress.');
  const claimed = { ...draft, submitting: true, submissionClaimedAt: new Date().toISOString() };
  activeClaims.add(`${normalizeActorId(user)}:${draftId}`);
  try { persist(user, drafts.map(item => item.id === draftId ? claimed : item), storage); }
  catch (error) { activeClaims.delete(`${normalizeActorId(user)}:${draftId}`); throw error; }
  return claimed;
}

export function releaseLocalDraftSubmission(user, draftId, storage) {
  activeClaims.delete(`${normalizeActorId(user)}:${draftId}`);
  const drafts = listLocalOperationDrafts(user, storage);
  persist(user, drafts.map(item => item.id === draftId ? { ...item, submitting: false, submissionClaimedAt: null } : item), storage);
}

export function completeLocalDraftSubmission(user, draftId, storage) {
  activeClaims.delete(`${normalizeActorId(user)}:${draftId}`);
  deleteLocalOperationDraft(user, draftId, storage);
}
