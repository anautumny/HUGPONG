import { authenticatedRequest } from './apiClient';

const query = ({ cropYearCycle, blockFarmId = '', cursor = '' }) => new URLSearchParams({ cropYearCycle, blockFarmId, ...(cursor ? { cursor } : {}) });
export const fetchCropYearOptions = () => authenticatedRequest('/api/crop-year-compilations/options');
export const previewCropYear = scope => authenticatedRequest(`/api/crop-year-compilations/preview?${query(scope)}`);
export const fetchCropYearCompilations = scope => authenticatedRequest(`/api/crop-year-compilations?${query(scope)}`);
export const compileCropYear = scope => authenticatedRequest('/api/crop-year-compilations', { method: 'POST', body: scope });
export async function printCropYearCompilation(id) {
  const popup = window.open('', '_blank');
  if (!popup) throw new Error('Allow pop-ups to print this compilation.');
  popup.opener = null;
  try {
    const response = await authenticatedRequest(`/api/crop-year-compilations/${encodeURIComponent(id)}/print`);
    popup.document.open();
    popup.document.write(response.data.html);
    popup.document.close();
    await popup.document.fonts.ready;
    popup.focus();
    popup.print();
  } catch (error) { popup.close(); throw error; }
}
