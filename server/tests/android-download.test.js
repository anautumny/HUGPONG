'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { createAndroidDownloadHandler } = require('../routes/androidDownload');
const release = { version: '1.0.2', downloadUrl: 'https://github.com/anautumny/HUGPONG/releases/download/Beta-1.0.2/HUGPONG-Beta.apk' };
async function serve(t, handler) {
  const app = express();
  app.get('/downloads/android/:version', handler);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  return `http://127.0.0.1:${server.address().port}/downloads/android/`;
}
test('APK button endpoint streams an attachment without a browser redirect or URL-controlled proxy', async t => {
  const bytes = Buffer.from('PK-test-android-file');
  let requested;
  const base = await serve(t, createAndroidDownloadHandler({ release, fetchArtifact: async (url, options) => {
    requested = { url, options };
    return new Response(bytes, { headers: { 'Content-Length': String(bytes.length), 'Accept-Ranges': 'bytes' } });
  } }));
  const response = await fetch(base + '1.0.2?url=https://attacker.invalid');
  assert.equal(response.status, 200);
  assert.equal(response.redirected, false);
  assert.match(response.headers.get('content-disposition'), /attachment; filename="HUGPONG-Beta.apk"/);
  assert.equal(response.headers.get('content-type'), 'application/vnd.android.package-archive');
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes);
  assert.equal(requested.url, release.downloadUrl);
  assert.equal((await fetch(base + '0.0.0')).status, 410);
});
test('APK download preserves single byte ranges and rejects malformed ranges', async t => {
  const base = await serve(t, createAndroidDownloadHandler({ release, fetchArtifact: async (_, options) => {
    assert.equal(options.headers.Range, 'bytes=0-3');
    return new Response('PK00', { status: 206, headers: { 'Content-Length': '4', 'Content-Range': 'bytes 0-3/100', 'Accept-Ranges': 'bytes' } });
  } }));
  const response = await fetch(base + '1.0.2', { headers: { Range: 'bytes=0-3' } });
  assert.equal(response.status, 206);
  assert.equal(response.headers.get('content-range'), 'bytes 0-3/100');
  assert.equal(await response.text(), 'PK00');
  assert.equal((await fetch(base + '1.0.2', { headers: { Range: 'bytes=0-1,4-5' } })).status, 416);
  assert.equal((await fetch(base + '1.0.2', { headers: { Range: 'bytes=-' } })).status, 416);
});
test('APK failures do not redirect to a release page or expose upstream errors', async t => {
  const base = await serve(t, createAndroidDownloadHandler({ release, fetchArtifact: async () => new Response('private upstream detail', { status: 404 }) }));
  const response = await fetch(base + '1.0.2');
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('location'), null);
  assert.doesNotMatch(await response.text(), /private upstream detail/);
});
test('APK handler refuses unapproved manifest destinations without calling the network', async t => {
  const base = await serve(t, createAndroidDownloadHandler({ release: { ...release, downloadUrl: 'http://127.0.0.1/internal.apk' }, fetchArtifact: () => { throw Error('must not fetch'); } }));
  assert.equal((await fetch(base + '1.0.2')).status, 503);
});
