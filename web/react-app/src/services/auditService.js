/**
 * ══════════════════════════════════════════════════════════════
 * HUGPONG — SRA Audit Service
 * Central authority for audit report subscriptions, compilation,
 * QR decoding, and server-authoritative SRA certification.
 * ══════════════════════════════════════════════════════════════
 */

import { fromReport, reportPeriod } from './firestoreSchema';
import { authenticatedRequest, subscribeToAuthenticatedResource } from './apiClient';
import { sortNewestFirst } from '../utils/recordOrdering';
import {
  createAuditQrPayload, createAuditQrParts, decodeAuditQrPayload,
  decodeAuditQrPart, assembleAuditQrParts, validateCanonicalAuditReport
} from '../domain/auditWorkflow';

/**
 * Real-time subscription to audit reports collection
 * @param {Object} options
 * @param {Function} options.onUpdate - ({ reports: Array, isLoading: boolean, error: string|null })
 * @param {Function} [options.onError]
 * @param {string} [options.blockFarmId] - Optional client filter for Farm Manager scope
 */
export function subscribeToAuditReports({ onUpdate, onError, blockFarmId = null, view = null, limit = 20 }) {
  const params = new URLSearchParams();
  if (view) params.set('view', view);
  if (limit) params.set('limit', String(limit));
  const path = `/api/audit-reports${params.toString() ? `?${params}` : ''}`;
  return subscribeToAuthenticatedResource(path, {
    onData: response => {
      let reports = (response.data || []).map(item => fromReport(item.id, item));
      if (blockFarmId) reports = reports.filter(report => report.blockFarmId === blockFarmId);
      onUpdate({
        reports: sortNewestFirst(reports, ['compiledAt', 'createdAt']),
        isLoading: false,
        error: null
      });
    },
    onError: error => {
      if (onError) onError(error);
    }
  });
}

/**
 * Fetch all authorized audit reports via API
 */
export async function fetchAuditReports() {
  return authenticatedRequest('/api/audit-reports');
}

export async function fetchAuditPage({ view = 'inbox', limit = 20, cursor = null } = {}) {
  const params = new URLSearchParams({ view, limit: String(limit) });
  if (cursor) params.set('cursor', cursor);
  return authenticatedRequest(`/api/audit-reports?${params}`);
}

export async function fetchNextAuditPeriod(blockFarmId = null) {
  const suffix = blockFarmId ? `?blockFarmId=${encodeURIComponent(blockFarmId)}` : '';
  return authenticatedRequest(`/api/audit-reports/next-period${suffix}`);
}

/**
 * Farm Manager: Compile active operations for a block farm and period into an audit report
 */
export async function compileAuditReport({ blockFarmId, periodKey, operationLogIds = [], id = null }) {
  const canonicalPeriodKey = reportPeriod(periodKey);
  if (!canonicalPeriodKey) throw new Error('Select a valid audit month and year before compiling.');
  const payload = {
    blockFarmId: String(blockFarmId || '').trim().toUpperCase(),
    periodKey: canonicalPeriodKey,
    operationLogIds: Array.isArray(operationLogIds) ? operationLogIds : []
  };
  if (id) payload.id = id;

  return authenticatedRequest('/api/audit-reports', {
    method: 'POST',
    body: payload
  });
}

/**
 * SRA Admin: Issue official SRA Digital Seal and certification
 */
export async function certifyAuditReport(reportId, { certificationNotes = '' } = {}) {
  const cleanId = String(reportId || '').trim();
  return authenticatedRequest(`/api/audit-reports/${encodeURIComponent(cleanId)}/certify`, {
    method: 'POST',
    body: { certificationNotes }
  });
}

export async function submitAuditReport(reportId) {
  return authenticatedRequest(`/api/audit-reports/${encodeURIComponent(reportId)}/submit`, {
    method: 'POST', body: { submissionMethod: 'CLOUD' }
  });
}

export async function returnAuditReport(reportId, returnReason, baseVersion = null) {
  return authenticatedRequest(`/api/audit-reports/${encodeURIComponent(reportId)}/return`, {
    method: 'POST', body: { returnReason }, baseVersion
  });
}

export async function verifyAuditQr(payload) {
  return authenticatedRequest('/api/audit-reports/qr/verify', { method: 'POST', body: { payload } });
}

export async function importAuditQr(payload) {
  return authenticatedRequest('/api/audit-reports/qr/import', { method: 'POST', body: { payload } });
}

export async function verifyAuditReportIntegrity(report) {
  if (!globalThis.crypto?.subtle) throw new Error('Secure audit verification is not available in this browser.');
  const canonical = JSON.stringify({
    reportId: report?.reportId || report?.id,
    blockFarmId: report?.blockFarmId,
    period: report?.periodKey || report?.period,
    operationSnapshots: report?.operationSnapshots || []
  });
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical));
  const hex = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  const expected = `HUG-${hex.slice(0, 24).toUpperCase()}`;
  return expected === (report?.integrityHash || report?.qrHash);
}

export {
  createAuditQrPayload, createAuditQrParts, decodeAuditQrPayload,
  decodeAuditQrPart, assembleAuditQrParts, validateCanonicalAuditReport
};
