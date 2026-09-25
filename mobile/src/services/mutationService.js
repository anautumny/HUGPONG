import { authenticatedRequest } from './authService';

const api = (path, method, body, mutation = null, takeoverGrant = null) => authenticatedRequest(path, {
  method,
  headers: takeoverGrant ? { 'X-Hugpong-Takeover-Grant': takeoverGrant } : {},
  body: mutation ? {
    ...body,
    _mutation: {
      mutationId: mutation.mutationId,
      idempotencyKey: mutation.idempotencyKey,
      entityKey: mutation.entityKey,
      baseVersion: mutation.baseVersion === undefined ? null : mutation.baseVersion
    }
  } : body
});

export const createField = (payload, mutation) => api('/api/fields', 'POST', payload, mutation);
export const updateField = (id, payload, mutation) => {
  const { id: _ignoredId, fieldId: _ignoredFieldId, ...changes } = payload || {};
  return api(`/api/fields/${encodeURIComponent(id)}`, 'PATCH', changes, mutation);
};
export const archiveField = (id, mutation) => api(`/api/fields/${encodeURIComponent(id)}/archive`, 'POST', {}, mutation);
export const updateCycleStage = (cycleId, payload, mutation, takeoverGrant) => api(`/api/crop-cycles/${encodeURIComponent(cycleId)}/stage`, 'PATCH', payload, mutation, takeoverGrant);
export const startCycle = (fieldId, payload, mutation, takeoverGrant) => api(`/api/crop-cycles/${encodeURIComponent(fieldId)}/start`, 'POST', payload, mutation, takeoverGrant);
export const rolloverCycle = (fieldId, payload, mutation, takeoverGrant) => api(`/api/crop-cycles/${encodeURIComponent(fieldId)}/rollover`, 'POST', payload, mutation, takeoverGrant);
export const saveCustomStages = (fieldId, customStages, mutation) => api(`/api/fields/${encodeURIComponent(fieldId)}/custom-stages`, 'PUT', { customStages }, mutation);
export const saveCustomOperations = (fieldId, customOperations, mutation) => api(`/api/fields/${encodeURIComponent(fieldId)}/custom-operations`, 'PUT', { customOperations }, mutation);

export const createOperation = (payload, mutation, takeoverGrant) => api('/api/logs', 'POST', payload, mutation, takeoverGrant);
export const amendOperation = (id, changes, amendment, mutation, takeoverGrant) => api(`/api/logs/${encodeURIComponent(id)}`, 'PATCH', { changes, amendment }, mutation, takeoverGrant);
export const archiveOperations = (operationLogIds, mutation, takeoverGrant) => api('/api/logs/archive', 'POST', { ids: operationLogIds }, mutation, takeoverGrant);

export const publishPrice = (payload, mutation) => api('/api/prices', 'POST', payload, mutation);
export const createTicket = (payload, mutation) => api('/api/tickets', 'POST', payload, mutation);
export const addTicketMessage = (payload, mutation) => api(`/api/tickets/${encodeURIComponent(payload.id)}/messages`, 'POST', payload, mutation);
export const createAuditEvent = (payload, mutation) => api('/api/audit-events', 'POST', payload, mutation);
export const compileAuditReport = (payload, mutation) => api('/api/audit-reports', 'POST', payload, mutation);
export const submitAuditReport = (id, submissionMethod = 'CLOUD', mutation) => api(`/api/audit-reports/${encodeURIComponent(id)}/submit`, 'POST', { submissionMethod }, mutation);
export const returnAuditReport = (id, returnReason, mutation) => api(`/api/audit-reports/${encodeURIComponent(id)}/return`, 'POST', { returnReason }, mutation);
export const verifyAuditQr = (payload) => api('/api/audit-reports/qr/verify', 'POST', { payload });
export const importAuditQr = (payload, mutation) => api('/api/audit-reports/qr/import', 'POST', { payload }, mutation);
export const certifyAuditReport = (id, certificationNotes = '', mutation) => api(`/api/audit-reports/${encodeURIComponent(id)}/certify`, 'POST', { certificationNotes }, mutation);
export const approveUser = (payload, mutation) => api('/api/users/approve', 'POST', payload, mutation);
