import { authenticatedRequest } from './authService';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';

const query = ({ cropYearCycle, blockFarmId = '', cursor = '' }) => `cropYearCycle=${encodeURIComponent(cropYearCycle)}&blockFarmId=${encodeURIComponent(blockFarmId)}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
export const fetchCropYearOptions = () => authenticatedRequest('/api/crop-year-compilations/options');
export const previewCropYear = scope => authenticatedRequest(`/api/crop-year-compilations/preview?${query(scope)}`);
export const fetchCropYearCompilations = scope => authenticatedRequest(`/api/crop-year-compilations?${query(scope)}`);
export const compileCropYear = scope => authenticatedRequest('/api/crop-year-compilations', { method: 'POST', body: scope });
export async function exportCropYearCompilation(id) {
  if (!(await Sharing.isAvailableAsync())) throw new Error('PDF sharing is unavailable on this device.');
  const response = await authenticatedRequest(`/api/crop-year-compilations/${encodeURIComponent(id)}/print`);
  let uri;
  let namedUri;
  try {
    ({ uri } = await Print.printToFileAsync({ html: response.data.html }));
    namedUri = `${FileSystem.cacheDirectory}${id.replace(/[^A-Za-z0-9_-]/g, '')}.pdf`;
    await FileSystem.copyAsync({ from: uri, to: namedUri });
    await Sharing.shareAsync(namedUri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: 'Share Crop Year Compilation' });
  } finally {
    if (uri) await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
    if (namedUri) await FileSystem.deleteAsync(namedUri, { idempotent: true }).catch(() => {});
  }
}
