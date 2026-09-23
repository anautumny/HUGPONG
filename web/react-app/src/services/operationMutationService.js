import { authenticatedRequest } from './apiClient';

const takeoverHeaders = takeoverGrant => takeoverGrant
  ? { 'X-Hugpong-Takeover-Grant': takeoverGrant }
  : {};

export async function createOperation(payload, takeoverGrant = null) {
  return authenticatedRequest('/api/logs', {
    method: 'POST',
    body: payload,
    headers: takeoverHeaders(takeoverGrant)
  });
}

export async function updateOperation(operationId, changes, amendment, baseVersion = null, takeoverGrant = null) {
  return authenticatedRequest(`/api/logs/${encodeURIComponent(operationId)}`, {
    method: 'PATCH',
    body: { changes, amendment },
    baseVersion,
    headers: takeoverHeaders(takeoverGrant)
  });
}

export async function archiveOperations(ids, takeoverGrant = null) {
  return authenticatedRequest('/api/logs/archive', {
    method: 'POST',
    body: { ids: Array.isArray(ids) ? ids : [ids] },
    headers: takeoverHeaders(takeoverGrant)
  });
}

export async function verifySupervisorAuth({ password, fieldId }) {
  return authenticatedRequest('/auth/verify-password', {
    method: 'POST',
    body: { password, purpose: 'MANAGER_TAKEOVER', fieldId }
  });
}
