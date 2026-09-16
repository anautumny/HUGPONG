import { authenticatedRequest } from './authService';

const api = (path, method, body, mutation = null) => authenticatedRequest(path, {
  method,
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
export const updateField = (id, payload, mutation) => api(`/api/fields/${encodeURIComponent(id)}`, 'PATCH', payload, mutation);
export const archiveField = (id, mutation) => api(`/api/fields/${encodeURIComponent(id)}/archive`, 'POST', {}, mutation);
export const updateCycleStage = (cycleId, payload, mutation) => api(`/api/crop-cycles/${encodeURIComponent(cycleId)}/stage`, 'PATCH', payload, mutation);
export const rolloverCycle = (fieldId, payload, mutation) => api(`/api/crop-cycles/${encodeURIComponent(fieldId)}/rollover`, 'POST', payload, mutation);
export const saveCustomStages = (fieldId, customStages, mutation) => api(`/api/fields/${encodeURIComponent(fieldId)}/custom-stages`, 'PUT', { customStages }, mutation);
export const saveCustomOperations = (fieldId, customOperations, mutation) => api(`/api/fields/${encodeURIComponent(fieldId)}/custom-operations`, 'PUT', { customOperations }, mutation);

export const createOperation = (payload, mutation) => api('/api/logs', 'POST', payload, mutation);
export const amendOperation = (id, changes, amendment, mutation) => api(`/api/logs/${encodeURIComponent(id)}`, 'PATCH', { changes, amendment }, mutation);
export const archiveOperations = (operationLogIds, mutation) => api('/api/logs/archive', 'POST', { ids: operationLogIds }, mutation);

export const publishPrice = (payload, mutation) => api('/api/prices', 'POST', payload, mutation);
export const createTicket = (payload, mutation) => api('/api/tickets', 'POST', payload, mutation);
export const createAuditEvent = (payload, mutation) => api('/api/audit-events', 'POST', payload, mutation);
export const compileAuditReport = (payload, mutation) => api('/api/audit-reports', 'POST', payload, mutation);
export const certifyAuditReport = (id, certificationNotes = '', mutation) => api(`/api/audit-reports/${encodeURIComponent(id)}/certify`, 'POST', { certificationNotes }, mutation);
export const approveUser = (payload, mutation) => api('/api/users/approve', 'POST', payload, mutation);
export const publishTelemetry = (deviceId, payload) => api(`/api/terminal-diagnostics/${encodeURIComponent(deviceId)}`, 'PUT', payload);
