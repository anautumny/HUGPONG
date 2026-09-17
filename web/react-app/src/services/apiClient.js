import { getSession } from './sessionStore';

function mutationId() {
  if (globalThis.crypto?.randomUUID) return `MUT-WEB-${globalThis.crypto.randomUUID()}`;
  return `MUT-WEB-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`.toUpperCase();
}

export async function apiRequest(path, options = {}) {
  const method = String(options.method || 'GET').toUpperCase();
  const token = Object.prototype.hasOwnProperty.call(options, 'token') ? options.token : getSession()?.token;
  let body = options.body;
  if (path.startsWith('/api/') && !['GET', 'HEAD'].includes(method) && body && !body._mutation) {
    const id = mutationId();
    body = { ...body, _mutation: { mutationId: id, idempotencyKey: id, entityKey: String(options.entityKey || path.replace(/^\/api\//, '').replace(/\?.*$/, '')), baseVersion: options.baseVersion === undefined ? null : options.baseVersion } };
  }
  const response = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(options.headers || {}) },
    body: body === undefined ? undefined : JSON.stringify(body), credentials: 'include'
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.success === false) {
    const error = new Error(result.error || `Request failed with HTTP ${response.status}.`);
    error.status = response.status; error.data = result.data; throw error;
  }
  return result;
}
