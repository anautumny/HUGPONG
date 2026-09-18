/**
 * ══════════════════════════════════════════════════════════════
 * HUGPONG — Central Authenticated API Client
 * Preserves exact server-authoritative mutation boundaries,
 * idempotency envelopes, and session handling.
 * ══════════════════════════════════════════════════════════════
 */

import { signInWithCustomTokenSilently } from './firebaseClient';

export function createMutationContext(path, body, suppliedBaseVersion = null) {
  const token = `${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
  const mutationId = `MUT-WEB-${token}`;
  return {
    mutationId,
    idempotencyKey: mutationId,
    entityKey: String(path || '').replace(/^\/api\//, '').replace(/\?.*$/, ''),
    baseVersion: suppliedBaseVersion
  };
}

export async function authenticatedRequest(path, options = {}) {
  const token = options.token || localStorage.getItem('hugpong_auth_token');
  const method = String(options.method || 'GET').toUpperCase();
  let requestBody = options.body;

  if (path.startsWith('/api/') && !['GET', 'HEAD'].includes(method) && requestBody && typeof requestBody === 'object' && !requestBody._mutation) {
    requestBody = {
      ...requestBody,
      _mutation: createMutationContext(path, requestBody, options.baseVersion)
    };
  }

  const response = await fetch(path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {})
    },
    body: requestBody === undefined ? undefined : JSON.stringify(requestBody),
    credentials: 'include'
  });

  const result = await response.json().catch(() => ({}));

  if (!response.ok || !result.success) {
    const error = new Error(result.error || 'Request was rejected by the server.');
    error.status = response.status;
    error.data = result.data;
    throw error;
  }

  if (result.token) {
    localStorage.setItem('hugpong_auth_token', result.token);
  }

  if (result.firebaseCustomToken) {
    await signInWithCustomTokenSilently(result.firebaseCustomToken).catch(() => {});
  }

  return result;
}

export default {
  request: authenticatedRequest,
  createMutationContext
};
