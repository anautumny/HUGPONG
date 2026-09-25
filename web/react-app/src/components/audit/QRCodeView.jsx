import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';

export default function QRCodeView({
  value = '',
  size = 140,
  color = '#000000',
  bgColor = '#ffffff',
  errorCorrectionLevel = 'M',
  className = ''
}) {
  const [svgContent, setSvgContent] = useState('');
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!value) {
      setSvgContent('');
      return;
    }

    const payload = typeof value === 'object' ? JSON.stringify(value) : String(value);

    QRCode.toString(payload, {
      type: 'svg',
      margin: 4,
      width: size,
      color: {
        dark: color,
        light: bgColor
      },
      errorCorrectionLevel
    })
      .then(svg => {
        setSvgContent(svg);
        setError(null);
      })
      .catch(err => {
        console.warn('[QRCodeView] QR generation failed:', err);
        setError(err.message);
      });
  }, [value, size, color, bgColor, errorCorrectionLevel]);

  if (!value) {
    return (
      <div
        style={{ width: size, height: size }}
        className={`flex items-center justify-center bg-gray-50 dark:bg-gray-800/40 rounded-xl border border-dashed border-border text-hug-muted text-xs ${className}`}
      >
        <span>No QR Data</span>
      </div>
    );
  }

  if (error) {
    return (
      <div
        style={{ width: size, height: size }}
        className={`flex items-center justify-center bg-danger-bg dark:bg-danger/10 text-danger rounded-xl border border-danger/30 text-xs text-center p-2 ${className}`}
      >
        <span>QR Error</span>
      </div>
    );
  }

  return (
    <div
      className={`inline-flex items-center justify-center p-2 rounded-xl bg-white shadow-2xs border border-border/80 overflow-hidden ${className}`}
      dangerouslySetInnerHTML={{ __html: svgContent }}
    />
  );
}
