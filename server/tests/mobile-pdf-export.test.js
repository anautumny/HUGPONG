'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function exporter({ os = 'android', permission, print, write, share } = {}) {
  const calls = [], files = new Map();
  const base64 = Buffer.from('%PDF-1.7\nexport transport verification').toString('base64');
  const context = {
    setTimeout, clearTimeout,
    AppState: { currentState: 'active' },
    Platform: { OS: os }, Alert: { alert: (...args) => calls.push(['alert', ...args]) },
    Print: {
      printToFileAsync: print || (async options => { calls.push(['print', options]); return { uri: 'file:///print/source.pdf', base64 }; }),
      printAsync: async () => calls.push(['printDialog'])
    },
    Sharing: { isAvailableAsync: async () => true, shareAsync: share || (async uri => calls.push(['share', uri])) },
    FileSystem: {
      cacheDirectory: 'file:///cache/', EncodingType: { Base64: 'base64' },
      deleteAsync: async uri => { calls.push(['delete', uri]); files.delete(uri); },
      readAsStringAsync: async () => base64,
      writeAsStringAsync: async (uri, data) => { files.set(uri, data); calls.push(['cacheWrite', uri]); },
      StorageAccessFramework: {
        requestDirectoryPermissionsAsync: permission || (async (...args) => { calls.push(['picker', ...args]); return { granted: true, directoryUri: 'content://selected-folder' }; }),
        createFileAsync: async (...args) => { calls.push(['create', ...args]); return 'content://selected-folder/report.pdf'; },
        writeAsStringAsync: write || (async (uri, data, options) => { files.set(uri, data); calls.push(['write', uri, options]); })
      }
    }
  };
  vm.createContext(context);
  const source = fs.readFileSync(path.resolve(__dirname, '../../mobile/src/services/pdfFileService.js'), 'utf8')
    .replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '');
  vm.runInContext(source, context);
  return { context, calls, files, base64, export: pageOptions => context.exportPdfFile('<html>Transport verification</html>', 'Report.pdf', pageOptions),
    exportQr: qr => context.exportQrImageFile(qr, 'Audit-QR.png') };
}

test('Android QR saving uses one unrestricted folder picker and preserves the PNG bytes and extension', async () => {
  const runtime = exporter();
  const png = Buffer.from('89504e470d0a1a0a', 'hex').toString('base64');
  const result = await runtime.exportQr({ toDataURL: callback => callback(png) });
  assert.equal(result.saved, true);
  assert.equal(runtime.files.get(result.uri), png);
  assert.deepEqual(runtime.calls.find(call => call[0] === 'picker'), ['picker']);
  assert.deepEqual(runtime.calls.find(call => call[0] === 'create'), ['create', 'content://selected-folder', 'Audit-QR.png', 'image/png']);
  assert.equal(runtime.calls.some(call => call[0] === 'share'), false);
  assert.ok(runtime.calls.some(call => call[0] === 'alert' && call[1] === 'QR Image Saved'));
});

test('QR rendering, QR saving and PDF export cannot race competing native requests', async () => {
  const runtime = exporter();
  let finish;
  const qr = { toDataURL: callback => { finish = callback; } };
  const first = runtime.exportQr(qr);
  await assert.rejects(runtime.exportQr(qr), /already open/);
  await assert.rejects(runtime.export(), /already open/);
  finish(runtime.base64);
  assert.equal((await first).saved, true);
  assert.equal(runtime.calls.filter(call => call[0] === 'picker').length, 1);
  assert.equal((await runtime.export()).saved, true);
});

test('background exports never launch a native print or folder activity and can be retried after resuming', async () => {
  const runtime = exporter();
  const qr = { toDataURL: callback => callback(runtime.base64) };
  runtime.context.AppState.currentState = 'background';
  await assert.rejects(runtime.exportQr(qr), /Return to HUGPONG/);
  await assert.rejects(runtime.export(), /Return to HUGPONG/);
  assert.equal(runtime.calls.length, 0);
  runtime.context.AppState.currentState = 'active';
  assert.equal((await runtime.exportQr(qr)).saved, true);
});

