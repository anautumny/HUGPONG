import { Alert, AppState, Platform } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';

// PDFs and QR images share one native picker/share request at a time.
let exporting = false;

function requireActiveApp() {
  if (AppState?.currentState && AppState.currentState !== 'active') {
    throw new Error('Return to HUGPONG and try saving again.');
  }
}

async function saveBase64File(base64, filename, { mimeType, UTI, savedTitle, dialogTitle }) {
  if (!base64) throw new Error('The generated file is unavailable.');
  requireActiveApp();
  if (Platform.OS === 'android') {
    const storage = FileSystem.StorageAccessFramework;
    // Let Android choose a valid location. A forced Downloads tree can fail in
    // DocumentsUI and Android does not allow granting its root on newer devices.
    const permission = await storage.requestDirectoryPermissionsAsync();
    if (!permission.granted) return { cancelled: true, filename };
    const uri = await storage.createFileAsync(permission.directoryUri, filename, mimeType);
    try {
      await storage.writeAsStringAsync(uri, base64, { encoding: FileSystem.EncodingType.Base64 });
    } catch (error) {
      await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
      throw error;
    }
    Alert.alert(savedTitle, `${filename} was saved in the folder you selected.`);
    return { uri, filename, saved: true };
  }
  if (!FileSystem.cacheDirectory) throw new Error('Temporary storage is unavailable.');
  if (!await Sharing.isAvailableAsync()) throw new Error('The system save sheet is unavailable.');
  const uri = `${FileSystem.cacheDirectory}${filename}`;
  await FileSystem.writeAsStringAsync(uri, base64, { encoding: FileSystem.EncodingType.Base64 });
  requireActiveApp();
  await Sharing.shareAsync(uri, { mimeType, dialogTitle, UTI });
  // Retain the app-owned cache file while the receiving app reads it.
  return { uri, filename, shared: true };
}

export async function exportQrImageFile(qr, filename) {
  if (exporting) throw new Error('A file export is already open. Finish or cancel it before saving another file.');
  exporting = true;
  try {
    requireActiveApp();
    if (typeof qr?.toDataURL !== 'function') throw new Error('The QR image is not ready. Open the QR and try again.');
    const base64 = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('The QR image could not be prepared.')), 10000);
      try {
        qr.toDataURL(data => {
          clearTimeout(timeout);
          if (data) resolve(data);
          else reject(new Error('The QR image could not be prepared.'));
        }, { width: 1200, height: 1200 });
      } catch (error) {
        clearTimeout(timeout);
        reject(error);
      }
    });
    return await saveBase64File(base64, filename, {
      mimeType: 'image/png', UTI: 'public.png', savedTitle: 'QR Image Saved', dialogTitle: 'Save or share audit QR'
    });
  } finally {
    exporting = false;
  }
}

export async function exportPdfFile(html, filename, pageOptions = {}) {
  if (exporting) throw new Error('A file export is already open. Finish or cancel it before exporting another report.');
  exporting = true;
  let generatedUri;
  try {
    requireActiveApp();
    const result = await Print.printToFileAsync({ ...pageOptions, html, base64: true });
    generatedUri = result.uri;
    if (Platform.OS !== 'android' && !await Sharing.isAvailableAsync()) {
      await Print.printAsync({ ...pageOptions, html });
      return { filename, printed: true };
    }
    const base64 = result.base64 || (generatedUri && await FileSystem.readAsStringAsync(generatedUri, {
      encoding: FileSystem.EncodingType.Base64
    }));
    return await saveBase64File(base64, filename, {
      mimeType: 'application/pdf', UTI: 'com.adobe.pdf', savedTitle: 'PDF Saved', dialogTitle: `Save or share ${filename}`
    });
  } finally {
    if (generatedUri) await FileSystem.deleteAsync(generatedUri, { idempotent: true }).catch(() => {});
    exporting = false;
  }
}
