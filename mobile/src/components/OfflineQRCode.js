// ══════════════════════════════════════════════════════════════
// HUGPONG Mobile — Pure Offline Vector SVG QR Code Component
// Renders mathematically on-device using react-native-svg + qrcode
// Zero external internet requests, 100% offline-first.
// ══════════════════════════════════════════════════════════════

import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { View } from 'react-native';
import Svg, { Path, Rect, Text as SvgText } from 'react-native-svg';
import QRCode from 'qrcode';
import { createMobileReference, reportMobileDiagnostic } from '../services/clientDiagnostics';
import { AppText as Text } from './Typography';

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
  footerLines = [],
  style
}, ref) {
  const svgRef = useRef(null);
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

  const quietZone = 4;
  const totalGrid = moduleCount + quietZone * 2;
  const footerHeight = footerLines.length ? footerLines.length * 3 + 6 : 0;
  const imageRatio = (totalGrid + footerHeight) / totalGrid;
  useImperativeHandle(ref, () => ({
    toDataURL(callback, options = {}) {
      svgRef.current?.toDataURL(callback, footerHeight
        ? { ...options, height: Math.round((options.width || size) * imageRatio) }
        : options);
    },
  }), [footerHeight, imageRatio, size]);

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

  return (
    <View style={[{ width: size, height: size * imageRatio, backgroundColor }, style]}>
      <Svg
        ref={svgRef}
        viewBox={`-${quietZone} -${quietZone} ${totalGrid} ${totalGrid + footerHeight}`}
        width={size}
        height={size * imageRatio}
      >
        <Rect
          x={-quietZone}
          y={-quietZone}
          width={totalGrid}
          height={totalGrid + footerHeight}
          fill={backgroundColor}
        />
        <Path d={pathData} fill={color} />
        {footerLines.map((line, index) => <SvgText key={index} x={moduleCount / 2} y={moduleCount + quietZone + 4 + index * 3} textAnchor="middle" fontSize={1.8} fontFamily="sans-serif" fill={color}>{line}</SvgText>)}
      </Svg>
    </View>
  );
});

export default OfflineQRCode;
