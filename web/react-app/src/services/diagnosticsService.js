import { authenticatedRequest } from './apiClient';

export async function fetchDiagnostics(filters = {}) {
  const params = new URLSearchParams();
  for (const key of ['level', 'module', 'date', 'referenceId', 'search']) {
    const value = String(filters[key] || '').trim();
    if (value) params.set(key, value);
  }
  params.set('limit', String(filters.limit || 50));
  const response = await authenticatedRequest(`/api/diagnostics?${params.toString()}`);
  return {
    entries: Array.isArray(response.data) ? response.data : [],
    levels: Array.isArray(response.levels) ? response.levels : [],
    modules: Array.isArray(response.modules) ? response.modules : []
  };
}

export default { fetchDiagnostics };
