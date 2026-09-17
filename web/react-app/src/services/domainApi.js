import { apiRequest } from './apiClient';
import { buildPricePayload } from '../domain/priceModel';

const idToken = () => `${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

export const usersApi = Object.freeze({
  list: () => apiRequest('/api/users'),
  create: data => apiRequest('/api/users/approve', { method: 'POST', body: data }),
  approve: user => apiRequest('/api/users/approve', { method: 'POST', body: { id: user.id, role: user.role }, baseVersion: user.updatedAt }),
  update: (user, changes) => apiRequest(`/api/users/${encodeURIComponent(user.id)}`, { method: 'PATCH', body: changes, baseVersion: user.updatedAt }),
  requestPhoneOtp: (phone, displayName) => apiRequest('/api/users/phone-verification/request', { method: 'POST', body: { phone, displayName } }),
  verifyPhoneOtp: (phone, code) => apiRequest('/api/users/phone-verification/verify', { method: 'POST', body: { phone, code } })
});

export const farmsApi = Object.freeze({
  list: () => apiRequest('/api/block-farms'),
  create: data => apiRequest('/api/block-farms', { method: 'POST', body: data }),
  update: (farm, changes) => apiRequest(`/api/block-farms/${encodeURIComponent(farm.id)}`, { method: 'PUT', body: changes, baseVersion: farm.updatedAt })
});

export const fieldsApi = Object.freeze({
  list: () => apiRequest('/api/fields'),
  create: data => apiRequest('/api/fields', { method: 'POST', body: data }),
  update: (field, changes) => apiRequest(`/api/fields/${encodeURIComponent(field.id)}`, { method: 'PATCH', body: changes, baseVersion: field.updatedAt }),
  archive: field => apiRequest(`/api/fields/${encodeURIComponent(field.id)}/archive`, { method: 'POST', body: {}, baseVersion: field.updatedAt }),
  customOperations: (field, customOperations) => apiRequest(`/api/fields/${encodeURIComponent(field.id)}/custom-operations`, { method: 'PUT', body: { customOperations }, baseVersion: field.updatedAt }),
  customStages: (field, customStages) => apiRequest(`/api/fields/${encodeURIComponent(field.id)}/custom-stages`, { method: 'PUT', body: { customStages }, baseVersion: field.updatedAt })
});

export const operationsApi = Object.freeze({
  list: () => apiRequest('/api/logs'),
  create: data => apiRequest('/api/logs', { method: 'POST', body: { id: data.id || `LOG-${String(data.fieldId).replace(/[^A-Za-z0-9]/g, '').toUpperCase()}-${idToken()}`, ...data } }),
  amend: (log, changes, reason) => apiRequest(`/api/logs/${encodeURIComponent(log.id)}`, {
    method: 'PATCH', body: { changes, amendment: { amendmentId: `AMD-${idToken()}`, reason, changes } }, baseVersion: log.updatedAt
  })
});

export const cyclesApi = Object.freeze({
  list: () => apiRequest('/api/crop-cycles'),
  updateStage: (cycle, currentStageNumber, elapsedMonths) => apiRequest(`/api/crop-cycles/${encodeURIComponent(cycle.id)}/stage`, {
    method: 'PATCH', body: { currentStageNumber, elapsedMonths }, baseVersion: cycle.updatedAt
  }),
  rollover: (field, cycle, data) => apiRequest(`/api/crop-cycles/${encodeURIComponent(field.id)}/rollover`, {
    method: 'POST', body: { previousCycleId: cycle.id, ...data }, baseVersion: field.updatedAt
  })
});

export const pricesApi = Object.freeze({
  list: () => apiRequest('/api/prices'),
  publish(data, previous) {
    const payload = buildPricePayload(data, previous);
    return apiRequest('/api/prices', {
      method: 'POST',
      body: { id: payload.id || `PRC-${idToken()}`, ...payload }
    });
  }
});

export const auditsApi = Object.freeze({
  list: () => apiRequest('/api/audit-reports'),
  compile: data => apiRequest('/api/audit-reports', { method: 'POST', body: { id: data.id || `RPT-${data.period}-${String(data.blockFarmId).replace(/[^A-Za-z0-9]/g, '')}-${idToken()}`, ...data } }),
  certify: (report, certificationNotes) => apiRequest(`/api/audit-reports/${encodeURIComponent(report.id)}/certify`, { method: 'POST', body: { certificationNotes }, baseVersion: report.updatedAt })
});

export const ticketsApi = Object.freeze({
  list: () => apiRequest('/api/tickets'),
  create: data => apiRequest('/api/tickets', { method: 'POST', body: { id: data.id || `TCK-${idToken()}`, ...data } }),
  update: (ticket, changes) => apiRequest(`/api/tickets/${encodeURIComponent(ticket.id)}`, { method: 'PATCH', body: changes, baseVersion: ticket.updatedAt })
});

export const accountApi = Object.freeze({
  verifyPassword: password => apiRequest('/auth/verify-password', { method: 'POST', body: { password } }),
  changePassword: (currentPassword, newPassword) => apiRequest('/auth/change-password', { method: 'POST', body: { currentPassword, newPassword } }),
  changePhone: (currentPassword, phone) => apiRequest('/auth/change-phone', { method: 'POST', body: { currentPassword, phone } }),
  smsStatus: () => apiRequest('/api/sms/status')
});
