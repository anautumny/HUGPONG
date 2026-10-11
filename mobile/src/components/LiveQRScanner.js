import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, StyleSheet, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, scanFromURLAsync, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { useTranslation } from '../services/i18n';
import { AppText as Text } from './Typography';
import { FONT_FAMILY } from '../theme';

export default function LiveQRScanner({ visible = false, onClose, onCodeDetected }) {
  const { t } = useTranslation();
  const [permission, requestPermission] = useCameraPermissions();
  const [cameraError, setCameraError] = useState('');
  const [scanMessage, setScanMessage] = useState('');
  const [scanLocked, setScanLocked] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [torchEnabled, setTorchEnabled] = useState(false);
  const [cameraKey, setCameraKey] = useState(0);
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
      setCameraReady(false);
      setUploadBusy(false);
      setTorchEnabled(false);
      return;
    }
    if (permission && !permission.granted && permission.canAskAgain && !permissionRequestedRef.current) {
      permissionRequestedRef.current = true;
      requestPermission().catch(() => {});
    }
  }, [visible, permission, requestPermission]);

  const handleBarcodeScanned = useCallback(async (result, source = 'camera') => {
    const event = result?.nativeEvent || result || {};
    const normalizedData = String(event.data || event.raw || '').trim();
    if (scanLockedRef.current || !normalizedData) return;
    const scannedAt = Date.now();
    if (lastScanRef.current.data === normalizedData && scannedAt - lastScanRef.current.scannedAt < 1500) return;
    lastScanRef.current = { data: normalizedData, scannedAt };
    scanLockedRef.current = true;
    setScanLocked(true);
    setScanMessage(t('qr_validating', 'Validating audit report...'));
    try {
      const outcome = await onCodeDetected?.(normalizedData, { source });
      if (outcome?.continueScanning && mountedRef.current) {
        setScanMessage(outcome.message || t('qr_invalid', 'This QR code is not a valid HUGPONG audit report.'));
        scanRearmTimerRef.current = setTimeout(() => {
          if (!mountedRef.current) return;
          scanLockedRef.current = false;
          setScanLocked(false);
        }, 650);
      }
    } catch (error) {
      if (!mountedRef.current) return;
      setScanMessage(error.message || t('qr_invalid', 'This QR code is not a valid HUGPONG audit report.'));
      scanRearmTimerRef.current = setTimeout(() => {
        if (!mountedRef.current) return;
        scanLockedRef.current = false;
        setScanLocked(false);
      }, 650);
    }
  }, [onCodeDetected, t]);

  const retryPermission = async () => {
    permissionRequestedRef.current = true;
    setCameraError('');
    const result = await requestPermission();
    if (!result.granted) {
      setCameraError(t('qr_permission_error', 'Camera permission is required. Enable it in device settings, or upload a QR image.'));
    }
  };

  const uploadQrImage = async () => {
    if (uploadBusy || scanLockedRef.current) return;
    setUploadBusy(true);
    setCameraError('');
    setScanMessage(t('qr_choose_crop', 'Choose the QR image and crop closely around the square code.'));
    try {
      const selection = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 1,
      });
      if (selection.canceled || !selection.assets?.[0]?.uri) {
        setScanMessage(t('qr_choose_or_camera', 'Choose a QR image or open the camera.'));
        return;
      }
      setScanMessage(t('qr_reading_upload', 'Reading uploaded QR image...'));
      const barcodes = await scanFromURLAsync(selection.assets[0].uri, ['qr']);
      const qrCode = barcodes.find(barcode => Boolean(barcode.data));
      if (!qrCode) {
        setScanMessage(t('qr_not_found', 'No readable QR was found. Upload it again and crop tightly around the QR square.'));
        return;
      }
      await handleBarcodeScanned(qrCode, 'image');
    } catch (error) {
      if (mountedRef.current) {
        setScanMessage(error.message || t('qr_image_read_failed', 'The QR image could not be read. Try a PNG or a clear screenshot.'));
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
          <TouchableOpacity accessibilityRole="button" accessibilityLabel={t('qr_back', 'Back')} style={styles.closeButton} onPress={onClose}>
            <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <View style={styles.headerTitleWrap}>
            <Text style={styles.brand}>HUGPONG</Text>
            <Text style={styles.title} numberOfLines={1}>{t('qr_scan_title', 'Scan QR')}</Text>
          </View>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Toggle flashlight"
            disabled={!permission?.granted}
            style={[styles.torchButton, torchEnabled && styles.torchButtonActive]}
            onPress={() => setTorchEnabled(current => !current)}
          >
            <Ionicons name={torchEnabled ? 'flashlight' : 'flashlight-outline'} size={21} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        <View style={styles.content}>
          {permissionLoading ? (
            <>
              <ActivityIndicator size="large" color="#2F6B3B" />
              <Text style={styles.heading}>{t('qr_checking_camera', 'Checking camera...')}</Text>
            </>
          ) : permissionDenied ? (
            <>
              <Text style={styles.heading}>{t('qr_permission_needed', 'Camera Permission Needed')}</Text>
              <Text style={styles.help}>{t('qr_permission_help', 'Allow camera access to open the device QR scanner. Image upload works without the camera.')}</Text>
              {permission.canAskAgain ? (
                <TouchableOpacity style={styles.primaryButton} onPress={retryPermission}>
                  <Text style={styles.primaryButtonText} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.8}>{t('qr_allow_camera', 'Allow Camera')}</Text>
                </TouchableOpacity>
              ) : null}
            </>
          ) : (
            <>
              <View style={styles.secureBadge}>
                <Ionicons name="shield-checkmark" size={14} color="#9EE493" />
                <Text style={styles.secureBadgeText}>HUGPONG SECURE SCANNER</Text>
              </View>
              <Text style={styles.heading}>{t('qr_scan_audit_heading', 'Scan Audit QR')}</Text>
              <Text style={styles.help}>{t('qr_scan_help', 'Keep the complete QR square inside the frame. The report will be securely retrieved after one scan.')}</Text>
              <View style={styles.cameraFrame}>
                <CameraView
                  key={`hugpong-qr-camera-${cameraKey}`}
                  style={styles.cameraPreview}
                  facing="back"
                  enableTorch={torchEnabled}
                  barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                  onBarcodeScanned={scanLocked ? undefined : handleBarcodeScanned}
                  onCameraReady={() => {
                    setCameraReady(true);
                    setCameraError('');
                  }}
                  onMountError={error => {
                    setCameraReady(false);
                    setCameraError(error?.message || t('qr_preview_failed', 'The camera preview could not be started.'));
                  }}
                />
                <View pointerEvents="none" style={styles.scanGuide}>
                  <View style={[styles.corner, styles.cornerTopLeft]} />
                  <View style={[styles.corner, styles.cornerTopRight]} />
                  <View style={[styles.corner, styles.cornerBottomLeft]} />
                  <View style={[styles.corner, styles.cornerBottomRight]} />
                  <View style={styles.scanLine} />
                </View>
                {!cameraReady ? (
                  <View style={styles.previewStatus}>
                    <ActivityIndicator size="small" color="#FFFFFF" />
                    <Text style={styles.previewStatusText}>{t('qr_starting_camera', 'Starting camera...')}</Text>
                  </View>
                ) : null}
                {scanLocked ? (
                  <View style={styles.validationOverlay}>
                    <View style={styles.validationPill}>
                      <ActivityIndicator size="small" color="#173D24" />
                      <Text style={styles.validationText}>{t('qr_validating', 'Validating audit report...')}</Text>
                    </View>
                  </View>
                ) : null}
              </View>
              <Text style={styles.autoScanText}>Scanning happens automatically</Text>
              {cameraError ? (
                <TouchableOpacity
                  style={styles.retryButton}
                  onPress={() => {
                    setCameraError('');
                    setCameraReady(false);
                    setCameraKey(current => current + 1);
                  }}
                >
                  <Ionicons name="refresh" size={18} color="#FFFFFF" />
                  <Text style={styles.retryButtonText}>Restart Camera</Text>
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
              ? <ActivityIndicator size="small" color="#FFFFFF" />
              : <Ionicons name="image-outline" size={20} color="#FFFFFF" />}
            <Text style={styles.uploadButtonText} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.8}>{uploadBusy ? t('qr_reading_image', 'Reading Image...') : t('qr_upload_image', 'Upload QR Image')}</Text>
          </TouchableOpacity>
          <Text style={styles.uploadHint}>{t('qr_upload_hint', 'Crop the image so the QR square fills most of the frame.')}</Text>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0D1E14' },
  header: {
    minHeight: 62,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#10291A',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  closeButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  headerTitleWrap: { flex: 1, alignItems: 'center' },
  brand: { color: '#9EE493', fontSize: 10, fontWeight: '900', letterSpacing: 2.2 },
  title: { color: '#FFFFFF', fontSize: 15, fontWeight: '800', marginTop: 1 },
  torchButton: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.1)' },
  torchButtonActive: { backgroundColor: '#2F6B3B', borderWidth: 1, borderColor: '#9EE493' },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20, paddingVertical: 16 },
  secureBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: 'rgba(158,228,147,0.12)', borderWidth: 1, borderColor: 'rgba(158,228,147,0.28)' },
  secureBadgeText: { color: '#9EE493', fontSize: 9, fontWeight: '900', letterSpacing: 1.2 },
  heading: { fontFamily: FONT_FAMILY.display, color: '#FFFFFF', fontSize: 22, fontWeight: '900', textAlign: 'center', marginTop: 14 },
  help: { color: 'rgba(255,255,255,0.7)', fontSize: 13, lineHeight: 19, textAlign: 'center', maxWidth: 340, marginTop: 7 },
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
    maxWidth: 310,
    aspectRatio: 1,
    marginTop: 20,
    overflow: 'hidden',
    borderRadius: 28,
    backgroundColor: '#050A07',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  cameraPreview: { flex: 1, width: '100%', height: '100%' },
  scanGuide: { position: 'absolute', left: 34, right: 34, top: 34, bottom: 34 },
  corner: { position: 'absolute', width: 42, height: 42, borderColor: '#9EE493' },
  cornerTopLeft: { left: 0, top: 0, borderLeftWidth: 4, borderTopWidth: 4, borderTopLeftRadius: 12 },
  cornerTopRight: { right: 0, top: 0, borderRightWidth: 4, borderTopWidth: 4, borderTopRightRadius: 12 },
  cornerBottomLeft: { left: 0, bottom: 0, borderLeftWidth: 4, borderBottomWidth: 4, borderBottomLeftRadius: 12 },
  cornerBottomRight: { right: 0, bottom: 0, borderRightWidth: 4, borderBottomWidth: 4, borderBottomRightRadius: 12 },
  scanLine: { position: 'absolute', left: 18, right: 18, top: '50%', height: 2, borderRadius: 2, backgroundColor: '#9EE493', opacity: 0.8 },
  previewStatus: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: 'rgba(5,10,7,0.72)' },
  previewStatusText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  validationOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(5,10,7,0.35)' },
  validationPill: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 11, backgroundColor: '#EAF6E7' },
  validationText: { color: '#173D24', fontSize: 12, fontWeight: '900' },
  autoScanText: { color: 'rgba(255,255,255,0.58)', fontSize: 11, fontWeight: '700', marginTop: 11 },
  retryButton: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 10, paddingHorizontal: 15, paddingVertical: 9, borderRadius: 999, backgroundColor: '#2F6B3B' },
  retryButtonText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  statusCard: { marginTop: 12, borderRadius: 12, backgroundColor: 'rgba(158,228,147,0.14)', borderWidth: 1, borderColor: 'rgba(158,228,147,0.26)', paddingHorizontal: 14, paddingVertical: 10, maxWidth: 360 },
  errorCard: { backgroundColor: 'rgba(185,52,52,0.16)', borderColor: 'rgba(255,140,140,0.35)' },
  statusText: { color: '#B9F0B1', fontSize: 12, lineHeight: 18, fontWeight: '700', textAlign: 'center' },
  errorText: { color: '#FFD0D0' },
  footer: { paddingHorizontal: 20, paddingBottom: 20, alignItems: 'center' },
  uploadButton: {
    width: '100%',
    minHeight: 50,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.28)',
    backgroundColor: 'rgba(255,255,255,0.08)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  uploadButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  uploadHint: { color: 'rgba(255,255,255,0.5)', fontSize: 11, lineHeight: 16, textAlign: 'center', marginTop: 8 },
  disabledButton: { opacity: 0.6 },
});
