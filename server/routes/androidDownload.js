'use strict';
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');

function createAndroidDownloadHandler({ release, fetchArtifact = fetch } = {}) {
  return async function downloadAndroid(req, res) {
    // The artifact is selected by our versioned release manifest, never a client URL.
    let artifact;
    try {
      artifact = new URL(release.downloadUrl);
      if (artifact.protocol !== 'https:' || artifact.hostname !== 'github.com'
        || !/^\/anautumny\/HUGPONG\/releases\/download\/[^/]+\/[^/]+\.apk$/.test(artifact.pathname)
        || artifact.username || artifact.password || artifact.search || artifact.hash) throw new Error('Unapproved artifact');
    } catch {
      return res.status(503).json({ success: false, error: 'The Android download is not configured.' });
    }
    if (req.params.version !== release.version) return res.status(410).json({ success: false, error: 'This APK version is no longer current. Refresh the download page.' });
    const range = req.headers.range;
    if (range && (!/^bytes=\d*-\d*$/.test(range) || !/\d/.test(range))) return res.status(416).end();
    const controller = new AbortController();
    const abortDownload = () => { if (!res.writableFinished) controller.abort(); };
    res.on('close', abortDownload);
    const timeout = setTimeout(() => controller.abort(), 10 * 60 * 1000);
    try {
      const upstream = await fetchArtifact(artifact.href, {
        headers: { ...(range ? { Range: range } : {}), 'Accept-Encoding': 'identity' },
        redirect: 'follow', signal: controller.signal
      });
      if (upstream.status === 416) {
        const contentRange = upstream.headers.get('content-range');
        if (contentRange) res.set('Content-Range', contentRange);
        await upstream.body?.cancel();
        return res.status(416).end();
      }
      if (![200, 206].includes(upstream.status) || !upstream.body) {
        await upstream.body?.cancel();
        return res.status(503).json({ success: false, error: 'The Android download is temporarily unavailable. Please try again.' });
      }
      res.status(upstream.status);
      res.set('Content-Type', 'application/vnd.android.package-archive');
      res.set('Content-Disposition', 'attachment; filename="HUGPONG-Beta.apk"');
      res.set('Cache-Control', 'public, max-age=300');
      for (const header of ['content-length', 'content-range', 'accept-ranges', 'etag', 'last-modified']) {
        const value = upstream.headers.get(header);
        if (value) res.set(header, value);
      }
      if (req.method === 'HEAD') { await upstream.body.cancel(); return res.end(); }
      await pipeline(Readable.fromWeb(upstream.body), res);
    } catch {
      if (res.destroyed) return;
      if (!res.headersSent) res.status(503).json({ success: false, error: 'The Android download could not start. Please try again.' });
      else res.destroy();
    } finally {
      clearTimeout(timeout);
      res.off('close', abortDownload);
    }
  };
}
module.exports = { createAndroidDownloadHandler };
