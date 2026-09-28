import { authenticatedRequest } from './authService';
import { createClientRecordId } from './secureId';

export function createMobileReference() {
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return createClientRecordId('MOB', day).replace(/-([A-Z0-9]{10})[A-Z0-9]+$/, '-$1');
}

export async function reportMobileDiagnostic({ referenceId, module = 'MOBILE', level = 'ERROR', message, errorCode, syncStatus }) {
  try {
    return await authenticatedRequest('/api/diagnostics/client', {
      method: 'POST',
      body: { referenceId, module, level, message, errorCode, syncStatus }
    });
  } catch {
    return null;
  }
}

export default { createMobileReference, reportMobileDiagnostic };
