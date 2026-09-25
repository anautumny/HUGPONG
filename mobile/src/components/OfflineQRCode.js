// ══════════════════════════════════════════════════════════════
// HUGPONG Mobile — Pure Offline Vector SVG QR Code Component
// Renders mathematically on-device using react-native-svg + qrcode
// Zero external internet requests, 100% offline-first.
// ══════════════════════════════════════════════════════════════

import React, { forwardRef, useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import QRCode from 'qrcode';

/**
 * OfflineQRCode renders a vector SVG QR code completely locally.
 *
 * @param {string} value - Text or envelope payload to encode
 * @param {number} size - Dimension in pixels (width and height)
 * @param {string} color - Color of the dark QR modules (default #1B381A)
 * @param {string} backgroundColor - Background fill color (default #FFFFFF)
 * @param {string} errorCorrectionLevel - 'L' | 'M' | 'Q' | 'H' (default 'M')
 */
const OfflineQRCode = forwardRef(function OfflineQRCode({
  value = 'HUGPONG-OFFLINE',
  size = 200,
  color = '#1B381A',
  backgroundColor = '#FFFFFF',
  errorCorrectionLevel = 'M',
  style
}, ref) {
  const { pathData, moduleCount } = useMemo(() => {
    try {
      const qr = QRCode.create(value || 'HUGPONG', {
        errorCorrectionLevel,
      });

      const modules = qr.modules;
      const count = modules.size;
      const data = modules.data;

      // Construct SVG path data out of dark module rectangles
      let path = '';
      for (let row = 0; row < count; row++) {
        for (let col = 0; col < count; col++) {
          if (data[row * count + col]) {
            // Draw a 1x1 module square in normalized coordinates
            path += `M${col},${row}h1v1h-1z `;
          }
        }
      }

      return { pathData: path, moduleCount: count };
    } catch (err) {
      console.warn('[OfflineQRCode] QR generation error:', err);
      return { pathData: '', moduleCount: 21 };
    }
  }, [value, errorCorrectionLevel]);

  if (!pathData) {
    return (
      <View style={[styles.fallback, { width: size, height: size }, style]} />
    );
  }

  // Adding quiet zone padding (2 modules on each side)
  const quietZone = 2;
  const totalGrid = moduleCount + quietZone * 2;

  return (
    <View style={[{ width: size, height: size, backgroundColor }, style]}>
      <Svg
        ref={ref}
        viewBox={`-${quietZone} -${quietZone} ${totalGrid} ${totalGrid}`}
        width={size}
        height={size}
      >
        <Rect
          x={-quietZone}
          y={-quietZone}
          width={totalGrid}
          height={totalGrid}
          fill={backgroundColor}
        />
        <Path d={pathData} fill={color} />
      </Svg>
    </View>
  );
});

export default OfflineQRCode;

const styles = StyleSheet.create({
  fallback: {
    backgroundColor: '#F1F5E9',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D4E2D0',
  },
});
