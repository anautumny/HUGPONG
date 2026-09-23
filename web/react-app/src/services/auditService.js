/**
 * ══════════════════════════════════════════════════════════════
 * HUGPONG — SRA Audit Service
 * Central authority for audit report subscriptions, compilation,
 * QR decoding, and server-authoritative SRA certification.
 * ══════════════════════════════════════════════════════════════
 */

import { db, collection, onSnapshot, query, where } from './firebaseClient';
import { COLLECTIONS, fromReport } from './firestoreSchema';
import { authenticatedRequest } from './apiClient';

/**
 * Real-time subscription to audit reports collection
 * @param {Object} options
 * @param {Function} options.onUpdate - ({ reports: Array, isLoading: boolean, error: string|null })
 * @param {Function} [options.onError]
 * @param {string} [options.blockFarmId] - Optional client filter for Farm Manager scope
 */
export function subscribeToAuditReports({ onUpdate, onError, blockFarmId = null }) {
  let isSubscribed = true;

  // Initial fetch from authoritative API endpoint
  authenticatedRequest('/api/audit-reports')
    .then(res => {
      if (!isSubscribed) return;
      if (res.success && Array.isArray(res.data)) {
        let reports = res.data.map(item => fromReport(item.id, item));
        if (blockFarmId) {
          reports = reports.filter(r => r.blockFarmId === blockFarmId);
        }
        reports.sort((a, b) => new Date(b.compiledAt || b.createdAt || 0) - new Date(a.compiledAt || a.createdAt || 0));
        onUpdate({ reports, isLoading: false, error: null });
      }
    })
    .catch(err => {
      console.warn('[AuditService] Initial API fetch notice:', err.message);
    });

  // Real-time Firestore snapshot listener
  let unsub = null;
  try {
    const reportsRef = blockFarmId
      ? query(collection(db, COLLECTIONS.AUDIT_REPORTS), where('blockFarmId', '==', blockFarmId))
      : collection(db, COLLECTIONS.AUDIT_REPORTS);
    unsub = onSnapshot(
      reportsRef,
      snapshot => {
        if (!isSubscribed) return;
        const reports = [];
        snapshot.forEach(docSnap => {
          try {
            reports.push(fromReport(docSnap.id, docSnap.data()));
          } catch (e) {
            console.warn('[AuditService] Skip report doc:', docSnap.id, e.message);
          }
        });

        let filtered = reports;
        if (blockFarmId) {
          filtered = filtered.filter(r => r.blockFarmId === blockFarmId);
        }
        filtered.sort((a, b) => new Date(b.compiledAt || b.createdAt || 0) - new Date(a.compiledAt || a.createdAt || 0));
        onUpdate({ reports: filtered, isLoading: false, error: null });
      },
      err => {
        console.warn('[AuditService] Snapshot listener note:', err.message);
        if (onError) onError(err);
      }
    );
  } catch (err) {
    console.warn('[AuditService] Could not establish Firestore listener:', err.message);
  }

  return () => {
    isSubscribed = false;
    if (typeof unsub === 'function') unsub();
  };
}

/**
 * Fetch all authorized audit reports via API
 */
export async function fetchAuditReports() {
  return authenticatedRequest('/api/audit-reports');
}

/**
 * Farm Manager: Compile active operations for a block farm and period into an audit report
 */
export async function compileAuditReport({ blockFarmId, period, operationLogIds, id = null }) {
  const payload = {
    blockFarmId: String(blockFarmId || '').trim().toUpperCase(),
    period: String(period || '').trim(),
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

/**
 * Extract canonical HUGPONG audit hash or report ID from raw QR text or URL
 */
export function extractAuditHash(rawText) {
  if (!rawText) return null;
  const str = String(rawText).trim();

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
