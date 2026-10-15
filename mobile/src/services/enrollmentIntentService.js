import { getItem, saveItem, removeItem } from './storageService';
import { createClientRecordId } from './secureId';

const pendingIntents = new Map();

export function fieldEnrollmentIntent(ownerId, payload) {
  if (!ownerId) return Promise.reject(new Error('Sign in before enrolling a field.'));
  const storageKey = `@hugpong_enrollment_${ownerId}_${encodeURIComponent(JSON.stringify(payload))}`;
  if (pendingIntents.has(storageKey)) return pendingIntents.get(storageKey);
  const pending = (async () => {
    let mutation = await getItem(storageKey);
    if (!mutation) {
      const mutationId = createClientRecordId('MUT');
      mutation = { mutationId, idempotencyKey: mutationId, entityKey: 'fields/new', baseVersion: null };
      if (!(await saveItem(storageKey, mutation))) {
        await removeItem(storageKey);
        throw new Error('The enrollment request could not be saved. Try again before continuing.');
      }
    }
    return { storageKey, mutation };
  })().finally(() => pendingIntents.delete(storageKey));
  pendingIntents.set(storageKey, pending);
  return pending;
}
