'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { Miniflare } = require('../../cloudflare/node_modules/miniflare');

test('the actual Workers runtime emits a fixed download length for full and resumed APK streams', async t => {
  const { preserveDownloadLength } = await import(pathToFileURL(path.resolve(__dirname, '../../cloudflare/src/routing.mjs')).href);
  const script = `${preserveDownloadLength.toString()}
      export default { fetch(request, env, ctx) {
        const range = request.headers.get('range');
        const bytes = new TextEncoder().encode(range ? 'PK00' : 'PK-test-android-file');
        const source = new ReadableStream({ start(controller) { controller.enqueue(bytes); controller.close(); } });
        const headers = { 'content-type': 'application/vnd.android.package-archive', 'x-hugpong-download-length': String(bytes.length) };
        if (range) headers['content-range'] = 'bytes 0-3/20';
        return preserveDownloadLength(request, new Response(source, { status: range ? 206 : 200, headers }), ctx);
      } };`;
  const runtime = new Miniflare({ workers: [{ config: { name: 'download-test', compatibilityDate: '2026-11-13',
    manifest: { mainModule: 'index.mjs', modules: { 'index.mjs': { type: 'esm', contents: script } } } } }] });
  t.after(() => runtime.dispose());
  for (const range of [null, 'bytes=0-3']) {
    const response = await runtime.dispatchFetch('https://test.invalid/downloads/android/1.1.1', { headers: range ? { Range: range } : {} });
    assert.equal(response.status, range ? 206 : 200);
    assert.equal(response.headers.get('content-length'), range ? '4' : '20');
    assert.equal(response.headers.get('x-hugpong-download-length'), null);
    assert.match(response.headers.get('cache-control'), /no-transform/);
    assert.equal((await response.arrayBuffer()).byteLength, range ? 4 : 20);
  }
});