test('leaving the app during QR capture prevents opening the native picker in the background', async () => {
  const runtime = exporter();
  let finish;
  const pending = runtime.exportQr({ toDataURL: callback => { finish = callback; } });
  runtime.context.AppState.currentState = 'background';
  finish(runtime.base64);
  await assert.rejects(pending, /Return to HUGPONG/);
  assert.equal(runtime.calls.some(call => call[0] === 'picker'), false);
  runtime.context.AppState.currentState = 'active';
  assert.equal((await runtime.export()).saved, true);
});

test('cancelled QR saving writes nothing and releases the native export lock', async () => {
  const runtime = exporter({ permission: async () => ({ granted: false }) });
  const qr = { toDataURL: callback => callback(runtime.base64) };
  assert.equal((await runtime.exportQr(qr)).cancelled, true);
  assert.equal((await runtime.exportQr(qr)).cancelled, true);
  assert.equal(runtime.calls.some(call => ['create', 'write', 'alert'].includes(call[0])), false);
});

test('QR render errors, empty images, unavailable views and timeouts do not leave saving stuck', async () => {
  const runtime = exporter();
  await assert.rejects(runtime.exportQr(null), /not ready/);
  await assert.rejects(runtime.exportQr({ toDataURL() { throw new Error('View unavailable'); } }), /View unavailable/);
  await assert.rejects(runtime.exportQr({ toDataURL: callback => callback('') }), /could not be prepared/);
  runtime.context.setTimeout = callback => setTimeout(callback, 1);
  await assert.rejects(runtime.exportQr({ toDataURL() {} }), /could not be prepared/);
  assert.equal((await runtime.exportQr({ toDataURL: callback => callback(runtime.base64) })).saved, true);
});

test('failed QR writes clean up only their incomplete file and permit another save', async () => {
  const runtime = exporter({ write: async () => { throw new Error('Storage full'); } });
  const qr = { toDataURL: callback => callback(runtime.base64) };
  await assert.rejects(runtime.exportQr(qr), /Storage full/);
  assert.ok(runtime.calls.some(call => call[0] === 'delete' && call[1] === 'content://selected-folder/report.pdf'));
  assert.equal(runtime.calls.some(call => call[0] === 'alert'), false);
  runtime.context.FileSystem.StorageAccessFramework.writeAsStringAsync = async () => {};
  assert.equal((await runtime.exportQr(qr)).saved, true);
});

test('the QR save button synchronously suppresses repeated taps and blocks dismiss while preparing the selected image', async () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../../mobile/src/screens/FieldOpsScreen.js'), 'utf8');
  const start = source.indexOf('  const saveCurrentQrImage = async () => {');
  const end = source.indexOf('\n  // Preview QR', start);
  let finish, calls = 0, closed = false, saving = false;
  const lock = { current: false };
  const handlers = new Function('qrSaveInFlightRef', 'activeQRData', 'qrSvgRef', 'setIsSavingQrImage', 'exportQrImageFile', 'Alert',
    `${source.slice(start, end)}; return saveCurrentQrImage;`)(lock, { qrPayload: 'existing-signed-payload', reportId: 'AUD/1' },
    { current: {} }, value => { saving = value; }, async (_qr, filename) => {
      calls++; assert.equal(filename, 'AUD-1-QR.png'); await new Promise(resolve => { finish = resolve; });
    }, { alert: () => assert.fail('No error popup expected') });
  const first = handlers();
  await handlers();
  assert.equal(calls, 1);
  assert.equal(saving, true);
  const closeStart = source.indexOf('  const closeAuditQr = () => {');
  const closeEnd = source.indexOf('\n  const saveCurrentQrImage', closeStart);
  const close = new Function('qrSaveInFlightRef', 'setShowQR', 'setActiveQRData', 'qrReturnTarget',
    `${source.slice(closeStart, closeEnd)}; return closeAuditQr;`)(lock, () => { closed = true; }, () => {}, null);
  close();
  assert.equal(closed, false);
  finish(); await first;
  assert.equal(saving, false);
  assert.equal(lock.current, false);
  close(); assert.equal(closed, true);
});

