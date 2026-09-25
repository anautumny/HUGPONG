import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Animated,
  Dimensions,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { COLORS, SPACING, RADIUS, SHADOW } from '../theme';

const { width, height } = Dimensions.get('window');
const SCAN_BOX_SIZE = Math.min(width * 0.72, 280);

export default function LiveQRScanner({
  visible = false,
  onClose,
  onCodeDetected,
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const [torch, setTorch] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [showManualInput, setShowManualInput] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [cameraKey, setCameraKey] = useState(0);
  const [cameraState, setCameraState] = useState('idle');
  const [cameraError, setCameraError] = useState('');

  // Scanning laser animation
  const scanLineAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) {
      scanLineAnim.setValue(0);
      return undefined;
    }
    setScanned(false);
    setTorch(false);
    setShowManualInput(false);

    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(scanLineAnim, {
          toValue: SCAN_BOX_SIZE - 6,
          duration: 1800,
          useNativeDriver: true,
        }),
        Animated.timing(scanLineAnim, {
          toValue: 0,
          duration: 1800,
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();
    return () => {
      animation.stop();
      scanLineAnim.setValue(0);
    };
  }, [visible]);

  useEffect(() => {
    if (!visible || !permission?.granted || showManualInput) {
      setCameraState('idle');
      setCameraError('');
      return undefined;
    }
    setCameraState('initializing');
    setCameraError('');
    const timeout = setTimeout(() => {
      setCameraState(current => current === 'ready' ? current : 'timeout');
    }, 8000);
    return () => clearTimeout(timeout);
  }, [visible, permission?.granted, cameraKey, showManualInput]);

  const retryCamera = () => {
    setTorch(false);
    setCameraError('');
    setCameraState('initializing');
    setCameraKey(current => current + 1);
  };

  const handleCameraMountError = event => {
    const message = event?.message || event?.nativeEvent?.message || 'The camera preview could not be started.';
    console.warn('[QR Scanner] Camera preview unavailable:', message);
    setCameraError(message);
    setCameraState('error');
  };

  const handleBarcodeScanned = ({ data }) => {
    if (scanned || showManualInput || !data) return;
    setScanned(true);

    if (onCodeDetected) {
      onCodeDetected(data, { source: 'camera' });
    }
  };

  const handleManualSubmit = () => {
    const cleanCode = manualCode.trim();
    if (!cleanCode) return;
    setScanned(true);
    if (onCodeDetected) {
      onCodeDetected(cleanCode, { source: 'manual' });
    }
    setManualCode('');
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent={false}
      animationType="slide"
      presentationStyle="fullScreen"
      hardwareAccelerated
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        {/* Header Bar */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.iconBtn} onPress={onClose} activeOpacity={0.7}>
            <Ionicons name="close" size={24} color="#FFF" />
          </TouchableOpacity>

          <View style={styles.headerTextCol}>
            <Text style={styles.headerTitle}>{showManualInput ? 'Manual Report Verification' : 'SRA Live QR Scanner'}</Text>
            <Text style={styles.headerSub}>
              {showManualInput ? 'Verify through the HUGPONG server' : "Point at Farm Manager's QR Code"}
            </Text>
          </View>

          {showManualInput ? (
            <View style={styles.headerIconSpacer} />
          ) : (
            <TouchableOpacity
              style={[styles.iconBtn, torch && styles.iconBtnActive, cameraState !== 'ready' && styles.iconBtnDisabled]}
              onPress={() => setTorch(!torch)}
              disabled={cameraState !== 'ready'}
              activeOpacity={0.7}
            >
              <Ionicons name={torch ? "flashlight" : "flashlight-outline"} size={22} color={torch ? '#267326' : '#FFF'} />
            </TouchableOpacity>
          )}
        </View>

        {/* Camera Feed or Permission Prompt */}
        {showManualInput ? (
          <KeyboardAvoidingView
            style={styles.manualScreen}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <View style={styles.manualCard}>
              <View style={styles.manualIconCircle}>
                <Ionicons name="keypad-outline" size={38} color="#7BC043" />
              </View>
              <Text style={styles.manualTitle}>Enter report code</Text>
              <Text style={styles.manualBody}>
                Use the report ID, audit hash, or complete QR package supplied by the Farm Manager.
              </Text>
              <Text style={styles.manualFieldLabel}>REPORT ID OR QR PACKAGE</Text>
              <TextInput
                style={styles.manualInput}
                placeholder="Example: AUD-... or HUG-..."
                placeholderTextColor="rgba(255,255,255,0.4)"
                value={manualCode}
                onChangeText={setManualCode}
                autoCapitalize="characters"
                autoCorrect={false}
                multiline
                autoFocus
              />
              <View style={styles.onlineNotice}>
                <Ionicons name="cloud-done-outline" size={18} color="#7BC043" />
                <Text style={styles.onlineNoticeText}>A live HUGPONG connection is required for verification.</Text>
              </View>
              <TouchableOpacity
                style={[styles.manualSubmitBtn, !manualCode.trim() && styles.manualSubmitBtnDisabled]}
                onPress={handleManualSubmit}
                disabled={!manualCode.trim() || scanned}
                activeOpacity={0.8}
              >
                {scanned ? <ActivityIndicator size="small" color="#FFF" /> : <Ionicons name="shield-checkmark-outline" size={19} color="#FFF" />}
                <Text style={styles.manualSubmitBtnText}>{scanned ? 'Verifying...' : 'Verify with HUGPONG'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.backToCameraBtn}
                onPress={() => { setShowManualInput(false); setManualCode(''); setScanned(false); }}
                activeOpacity={0.8}
              >
                <Ionicons name="camera-outline" size={18} color="#FFF" />
                <Text style={styles.backToCameraText}>Back to Scanner</Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        ) : !permission ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={styles.loadingText}>Initializing camera hardware...</Text>
          </View>
        ) : !permission.granted ? (
          <View style={styles.centerContainer}>
            <View style={styles.permissionIconCircle}>
              <Ionicons name="camera-outline" size={48} color={COLORS.primary} />
            </View>
            <Text style={styles.permissionTitle}>Camera Permission Required</Text>
            <Text style={styles.permissionBody}>
              HUGPONG requires camera access to scan and verify live SRA compliance QR codes in the field.
            </Text>
            <TouchableOpacity style={styles.grantBtn} onPress={requestPermission} activeOpacity={0.8}>
              <Ionicons name="camera" size={20} color="#FFF" />
              <Text style={styles.grantBtnText}>Grant Camera Access</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.manualEntryLink}
              onPress={() => { setTorch(false); setShowManualInput(true); }}
            >
              <Text style={styles.manualEntryLinkText}>Enter report code manually</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.cameraContainer}>
            {/* Live Camera Feed */}
            <CameraView
              key={`sra-camera-${cameraKey}`}
              style={StyleSheet.absoluteFillObject}
              facing="back"
              enableTorch={torch}
              onCameraReady={() => setCameraState('ready')}
              onMountError={handleCameraMountError}
              barcodeScannerSettings={{
                barcodeTypes: ['qr'],
              }}
              onBarcodeScanned={scanned ? undefined : handleBarcodeScanned}
            />

            {cameraState !== 'ready' && (
              <View style={styles.cameraStatusOverlay}>
                {cameraState === 'initializing' ? (
                  <>
                    <ActivityIndicator size="large" color="#7BC043" />
                    <Text style={styles.cameraStatusTitle}>Starting camera…</Text>
                    <Text style={styles.cameraStatusBody}>Keep HUGPONG open while the camera preview initializes.</Text>
                  </>
                ) : (
                  <>
                    <Ionicons name="camera-outline" size={48} color="#7BC043" />
                    <Text style={styles.cameraStatusTitle}>Camera preview unavailable</Text>
                    <Text style={styles.cameraStatusBody}>
                      {cameraError || 'The camera did not start. Close other camera apps, then retry.'}
                    </Text>
                    <View style={styles.cameraRecoveryRow}>
                      <TouchableOpacity style={styles.retryBtn} onPress={retryCamera} activeOpacity={0.8}>
                        <Ionicons name="refresh" size={18} color="#FFF" />
                        <Text style={styles.retryBtnText}>Retry Camera</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.manualRecoveryBtn} onPress={() => { setTorch(false); setShowManualInput(true); }} activeOpacity={0.8}>
                        <Ionicons name="keypad-outline" size={18} color="#FFF" />
                        <Text style={styles.retryBtnText}>Enter Code</Text>
                      </TouchableOpacity>
                    </View>
                  </>
                )}
              </View>
            )}

            {/* Viewfinder Dark Overlay with Center Cutout */}
            <View style={styles.overlay}>
              <View style={styles.overlayTop} />
              
              <View style={styles.overlayCenterRow}>
                <View style={styles.overlaySide} />
                
                {/* Scanner Target Box */}
                <View style={styles.scanBox}>
                  {/* Corner Reticles */}
                  <View style={[styles.corner, styles.cornerTL]} />
                  <View style={[styles.corner, styles.cornerTR]} />
                  <View style={[styles.corner, styles.cornerBL]} />
                  <View style={[styles.corner, styles.cornerBR]} />

                  {/* Animated Laser Scanning Line */}
                  <Animated.View
                    style={[
                      styles.laserLine,
                      {
                        transform: [{ translateY: scanLineAnim }],
                      },
                    ]}
                  />

                  {scanned && (
                    <View style={styles.scannedOverlay}>
                      <Ionicons name="checkmark-circle" size={56} color='#267326' />
                      <Text style={styles.scannedText}>QR Code Detected</Text>
                    </View>
                  )}
                </View>

                <View style={styles.overlaySide} />
              </View>

              <View style={styles.overlayBottom}>
                {/* Helper Banner */}
                <View style={styles.helperPill}>
                  <Ionicons name="scan-outline" size={16} color='#267326' />
                  <Text style={styles.helperText}>
                    Align the QR code within the frame to scan
                  </Text>
                </View>

                {/* Manual Fallback Toggle */}
                <TouchableOpacity
                  style={styles.manualEntryBtn}
                  onPress={() => { setTorch(false); setShowManualInput(true); }}
                  activeOpacity={0.8}
                >
                  <Ionicons name="keypad-outline" size={16} color="#FFF" />
                  <Text style={styles.manualEntryBtnText}>Enter Report Code Manually</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}

      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    backgroundColor: 'rgba(10, 20, 10, 0.95)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
    zIndex: 10,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnActive: {
    backgroundColor: 'rgba(74, 222, 128, 0.25)',
    borderWidth: 1,
    borderColor: '#267326',
  },
  iconBtnDisabled: {
    opacity: 0.45,
  },
  headerIconSpacer: {
    width: 40,
    height: 40,
  },
  headerTextCol: {
    flex: 1,
    alignItems: 'center',
    marginHorizontal: 12,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFF',
  },
  headerSub: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.65)',
    marginTop: 2,
  },

  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.xl,
    backgroundColor: '#0B150B',
  },
  loadingText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 14,
  },
  permissionIconCircle: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: 'rgba(74, 222, 128, 0.12)',
    borderWidth: 2,
    borderColor: '#267326',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  permissionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFF',
    marginBottom: 8,
    textAlign: 'center',
  },
  permissionBody: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 28,
    maxWidth: 320,
  },
  grantBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: RADIUS.lg,
    ...SHADOW.card,
  },
  grantBtnText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '800',
  },
  manualEntryLink: {
    marginTop: 20,
    padding: 8,
  },
  manualEntryLinkText: {
    color: '#267326',
    fontSize: 13,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },

  cameraContainer: {
    flex: 1,
    position: 'relative',
    backgroundColor: '#000',
  },
  cameraStatusOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 5,
    backgroundColor: 'rgba(3, 12, 5, 0.94)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.xl,
  },
  cameraStatusTitle: {
    color: '#FFF',
    fontSize: 17,
    fontWeight: '800',
    marginTop: 14,
    textAlign: 'center',
  },
  cameraStatusBody: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 7,
    textAlign: 'center',
    maxWidth: 320,
  },
  cameraRecoveryRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 22,
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.primary,
  },
  manualRecoveryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: RADIUS.md,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  retryBtnText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '800',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 2,
  },
  overlayTop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
  },
  overlayCenterRow: {
    flexDirection: 'row',
    height: SCAN_BOX_SIZE,
  },
  overlaySide: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
  },
  scanBox: {
    width: SCAN_BOX_SIZE,
    height: SCAN_BOX_SIZE,
    position: 'relative',
    overflow: 'hidden',
  },
  corner: {
    position: 'absolute',
    width: 32,
    height: 32,
    borderColor: '#267326',
    borderWidth: 4,
  },
  cornerTL: {
    top: 0,
    left: 0,
    borderBottomWidth: 0,
    borderRightWidth: 0,
    borderTopLeftRadius: 12,
  },
  cornerTR: {
    top: 0,
    right: 0,
    borderBottomWidth: 0,
    borderLeftWidth: 0,
    borderTopRightRadius: 12,
  },
  cornerBL: {
    bottom: 0,
    left: 0,
    borderTopWidth: 0,
    borderRightWidth: 0,
    borderBottomLeftRadius: 12,
  },
  cornerBR: {
    bottom: 0,
    right: 0,
    borderTopWidth: 0,
    borderLeftWidth: 0,
    borderBottomRightRadius: 12,
  },
  laserLine: {
    position: 'absolute',
    left: 8,
    right: 8,
    height: 3,
    backgroundColor: '#267326',
    borderRadius: 2,
    shadowColor: '#267326',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 6,
    elevation: 4,
  },
  scannedOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(11, 35, 15, 0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  scannedText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '800',
  },

  overlayBottom: {
    flex: 1.3,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.lg,
    gap: 16,
  },
  helperPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(17, 34, 17, 0.85)',
    borderWidth: 1,
    borderColor: 'rgba(74, 222, 128, 0.35)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 24,
  },
  helperText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '600',
  },
  manualEntryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: RADIUS.md,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
  },
  manualEntryBtnText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '700',
  },

  manualScreen: {
    flex: 1,
    justifyContent: 'center',
    padding: SPACING.lg,
    backgroundColor: '#071007',
  },
  manualCard: {
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
    padding: SPACING.lg,
    borderRadius: RADIUS.xl,
    backgroundColor: '#112211',
    borderWidth: 1,
    borderColor: 'rgba(123,192,67,0.35)',
  },
  manualIconCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    backgroundColor: 'rgba(123,192,67,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(123,192,67,0.35)',
  },
  manualTitle: {
    color: '#FFF',
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
  },
  manualBody: {
    color: 'rgba(255,255,255,0.68)',
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 22,
  },
  manualFieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.7)',
    marginBottom: 8,
  },
  manualInput: {
    minHeight: 92,
    maxHeight: 160,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    borderRadius: RADIUS.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#FFF',
    fontSize: 13,
    fontWeight: '700',
    fontFamily: 'monospace',
    textAlignVertical: 'top',
  },
  onlineNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    marginBottom: 18,
  },
  onlineNoticeText: {
    flex: 1,
    color: 'rgba(255,255,255,0.68)',
    fontSize: 12,
    lineHeight: 17,
  },
  manualSubmitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 16,
    height: 48,
    borderRadius: RADIUS.md,
    justifyContent: 'center',
  },
  manualSubmitBtnDisabled: {
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  manualSubmitBtnText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '800',
  },
  backToCameraBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    marginTop: 10,
    height: 44,
    borderRadius: RADIUS.md,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  backToCameraText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '700',
  },
});
