import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, scanFromURLAsync, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';

export default function LiveQRScanner({ visible = false, onClose, onCodeDetected }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [cameraError, setCameraError] = useState('');
  const [scanMessage, setScanMessage] = useState('');
  const [scanLocked, setScanLocked] = useState(false);
  const [cameraBusy, setCameraBusy] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [systemScannerActive, setSystemScannerActive] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);
  const permissionRequestedRef = useRef(false);
  const scanLockedRef = useRef(false);
  const scanRearmTimerRef = useRef(null);
  const lastScanRef = useRef({ data: '', scannedAt: 0 });
  const mountedRef = useRef(true);

  useEffect(() => () => {
    mountedRef.current = false;
    if (scanRearmTimerRef.current) clearTimeout(scanRearmTimerRef.current);
  }, []);

  useEffect(() => {
    if (!visible) {
      permissionRequestedRef.current = false;
      scanLockedRef.current = false;
      lastScanRef.current = { data: '', scannedAt: 0 };
      if (scanRearmTimerRef.current) clearTimeout(scanRearmTimerRef.current);
      setCameraError('');
      setScanMessage('');
      setScanLocked(false);
      setCameraBusy(false);
      setCameraReady(false);
      setSystemScannerActive(false);
      setUploadBusy(false);
      return;
    }
    if (permission && !permission.granted && permission.canAskAgain && !permissionRequestedRef.current) {
      permissionRequestedRef.current = true;
      requestPermission().catch(() => {});
    }
  }, [visible, permission, requestPermission]);

  const handleBarcodeScanned = useCallback(async ({ data }, source = 'camera') => {
    const normalizedData = String(data || '').trim();
    if (scanLockedRef.current || !normalizedData) return;
    const scannedAt = Date.now();
    if (lastScanRef.current.data === normalizedData && scannedAt - lastScanRef.current.scannedAt < 1500) return;
    lastScanRef.current = { data: normalizedData, scannedAt };
    scanLockedRef.current = true;
    setScanLocked(true);
    setScanMessage('Validating audit report...');
    try {
      const outcome = await onCodeDetected?.(normalizedData, { source });
      if (outcome?.continueScanning && mountedRef.current) {
        setScanMessage(outcome.message || 'This QR code is not a valid HUGPONG audit report.');
        scanRearmTimerRef.current = setTimeout(() => {
          if (!mountedRef.current) return;
          scanLockedRef.current = false;
          setScanLocked(false);
        }, 650);
      }
    } catch (error) {
      if (!mountedRef.current) return;
      setScanMessage(error.message || 'This QR code is not a valid HUGPONG audit report.');
      scanRearmTimerRef.current = setTimeout(() => {
        if (!mountedRef.current) return;
        scanLockedRef.current = false;
        setScanLocked(false);
      }, 650);
    }
  }, [onCodeDetected]);

  const openCamera = useCallback(async () => {
    if (cameraBusy || scanLockedRef.current) return;
    setCameraError('');
    setScanMessage('Opening the device QR scanner...');

    let currentPermission = permission;
    if (!currentPermission?.granted && currentPermission?.canAskAgain !== false) {
      permissionRequestedRef.current = true;
      currentPermission = await requestPermission();
    }
    if (!currentPermission?.granted) {
      setCameraError('Camera permission is required. Enable it in device settings, or upload a QR image.');
      return;
    }
    if (!CameraView.isModernBarcodeScannerAvailable) {
      setCameraError('The native QR camera is unavailable on this device. Upload a QR image instead.');
      return;
    }

    setCameraBusy(true);
    setCameraReady(false);
    setSystemScannerActive(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 120));
      await CameraView.launchScanner({ barcodeTypes: ['qr'] });
      if (mountedRef.current && !scanLockedRef.current) {
        setScanMessage('System scanner closed. The live scanner is ready.');
      }
    } catch (error) {
      if (!mountedRef.current) return;
      const message = String(error?.message || '');
      if (/cancel/i.test(message)) {
        setScanMessage('System scanner closed. The live scanner is ready.');
      } else {
        setCameraError(message || 'The device QR camera could not be opened. Upload a QR image instead.');
      }
    } finally {
      if (mountedRef.current) {
        setCameraBusy(false);
        setCameraReady(false);
        setSystemScannerActive(false);
      }
    }
  }, [cameraBusy, permission, requestPermission]);

  useEffect(() => {
    if (!visible || !CameraView.isModernBarcodeScannerAvailable) return undefined;
    const subscription = CameraView.onModernBarcodeScanned(result => {
      handleBarcodeScanned(result, 'camera');
    });
    return () => subscription.remove();
  }, [visible, handleBarcodeScanned]);

  const retryPermission = async () => {
    permissionRequestedRef.current = true;
    setCameraError('');
    const result = await requestPermission();
    if (!result.granted) {
      setCameraError('Camera permission is required. Enable it in device settings, or upload a QR image.');
    }
  };

  const uploadQrImage = async () => {
    if (uploadBusy || scanLockedRef.current) return;
    setUploadBusy(true);
    setCameraError('');
    setScanMessage('Choose the QR image and crop closely around the square code.');
    try {
      const selection = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 1,
      });
      if (selection.canceled || !selection.assets?.[0]?.uri) {
        setScanMessage('Choose a QR image or open the camera.');
        return;
      }
      setScanMessage('Reading uploaded QR image...');
      const barcodes = await scanFromURLAsync(selection.assets[0].uri, ['qr']);
      const qrCode = barcodes.find(barcode => Boolean(barcode.data));
      if (!qrCode) {
        setScanMessage('No readable QR was found. Upload it again and crop tightly around the QR square.');
        return;
      }
      await handleBarcodeScanned({ data: qrCode.data }, 'image');
    } catch (error) {
      if (mountedRef.current) {
        setScanMessage(error.message || 'The QR image could not be read. Try a PNG or a clear screenshot.');
      }
    } finally {
      if (mountedRef.current) setUploadBusy(false);
    }
  };

  if (!visible) return null;

  const permissionLoading = !permission;
  const permissionDenied = permission && !permission.granted;

  return (
    <Modal visible animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close scanner" style={styles.closeButton} onPress={onClose}>
            <Ionicons name="close" size={25} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.title}>Scan QR</Text>
          <View style={styles.headerSpacer} />
        </View>

        <View style={styles.content}>
          <View style={styles.iconCircle}>
            <Ionicons name="scan-outline" size={48} color="#2F6B3B" />
          </View>

          {permissionLoading ? (
            <>
              <ActivityIndicator size="large" color="#2F6B3B" />
              <Text style={styles.heading}>Checking camera...</Text>
            </>
          ) : permissionDenied ? (
            <>
              <Text style={styles.heading}>Camera Permission Needed</Text>
              <Text style={styles.help}>Allow camera access to open the device QR scanner. Image upload works without the camera.</Text>
              {permission.canAskAgain ? (
                <TouchableOpacity style={styles.primaryButton} onPress={retryPermission}>
                  <Text style={styles.primaryButtonText}>Allow Camera</Text>
                </TouchableOpacity>
              ) : null}
            </>
          ) : (
            <>
              <Text style={styles.heading}>Scan Audit QR</Text>
              <Text style={styles.help}>Keep the complete QR square inside the frame. Multi-part transfers continue scanning without closing the camera.</Text>
              <View style={styles.cameraFrame}>
                {!systemScannerActive ? (
                  <CameraView
                    style={styles.cameraPreview}
                    facing="back"
                    barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                    onBarcodeScanned={scanLocked ? undefined : result => handleBarcodeScanned(result, 'camera')}
                    onCameraReady={() => {
                      setCameraReady(true);
                      setCameraError('');
                    }}
                    onMountError={error => {
                      setCameraReady(false);
                      setCameraError(error?.message || 'The camera preview could not be started.');
                    }}
                  />
                ) : null}
              </View>
              {systemScannerActive || (!cameraReady && !cameraError) ? (
                <View style={styles.cameraStatus}>
                  <ActivityIndicator size="small" color="#2F6B3B" />
                  <Text style={styles.cameraStatusText}>{systemScannerActive ? 'Opening system scanner...' : 'Starting camera...'}</Text>
                </View>
              ) : null}
              {CameraView.isModernBarcodeScannerAvailable ? (
                <TouchableOpacity
                  disabled={cameraBusy || scanLocked}
                  style={[styles.deviceScannerButton, (cameraBusy || scanLocked) && styles.disabledButton]}
                  onPress={openCamera}
                >
                  {cameraBusy
                    ? <ActivityIndicator size="small" color="#2F6B3B" />
                    : <Ionicons name="scan-outline" size={18} color="#2F6B3B" />}
                  <Text style={styles.deviceScannerButtonText}>{cameraBusy ? 'Opening...' : 'Use System Scanner'}</Text>
                </TouchableOpacity>
              ) : null}
            </>
          )}

          {(cameraError || scanMessage) ? (
            <View style={[styles.statusCard, cameraError && styles.errorCard]}>
              <Text style={[styles.statusText, cameraError && styles.errorText]}>{cameraError || scanMessage}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.footer}>
          <TouchableOpacity
            disabled={uploadBusy || scanLocked}
            style={[styles.uploadButton, (uploadBusy || scanLocked) && styles.disabledButton]}
            onPress={uploadQrImage}
          >
            {uploadBusy
              ? <ActivityIndicator size="small" color="#2F6B3B" />
              : <Ionicons name="image-outline" size={20} color="#2F6B3B" />}
            <Text style={styles.uploadButtonText}>{uploadBusy ? 'Reading Image...' : 'Upload QR Image'}</Text>
          </TouchableOpacity>
          <Text style={styles.uploadHint}>Crop the image so the QR square fills most of the frame.</Text>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F9F4' },
  header: {
    height: 56,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#173D24',
  },
  closeButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  title: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  headerSpacer: { width: 42 },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  iconCircle: {
    width: 92,
    height: 92,
    borderRadius: 46,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E7F1E3',
    marginBottom: 20,
  },
  heading: { color: '#173D24', fontSize: 20, fontWeight: '900', textAlign: 'center', marginTop: 12 },
  help: { color: '#647067', fontSize: 14, lineHeight: 21, textAlign: 'center', maxWidth: 340, marginTop: 8 },
  primaryButton: {
    minHeight: 50,
    marginTop: 22,
    paddingHorizontal: 24,
    borderRadius: 12,
    backgroundColor: '#2F6B3B',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  primaryButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  cameraFrame: {
    width: '100%',
    maxWidth: 380,
    aspectRatio: 1,
    marginTop: 18,
    overflow: 'hidden',
    borderRadius: 18,
    backgroundColor: '#111827',
    borderWidth: 2,
    borderColor: '#2F6B3B',
  },
  cameraPreview: { flex: 1, width: '100%', height: '100%' },
  cameraStatus: {
    minHeight: 28,
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  cameraStatusText: { color: '#2F6B3B', fontSize: 12, fontWeight: '700' },
  deviceScannerButton: {
    minHeight: 42,
    marginTop: 12,
    paddingHorizontal: 18,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#2F6B3B',
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  deviceScannerButtonText: { color: '#2F6B3B', fontSize: 13, fontWeight: '800' },
  statusCard: { marginTop: 22, borderRadius: 10, backgroundColor: '#E7F1E3', paddingHorizontal: 14, paddingVertical: 11, maxWidth: 360 },
  errorCard: { backgroundColor: '#FDECEC' },
  statusText: { color: '#2F6B3B', fontSize: 13, lineHeight: 19, fontWeight: '700', textAlign: 'center' },
  errorText: { color: '#A12C2C' },
  footer: { paddingHorizontal: 20, paddingBottom: 20, alignItems: 'center' },
  uploadButton: {
    width: '100%',
    minHeight: 50,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#2F6B3B',
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  uploadButtonText: { color: '#2F6B3B', fontSize: 14, fontWeight: '800' },
  uploadHint: { color: '#768078', fontSize: 11, lineHeight: 16, textAlign: 'center', marginTop: 8 },
  disabledButton: { opacity: 0.6 },
});