test('Android saves PDF bytes to the selected folder without calling the busy share sheet', async () => {
  const runtime = exporter({ share: async () => { throw new Error('Another share request is being processed now.'); } });
  const result = await runtime.export();
  assert.equal(result.saved, true);
  assert.equal(result.uri, 'content://selected-folder/report.pdf');
  assert.equal(runtime.files.get(result.uri), runtime.base64);
  assert.equal(Buffer.from(runtime.files.get(result.uri), 'base64').subarray(0, 5).toString(), '%PDF-');
  assert.deepEqual(runtime.calls.find(call => call[0] === 'create'), ['create', 'content://selected-folder', 'Report.pdf', 'application/pdf']);
  assert.equal(runtime.calls.some(call => call[0] === 'share'), false);
  assert.ok(runtime.calls.some(call => call[0] === 'alert' && call[1] === 'PDF Saved'));
  assert.ok(runtime.calls.some(call => call[0] === 'delete' && call[1] === 'file:///print/source.pdf'));
});

test('canceling the Android folder picker writes nothing and releases the export lock', async () => {
  let attempts = 0;
  const runtime = exporter({ permission: async () => { attempts++; return { granted: false }; } });
  assert.equal((await runtime.export()).cancelled, true);
  assert.equal((await runtime.export()).cancelled, true);
  assert.equal(attempts, 2);
  assert.equal(runtime.calls.some(call => ['create', 'write', 'alert'].includes(call[0])), false);
});

test('concurrent exports do not open competing native pickers or share requests', async () => {
  let release;
  const runtime = exporter({ print: () => new Promise(resolve => { release = resolve; }) });
  const first = runtime.export();
  await assert.rejects(runtime.export(), /already open/);
  release({ uri: 'file:///print/source.pdf', base64: runtime.base64 });
  assert.equal((await first).saved, true);
  assert.equal(runtime.calls.filter(call => call[0] === 'picker').length, 1);
});

test('failed writes clean up only the newly created file, report failure and allow retry', async () => {
  const runtime = exporter({ write: async () => { throw new Error('Storage full'); } });
  await assert.rejects(runtime.export(), /Storage full/);
  assert.ok(runtime.calls.some(call => call[0] === 'delete' && call[1] === 'content://selected-folder/report.pdf'));
  assert.equal(runtime.calls.some(call => call[0] === 'alert'), false);
  runtime.context.FileSystem.StorageAccessFramework.writeAsStringAsync = async () => {};
  assert.equal((await runtime.export()).saved, true);
});

test('render failures release the shared lock before the next export', async () => {
  const runtime = exporter({ print: async () => { throw new Error('Render failed'); } });
  await assert.rejects(runtime.export(), /Render failed/);
  runtime.context.Print.printToFileAsync = async () => ({ uri: 'file:///print/retry.pdf', base64: runtime.base64 });
  assert.equal((await runtime.export()).saved, true);
});

test('Android can export when only the generated file URI is returned', async () => {
  const runtime = exporter({ print: async () => ({ uri: 'file:///print/source.pdf' }) });
  const result = await runtime.export();
  assert.equal(runtime.files.get(result.uri), runtime.base64);
});

test('iOS retains sharing from app-owned cache and leaves the shared file available', async () => {
  const runtime = exporter({ os: 'ios' });
  const result = await runtime.export();
  assert.equal(result.shared, true);
  assert.equal(runtime.files.get(result.uri), runtime.base64);
  assert.ok(runtime.calls.some(call => call[0] === 'share' && call[1] === 'file:///cache/Report.pdf'));
  assert.equal(runtime.calls.some(call => call[0] === 'picker'), false);
});

test('native monthly PDF rendering receives explicit landscape dimensions instead of portrait defaults', async () => {
  const runtime = exporter();
  await runtime.export({ width: 842, height: 595 });
  const options = runtime.calls.find(call => call[0] === 'print')[1];
  assert.equal(options.width, 842);
  assert.equal(options.height, 595);
  assert.equal(options.base64, true);
});
