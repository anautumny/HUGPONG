import { authenticatedRequest } from './authService';
import { createClientRecordId } from './secureId';

export const CLIENT_DIAGNOSTIC_MESSAGE_LIMIT = 1000;

export function boundedDiagnosticMessage(message) {
  const normalized = String(message || 'Client failure without an error message.').trim();
  if (normalized.length <= CLIENT_DIAGNOSTIC_MESSAGE_LIMIT) return normalized;
  return `${normalized.slice(0, CLIENT_DIAGNOSTIC_MESSAGE_LIMIT - 16).trimEnd()} [TRUNCATED]`;
}

export function createMobileReference() {
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return createClientRecordId('MOB', day).replace(/-([A-Z0-9]{10})[A-Z0-9]+$/, '-$1');
}

export async function reportMobileDiagnostic({ referenceId, module = 'MOBILE', level = 'ERROR', message, errorCode, syncStatus }) {
  try {
    return await authenticatedRequest('/api/diagnostics/client', {
      method: 'POST',
      body: {
        referenceId,
        module,
        level,
        message: boundedDiagnosticMessage(message),
        errorCode,
        syncStatus
      }
    });
  } catch {
    return null;
  }
}

export default { createMobileReference, reportMobileDiagnostic };
