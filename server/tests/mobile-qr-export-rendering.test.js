'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const mobileRequire = createRequire(path.resolve(__dirname, '../../mobile/package.json'));

// Execute the real QR component/ref against a native SVG boundary. This checks
// that unavailable views and invalid bitmap dimensions never reach native code.
function renderer() {
  const svg = { current: null };
  const React = {
    forwardRef: component => component, useMemo: factory => factory(), useRef: () => svg,
    useImperativeHandle: (ref, factory) => { ref.current = factory(); }, useEffect() {},
    createElement: (type, props, ...children) => ({ type, props, children })
  };
  const code = mobileRequire('@babel/core').transformSync(fs.readFileSync(path.resolve(__dirname, '../../mobile/src/components/OfflineQRCode.js'), 'utf8'), {
    configFile: false, babelrc: false,
    plugins: [mobileRequire.resolve('@babel/plugin-transform-react-jsx'), mobileRequire.resolve('@babel/plugin-transform-modules-commonjs')]
  }).code;
  const mocks = {
    react: React, 'react-native': { View: 'View' },
    'react-native-svg': { __esModule: true, default: 'Svg', Path: 'Path', Rect: 'Rect', Text: 'SvgText' },
    qrcode: mobileRequire('qrcode'),
    '../services/clientDiagnostics': { createMobileReference: () => 'TEST', reportMobileDiagnostic() {} },
    './Typography': { AppText: 'Text' }
  };
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', code)(name => {
    if (!(name in mocks)) throw new Error(`Unexpected module ${name}`);
    return mocks[name];
  }, mod, mod.exports);
  return { ...mod.exports, svg };
}

test('QR capture rejects unavailable or empty views before invoking native SVG', () => {
  const runtime = renderer(), ref = { current: null };
  runtime.default({ value: 'Existing report reference', size: 320 }, ref);
  assert.throws(() => ref.current.toDataURL(() => {}, { width: 1200 }), /not ready/);
  let calls = 0;
  runtime.svg.current = { toDataURL() { calls++; } };
  runtime.default({ value: '', size: 320 }, ref);
  assert.throws(() => ref.current.toDataURL(() => {}), /not ready/);
  assert.equal(calls, 0);
});

test('QR capture supplies bounded integer native bitmap dimensions, preserving the footer aspect ratio', () => {
  const runtime = renderer(), ref = { current: null }, calls = [];
  runtime.svg.current = { toDataURL(callback, options) { calls.push(options); callback('image-bytes'); } };
  runtime.default({ value: 'Existing report reference', size: 320, footerLines: ['HUGPONG', 'Farm', 'Month', 'Report'] }, ref);
  let image;
  ref.current.toDataURL(value => { image = value; }, { width: 1200, height: -1 });
  assert.equal(image, 'image-bytes');
  assert.equal(calls[0].width, 1200);
  assert.ok(calls[0].height > calls[0].width);
  assert.ok(calls[0].height <= 2048);
  assert.ok(Number.isInteger(calls[0].height));
  ref.current.toDataURL(() => {}, { width: Number.MAX_SAFE_INTEGER });
  assert.equal(calls[1].width, 1200);
  const before = calls.length;
  for (const width of [-1, 0, NaN, Infinity]) assert.throws(() => ref.current.toDataURL(() => {}, { width }), /dimensions/);
  assert.equal(calls.length, before, 'invalid sizes never reach native bitmap allocation');
  const tall = runtime.qrExportDimensions(1200, 100);
  assert.ok(tall.width > 0 && tall.height <= 2048);
  assert.throws(() => runtime.qrExportDimensions(1200, Infinity), /dimensions/);
});
