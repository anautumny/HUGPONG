import { createMutationContext } from './apiClient';

export async function creationIntent(ownerId, payload, resource = 'fields') {
  if (!ownerId) throw new Error('Sign in before enrolling a field.');
  const bytes = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(payload)));
  const fingerprint = Array.from(new Uint8Array(bytes), value => value.toString(16).padStart(2, '0')).join('');
  const storageKey = `hugpong_enrollment_${resource === 'fields' ? '' : `${resource}_`}${ownerId}_${fingerprint}`;
  const previous = localStorage.getItem(storageKey);
  if (previous) return { storageKey, mutation: JSON.parse(previous) };
  const mutation = createMutationContext(`/api/${resource}`, payload);
  localStorage.setItem(storageKey, JSON.stringify(mutation));
  return { storageKey, mutation };
}

export function fieldEnrollmentIntent(ownerId, payload) { return creationIntent(ownerId, payload); }
