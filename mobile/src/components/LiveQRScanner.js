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
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS, SHADOW } from '../theme';

// Safely resolve expo-camera if available in the current native runtime
let CameraView = null;
let useCameraPermissions = null;
let isCameraSupported = false;

try {
  const ExpoCamera = require('expo-camera');
  if (ExpoCamera) {
    CameraView = ExpoCamera.CameraView || null;
    useCameraPermissions = ExpoCamera.useCameraPermissions || null;
    isCameraSupported = Boolean(CameraView);
  }
} catch (e) {
  isCameraSupported = false;
}

const { width, height } = Dimensions.get('window');
const SCAN_BOX_SIZE = Math.min(width * 0.72, 280);

export default function LiveQRScanner({
  visible = false,
  onClose,
  onCodeDetected,
}) {
  let permission = { granted: false, canAskAgain: true };
  let requestPermission = () => {};

  if (isCameraSupported && typeof useCameraPermissions === 'function') {
    try {
      const [perm, reqPerm] = useCameraPermissions();
      if (perm) permission = perm;
      if (reqPerm) requestPermission = reqPerm;
    } catch (e) {
      permission = { granted: false, canAskAgain: false };
    }
  }
  const [torch, setTorch] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [showManualInput, setShowManualInput] = useState(false);
  const [manualCode, setManualCode] = useState('');

  // Scanning laser animation
  const scanLineAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setScanned(false);
      setTorch(false);
      setShowManualInput(false);

      // Start looping scan line animation
      Animated.loop(
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
      ).start();
    } else {
      scanLineAnim.setValue(0);
    }
  }, [visible]);

  const handleBarcodeScanned = ({ data }) => {
    if (scanned || !data) return;
    setScanned(true);

    if (onCodeDetected) {
      onCodeDetected(data);
    }
  };

  const handleManualSubmit = () => {
    const cleanCode = manualCode.trim();
    if (!cleanCode) return;
    setScanned(true);
    if (onCodeDetected) {
      onCodeDetected(cleanCode);
    }
    setManualCode('');
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent={false} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        {/* Header Bar */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.iconBtn} onPress={onClose} activeOpacity={0.7}>
            <Ionicons name="close" size={24} color="#FFF" />
          </TouchableOpacity>

          <View style={styles.headerTextCol}>
            <Text style={styles.headerTitle}>SRA Live QR Scanner</Text>
            <Text style={styles.headerSub}>Point at Farm Manager's QR Code</Text>
          </View>

          <TouchableOpacity
            style={[styles.iconBtn, torch && styles.iconBtnActive]}
            onPress={() => setTorch(!torch)}
            activeOpacity={0.7}
          >
            <Ionicons name={torch ? "flashlight" : "flashlight-outline"} size={22} color={torch ? '#4ADE80' : '#FFF'} />
          </TouchableOpacity>
        </View>

        {/* Camera Feed or Permission Prompt */}
        {!isCameraSupported || !CameraView ? (
          <View style={styles.centerContainer}>
            <View style={styles.permissionIconCircle}>
              <Ionicons name="qr-code-outline" size={48} color={COLORS.primary} />
            </View>
            <Text style={styles.permissionTitle}>Manual QR Verification Mode</Text>
            <Text style={styles.permissionBody}>
              Live Camera hardware module is not active in this environment. You can enter or paste the SRA Audit Hash / QR Envelope string directly below.
            </Text>
            <TouchableOpacity style={styles.grantBtn} onPress={() => setShowManualInput(true)} activeOpacity={0.8}>
              <Ionicons name="keypad" size={20} color="#FFF" />
              <Text style={styles.grantBtnText}>Enter SRA Hash / Code</Text>
            </TouchableOpacity>
          </View>
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
              onPress={() => setShowManualInput(true)}
            >
              <Text style={styles.manualEntryLinkText}>Or enter QR hash code manually</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.cameraContainer}>
            {/* Live Camera Feed */}
            <CameraView
              style={StyleSheet.absoluteFillObject}
              facing="back"
              enableTorch={torch}
              barcodeScannerSettings={{
                barcodeTypes: ['qr'],
              }}
              onBarcodeScanned={scanned ? undefined : handleBarcodeScanned}
            />

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
                      <Ionicons name="checkmark-circle" size={56} color="#4ADE80" />
                      <Text style={styles.scannedText}>QR Code Detected</Text>
                    </View>
                  )}
                </View>

                <View style={styles.overlaySide} />
              </View>

              <View style={styles.overlayBottom}>
                {/* Helper Banner */}
                <View style={styles.helperPill}>
                  <Ionicons name="scan-outline" size={16} color="#4ADE80" />
                  <Text style={styles.helperText}>
                    Align the QR code within the frame to scan
                  </Text>
                </View>

                {/* Manual Fallback Toggle */}
                <TouchableOpacity
                  style={styles.manualEntryBtn}
                  onPress={() => setShowManualInput(!showManualInput)}
                  activeOpacity={0.8}
                >
                  <Ionicons name={showManualInput ? "camera-outline" : "keypad-outline"} size={16} color="#FFF" />
                  <Text style={styles.manualEntryBtnText}>
                    {showManualInput ? "Hide Code Entry" : "Enter Hash Manually"}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}

        {/* Manual Code Input Bar / Drawer (Optional Fallback) */}
        {showManualInput && (
          <View style={styles.manualDrawer}>
            <Text style={styles.manualDrawerTitle}>Manual SRA Hash or Envelope Entry</Text>
            <View style={styles.manualInputRow}>
              <TextInput
                style={styles.manualInput}
                placeholder="e.g. HUG-202605-A3F9"
                placeholderTextColor="#888"
                value={manualCode}
                onChangeText={setManualCode}
                autoCapitalize="characters"
                autoCorrect={false}
              />
              <TouchableOpacity
                style={[styles.manualSubmitBtn, !manualCode.trim() && styles.manualSubmitBtnDisabled]}
                onPress={handleManualSubmit}
                disabled={!manualCode.trim()}
              >
                <Ionicons name="arrow-forward" size={18} color="#FFF" />
                <Text style={styles.manualSubmitBtnText}>Verify</Text>
              </TouchableOpacity>
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
    borderColor: '#4ADE80',
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
    borderColor: '#4ADE80',
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
    color: '#4ADE80',
    fontSize: 13,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },

  cameraContainer: {
    flex: 1,
    position: 'relative',
    backgroundColor: '#000',
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
    borderColor: '#4ADE80',
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
    backgroundColor: '#4ADE80',
    borderRadius: 2,
    shadowColor: '#4ADE80',
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

  manualDrawer: {
    padding: SPACING.md,
    backgroundColor: '#112211',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.15)',
    zIndex: 20,
  },
  manualDrawerTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.7)',
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  manualInputRow: {
    flexDirection: 'row',
    gap: 8,
  },
  manualInput: {
    flex: 1,
    height: 44,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    borderRadius: RADIUS.md,
    paddingHorizontal: 12,
    color: '#FFF',
    fontSize: 13,
    fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  manualSubmitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 16,
    height: 44,
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
});
