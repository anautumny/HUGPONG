import { authenticatedRequest } from './apiClient';

export function createClientReference(module = 'WEB') {
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const random = globalThis.crypto.randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase();
  return `${String(module).toUpperCase()}-${day}-${random}`;
}

export async function reportClientDiagnostic({ referenceId, module = 'WEB', level = 'ERROR', message, errorCode, syncStatus }) {
  try {
    return await authenticatedRequest('/api/diagnostics/client', {
      method: 'POST',
      body: { referenceId, module, level, message, errorCode, syncStatus }
    });
  } catch {
    return null;
  }
}

export default { createClientReference, reportClientDiagnostic };
