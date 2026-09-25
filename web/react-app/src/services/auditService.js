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

export {
  createAuditQrPayload, createAuditQrParts, decodeAuditQrPayload,
  decodeAuditQrPart, assembleAuditQrParts, validateCanonicalAuditReport
};

/**
 * Extract canonical HUGPONG audit hash or report ID from raw QR text or URL
 */
export function extractAuditHash(rawText) {
  if (!rawText) return null;
  const str = String(rawText).trim();

  if (str.startsWith('{')) {
    try {
      const payload = decodeAuditQrPayload(str);
      return payload.reportId;
    } catch {
      return null;
    }
  }

  // Match HUG-... hash (e.g. HUG-202609-XXXX or HUG-XXXX)
  const hugMatch = str.match(/(HUG-[A-Z0-9-]+)/i);
  if (hugMatch) return hugMatch[1].toUpperCase();

  // Match RPT-... report ID (e.g. RPT-2026-09-BF01-01)
  const rptMatch = str.match(/(RPT-[A-Z0-9-]+)/i);
  if (rptMatch) return rptMatch[1].toUpperCase();

  // If text itself looks like an alphanumeric code without prefix
  if (/^[A-Z0-9-]{6,40}$/i.test(str)) {
    return str.toUpperCase();
  }

  return null;
}

/**
 * Attempt to decode a QR code from an image File using native BarcodeDetector
 */
export async function decodeQRCodeFromImage(file) {
  if (!file) throw new Error('No image file provided.');

  if ('BarcodeDetector' in window) {
    try {
      const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
      const imgBitmap = await createImageBitmap(file);
      const barcodes = await detector.detect(imgBitmap);
      if (barcodes && barcodes.length > 0 && barcodes[0].rawValue) {
        return barcodes[0].rawValue;
      }
    } catch (e) {
      console.warn('[AuditService] BarcodeDetector error:', e);
    }
  }

  throw new Error('Could not decode QR code from this photo. Please ensure good lighting or enter the audit hash code manually.');
}
