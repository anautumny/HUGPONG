// ══════════════════════════════════════════════════════════════
// HUGPONG Mobile — Pure Offline Vector SVG QR Code Component
// Renders mathematically on-device using react-native-svg + qrcode
// Zero external internet requests, 100% offline-first.
// ══════════════════════════════════════════════════════════════

import React, { forwardRef, useEffect, useMemo } from 'react';
import { Text, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import QRCode from 'qrcode';
import { createMobileReference, reportMobileDiagnostic } from '../services/clientDiagnostics';

/**
 * OfflineQRCode renders a vector SVG QR code completely locally.
 *
 * @param {string} value - Text or envelope payload to encode
 * @param {number} size - Dimension in pixels (width and height)
 * @param {string} color - Color of the dark QR modules (always black in production use)
 * @param {string} backgroundColor - Background fill color (default #FFFFFF)
 * @param {string} errorCorrectionLevel - 'L' | 'M' | 'Q' | 'H' (default 'M')
 */
const OfflineQRCode = forwardRef(function OfflineQRCode({
  value = '',
  size = 200,
  color = '#000000',
  backgroundColor = '#FFFFFF',
  errorCorrectionLevel = 'M',
  style
}, ref) {
  const { pathData, moduleCount, diagnostic } = useMemo(() => {
    try {
      if (!value) return { pathData: '', moduleCount: 0 };
      const qr = QRCode.create(String(value), {
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
      const referenceId = createMobileReference();
      return {
        pathData: '',
        moduleCount: 0,
        diagnostic: {
          referenceId,
          message: `${err?.name || 'QrError'}: ${err?.message || 'QR generation failed.'}`
        }
      };
    }
  }, [value, errorCorrectionLevel]);

  useEffect(() => {
    if (!diagnostic) return;
    reportMobileDiagnostic({
      ...diagnostic,
      module: 'QR',
      errorCode: 'MOBILE_QR_GENERATION_FAILURE'
    });
  }, [diagnostic]);

  if (!pathData || !moduleCount) {
    if (!diagnostic) return null;
    return (
      <View style={[{ width: size, minHeight: size, justifyContent: 'center', padding: 12, backgroundColor }, style]}>
        <Text style={{ color: '#9B1C1C', textAlign: 'center', fontSize: 12 }}>
          QR could not be generated. Try again.{`\n`}Reference ID: {diagnostic.referenceId}
        </Text>
      </View>
    );
  }

  // ISO/IEC 18004 recommends a four-module quiet zone.
  const quietZone = 4;
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
