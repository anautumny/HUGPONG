import { authenticatedRequest } from './authService';
import { exportPdfFile } from './pdfFileService';

const query = ({ cropYearCycle, blockFarmId = '', cursor = '', startDate = '', endDate = '', coverageMode = '' }) => new URLSearchParams({ cropYearCycle, blockFarmId, ...(cursor ? { cursor } : {}), ...(coverageMode ? { coverageMode } : {}), ...(startDate ? { startDate } : {}), ...(endDate ? { endDate } : {}) }).toString();
export const fetchCropYearOptions = () => authenticatedRequest('/api/crop-year-compilations/options');
export const previewCropYear = scope => authenticatedRequest(`/api/crop-year-compilations/preview?${query(scope)}`);
export const fetchCropYearCompilations = scope => authenticatedRequest(`/api/crop-year-compilations?${query(scope)}`);
export const compileCropYear = scope => authenticatedRequest('/api/crop-year-compilations', { method: 'POST', body: scope });
export async function exportCropYearCompilation(id) {
  const response = await authenticatedRequest(`/api/crop-year-compilations/${encodeURIComponent(id)}/print`);
  return exportPdfFile(response.data.html, `${id.replace(/[^A-Za-z0-9_-]/g, '')}.pdf`);
}
